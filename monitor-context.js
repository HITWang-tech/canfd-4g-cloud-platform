import {buildTimeline} from './protocol.js?v=20261030-monitor1';
import {buildLiveView,liveSignal} from './live-view.js';
import {pointAt} from './monitor-data.js';
const inletKeys=new Set(['SCRInletNOx','NOxInletPower','NOxInletAtTemp','NOxInletStable']);
const outletKeys=new Set(['SCROutletNOx','NOxOutletPower','NOxOutletAtTemp','NOxOutletStable']);
const sourceLabel=source=>source==='standard'?'标准帧':source===''?'未选择':`0x${Number(source).toString(16).toUpperCase().padStart(2,'0')}`;
export class MonitoringContext{
 constructor(getState){this.getState=getState;this.cached=null;}
 get(){
  const s=this.getState();if(!s.timeline||!s.dataset)return null;
  const binding=s.bindings?.device===s.selection.device?s.bindings:{inlet:'current',outlet:'current',confirmed:false};
  const ptoBinding=s.ptoBinding?.device===s.selection.device?s.ptoBinding:{source:'current'};
  const sources={pto:ptoBinding.source==='current'||ptoBinding.source===undefined?s.selection.source:String(ptoBinding.source),inlet:binding.inlet==='current'||binding.inlet===undefined?s.selection.source:String(binding.inlet),outlet:binding.outlet==='current'||binding.outlet===undefined?s.selection.source:String(binding.outlet)};
  const signature=JSON.stringify([s.selection,sources]);
  if(!this.cached||this.cached.dataset!==s.dataset||this.cached.timeline!==s.timeline||this.cached.signature!==signature){
   const timelines=new Map([[s.selection.source,s.timeline]]),views=new Map([[s.selection.source,s.liveView]]);
   if(Number(s.selection.channel)===2)for(const source of new Set(Object.values(sources))){if(timelines.has(source))continue;const selection={device:s.selection.device,channel:'2',source};timelines.set(source,buildTimeline(s.dataset,selection));views.set(source,buildLiveView(s.dataset.events,selection));}
   this.cached={dataset:s.dataset,timeline:s.timeline,signature,timelines,views};
  }
  const sourceFor=key=>Number(s.selection.channel)!==2?s.selection.source:key==='PowerTakeoffSpeed'?sources.pto:inletKeys.has(key)?sources.inlet:outletKeys.has(key)?sources.outlet:s.selection.source;
  const series=key=>this.cached.timelines.get(sourceFor(key))?.series[key]||[];
  const timeCandidates=[s.cursor];if(s.live)for(const view of this.cached.views.values())if(Number.isFinite(view?.frame?.t))timeCandidates.push(view.frame.t);
  const cursor=Math.max(...timeCandidates);
  const sample=key=>{
   const source=sourceFor(key),view=this.cached.views.get(source);
   if(s.live){const status=liveSignal(view,key,s.now,s.ttl),event=view?.signals.get(key)?.event;return {...status,t:event?.t,device:event?.device,channel:event?.channel,source:event?.source};}
   return {...pointAt(series(key),cursor,s.ttl),device:s.selection.device,channel:Number(s.selection.channel),source:source==='standard'?null:Number(source)};
  };
  return {timeline:s.timeline,fields:s.fields,channel:s.selection.channel,cursor,series,sample,ttl:s.ttl,styles:s.styles,demo:s.demo,live:s.live,selection:JSON.stringify([s.filename,s.selection,binding,ptoBinding]),confirmedNoxPair:!!binding.confirmed,ureaDensity:Number.isFinite(s.ureaDensity)&&s.ureaDensity>0?s.ureaDensity:null,ptoSourceLabel:sourceLabel(sources.pto),sourceLabel:`${s.demo?'合成演示 · ':''}${s.selection.device} · CAN${s.selection.channel} · ECU ${sourceLabel(s.selection.source)}；NOx 入口 ${sourceLabel(sources.inlet)} / 出口 ${sourceLabel(sources.outlet)}`};
 }
}
