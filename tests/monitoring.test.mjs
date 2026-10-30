import test from 'node:test';import assert from 'node:assert/strict';
import {PLATFORM_FIELDS} from '../web/channel-profiles.js';
import {MONITOR_FIELDS} from '../web/monitor-fields.js';
import {physicalEvent,prepareDataset,buildTimeline,parseDBC} from '../web/protocol.js';
import {NOX_KEYS,scrEfficiency,regenSummary,volumeDosing,observedPeriod} from '../web/monitor-data.js';
import {MonitoringContext} from '../web/monitor-context.js';
import {buildLiveView} from '../web/live-view.js';
import {forwardingPlan,candidatePlan,auditRows} from '../web/forwarding-audit.js';
import {parseStoredLog} from '../web/stored-log.js';

const sample=(value,source=0,t=100)=>({value,source,t,state:'fresh',device:'A',channel:2});
const good=()=>Object.fromEntries(NOX_KEYS.map((key,i)=>[key,sample(i===0?500:i===1?100:1)]));
const raw=(id,data,channel=2)=>({kind:'can',device:'A',channel,source:id&255,extended:true,id,t:100,data:Uint8Array.from(data)});

test('SCR efficiency requires valid flags, synchronized samples, positive inlet and a 0–100 result',()=>{
 assert.equal(scrEfficiency(good()).value,80);
 for(const patch of [{SCRInletNOx:sample(0)},{SCROutletNOx:sample(-1)},{SCROutletNOx:sample(600)},{NOxInletStable:sample(0)},{NOxInletPower:sample(2)},{NOxOutletAtTemp:{...sample(1),state:'stale'}},{SCROutletNOx:sample(100,0,102)},{NOxInletStable:{...sample(1),t:undefined}}])assert.equal(scrEfficiency({...good(),...patch}).value,null);
 assert.equal(scrEfficiency({...good(),SCROutletNOx:sample(0)}).value,100);
});
test('SCR source pairing needs explicit confirmation and never crosses devices, channels or flag origins',()=>{
 const points=good();for(const key of ['SCROutletNOx','NOxOutletPower','NOxOutletAtTemp','NOxOutletStable'])points[key].source=82;
 assert.equal(scrEfficiency(points).value,null);assert.equal(scrEfficiency(points,1.5,true).value,80);
 assert.equal(scrEfficiency({...points,SCROutletNOx:{...points.SCROutletNOx,device:'B'}},1.5,true).value,null);
 assert.equal(scrEfficiency({...points,NOxOutletStable:sample(1)},1.5,true).value,null);
});
test('monitor context honors device-specific NOx bindings and reception-time freshness',()=>{
 const input={kind:'physical',device:'A',channel:2,source:0,t:100,receivedAt:100000,values:{SCRInletNOx:500,NOxInletPower:1,NOxInletAtTemp:1,NOxInletStable:1}},output={...input,source:82,values:{SCROutletNOx:100,NOxOutletPower:1,NOxOutletAtTemp:1,NOxOutletStable:1}};
 const dataset=prepareDataset({events:[input,output],report:{}},PLATFORM_FIELDS),selection={device:'A',channel:'2',source:'0'},timeline=buildTimeline(dataset,selection);
 const state={dataset,timeline,fields:PLATFORM_FIELDS,selection,liveView:buildLiveView(dataset.events,selection),live:true,now:100500,cursor:100,ttl:3,styles:{},bindings:{device:'A',inlet:'0',outlet:'82',confirmed:true},demo:false};
 const context=new MonitoringContext(()=>state);let ctx=context.get();assert.equal(scrEfficiency(Object.fromEntries(NOX_KEYS.map(k=>[k,ctx.sample(k)])),1.5,ctx.confirmedNoxPair).value,80);
 state.now=105000;ctx=context.get();assert.equal(scrEfficiency(Object.fromEntries(NOX_KEYS.map(k=>[k,ctx.sample(k)])),1.5,true).value,null);
});
test('new DBC fields decode correct real byte locations and enum error/NA codes',()=>{
 assert.equal(physicalEvent(raw(0x18fdb200,[0,0,0,0,250,0,0,0]),PLATFORM_FIELDS).values.DPFDifferentialPressure,25);
 assert.equal(physicalEvent(raw(0x0cf02300,[0xe8,3,14,0,0,0,0,0]),PLATFORM_FIELDS).values.UreaDosingMassRate,300);
 assert.equal(physicalEvent(raw(0x0cf02300,[0xe8,3,14,0,0,0,0,0]),PLATFORM_FIELDS).values.SCRSystemState,14);
 assert.equal(physicalEvent(raw(0x0cf02300,[0xe8,3,15,0,0,0,0,0]),PLATFORM_FIELDS).values.SCRSystemState,null);
 assert.equal(physicalEvent(raw(0x18fd7c00,[0,8,0,0,0,0,0,0]),PLATFORM_FIELDS).values.ActiveRegenStatus,2);
 assert.equal(physicalEvent(raw(0x18fd7c00,[0,2,0,0,0,0,0,0]),PLATFORM_FIELDS).values.PassiveRegenStatus,null);
});
test('duplicate temperature and FMI names are disambiguated by an explicit DBC selector',()=>{
 const fields=MONITOR_FIELDS.filter(f=>f.key==='DOCInletTemp');
 const dbc=`BO_ ${(0x18fd20fe|0x80000000)>>>0} A1DOC: 8 ECU\n SG_ Aftrtrtmnt1DslOxdtnCtlystIntkGsT : 0|16@1+ (0.03125,-273) [-273|1734.96875] "deg C" ECU\n SG_ Aftrtrtmnt1DslOxdtnCtlystIntkGsT : 48|5@1+ (1,0) [0|31] "" ECU`;
 const result=parseDBC(dbc,fields);assert.equal(result.count,1);assert.equal(result.fields[0].size,16);assert.equal(result.fields[0].start,0);
});
test('unit conversion needs real density, periods remain raw, and regen transitions do not invent interruption',()=>{
 assert.ok(Math.abs(volumeDosing(3960,1.1)-1)<1e-12);assert.equal(volumeDosing(3960,null),null);assert.equal(volumeDosing(0,1.1),0);
 assert.equal(observedPeriod([[0,1],[1,2],[2,3],[2,4],[3,4]]),1);
 assert.equal(regenSummary({ActiveRegenStatus:sample(0),PassiveRegenStatus:sample(0)}).text,'当前无主动或被动再生');
});
test('forwarding plans use only real decodable CAN evidence and correct PGN masks',()=>{
 const frame=raw(0x0cf00400,[0,125,125,0x80,0x3e,0,0,0]),dataset=prepareDataset({events:[frame],report:{}},PLATFORM_FIELDS);
 assert.deepEqual(forwardingPlan(dataset,{device:'A',fields:PLATFORM_FIELDS,demo:true}),[]);
 const plan=forwardingPlan(dataset,{device:'A',fields:PLATFORM_FIELDS});assert.equal(plan.length,1);assert.equal(plan[0].mask,'0x03FFFF00');assert.equal(plan[0].id,'0x00F00400');assert.deepEqual(plan[0].observedIds,['0x0CF00400']);
 assert.deepEqual(forwardingPlan(dataset,{device:'B',fields:PLATFORM_FIELDS}),[]);
});
test('stored raw logs preserve device time and re-decode bytes rather than trusting stored values',()=>{
 const frame={...raw(0x0cf00400,[0,125,125,0x80,0x3e,0,0,0]),data:[0,125,125,0x80,0x3e,0,0,0],values:{EngSpeed:9999}},gps={kind:'gps',device:'A',t:101,valid:true,latitude:45,longitude:126};
 const parsed=parseStoredLog(JSON.stringify(frame)+'\n'+JSON.stringify(gps)+'\n{broken');assert.equal(parsed.report.malformed,1);assert.equal(parsed.events[0].t,100);
 const dataset=prepareDataset(parsed,PLATFORM_FIELDS);assert.equal(dataset.events[0].values.EngSpeed,2000);assert.equal(dataset.events[1].valid,true);
});


