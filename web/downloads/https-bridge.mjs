import {spawn} from 'node:child_process';
import {readFile,writeFile,appendFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function connectionArtifacts(endpoint,token){
 const params=new URLSearchParams({liveEndpoint:endpoint,liveToken:token});
 return {config:JSON.stringify({version:1,endpoint,token},null,2),shortcut:'[InternetShortcut]\r\nURL=https://hitwang-tech.github.io/canfd-4g-cloud-platform/#'+params+'\r\n'};
}
export async function verifyEndpoint(endpoint,token){
   const options={headers:{Origin:'https://hitwang-tech.github.io'},signal:AbortSignal.timeout(10000)};
   const denied=await fetch(endpoint+'/api/snapshot',options);
   if(denied.status!==401)throw Error('Unauthenticated API did not return 401');
   const response=await fetch(endpoint+'/api/snapshot',{...options,headers:{...options.headers,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});
   if(response.status!==200||response.headers.get('access-control-allow-origin')!=='https://hitwang-tech.github.io')throw Error('HTTPS API or CORS check failed');
   const data=await response.json();if(!Array.isArray(data.records)||!Number.isFinite(data.cursor))throw Error('Invalid API response');
   const preflight=await fetch(endpoint+'/api/snapshot',{method:'OPTIONS',headers:{Origin:'https://hitwang-tech.github.io','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization'},signal:AbortSignal.timeout(10000)});
   if(preflight.status!==204||!/authorization/i.test(preflight.headers.get('access-control-allow-headers')||''))throw Error('CORS preflight failed');
}
export async function runBridge(root){
 const config=JSON.parse(await readFile(path.join(root,'config.json'),'utf8'));
 const state=path.join(root,'data','https-state.json'),log=path.join(root,'logs','https-bridge.log');
 const record=s=>appendFile(log,new Date().toISOString()+' '+s+'\n').catch(()=>{});
 const atomic=async(file,content)=>{await writeFile(file+'.tmp',content);await rename(file+'.tmp',file);};
 await atomic(state,JSON.stringify({ready:false,updatedAt:Date.now()}));
 let endpoint=null,buffer='',checking=false,stopping=false;
 // Explicit empty configuration prevents loading unrelated profile tunnels.
 const child=spawn(path.join(root,'runtime','cloudflared.exe'),['tunnel','--config',path.join(root,'https-empty.yml'),'--no-autoupdate','--protocol','http2','--url','http://127.0.0.1:'+config.httpPort],{windowsHide:true});
 const consume=chunk=>{const text=chunk.toString();record(text);buffer=(buffer+text).slice(-16000);const match=buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);if(match)endpoint=match[0];};
 child.stdout.on('data',consume);child.stderr.on('data',consume);
 const timer=setInterval(async()=>{
  if(!endpoint||checking||stopping)return;checking=true;
  try{
   await verifyEndpoint(endpoint,config.token);
   const artifacts=connectionArtifacts(endpoint,config.token);
   await atomic(path.join(root,'data','live-connection.json'),artifacts.config);
   await atomic(path.join(root,'data','Open-Live.url'),artifacts.shortcut);
   await atomic(state,JSON.stringify({ready:true,endpoint,updatedAt:Date.now()}));
   record('HTTPS_READY '+endpoint);clearInterval(timer);
  }catch(e){record('HTTPS_CHECK_PENDING '+e.message);}finally{checking=false;}
 },4000);
 child.on('error',e=>{record('BRIDGE_ERROR '+e.message);clearInterval(timer);process.exitCode=1;});
 child.on('exit',(code)=>{clearInterval(timer);atomic(state,JSON.stringify({ready:false,updatedAt:Date.now()})).finally(()=>{process.exitCode=stopping?0:code||1;});});
 const stop=()=>{stopping=true;clearInterval(timer);child.kill();};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runBridge(path.resolve(process.argv[2])).catch(e=>{console.error(e.message);process.exitCode=1;});
