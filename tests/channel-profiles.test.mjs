import test from 'node:test';import assert from 'node:assert/strict';
import {PLATFORM_FIELDS,FORCE_KEYS,parseForceDBC} from '../web/channel-profiles.js';
import {physicalEvent,prepareDataset,parsePhysical,buildTimeline} from '../web/protocol.js';
import {signalStatus} from '../web/receive-journal.js';
const force=(raw,extra={})=>({kind:'can',device:'TEST',channel:1,extended:false,id:0x301,source:null,t:1,data:Uint8Array.from([raw>>>8,raw&255,0xff,0xff,0xff,0xff,0xff,0xff]),...extra});
const engine=extra=>({kind:'can',device:'TEST',channel:2,extended:true,id:0x0cf00400,source:0,t:1,data:Uint8Array.from([0,0,125,0x80,0x3e,0,0,0]),...extra});
const syntheticDBC='BO_ 769 QA_ONLY: 8 ECU\n'+FORCE_KEYS.map((key,i)=>` SG_ ${key} : ${7+i*16}|16@0+ (0.01,0) [0|50] "kN" Logger`).join('\n');

test('CAN1 force obeys the latest big-endian 0.002 kN calibration and declared DBC range',()=>{
 for(const [raw,expected]of [[0,0],[1,.002],[2500,5],[5000,10],[5001,10.002],[25000,50],[25001,null],[65535,null]])assert.equal(physicalEvent(force(raw),PLATFORM_FIELDS).values.IN1_Force_kN,expected);
 const decoded=physicalEvent(force(2500),PLATFORM_FIELDS);assert.deepEqual(Object.keys(decoded.values),['IN1_Force_kN']);
 assert.equal(decoded.values.IN2_Force_kN,undefined);assert.equal(decoded.values.IN3_Force_kN,undefined);
});
test('channel, frame type and ID must all match; J1939 stays on CAN2',()=>{
 assert.deepEqual(physicalEvent(force(2500,{channel:2}),PLATFORM_FIELDS).values,{});
 assert.deepEqual(physicalEvent(force(2500,{extended:true}),PLATFORM_FIELDS).values,{});
 assert.deepEqual(physicalEvent(force(2500,{id:0x302}),PLATFORM_FIELDS).values,{});
 assert.equal(physicalEvent(engine({}),PLATFORM_FIELDS).values.EngSpeed,2000);
 assert.deepEqual(physicalEvent(engine({channel:1}),PLATFORM_FIELDS).values,{});
 assert.equal(signalStatus(force(2500),PLATFORM_FIELDS).keys[0],'IN1_Force_kN');
});
test('profile timeline and physical import isolate channel roles without manufacturing pending values',()=>{
 const ds=prepareDataset({events:[force(2500),engine({})],report:{}},PLATFORM_FIELDS);
 const one=buildTimeline(ds,{device:'TEST',channel:'1',source:'standard'}),two=buildTimeline(ds,{device:'TEST',channel:'2',source:'0'});
 assert.deepEqual(one.series.IN1_Force_kN,[[1,5]]);assert.deepEqual(one.series.EngSpeed,[]);
 assert.deepEqual(two.series.EngSpeed,[[1,2000]]);assert.deepEqual(two.series.IN1_Force_kN,[]);
 const physical=prepareDataset(parsePhysical([{Time_s:1,channel:1,IN1_Force_kN:0,EngSpeed:2000},{Time_s:2,channel:2,IN1_Force_kN:30,EngSpeed:2000}],PLATFORM_FIELDS),PLATFORM_FIELDS);
 assert.deepEqual(physical.events[0].values,{IN1_Force_kN:0});assert.deepEqual(physical.events[1].values,{EngSpeed:2000});
});
test('separate IN1 force DBC import never changes engine definitions or decodes other bytes',()=>{
 const imported=parseForceDBC(syntheticDBC);assert.equal(imported.count,1);
 const data=Uint8Array.from([0x09,0xc4,0x13,0x88,0,0,0xff,0xff]);
 assert.deepEqual(physicalEvent(force(0,{data}),imported.fields).values,{IN1_Force_kN:25});
 assert.equal(physicalEvent(engine({}),imported.fields).values.EngSpeed,2000);
 assert.throws(()=>parseForceDBC(syntheticDBC.replaceAll('"kN"','"N"')),/单位/);
 assert.throws(()=>parseForceDBC(syntheticDBC.replace('BO_ 769','BO_ 2147484417')),/标准帧/);
});
