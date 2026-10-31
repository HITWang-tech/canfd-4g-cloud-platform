import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,DEMO_METADATA} from '../web/demo.js';
import {prepareDataset,buildTimeline} from '../web/protocol.js';
import {PLATFORM_FIELDS} from '../web/channel-profiles.js';
import {vehicleTimeline} from '../web/vehicle-speed.js';
test('default demo is a continuous real 2 minute 22 second CAN recording, with time-aligned original GPS',()=>{
 const a=createDemo(),b=createDemo();assert.equal(DEMO_METADATA.synthetic,false);assert.equal(DEMO_METADATA.previousDemoOffsetSeconds,1793420554-1793420096.114937);assert.equal(a.events.length,34754);assert.equal(a.events.filter(e=>e.kind==='gps').length,143);assert.ok(a.events.at(-1).t-a.events[0].t>142);assert.ok(a.events.at(-1).t-a.events[0].t<143);
 assert.deepEqual([...new Set(a.events.filter(e=>e.kind==='can').map(e=>e.channel))].sort(),[1,2]);
 assert.ok(a.events.every((e,i)=>(e.kind==='gps'||e.data.length===8)&&(!i||e.t>=a.events[i-1].t)));assert.notEqual(a.events.find(e=>e.kind==='can').data,b.events.find(e=>e.kind==='can').data);assert.equal(a.events[0].kind,'gps');assert.equal(a.events[0].valid,true);assert.equal(a.events[0].t,DEMO_METADATA.start);
 let maxGap=0;for(let i=1;i<a.events.length;i++)maxGap=Math.max(maxGap,a.events[i].t-a.events[i-1].t);assert.ok(maxGap<1);
 const d=prepareDataset(a,PLATFORM_FIELDS),force=buildTimeline(d,{channel:'1',source:'standard'}).series.IN1_Force_kN.filter(p=>Number.isFinite(p[1]));assert.equal(force.length,8778);assert.equal(Math.max(...force.map(p=>p[1])),4.114);assert.ok(force.some(p=>Math.abs(p[1]-.026)<1e-12));
 const engine=vehicleTimeline(buildTimeline(d,{channel:'2',source:'0'}));assert.equal(engine.series.EngSpeed.filter(p=>Number.isFinite(p[1])).length,9473);assert.ok(engine.series.EngFuelRate.some(p=>p[1]>0));assert.equal(engine.positions.length,143);assert.equal(Math.max(...engine.series.WheelBasedVehicleSpeed.map(p=>p[1]??0)),7);assert.equal(DEMO_METADATA.gpsAvailable,true);assert.equal(engine.series.WheelBasedVehicleSpeed.filter(p=>p[1]>0).length,88);
});


