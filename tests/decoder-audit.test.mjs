import test from 'node:test';
import assert from 'node:assert/strict';
import {FIELDS,pgn,PacketStream,encodePacket,ackPacket,decodePacket,extractRaw,signalValue,physicalEvent,parseDBC,parseASC,parsePhysical,prepareDataset,buildTimeline} from '../web/protocol.js';
import {buildLiveView,chooseLiveStream} from '../web/live-view.js';

const dbcSignal=(s,changes={})=>{const f={...s,...changes};return ` SG_ ${f.name} : ${f.start}|${f.size}@${f.endian}${f.signed?'-':'+'} (${f.factor},${f.offset}) [${f.minimum}|${f.maximum}] "${f.unit}" ECU`;};
const dbcMessage=(s,changes={})=>`BO_ ${(s.id|0x80000000)>>>0} EEC1: 8 ECU\n${dbcSignal(s,changes)}`;
const rpm=FIELDS.find(s=>s.key==='EngSpeed');
const event=(changes={})=>({kind:'physical',device:'A',channel:1,source:0,t:0,values:{EngFuelRate:36},...changes});

test('DBC import matches PGN and name, independent of duplicate-name ordering',()=>{
 const wrong=`BO_ ${(0x18fecdfe|0x80000000)>>>0} DM4: 13 ECU\n${dbcSignal(rpm,{start:56})}`;
 for(const text of [wrong+'\n'+dbcMessage(rpm),dbcMessage(rpm)+'\n'+wrong]){
  const result=parseDBC(text);assert.equal(result.count,1);assert.equal(result.fields.find(s=>s.key===rpm.key).start,24);
 }
 assert.throws(()=>parseDBC(wrong),/没有匹配/);
});

test('all 21 direct fields retain their layout on canonical DBC import',()=>{
 const direct=FIELDS.filter(s=>Number.isInteger(s.start));
 const result=parseDBC(direct.map(s=>dbcMessage(s)).join('\n'));
 assert.equal(result.count,21);
 for(const s of direct)for(const key of ['start','size','endian','signed','factor','offset','minimum','maximum','pgn'])assert.equal(result.fields.find(f=>f.key===s.key)[key],s[key],s.key+':'+key);
});

test('DBC rejects ambiguous PGNs, invalid layouts, incompatible units, multiplexing and floats',()=>{
 assert.throws(()=>parseDBC(dbcMessage(rpm)+'\n'+dbcMessage(rpm,{start:8})),/冲突/);
 assert.throws(()=>parseDBC(dbcMessage(rpm,{start:60})),/载荷/);
 assert.throws(()=>parseDBC(dbcMessage(rpm,{factor:Infinity})),/定义无效/);
 assert.throws(()=>parseDBC(dbcMessage(rpm,{unit:'rad/s'})),/单位/);
 assert.throws(()=>parseDBC(dbcMessage(rpm).replace('EngSpeed :','EngSpeed m1 :')),/多路复用/);
 assert.throws(()=>parseDBC(dbcMessage(rpm)+`\nSIG_VALTYPE_ ${(rpm.id|0x80000000)>>>0} EngSpeed : 1;`),/浮点/);
 assert.equal(parseDBC(dbcMessage(rpm,{unit:'r/min'})).count,1);
});

test('PGN matching ignores priority and source, PDU1 destination is excluded',()=>{
 assert.equal(pgn(0x0cf00400),pgn(0x18f004fa));
 assert.equal(pgn(0x18ea00fe),pgn(0x0cea80ab));
 assert.notEqual(pgn(0x18fef100),pgn(0x18fef200));
 const frame={extended:true,id:0x18f004ab,data:Uint8Array.from([0,0,125,0x80,0x3e,0,0,0])};
 assert.equal(physicalEvent(frame).values.EngSpeed,2000);
 assert.deepEqual(physicalEvent({...frame,extended:false}).values,{});
 assert.deepEqual(physicalEvent({...frame,error:true}).values,{});
 assert.deepEqual(physicalEvent({...frame,remote:true}).values,{});
});

test('unsigned J1939 reserved values are invalid, zero and negative torque remain valid',()=>{
 assert.equal(signalValue(Uint8Array.from([0,0,0,0xff,0xff]),rpm),null);
 assert.equal(signalValue(Uint8Array.from([0,0,0,0,0xfe]),rpm),null);
 assert.equal(signalValue(new Uint8Array(8),rpm),0);
 const torque=FIELDS.find(s=>s.key==='ActualEngPercentTorque');
 assert.equal(signalValue(new Uint8Array(8),torque),-125);
 assert.equal(signalValue(new Uint8Array(2),rpm),null);
 const fuelTemp=FIELDS.find(s=>s.key==='EngFuelTemp1');assert.equal(signalValue(new Uint8Array(8),fuelTemp),null);
});

