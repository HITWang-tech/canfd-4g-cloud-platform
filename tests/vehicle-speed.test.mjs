import test from 'node:test';import assert from 'node:assert/strict';
import {gpsVehicleSpeed,vehicleTimeline,vehicleLiveView,vehicleCSVRows,VEHICLE_SPEED_KEY} from '../web/vehicle-speed.js';
import {prepareDataset,buildTimeline,parsePhysical,valueAt} from '../web/protocol.js';
import {buildLiveView,liveSignal} from '../web/live-view.js';
import {PLATFORM_FIELDS} from '../web/channel-profiles.js';
import {auditRows,candidatePlan,forwardingPlan} from '../web/forwarding-audit.js';
const gps=(extra={})=>({kind:'gps',device:'A',t:100,receivedAt:100000,valid:true,latitude:45,longitude:126,speed:14.5,...extra});
const can={kind:'can',device:'A',channel:2,source:0,t:100,receivedAt:100000,extended:true,id:0x18fef100,data:Uint8Array.from([0,0,50,0,0,0,0,0])};
const selection={device:'A',channel:'2',source:'0'};
const dataset=events=>prepareDataset({events,report:{}},PLATFORM_FIELDS);
test('GPS display accepts valid zero but rejects missing, invalid, negative and nonfinite speeds',()=>{
 assert.equal(gpsVehicleSpeed(gps({speed:0})),0);assert.equal(gpsVehicleSpeed(gps()),14.5);
 for(const extra of [{valid:false},{speed:null},{speed:-1},{speed:Infinity},{latitude:null},{longitude:181}])assert.equal(gpsVehicleSpeed(gps(extra)),null);
});
test('vehicle curves use only selected-device GPS regardless of ECU, preserving raw CAN decoding',()=>{
 const data=dataset([can,gps(),gps({device:'B',speed:99}),gps({t:101,speed:null})]),raw=buildTimeline(data,selection),view=vehicleTimeline(raw);
 assert.ok(Math.abs(raw.series[VEHICLE_SPEED_KEY][0][1]-50)<.001);assert.deepEqual(view.series[VEHICLE_SPEED_KEY],[[100,14.5],[101,null]]);assert.equal(raw.series[VEHICLE_SPEED_KEY].length,1);
 assert.deepEqual(vehicleTimeline(buildTimeline(data,{...selection,source:'82'})).series[VEHICLE_SPEED_KEY],[[100,14.5],[101,null]]);
 assert.deepEqual(vehicleTimeline(buildTimeline(dataset([can]),selection)).series[VEHICLE_SPEED_KEY],[]);
});
test('live freshness is based on GPS arrival, and no GPS cannot fall back to a fresh CAN wheel speed',()=>{
 const view=vehicleLiveView(buildLiveView(dataset([can,gps({receivedAt:90000})]).events,selection));assert.equal(liveSignal(view,VEHICLE_SPEED_KEY,101000,3).state,'stale');assert.equal(liveSignal(view,VEHICLE_SPEED_KEY,101000,3).value,14.5);
 const absent=vehicleLiveView(buildLiveView(dataset([can]).events,selection));assert.equal(liveSignal(absent,VEHICLE_SPEED_KEY,101000,3).state,'missing');
 const invalid=vehicleLiveView(buildLiveView(dataset([can,gps({valid:false})]).events,selection));assert.equal(liveSignal(invalid,VEHICLE_SPEED_KEY,101000,3).state,'invalid');
});
test('GPS CSV preserves source, zero, invalid gaps and original times through reimport',()=>{
 const data=dataset([can,gps({speed:0}),gps({t:101,valid:false,latitude:null,longitude:null})]),timeline=vehicleTimeline(buildTimeline(data,selection)),rows=vehicleCSVRows(timeline,PLATFORM_FIELDS,valueAt),[header,...values]=rows;
 assert.ok(header.includes('gpsSpeed'));assert.ok(!header.includes(VEHICLE_SPEED_KEY));const records=values.map(row=>Object.fromEntries(header.map((key,i)=>[key,row[i]])));
 const imported=dataset(parsePhysical(records,PLATFORM_FIELDS).events);assert.equal(imported.events.filter(e=>e.kind==='gps').length,2);assert.ok(!imported.events.some(e=>e.kind==='physical'&&e.channel===0));
 assert.deepEqual(vehicleTimeline(buildTimeline(imported,selection)).series[VEHICLE_SPEED_KEY],[[100,0],[101,null]]);
});
test('audit identifies GPS speed without treating wheel-speed CAN IDs as its evidence or filter condition',()=>{
 const data=dataset([can,gps()]),row=auditRows(data,{device:'A',fields:PLATFORM_FIELDS}).find(r=>r[0]==='车速');assert.equal(row[1],'GPS');assert.equal(row[3],'GPS 定位速度');assert.ok(row[5].includes('1 个有效样本'));
 assert.ok(!candidatePlan(PLATFORM_FIELDS).some(p=>p.pgn===0xfef1));assert.deepEqual(forwardingPlan(dataset([can]),{device:'A',fields:PLATFORM_FIELDS}),[]);
});
