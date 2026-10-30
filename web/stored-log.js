export function parseStoredLog(input){
 const rows=typeof input==='string'?input.replace(/^\uFEFF/,'').split(/\r?\n/).filter(s=>s.trim()):Array.isArray(input)?input:input?.records;
 if(!Array.isArray(rows))throw Error('原始日志应为 NDJSON 记录或包含 records 的 JSON');
 const events=[];let malformed=0;
 for(const row of rows){try{
  const e=typeof row==='string'?JSON.parse(row):row;
  if(!e||typeof e.device!=='string'||!Number.isFinite(e.t))throw Error('记录格式无效');
  if(e.kind==='can'){
   if(!Number.isInteger(e.channel)||e.channel<1||e.channel>6||typeof e.extended!=='boolean'||!Number.isInteger(e.id)||e.id<0||e.id>(e.extended?0x1fffffff:0x7ff)||!Array.isArray(e.data)||e.data.length>64||e.data.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('CAN 记录无效');
   const flags=Number.isInteger(e.flags)?e.flags:e.extended?1:0;if(!!(flags&1)!==e.extended||(!(flags&4)&&e.data.length>8)||((flags&4)&&![0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64].includes(e.data.length)))throw Error('帧类型与数据长度不匹配');
   const event={...e,flags,error:!!(flags&32),remote:!!(flags&2)&&!(flags&4),data:Uint8Array.from(e.data),source:e.extended?e.id&255:null};delete event.values;events.push(event);
  }else if(e.kind==='gps')events.push({...e,valid:e.valid===true&&Number.isFinite(e.latitude)&&Number.isFinite(e.longitude)&&Math.abs(e.latitude)<=90&&Math.abs(e.longitude)<=180});
  else if(e.kind==='heartbeat'||e.kind==='other')events.push(e);
  else throw Error('不支持的日志记录');
 }catch{malformed++;}}
 if(!events.length)throw Error('日志中没有有效的原始记录');
 return {events,report:{packets:events.length,malformed,badChecksum:0,truncated:0,discardedBytes:0}};
}
