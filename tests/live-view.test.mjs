import test from 'node:test';import assert from 'node:assert/strict';
import {buildLiveView,liveSignal,chooseLiveStream} from '../web/live-view.js';
const selection={device:'TEST',channel:'1',source:'0'};
const frame=(data={})=>({kind:'can',device:'TEST',channel:1,source:0,t:100,receivedAt:10000,cursor:1,values:{EngSpeed:1200},...data});
test('live instruments use received frames independently of future GPS timestamps and source filtering',()=>{
 const events=[frame(),{kind:'gps',device:'TEST',t:999999,receivedAt:10000},frame({channel:2,t:900,values:{EngSpeed:2500}}),frame({source:3,t:900,values:{EngSpeed:3000}})];
 const view=buildLiveView(events,selection);
 assert.equal(view.cursor,100);assert.equal(liveSignal(view,'EngSpeed',11000,3).value,1200);
});
test('latest arrival wins if device time moves backward; zero is valid; stale values are marked rather than cleared',()=>{
 const view=buildLiveView([frame({t:99,receivedAt:12000,cursor:2,values:{EngSpeed:0}}),frame()],selection);
 assert.equal(view.cursor,99);assert.deepEqual(liveSignal(view,'EngSpeed',13000,3),{value:0,state:'fresh',age:1});
 assert.deepEqual(liveSignal(view,'EngSpeed',18000,3),{value:0,state:'stale',age:6});
 assert.equal(liveSignal(view,'EngFuelRate',18000,3).state,'missing');
});
test('new invalid signal clears the old value instead of falsely holding it as live',()=>{
 const view=buildLiveView([frame(),frame({receivedAt:12000,cursor:2,values:{EngSpeed:null}})],selection);
 assert.equal(liveSignal(view,'EngSpeed',12500,3).state,'invalid');assert.equal(liveSignal(view,'EngSpeed',12500,3).value,null);
});
test('auto-selection finds engine signals on a different channel and preserves an already useful stream',()=>{
 const engine=frame({channel:2,values:{EngSpeed:1000,EngFuelRate:5}}),raw=frame({values:{}});
 assert.equal(chooseLiveStream([raw,engine],selection).channel,'2');
 assert.equal(chooseLiveStream([frame(),engine],selection).channel,'1');
});
test('CAN zero and ECU zero remain valid explicit choices when the earlier selector was empty',()=>{
 const zero=frame({channel:0,source:0});
 assert.deepEqual(chooseLiveStream([zero],{device:'TEST',channel:'',source:''}),{device:'TEST',channel:'0',source:'0'});
 const view=buildLiveView([zero],{device:'TEST',channel:'0',source:'0'});
 assert.equal(liveSignal(view,'EngSpeed',10500,3).value,1200);
});
