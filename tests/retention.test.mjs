import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,readdir,utimes,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';import net from 'node:net';import {once} from 'node:events';
import {RecordCache} from '../server/record-cache.mjs';
import {RecorderLog,beijingDate} from '../server/recorder-log.mjs';
import {createCollector} from '../server/collector.mjs';
import {encodePacket,PacketStream} from '../web/protocol.js';

test('cache evicts by reception age and capacity without resetting cursors or using device time',()=>{
 let now=10000;const cache=new RecordCache({maxRecords:3,retentionMs:1000,now:()=>now});
 for(let i=1;i<=4;i++)cache.append({cursor:i,receivedAt:9000+i*100,t:1});
 assert.deepEqual(cache.records.map(e=>e.cursor),[2,3,4]);assert.equal(cache.snapshot().capacityEvictions,1);
 now=10300;assert.equal(cache.prune(),1);assert.deepEqual(cache.records.map(e=>e.cursor),[3,4]);
 now=20000;cache.prune();assert.equal(cache.records.length,0);
 cache.append({cursor:5,receivedAt:now,t:0});assert.equal(cache.records[0].cursor,5);
});

test('daily logs rotate at Beijing midnight, migrate old logs, and flush on close',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'canfd-log-'));let now=Date.parse('2026-10-29T23:59:59+08:00');
 try{
  await writeFile(path.join(directory,'records.ndjson'),'legacy-record\n');
  const logger=new RecorderLog({directory,now:()=>now});await logger.ready;
  logger.append({receivedAt:now,cursor:1});now+=2000;logger.append({receivedAt:now,cursor:2});await logger.close();
  assert.equal(beijingDate(now),'2026-10-30');
  const files=await readdir(directory);assert.equal(files.filter(n=>n.startsWith('records-legacy-')).length,1);
  assert.equal(await readFile(path.join(directory,files.find(n=>n.startsWith('records-legacy-'))),'utf8'),'legacy-record\n');
  assert.equal(JSON.parse(await readFile(path.join(directory,'records-2026-10-29.ndjson'),'utf8')).cursor,1);
  assert.equal(JSON.parse(await readFile(path.join(directory,'records-2026-10-30.ndjson'),'utf8')).cursor,2);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('30-day cleanup removes only expired project archives, protecting recent files and connection configuration',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'canfd-retain-')),now=Date.parse('2026-10-29T12:00:00+08:00'),old=new Date('2026-09-01T00:00:00Z');
 try{
  const names=['records-2026-09-01.ndjson','records-2026-09-29.ndjson','records-2026-10-29.ndjson','records-2026-09-02.ndjson','direct-connection.json','records-other.ndjson'];
  for(const name of names){await writeFile(path.join(directory,name),'preserve-or-expire\n');await utimes(path.join(directory,name),old,old);}
  await utimes(path.join(directory,'records-2026-09-02.ndjson'),new Date(now),new Date(now));
  const logger=new RecorderLog({directory,retentionDays:30,now:()=>now});await logger.ready;await logger.close();
  const remaining=await readdir(directory);
  assert.equal(remaining.includes('records-2026-09-01.ndjson'),false);
  assert.ok(names.slice(1).every(name=>remaining.includes(name)));
  assert.equal(logger.snapshot().deletedFiles,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('cache expiration preserves a TCP connection and monotonic cursor, with durable raw logs',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'canfd-retention-service-'));let now=100000;
 const c=createCollector({token:'retention-test',logDir:directory,cacheRetentionMs:1000,cacheCleanupMs:10,now:()=>now});await c.ready;
 await Promise.all([new Promise(r=>c.web.listen(0,'127.0.0.1',r)),new Promise(r=>c.tcp.listen(0,'127.0.0.1',r))]);
 const socket=net.connect(c.tcp.address().port,'127.0.0.1');await once(socket,'connect');
 try{
  let ack=once(socket,'data');socket.write(encodePacket(25,[0,0,0,1],'RETENTION',1,true));await ack;
  now+=2000;
  for(let i=0;i<30&&c.cache.records.length;i++)await new Promise(r=>setTimeout(r,5));
  assert.equal(c.cache.records.length,0);assert.equal(c.report.activeConnections,1);assert.equal(c.report.packets,1);
  ack=once(socket,'data');socket.write(encodePacket(25,[0,0,0,2],'RETENTION',2,true));const [reply]=new PacketStream().feed((await ack)[0]);assert.equal(reply.sequence,2);
  const result=await (await fetch(`http://127.0.0.1:${c.web.address().port}/api/snapshot?after=1`,{headers:{Authorization:'Bearer retention-test'}})).json();
  assert.equal(result.cursor,2);assert.equal(result.records.length,1);assert.equal(result.records[0].cursor,2);assert.equal(result.cache.expiredRecords,1);assert.equal(result.storage.retentionDays,30);
 }finally{socket.destroy();await c.close();}
 const files=await readdir(directory);assert.equal((await readFile(path.join(directory,files.find(n=>n.startsWith('records-'))),'utf8')).trim().split('\n').length,2);
 await rm(directory,{recursive:true,force:true});
});
