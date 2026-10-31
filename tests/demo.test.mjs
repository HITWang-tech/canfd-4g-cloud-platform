import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,DEMO_METADATA} from '../web/demo.js';
import {prepareDataset,buildTimeline} from '../web/protocol.js';
import {PLATFORM_FIELDS} from '../web/channel-profiles.js';
import {vehicleTimeline} from '../web/vehicle-speed.js';
test('default demo is a continuous real 10 minute CAN recording, with time-aligned original GPS',()=>{
 const a=createDemo(),b=createDemo();assert.equal(DEMO_METADATA.synthetic,false);assert.equal(a.events.length,146470);assert.equal(a.events.filter(e=>e.kind==='gps').length,320);assert.ok(a.events.at(-1).t-a.events[0].t>599);assert.ok(a.events.at(-1).t-a.events[0].t<601);
 assert.deepEqual([...new Set(a.events.filter(e=>e.kind==='can').map(e=>e.channel))].sort(),[1,2]);
 assert.ok(a.events.every((e,i)=>(e.kind==='gps'||e.data.length===8)&&(!i||e.t>=a.events[i-1].t)));assert.notEqual(a.events[0].data,b.events[0].data);
 let maxGap=0;for(let i=1;i<a.events.length;i++)maxGap=Math.max(maxGap,a.events[i].t-a.events[i-1].t);assert.ok(maxGap<1);
 const d=prepareDataset(a,PLATFORM_FIELDS),force=buildTimeline(d,{channel:'1',source:'standard'}).series.IN1_Force_kN.filter(p=>Number.isFinite(p[1]));assert.equal(force.length,37061);assert.equal(Math.max(...force.map(p=>p[1])),4.114);assert.ok(force.some(p=>Math.abs(p[1]-.026)<1e-12));
 const engine=vehicleTimeline(buildTimeline(d,{channel:'2',source:'0'}));assert.equal(engine.series.EngSpeed.filter(p=>Number.isFinite(p[1])).length,39998);assert.ok(engine.series.EngFuelRate.some(p=>p[1]>0));assert.equal(engine.positions.length,319);assert.equal(Math.max(...engine.series.WheelBasedVehicleSpeed.map(p=>p[1]??0)),7);assert.equal(DEMO_METADATA.gpsAvailable,true);assert.equal(engine.series.WheelBasedVehicleSpeed.filter(p=>p[1]>0).length,88);
});


