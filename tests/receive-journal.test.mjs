import test from 'node:test';import assert from 'node:assert/strict';
import {ReceiveJournal,signalStatus,pagination} from '../web/receive-journal.js';
const frame=values=>({kind:'can',values});
test('per-frame validity preserves valid zero and distinguishes missing fields and invalid values',()=>{
 assert.deepEqual(signalStatus(frame({EngSpeed:0})).keys,['EngSpeed']);
 assert.equal(signalStatus(frame({EngSpeed:null})).label,'目标信号无有效值');
 assert.equal(signalStatus(frame({})).label,'无匹配目标信号');
});
test('journal distinguishes existing history, new physical data, bad frames and partial TCP data',()=>{
 const j=new ReceiveJournal(3);let report={packets:10,receivedBytes:100,badChecksum:0,malformed:0,activeConnections:1};
 let row=j.observe({records:[frame({EngSpeed:0})],report},undefined,1000);
 assert.equal(row.status,'已连接，载入已有记录');assert.equal(row.bytes,null);assert.equal(row.targetFrames,1);
 assert.equal(j.observe({records:[],report},undefined,2000),null);
 report={...report,receivedBytes:140,packets:11};row=j.observe({records:[frame({EngSpeed:0})],report},undefined,3000);
 assert.equal(row.bytes,40);assert.equal(row.status,'收到有效数据');assert.equal(row.frames,1);
 report={...report,receivedBytes:150};row=j.observe({records:[],report},undefined,4000);
 assert.equal(row.status,'收到字节，暂无有效帧');assert.equal(row.kind,'info');
 report={...report,receivedBytes:190,badChecksum:1};row=j.observe({records:[],report},undefined,5000);
 assert.equal(row.bad,1);assert.equal(row.status,'报文校验或格式异常');assert.equal(j.rows.length,3);
 row=j.observe({records:[],report:{packets:0,receivedBytes:0}},undefined,6000);assert.equal(row.status,'服务计数已重置');
});
test('pagination clamps jumps, stays on the selected page as rows arrive, and follows the last page when requested',()=>{
 assert.equal(pagination(0,40,100).index,0);assert.equal(pagination(81,40,99).index,2);
 assert.equal(pagination(200,40,-1).index,0);assert.equal(pagination(240,40,2).index,2);
 assert.equal(pagination(281,40,2,true).index,7);assert.equal(pagination(40,40,1).index,0);
});
