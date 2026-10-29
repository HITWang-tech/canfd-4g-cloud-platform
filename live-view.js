const sourceKey=e=>e.source===null?'standard':String(e.source??'');
const matches=(e,s)=>e.device===s.device&&(s.channel===''||String(e.channel)===String(s.channel))&&(s.source===''||sourceKey(e)===String(s.source));
const newer=(a,b)=>!b||(Number.isFinite(a.receivedAt)&&Number.isFinite(b.receivedAt)&&a.receivedAt!==b.receivedAt?a.receivedAt>b.receivedAt:Number.isFinite(a.cursor)&&Number.isFinite(b.cursor)&&a.cursor!==b.cursor?a.cursor>b.cursor:(a.t??0)>=(b.t??0));
export function buildLiveView(events,selection){
 const signals=new Map();let frame=null,gps=null;
 for(const e of events){
  if(e.device!==selection.device)continue;
  if(e.kind==='gps'){if(newer(e,gps))gps=e;continue;}
  if(!matches(e,selection)||!['can','physical'].includes(e.kind))continue;
  if(newer(e,frame))frame=e;
  for(const [key,value]of Object.entries(e.values||{}))if(newer(e,signals.get(key)?.event))signals.set(key,{value:Number.isFinite(value)?value:null,event:e});
 }
 return {signals,frame,gps,cursor:frame?.t??gps?.t??0};
}
export function liveSignal(view,key,now,ttl){
 const sample=view?.signals.get(key);if(!sample)return {value:null,state:'missing',age:null};
 const age=Number.isFinite(sample.event.receivedAt)?Math.max(0,(now-sample.event.receivedAt)/1000):null;
 return {value:sample.value,state:sample.value===null?'invalid':age===null?'unknown':age>ttl?'stale':'fresh',age};
}
export function chooseLiveStream(events,selection){
 const weights={EngSpeed:10,ActualEngPercentTorque:8,AccelPedalPos1:6,EngFuelRate:6},groups=new Map();
 for(const e of events){
  if(!['can','physical'].includes(e.kind))continue;
  const stream={device:e.device,channel:String(e.channel),source:sourceKey(e)},id=JSON.stringify(stream);
  if(!groups.has(id))groups.set(id,{...stream,keys:new Set()});
  for(const [key,value]of Object.entries(e.values||{}))if(Number.isFinite(value))groups.get(id).keys.add(key);
 }
 const entries=[...groups.values()].map(g=>({...g,score:[...g.keys].reduce((sum,k)=>sum+(weights[k]||1),0)}));
 const current=entries.find(g=>g.device===selection.device&&g.channel===String(selection.channel)&&g.source===String(selection.source));
 // Preserve a useful stream; automatically leave a raw-only default until the user chooses manually.
 const chosen=current?.score>0?current:entries.sort((a,b)=>b.score-a.score)[0];
 return chosen?{device:chosen.device,channel:chosen.channel,source:chosen.source}:null;
}