test('PTO source binding routes only PTO and stays scoped to one device',()=>{
 const events=[{kind:'physical',device:'A',channel:2,source:0,t:100,values:{EngSpeed:1500,PowerTakeoffSpeed:600}},{kind:'physical',device:'A',channel:2,source:42,t:100,values:{EngSpeed:900,PowerTakeoffSpeed:540}}];
 const dataset=prepareDataset({events,report:{}},PLATFORM_FIELDS),selection={device:'A',channel:'2',source:'0'},state={dataset,selection,timeline:buildTimeline(dataset,selection),fields:PLATFORM_FIELDS,cursor:100,ttl:3,styles:{},ptoBinding:{device:'A',source:'42'}};
 const context=new MonitoringContext(()=>state);assert.equal(context.get().sample('PowerTakeoffSpeed').value,540);assert.equal(context.get().sample('EngSpeed').value,1500);
 state.ptoBinding.device='B';assert.equal(context.get().sample('PowerTakeoffSpeed').value,600);
});

test('DBC candidate rules cover all direct signals on CAN1 and CAN2, excluding computed values',()=>{
 const plan=candidatePlan(PLATFORM_FIELDS),labels=plan.flatMap(p=>p.signals);assert.ok(plan.some(p=>p.channel===2&&p.pgn===61444));
 for(const f of PLATFORM_FIELDS.filter(f=>Number.isInteger(f.start)))assert.ok(labels.includes(f.label),f.key);
 const force=plan.find(p=>p.channel===1);assert.equal(force.id,'0x00000301');assert.equal(force.mask,'0x000007FF');assert.equal(force.pgn,null);assert.equal(force.extended,false);
 assert.ok(!labels.includes(PLATFORM_FIELDS.find(f=>f.key==='IntegratedFuel_L').label));
});

