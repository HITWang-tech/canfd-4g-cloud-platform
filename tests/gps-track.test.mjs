import test from 'node:test';import assert from 'node:assert/strict';
import {trackSegments} from '../web/gps-track.js';
import {vehicleTimeline} from '../web/vehicle-speed.js';
import {createDemo} from '../web/demo.js';
const gps=(t,extra={})=>({kind:'gps',device:'A',t,valid:true,latitude:45,longitude:126,speed:4,...extra});
test('tracks break at missing time, invalid coordinates and device boundaries; playback has no future segment',()=>{
 const rows=[gps(0),gps(1),gps(172),gps(173,{valid:false}),gps(174),gps(175,{device:'B'}),gps(176,{longitude:null})];
 assert.deepEqual(trackSegments(rows).map(s=>s.length),[2,1,1,1]);assert.deepEqual(trackSegments(rows,{until:1}).map(s=>s.length),[2]);
 const speeds=vehicleTimeline({events:[gps(0),gps(171)],series:{}}).series.WheelBasedVehicleSpeed;assert.deepEqual(speeds,[[0,4],[3,null],[171,4]]);
});
test('authorized GPS excerpt retains all valid points and its five actual track sections',()=>{
 const gpsRows=createDemo().events.filter(e=>e.kind==='gps');const segments=trackSegments(gpsRows);assert.deepEqual(segments.map(s=>s.length),[20,19,123,14,143]);assert.equal(segments.flat().length,319);
 assert.ok(gpsRows.every(e=>e.device==='实车演示'&&!Object.hasOwn(e,'altitude')&&!Object.hasOwn(e,'receivedAt')));
});
