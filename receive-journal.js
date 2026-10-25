import {physicalEvent} from './protocol.js';
export function signalStatus(frame,fields){
 if(frame.error)return {kind:'warning',label:'CAN 错误帧',keys:[],matched:0};
 if(frame.remote)return {kind:'info',label:'远程请求帧',keys:[],matched:0};
 const values=frame.values??physicalEvent({...frame,data:Uint8Array.from(frame.data)},fields).values;
 const keys=Object.keys(values).filter(key=>Number.isFinite(values[key]));
 const matched=Object.keys(values).length;
 return {kind:keys.length?'success':matched?'warning':'info',label:keys.length?`${keys.length} 项有效信号`:matched?'目标信号无有效值':'无匹配目标信号',keys,matched};
}
export function summarizeRecords(records,fields){
 const out={can:0,targetFrames:0,matchedFrames:0,keys:[],gps:0,validGPS:0,other:0},keys=new Set();
 for(const event of records){
  if(event.kind==='can'){out.can++;const status=signalStatus(event,fields);if(status.matched)out.matchedFrames++;if(status.keys.length)out.targetFrames++;for(const key of status.keys)keys.add(key);}
  else if(event.kind==='gps'){out.gps++;if(event.valid)out.validGPS++;}else out.other++;
 }
 out.keys=[...keys];return out;
}
export class ReceiveJournal{
 constructor(limit=1000){this.limit=limit;this.rows=[];this.previous=null;this.nextId=1;}
 add(row){const entry={id:this.nextId++,...row};this.rows.push(entry);if(this.rows.length>this.limit)this.rows.splice(0,this.rows.length-this.limit);return entry;}
 begin(now){this.previous=null;return this.add({time:now,kind:'info',status:'开始连接',detail:'正在连接采集服务。'});}
 note(time,kind,status,detail){return this.add({time,kind,status,detail});}
 observe(result,fields,now){
  const current=result.report||{},previous=this.previous;
  const reset=previous&&['receivedBytes','packets','badChecksum','malformed'].some(key=>Number(current[key]||0)<Number(previous[key]||0));
  const delta=key=>previous&&!reset?Math.max(0,Number(current[key]||0)-Number(previous[key]||0)):0;
  const bytes=delta('receivedBytes'),frames=delta('packets'),bad=delta('badChecksum'),malformed=delta('malformed'),discarded=delta('discardedBytes');
  const records=result.records||[],summary=summarizeRecords(records,fields);
  const connectionChanged=previous&&current.activeConnections!==previous.activeConnections;
  this.previous={...current};
  if(previous&&!reset&&!records.length&&!bytes&&!frames&&!bad&&!malformed&&!discarded&&!connectionChanged)return null;
  const initial=!previous||reset;
  const detail=`CAN ${summary.can} 帧，其中 ${summary.targetFrames} 帧有有效目标信号（${summary.keys.length} 种）；GPS ${summary.validGPS}/${summary.gps} 帧有效；心跳及其他 ${summary.other} 帧。`;
  let kind='info',status='收到有效报文';
  if(summary.targetFrames||summary.validGPS){kind='success';status='收到有效数据';}
  else if(summary.matchedFrames){kind='warning';status='目标信号无有效值';}
  else if(summary.can)status='CAN 有效，无目标信号';
  else if(summary.gps){kind='warning';status='定位无效';}
  else if(bytes&&!frames&&!records.length){kind=bad||malformed||discarded?'warning':'info';status='收到字节，暂无有效帧';}
  else if(connectionChanged&&!records.length&&!frames)status=`设备连接数变为 ${current.activeConnections??0}`;
  if(bad||malformed){kind='warning';status=frames?'收到报文，部分异常':'报文校验或格式异常';}
  return this.add({time:now,kind,status:initial?(reset?'服务计数已重置':'已连接，载入已有记录'):status,bytes:initial?null:bytes,frames:initial?records.length:frames,bad:initial?null:bad,malformed:initial?null:malformed,discarded:initial?null:discarded,...summary,detail:(initial?'当前批次为已有记录，不计为新发送。':'')+detail+(bad||malformed?` 新增校验失败 ${bad}，格式异常 ${malformed}。`:'')+(discarded?` 丢弃非帧字节 ${discarded}。`:'')});
 }
}
export function pagination(total,size,requested,follow=false){
 const count=Math.max(1,Math.ceil(total/size)),index=follow?count-1:Math.max(0,Math.min(count-1,Number.isFinite(requested)?Math.trunc(requested):0));
 return {count,index,start:index*size,end:Math.min(total,(index+1)*size)};
}
