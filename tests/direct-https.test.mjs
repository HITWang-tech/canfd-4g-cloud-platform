import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,unlink,rmdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {once} from 'node:events';
import https from 'node:https';import tls from 'node:tls';
import {createCollector} from '../server/collector.mjs';import {createDirectProxy,validateBundle,probeDirect} from '../server/direct-https.mjs';
test('IP TLS proxy validates keys/IP/expiry, enforces auth, forwards CORS, and rejects untrusted certificates',async t=>{
 if(spawnSync('openssl',['version']).error){t.skip('OpenSSL is required to generate ephemeral test certificates');return;}
 const folder=await mkdtemp(path.join(tmpdir(),'canfd-tls-test-')),certFile=path.join(folder,'cert.pem'),keyFile=path.join(folder,'key.pem'),configFile=path.join(folder,'openssl.cnf'),ip='192.0.2.123';
 let collector,proxy;
 try{
  await writeFile(configFile,'[req]\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\n[extensions]\nbasicConstraints=critical,CA:TRUE\n');
  const generated=spawnSync('openssl',['req','-config',configFile,'-x509','-newkey','rsa:2048','-nodes','-keyout',keyFile,'-out',certFile,'-days','2','-subj','/CN=CANFD-loopback-test-only','-addext','subjectAltName=IP:'+ip],{encoding:'utf8',windowsHide:true});
  assert.equal(generated.status,0,generated.stderr);
  const bundle={cert:await readFile(certFile,'utf8'),key:await readFile(keyFile,'utf8')};
  assert.ok(validateBundle(bundle,ip).expires>Date.now());
  assert.throws(()=>validateBundle(bundle,'192.0.2.124'));
  assert.throws(()=>validateBundle(bundle,ip,Date.now()+3*86400000));
  collector=createCollector({token:'test-direct-private-token',origins:['https://hitwang-tech.github.io']});collector.web.listen(0,'127.0.0.1');await once(collector.web,'listening');
  proxy=createDirectProxy(bundle,{ip,host:'127.0.0.1',port:0,upstreamPort:collector.web.address().port});await proxy.listen();
  const port=proxy.server.address().port;
  await probeDirect({port,ip,token:'test-direct-private-token',ca:bundle.cert});
  await assert.rejects(()=>probeDirect({port,ip,token:'test-direct-private-token'}));
  await assert.rejects(()=>probeDirect({port,ip,token:'wrong-token',ca:bundle.cert}));
  const before=proxy.metadata.fingerprint;assert.throws(()=>proxy.reload({...bundle,key:'invalid key'}));assert.equal(proxy.metadata.fingerprint,before);
  const status=await new Promise((resolve,reject)=>{const request=https.get({hostname:'127.0.0.1',port,path:'/config.json',ca:bundle.cert,checkServerIdentity:(_,cert)=>tls.checkServerIdentity(ip,cert)},response=>{response.resume();resolve(response.statusCode);});request.on('error',reject);});
  assert.equal(status,404);
 }finally{
  if(proxy)await new Promise(resolve=>proxy.server.close(resolve));if(collector)await new Promise(resolve=>collector.web.close(resolve));
  for(const file of [certFile,keyFile,configFile])await unlink(file).catch(()=>{});await rmdir(folder);
 }
});
