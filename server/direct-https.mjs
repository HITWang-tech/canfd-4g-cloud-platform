import https from 'node:https';import http from 'node:http';import tls from 'node:tls';
import {X509Certificate} from 'node:crypto';import {readFile,writeFile,rename,appendFile} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
export function validateBundle(bundle,ip,now=Date.now()){
 const cert=new X509Certificate(bundle.cert);
 if(cert.checkIP(ip)!==ip)throw Error('Certificate IP address does not match configured public IP');
 if(Date.parse(cert.validTo)<=now||Date.parse(cert.validFrom)>now+60000)throw Error('Certificate is expired or not yet valid');
 tls.createSecureContext({key:bundle.key,cert:bundle.cert,minVersion:'TLSv1.2'});
 return {expires:Date.parse(cert.validTo),fingerprint:cert.fingerprint256};
}
export function createDirectProxy(bundle,{ip,upstreamPort,host='0.0.0.0',port=443}){
 let metadata=validateBundle(bundle,ip);
 const server=https.createServer({key:bundle.key,cert:bundle.cert,minVersion:'TLSv1.2',maxHeaderSize:16384},(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
  const origin=req.headers.origin;
  const error=(code,message)=>{if(res.headersSent){res.destroy();return;}if(origin==='https://hitwang-tech.github.io')res.setHeader('Access-Control-Allow-Origin',origin);res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify({error:message}));};
  let pathname;try{pathname=new URL(req.url,'https://localhost').pathname;}catch{return error(400,'Invalid URL');}
  if(pathname!=='/api/snapshot')return error(404,'Not found');
  if(!['GET','OPTIONS'].includes(req.method))return error(405,'Method not allowed');
  const headers={Host:'127.0.0.1',Connection:'close'};for(const key of ['authorization','origin','access-control-request-method','access-control-request-headers'])if(req.headers[key])headers[key]=req.headers[key];
  const upstream=http.request({hostname:'127.0.0.1',port:upstreamPort,path:'/api/snapshot'+new URL(req.url,'https://localhost').search,method:req.method,headers,timeout:12000},response=>{res.writeHead(response.statusCode,response.headers);response.on('error',()=>res.destroy());response.pipe(res);});
  upstream.on('timeout',()=>upstream.destroy(Error('Upstream timeout')));upstream.on('error',()=>error(502,'Local collector is unavailable'));req.on('aborted',()=>upstream.destroy());req.resume();upstream.end();
 });
 return {server,get metadata(){return metadata;},listen:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);}),reload:next=>{const checked=validateBundle(next,ip);server.setSecureContext({key:next.key,cert:next.cert,minVersion:'TLSv1.2'});metadata=checked;}};
}
export function probeDirect({port=443,ip,token,ca}){
 const request=(headers={},method='GET')=>new Promise((resolve,reject)=>{
  const req=https.request({hostname:'127.0.0.1',port,path:'/api/snapshot',method,headers:{Host:ip,...headers},...(ca?{ca}:{}),checkServerIdentity:(_,cert)=>tls.checkServerIdentity(ip,cert),timeout:10000},res=>{let data='';res.setEncoding('utf8');res.on('data',part=>data+=part);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,data}));});
  req.on('error',reject);req.on('timeout',()=>req.destroy(Error('TLS probe timeout')));req.end();
 });
 return (async()=>{
  const origin={Origin:'https://hitwang-tech.github.io'};
  if((await request(origin)).status!==401)throw Error('Unauthenticated API was not rejected');
  const auth=await request({...origin,Authorization:'Bearer '+token});
  if(auth.status!==200||auth.headers['access-control-allow-origin']!==origin.Origin||!Array.isArray(JSON.parse(auth.data).records))throw Error('Authenticated API or CORS check failed');
  const preflight=await request({...origin,'Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'},'OPTIONS');
  if(preflight.status!==204||!/authorization/i.test(preflight.headers['access-control-allow-headers']||''))throw Error('CORS preflight failed');
 })();
}
async function main(root,mode){
 const folder=path.join(root,'ip-https'),settings=JSON.parse(await readFile(path.join(folder,'settings.json'),'utf8')),config=JSON.parse(await readFile(path.join(root,'config.json'),'utf8'));
 const bundlePath=path.join(folder,'published','active-tls.json');
 if(mode==='--probe'){await probeDirect({ip:settings.ip,token:config.token});console.log('DIRECT_HTTPS_LOCAL_OK');return;}
 const log=message=>appendFile(path.join(root,'logs','direct-https.log'),new Date().toISOString()+' '+message+'\n').catch(()=>{});
 let raw=await readFile(bundlePath,'utf8'),proxy=createDirectProxy(JSON.parse(raw),{ip:settings.ip,upstreamPort:config.httpPort});await proxy.listen();
 log('LISTENING_443 certificate expires '+new Date(proxy.metadata.expires).toISOString());
 const timer=setInterval(async()=>{try{const next=await readFile(bundlePath,'utf8');if(next!==raw){proxy.reload(JSON.parse(next));raw=next;log('CERTIFICATE_RELOADED expires '+new Date(proxy.metadata.expires).toISOString());}if(proxy.metadata.expires<Date.now())log('ERROR certificate expired; renewal requires attention');}catch(e){log('CERTIFICATE_RELOAD_ERROR '+e.message);}},15000);
 const stop=()=>{clearInterval(timer);proxy.server.close();setTimeout(()=>process.exit(0),1000).unref();};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv[2]==='--validate'){
  readFile(process.argv[3],'utf8').then(raw=>{const metadata=validateBundle(JSON.parse(raw),process.argv[4]);console.log(JSON.stringify(metadata));}).catch(e=>{console.error(e.message);process.exitCode=1;});
 }else main(path.resolve(process.argv[2]),process.argv[3]).catch(async e=>{if(process.argv[3]!=='--probe')await appendFile(path.join(path.resolve(process.argv[2]),'logs','direct-https.log'),new Date().toISOString()+' START_ERROR '+e.message+'\n').catch(()=>{});console.error(e.message);process.exitCode=1;});
}
