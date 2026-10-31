import {FIELDS as ENGINE_FIELDS} from './fields.js';
import {MONITOR_FIELDS} from './monitor-fields.js';
import {parseDBC} from './protocol.js?v=20261030-monitor1';

export const CHANNEL_PROFILES={1:{name:'传感器力',baudKbit:500},2:{name:'整车 J1939',baudKbit:250}};
export const FORCE_KEYS=['IN1_Force_kN'];
export const FORCE_FIELDS=[{key:'IN1_Force_kN',name:'IN1_Force_kN',label:'传感器力（IN1）',unit:'kN',channel:1,extended:false,payloadLength:8,id:0x301,message:'Zhongsheng_ADC_IN1_0x301',start:7,size:16,endian:0,signed:false,factor:.002,offset:0,minimum:0,maximum:50,note:'由提供的 DBC 定义：D0–D1 大端，原始值 × 0.002 kN'}];
export const PLATFORM_FIELDS=[...ENGINE_FIELDS.map(f=>({...f,channel:2,payloadLength:8})),...MONITOR_FIELDS.map(f=>({...f,payloadLength:8})),...FORCE_FIELDS];
export const fieldsForChannel=(fields,channel)=>fields.filter(f=>Number(f.channel)===Number(channel));
export function parseForceDBC(text,fields=PLATFORM_FIELDS){
 let message=null;const candidates=new Map();
 for(const line of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const bo=line.match(/^\s*BO_\s+(\d+)\s+(\S+)\s*:/);
  if(bo){message={rawId:Number(bo[1]),id:Number(bo[1])&0x1fffffff};continue;}
  const sg=line.match(/^\s*SG_\s+(IN1_Force_kN)\s*(?:M|m\d+M?)?\s*:/);
  if(!sg||!message)continue;
  if(message.rawId>0x7ff)throw Error('CAN1 力信号当前使用标准帧，请核对传感器 DBC 的 CAN ID');
  const old=candidates.get(sg[1]);if(old!==undefined&&old!==message.id)throw Error(`${sg[1]} 存在不同 CAN ID 定义，不能自动选择`);
  candidates.set(sg[1],message.id);
 }
 if(!candidates.size)throw Error('未找到 IN1_Force_kN，请提供对应力信号定义');
 const templates=fields.filter(f=>f.channel===1).map(f=>candidates.has(f.key)?{...f,id:candidates.get(f.key),start:0,pendingDefinition:false}:f);
 const result=parseDBC(text,templates);for(const field of result.fields)field.note=`DBC 换算：原始值 × ${field.factor} ${field.unit}，偏移 ${field.offset}`;
 return {...result,fields:fields.map(f=>f.channel===1?result.fields.find(s=>s.key===f.key)??f:f)};
}