test('Intel and Motorola integer extraction handles signed values without treating negatives as NA',()=>{
 for(const endian of [0,1]){
  const s={start:endian?0:7,size:16,endian,signed:true,extended:true,factor:1,offset:0,minimum:-32768,maximum:32767};
  assert.equal(signalValue(Uint8Array.from(endian?[0xfe,0xff]:[0xff,0xfe]),s),-2);
 }
 assert.equal(extractRaw(Uint8Array.from([0xab,0xcd]),{start:3,size:8,endian:0}),0xbcn);
 assert.equal(extractRaw(Uint8Array.from([0xab,0xcd]),{start:4,size:8,endian:1}),0xdan);
});

test('JSON explicit null clears prior values, preserves zero, and does not integrate across invalid samples',()=>{
 const parsed=parsePhysical([{Time_s:0,EngFuelRate:36,EngSpeed:1000},{Time_s:1,EngFuelRate:null,EngSpeed:null,values:{EngSpeed:1234}},{Time_s:2,EngFuelRate:36,EngSpeed:0}]);
 assert.equal(parsed.events[1].values.EngSpeed,null);
 assert.equal(parsed.events[1].values.EngFuelRate,null);
 assert.equal(parsed.events[2].values.EngSpeed,0);
 assert.equal(buildTimeline(prepareDataset(parsed)).series.IntegratedFuel_L.at(-1)[1],0);
 assert.throws(()=>parsePhysical([null]),/记录格式/);
});

test('fuel integration never bridges devices, NaN, infinity or negative fuel rates',()=>{
 assert.equal(buildTimeline(prepareDataset({events:[event(),event({device:'B',t:1})],report:{}})).series.IntegratedFuel_L.at(-1)[1],0);
 for(const bad of [NaN,Infinity,-1]){
  const tl=buildTimeline(prepareDataset({events:[event(),event({t:1,values:{EngFuelRate:bad}}),event({t:2})],report:{}}));
  assert.deepEqual(tl.series.IntegratedFuel_L,[[0,0],[1,null],[2,0]]);
 }
});

test('standard-frame selection is explicit in offline and live paths',()=>{
 const frames=[event({source:null,values:{EngSpeed:50}}),event({t:1,values:{EngSpeed:2000}})];
 const selection={device:'A',channel:'1',source:'standard'};
 assert.deepEqual(buildTimeline(prepareDataset({events:frames,report:{}}),selection).series.EngSpeed,[[0,50]]);
 assert.equal(buildLiveView(frames,selection).signals.get('EngSpeed').value,50);
 assert.equal(chooseLiveStream([frames[0]],{device:'A',channel:'',source:''}).source,'standard');
});

test('fragmented CAN FD never resyncs into packet-shaped bytes in its payload',()=>{
 const nested=encodePacket(25,[1,2,3,4],'INNER',5),payload=new Uint8Array(64);payload.set(nested);
 const body=[0,0,0,1,0,0,0,1,4,1,0x23,64,...payload];
 const outer=encodePacket(15,body,'OUTER',7,true);
 for(let cut=1;cut<outer.length;cut++){
  const stream=new PacketStream(),packets=[...stream.feed(outer.slice(0,cut)),...stream.feed(outer.slice(cut))];
  assert.equal(packets.length,1,'cut '+cut);assert.equal(packets[0].device,'OUTER');assert.equal(decodePacket(packets[0]).data.length,64);
 }
});

test('ACK echoes exact raw device serial bytes, including non-UTF8',()=>{
 const serial=Uint8Array.from([0xff,0x80,0x41]),packet=new PacketStream().feed(encodePacket(25,[0,0,0,1],serial,3,true))[0];
 const reply=new PacketStream().feed(ackPacket(packet))[0];assert.deepEqual(reply.serial,serial);assert.equal(reply.sequence,3);
});

test('ASC rejects partially parsed byte tokens and out-of-range IDs; decimal bases are strict',()=>{
 const parsed=parseASC('  base hex timestamps absolute\n0 1 7B Rx d 1 00\n1 1 7B Rx d 1 0G\n2 1 800 Rx d 1 00\n3 1 20000000x Rx d 1 00');
 assert.equal(parsed.events.length,1);assert.equal(parsed.report.malformed,3);
 const decimal=parseASC('base dec timestamps absolute\n0 1 123 Rx d 1 25\n1 1 123 Rx d 1 2F');
 assert.equal(decimal.events[0].data[0],25);assert.equal(decimal.report.malformed,1);
});

test('unknown fragmented packet is buffered rather than guessing at embedded packet boundaries',()=>{
 const nested=encodePacket(25,[0,0,0,1],'NESTED'),bytes=encodePacket(99,[0,0,...nested,1,2,3],'UNKNOWN');
 const stream=new PacketStream();assert.equal(stream.feed(bytes.slice(0,-3)).length,0);
 const [packet]=stream.feed(bytes.slice(-3));assert.equal(packet.type,99);assert.equal(packet.device,'UNKNOWN');
});
