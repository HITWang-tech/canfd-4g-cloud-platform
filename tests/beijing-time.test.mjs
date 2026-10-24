import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkClock,formatBeijing} from '../web/beijing-time.js';
test('Beijing display is UTC+8 regardless of browser timezone and crosses dates correctly',()=>{
 assert.equal(formatBeijing(Date.UTC(2026,9,24,17,2,3)),'2026/10/25 01:02:03');
});
test('network calibration corrects wrong local time and continues using monotonic time',()=>{
 let elapsed=400,local=0;const clock=new NetworkClock({monotonic:()=>elapsed,wall:()=>local});
 assert.equal(clock.now(),0);assert.equal(clock.synchronized,false);
 const server=Date.UTC(2026,9,24,5,0,0);
 clock.calibrate(new Date(server).toUTCString(),'2',200,400);
 assert.equal(clock.now(),server+2100);local+=86400000;elapsed+=1500;
 assert.equal(clock.now(),server+3600);assert.equal(clock.synchronized,true);
 assert.throws(()=>clock.calibrate('invalid','0',0,10));
 assert.throws(()=>clock.calibrate(new Date(server).toUTCString(),'-1',0,10));
});