test('audit covers all 49 platform fields plus unsupported references and identifies computed fuel',()=>{
 const dataset=prepareDataset({events:[raw(0x18fef200,[0,0,0,0,0,0,0,0])],report:{}},PLATFORM_FIELDS),ctx={device:'A',fields:PLATFORM_FIELDS};
 const rows=auditRows(dataset,ctx);assert.equal(rows.length,53);
 for(const f of PLATFORM_FIELDS)assert.equal(rows.filter(row=>row[0]===f.label).length,1,f.key);
 const fuel=rows.find(row=>row[0]===PLATFORM_FIELDS.find(f=>f.key==='IntegratedFuel_L').label);assert.ok(fuel[3].includes('无独立 CAN ID'));assert.ok(fuel[5].includes('积分计算量'));assert.ok(!fuel[5].includes('可解码'));
 assert.ok(rows.find(row=>row[0]==='传感器力（IN1）')[3].includes('0x301'));
});

test('observed forwarding suggestions include legacy engine signals and force without adding absent PGNs',()=>{
 const field=PLATFORM_FIELDS.find(f=>f.key==='BarometricPress'),force={...raw(0x301,[9,196,0,0,0,0,0,0],1),extended:false,source:null};
 const dataset=prepareDataset({events:[raw(field.id,Array(8).fill(0)),force],report:{}},PLATFORM_FIELDS),plan=forwardingPlan(dataset,{device:'A',fields:PLATFORM_FIELDS});
 assert.ok(plan.some(p=>p.signals.includes(field.label)));assert.ok(plan.some(p=>p.channel===1&&p.id==='0x00000301'));
 assert.ok(!plan.some(p=>p.pgn===61444));
});

test('raw log type and DLC contradictions are rejected and short target frames do not decode',()=>{
 const valid={...raw(0x0cf00400,[0,125,125,0x80,0x3e,0,0,0]),data:[0,125,125,0x80,0x3e,0,0,0]},badType={...valid,flags:0},badFD={...valid,flags:5,data:Array(9).fill(0)};
 const parsed=parseStoredLog([valid,badType,badFD]);assert.equal(parsed.events.length,1);assert.equal(parsed.report.malformed,2);
 assert.equal(physicalEvent(raw(0x0cf00400,[0,125,125,0x80,0x3e]),PLATFORM_FIELDS).values.EngSpeed,null);
});
