import {FIELDS} from './fields.js';
export {FIELDS};
export const pgn=id=>{const p=(id>>>8)&0x3ffff;return ((id>>>16)&255)<240?p&0x3ff00:p;};
const be=(a,i,n)=>{let v=0;for(let k=0;k<n;k++)v=v*256+a[i+k];return v;};
export const xor=a=>a.reduce((v,b)=>v^b,0);
export function encodePacket(type,body=[],sn='',sequence=0,ack=false){
 const serial=new TextEncoder().encode(sn).slice(-16),size=7+serial.length+body.length;
 const out=Uint8Array.from([0x55,size>>>8,size&255,sequence&255,serial.length|(ack?128:0),...serial,type,...body,0]);
 out[out.length-1]=xor(out.subarray(0,-1));return out;
}
export class PacketStream{
 constructor(){this.pending=new Uint8Array();this.report={packets:0,badChecksum:0,discardedBytes:0,truncated:0,malformed:0};}
 feed(chunk){let data=new Uint8Array(this.pending.length+chunk.length);data.set(this.pending);data.set(chunk,this.pending.length);let pos=0;const packets=[];
  while(pos<data.length){if(data[pos]!==0x55){this.report.discardedBytes++;pos++;continue;}if(data.length-pos<5)break;
   const len=be(data,pos+1,2),snLen=data[pos+4]&31;if(len<7+snLen||snLen>16||len>65535){this.report.malformed++;pos++;continue;}if(data.length-pos<len){let recovered=-1;for(let j=pos+1;j+7<=data.length;j++){if(data[j]!==0x55)continue;const n=be(data,j+1,2),s=data[j+4]&31;if(s<=16&&n>=7+s&&j+n<=data.length&&xor(data.subarray(j,j+n))===0){recovered=j;break;}}if(recovered<0)break;this.report.discardedBytes+=recovered-pos;this.report.malformed++;pos=recovered;continue;}
   const raw=data.slice(pos,pos+len);if(xor(raw)!==0){this.report.badChecksum++;pos++;continue;}
   const type=raw[5+snLen],device=new TextDecoder().decode(raw.subarray(5,5+snLen));
   packets.push({type,device:device||'未标识设备',sequence:raw[3],ack:!!(raw[4]&128),body:raw.slice(6+snLen,-1),raw});this.report.packets++;pos+=len;
  }
  this.pending=data.slice(pos);return packets;
 }
 finish(){this.report.truncated=this.pending.length;return {...this.report};}
}
export function decodePacket(packet,{gpsValidity='sample-bit15'}={}){
 const a=packet.body,base={device:packet.device,sequence:packet.sequence,type:packet.type};
 if(packet.type===15){if(a.length<12)throw Error('CAN 数据段过短');const t=be(a,0,4)+be(a,4,3)/1e6,channel=a[7],flags=a[8],extended=!!(flags&1),idBytes=extended?4:2,id=be(a,9,idBytes)&(extended?0x1fffffff:0x7ff),dlc=a[9+idBytes];
  if(channel<1||channel>6||be(a,4,3)>999999||(!(flags&4)&&dlc>8)||((flags&4)&&![0,1,2,3,4,5,6,7,8,12,16,20,24,32,48,64].includes(dlc))||a.length!==10+idBytes+dlc)throw Error('CAN 通道、长度或微秒时间戳无效');
  return {...base,kind:'can',t,channel,flags,extended,id,source:extended?id&255:null,data:a.slice(10+idBytes),error:!!(flags&32),remote:!!(flags&2)&&!(flags&4)};
 }
 if(packet.type===19){if(a.length!==20)throw Error('定位数据段长度应为 20 字节');const status=a[4],lon=be(a,5,4),lat=be(a,9,4),speed=be(a,13,2),heading=be(a,15,2),alt=be(a,17,2),sat=a[19];
  const scalar=v=>gpsValidity==='sample-bit15'&&!!(v&0x8000)?v&0x7fff:null;
  const longitude=(lon&0x80000000)?(lon&0x0fffffff)/1e6*((lon&0x40000000)?-1:1):null,latitude=(lat&0x80000000)?(lat&0x0fffffff)/1e6*((lat&0x40000000)?-1:1):null;
  const valid=!!(status&1)&&longitude!==null&&latitude!==null&&Math.abs(longitude)<=180&&Math.abs(latitude)<=90;
  return {...base,kind:'gps',t:be(a,0,4),status,valid,longitude,latitude,speed:scalar(speed)===null?null:scalar(speed)/10,heading:scalar(heading)===null?null:scalar(heading)/10,altitude:scalar(alt)===null?null:scalar(alt)-1000,satellites:sat&128?sat&31:null,system:['自动','GPS','北斗','保留'][(status>>>1)&7]||'保留',antenna:['正常','开路','短路','保留'][(status>>>4)&3],validityMode:gpsValidity};
 }
 return {...base,kind:packet.type===25?'heartbeat':'other',t:a.length>=4?be(a,0,4):null};
}
export function ackPacket(packet,result=0,now=Math.floor(Date.now()/1000)){
 const type={15:16,19:20,25:26}[packet.type];if(!packet.ack||!type)return null;
 return encodePacket(type,[now>>>24,(now>>>16)&255,(now>>>8)&255,now&255,result,0],packet.device==='未标识设备'?'':packet.device,packet.sequence);
}
export function extractRaw(data,s){let v=0n;if(s.endian===1){if(s.start+s.size>data.length*8)throw Error('载荷不足');for(let i=data.length-1;i>=0;i--)v=(v<<8n)|BigInt(data[i]);return (v>>BigInt(s.start))&((1n<<BigInt(s.size))-1n);}
 let bit=s.start;for(let n=0;n<s.size;n++){if(bit<0||bit>=data.length*8)throw Error('载荷不足');v=(v<<1n)|BigInt((data[bit>>>3]>>>(bit%8))&1);bit=bit%8===0?bit+15:bit-1;}return v;}
export function signalValue(data,s){try{let raw=extractRaw(data,s);if(s.size>=8&&s.extended){const high=Number(raw>>BigInt(s.size-8));if(high>=254)return null;}if(s.signed&&(raw&(1n<<BigInt(s.size-1))))raw-=1n<<BigInt(s.size);const v=Number(raw)*s.factor+s.offset;
 if(s.maximum>s.minimum&&(v<s.minimum-1e-7||v>s.maximum+1e-7))return null;
 return s.key==='EngFuelTemp1'&&Math.abs(v+40)<1e-7?null:v;
 }catch{return null;}}
export function physicalEvent(frame,fields=FIELDS){const values={};if(!frame.error&&!frame.remote)for(const s of fields){if(!Number.isInteger(s.start)||frame.extended!==s.extended||(frame.extended?pgn(frame.id)!==s.pgn:frame.id!==s.id))continue;values[s.key]=signalValue(frame.data,s);}
 return {...frame,values};}
export function hexBytes(text){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/),bytes=[];for(const line of lines){const s=line.trim();if(/^(?:[\da-f]{2}\s+){6,}[\da-f]{2}$/i.test(s))bytes.push(...s.split(/\s+/).map(x=>parseInt(x,16)));}if(!bytes.length)throw Error('未识别到连续十六进制报文行');return Uint8Array.from(bytes);}
export function parseHexLog(input,options={}){const stream=new PacketStream(),packets=stream.feed(typeof input==='string'?hexBytes(input):new Uint8Array(input)),events=[];for(const p of packets){try{events.push(decodePacket(p,options));}catch{stream.report.malformed++;}}return {events,report:stream.finish()};}
export function parseASC(text){const events=[];let base=16,relative=false,elapsed=0,malformed=0;for(const line of text.split(/\r?\n/)){if(/^base /i.test(line)){base=/base dec/i.test(line)?10:16;relative=/timestamps relative/i.test(line);continue;}const m=line.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+)\s+([\da-f]+x?)\s+(Rx|Tx)\s+d\s+(\d+)\s*(.*)$/i);if(!m)continue;const dlc=Number(m[5]),parts=m[6].trim().split(/\s+/),t=relative?(elapsed+=Number(m[1])):Number(m[1]),extended=/x$/i.test(m[3]),id=parseInt(m[3].replace(/x$/i,''),base),data=parts.slice(0,dlc).map(x=>parseInt(x,base));if(dlc>8||data.length!==dlc||data.some(x=>!Number.isInteger(x)||x<0||x>255)){malformed++;continue;}events.push({kind:'can',device:'ASC 导入',t,channel:+m[2],extended,id,source:extended?id&255:null,data:Uint8Array.from(data),flags:extended?1:0});}if(!events.length)throw Error('ASC 中没有有效 CAN 数据帧');return {events,report:{packets:events.length,malformed,badChecksum:0,truncated:0,discardedBytes:0}};}
export function parseDBC(text,fields=FIELDS){const out=fields.map(x=>({...x}));let current=null,count=0;for(const line of text.split(/\r?\n/)){const bo=line.match(/^BO_\s+(\d+)\s+(\S+)\s*:\s*(\d+)/);if(bo){const n=Number(bo[1]);current={id:n&0x1fffffff,extended:!!(n&0x80000000),message:bo[2]};continue;}const sg=line.match(/^\s*SG_\s+(\w+)\s*(M|m\d+M?)?\s*:\s*(\d+)\|(\d+)@([01])([+-])\s*\(([^,]+),([^\)]+)\)\s*\[([^|]+)\|([^\]]+)\]\s*"([^"]*)"/);if(!sg||!current)continue;const existing=out.find(s=>s.key===sg[1]||s.name===sg[1]);if(!existing)continue;if(sg[2])throw Error(`目标信号 ${sg[1]} 含多路复用，需要单独配置`);Object.assign(existing,current,{pgn:pgn(current.id),start:+sg[3],size:+sg[4],endian:+sg[5],signed:sg[6]==='-',factor:+sg[7],offset:+sg[8],minimum:+sg[9],maximum:+sg[10]});count++;}if(!count)throw Error('DBC 中没有匹配的目标信号');return {fields:out,count};}
export function csvRows(text){const rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);rows.push(row);}if(quoted)throw Error('CSV 引号未闭合');return rows;}
const numeric=v=>v===null||v===undefined||String(v).trim()===''||!Number.isFinite(Number(v))?null:Number(v);
export function parsePhysical(input){let records;if(typeof input==='string'){if(/^[\s\uFEFF]*[\[{]/.test(input))records=JSON.parse(input.replace(/^\uFEFF/,''));else {const rows=csvRows(input.replace(/^\uFEFF/,'')),header=rows.shift();records=rows.map(row=>Object.fromEntries(header.map((k,i)=>[k,row[i]])));}}else records=input;
 if(!Array.isArray(records))records=records.records||records.data||[records];if(!Array.isArray(records))throw Error('JSON 应包含数据记录数组');
 const events=[];for(const [i,r] of records.entries()){const rawTime=r.Time_s??r.timestamp??r.time??r.时间??i;let t=numeric(rawTime);if(t===null)t=Date.parse(rawTime)/1000;if(t>1e12)t/=1000;if(!Number.isFinite(t))continue;const values={};for(const s of FIELDS){const v=r[s.key]??r[s.label]??r.values?.[s.key];if(v!==undefined)values[s.key]=numeric(v);}const device=String(r.device??r.sn??r.SN??'物理量数据'),channel=Number(r.CAN_Channel??r.channel??1),address=r.SourceAddress??r.source??'0x00',source=String(address).startsWith('0x')?parseInt(address,16):numeric(address);events.push({kind:'physical',t,device,channel,source,values});const latitude=numeric(r.latitude??r.lat??r.纬度),longitude=numeric(r.longitude??r.lon??r.lng??r.经度);if(latitude!==null&&longitude!==null)events.push({kind:'gps',t,device,valid:Math.abs(latitude)<=90&&Math.abs(longitude)<=180,latitude,longitude,speed:numeric(r.gpsSpeed),heading:numeric(r.heading),altitude:numeric(r.altitude),satellites:numeric(r.satellites),system:'导入坐标',antenna:'未提供'});}
 if(!events.length)throw Error('没有可识别的数据记录');return {events,report:{packets:events.length,malformed:0,badChecksum:0,truncated:0,discardedBytes:0}};
}
export function prepareDataset(parsed,fields=FIELDS){const events=parsed.events.map(e=>e.kind==='can'?physicalEvent(e,fields):e).sort((a,b)=>(a.t??0)-(b.t??0));let start=Infinity,end=-Infinity;for(const e of events)if(Number.isFinite(e.t)){start=Math.min(start,e.t);end=Math.max(end,e.t);}return {events,report:parsed.report,devices:[...new Set(events.map(e=>e.device))],start,end};}
export function buildTimeline(dataset,{device,channel='',source=''}={}){
 const events=dataset.events.filter(e=>(!device||e.device===device)&&(e.kind==='gps'||((channel===''||e.channel===Number(channel))&&(source===''||e.source===Number(source)))));
 const series=Object.fromEntries(FIELDS.map(s=>[s.key,[]])),positions=[],frames=[];
 for(const e of events){if(e.kind==='gps'){if(e.valid)positions.push(e);continue;}if(!e.values)continue;frames.push(e);for(const [key,value]of Object.entries(e.values))if(series[key])series[key].push([e.t,value]);}
 // Integrate each source separately; never combine different ECUs or bridge long gaps.
 const rates=series.EngFuelRate,integrated=series.IntegratedFuel_L;if(!integrated.length&&rates.length){const states=new Map();let total=0;for(const e of frames){if(!Object.hasOwn(e.values,'EngFuelRate'))continue;const rate=e.values.EngFuelRate,id=e.channel+':'+e.source,old=states.get(id);if(rate!==null&&old&&old.rate!==null&&e.t>old.t&&e.t-old.t<=5)total+=(rate+old.rate)/2*(e.t-old.t)/3600;states.set(id,{t:e.t,rate});integrated.push([e.t,rate===null?null:total]);}}
 let start=Infinity,end=-Infinity;for(const e of events)if(Number.isFinite(e.t)){start=Math.min(start,e.t);end=Math.max(end,e.t);}return {events,series,positions,frames,start:start===Infinity?0:start,end:end===-Infinity?0:end};
}
export function valueAt(series,t,ttl=3){let lo=0,hi=series.length;while(lo<hi){const mid=(lo+hi)>>>1;if(series[mid][0]<=t)lo=mid+1;else hi=mid;}const point=series[lo-1];return point&&t-point[0]<=ttl?point[1]:null;}
