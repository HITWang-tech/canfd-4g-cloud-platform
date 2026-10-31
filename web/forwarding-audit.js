import {DOCUMENT_SIGNALS} from './monitor-spec.js';
const hex=(value,size=8)=>'0x'+value.toString(16).toUpperCase().padStart(size,'0');
export function signalEvidence(dataset,{device,fields}){
 const evidence=new Map(fields.map(f=>[f.key,{matched:0,valid:0,invalid:0,ids:new Set(),sources:new Set()}]));
 for(const event of dataset.events){
  if(event.kind!=='can'||event.device!==device)continue;
  for(const [key,value]of Object.entries(event.values||{})){
   const entry=evidence.get(key);if(!entry)continue;entry.matched++;
   if(Number.isFinite(value)){entry.valid++;entry.ids.add(event.id);entry.sources.add(event.source);}else entry.invalid++;
  }
 }
 return evidence;
}
export function forwardingPlan(dataset,{device,fields,demo=false}){
 if(demo)return [];
 const evidence=signalEvidence(dataset,{device,fields});
 const groups=new Map();
 for(const f of fields){
  const e=evidence.get(f.key);if(!e?.valid||!Number.isInteger(f.start)||f.pendingDefinition)continue;
  const groupId=`${f.channel}:${f.extended?f.pgn:f.id}`;
  if(!groups.has(groupId))groups.set(groupId,{channel:f.channel,extended:f.extended,pgn:f.extended?f.pgn:null,id:f.extended?f.pgn<<8:f.id,mask:f.extended?(((f.pgn>>>8)&255)<240?0x03ff0000:0x03ffff00):0x7ff,ids:new Set(),signals:[],samples:0});
  const group=groups.get(groupId);for(const id of e.ids)group.ids.add(id);group.signals.push(f.label);group.samples+=e.valid;
 }
 return [...groups.values()].map(g=>({...g,id:hex(g.id),mask:hex(g.mask),observedIds:[...g.ids].map(id=>hex(id)),ids:undefined}));
}
export function candidatePlan(fields){
 const groups=new Map();
 for(const f of fields){
  if(!Number.isInteger(f.start)||f.pendingDefinition)continue;
  const key=`${f.channel}:${f.extended?f.pgn:f.id}`;
  if(!groups.has(key))groups.set(key,{channel:f.channel,extended:f.extended,pgn:f.extended?f.pgn:null,id:hex(f.extended?f.pgn<<8:f.id),mask:hex(f.extended?(((f.pgn>>>8)&255)<240?0x03ff0000:0x03ffff00):0x7ff),signals:[]});
  groups.get(key).signals.push(f.label);
 }
 return [...groups.values()];
}
const AUDIT_HEADERS=['信号名称','CAN通道','单位','DBC报文 / CAN ID / PGN','参考PGN / SPN（待核对）','当前记录','核对说明'];
export function auditRows(dataset,ctx){
 const evidence=signalEvidence(dataset,ctx);
 const rows=ctx.fields.map(f=>{
  const reference=DOCUMENT_SIGNALS.find(item=>item.key===f.key),e=evidence.get(f.key),computed=f.key==='IntegratedFuel_L',fuel=evidence.get('EngFuelRate');
  const status=ctx.demo?'合成演示，不作实测依据':computed?(fuel?.valid?`积分计算量；已有 ${fuel.valid} 个有效燃油率输入样本`:'积分计算量；等待有效燃油率输入'):e?.valid?`${e.valid} 个可解码样本`:e?.matched?'报文存在，样本均无效':'当前记录未见有效输入';
  const definition=computed?'平台计算（无独立 CAN ID）':f.extended?`${f.message} / PGN ${f.pgn} (${hex(f.pgn,4)})`:`${f.message} / 标准帧 ${hex(f.id,3)}`;
  return [f.label,`CAN${f.channel}`,f.unit,definition,reference?`${reference.docPgn} / ${reference.docSpn}`:'—',status,[f.note,reference?.note].filter(Boolean).join('；')];
 });
 for(const item of DOCUMENT_SIGNALS.filter(item=>!item.key))rows.push([item.label,'CAN2','—','—',`${item.docPgn} / ${item.docSpn}`,item.excluded?'不纳入监控':'当前 DBC 未定义',item.note]);
 return rows;
}
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class ForwardingAudit{
 constructor(id,{context,download,csvCell}){
  this.id=id;this.context=context;this.download=download;this.csvCell=csvCell;
  const host=document.getElementById(id);
  host.innerHTML='<div class="card-head"><div><h3>信号核对与 4G 转发筛选</h3></div><div class="inline"><button class="button subtle" data-export-audit>导出核对表</button><button class="button subtle" data-export-candidates>导出全部待测清单</button><button class="button primary" data-export-forward disabled>导出实测增补建议</button></div></div><p class="hint" data-forward-summary></p><div class="table-wrap"><table><thead><tr>'+AUDIT_HEADERS.map(label=>'<th>'+label+'</th>').join('')+'</tr></thead><tbody data-forward-body></tbody></table></div>';
  host.querySelector('[data-export-audit]').onclick=()=>this.export(false);host.querySelector('[data-export-forward]').onclick=()=>this.export(true);
  host.querySelector('[data-export-candidates]').onclick=()=>{const rows=[['CAN通道','帧类型','PGN','筛选ID','掩码_1参与匹配','信号','验证状态'],...candidatePlan(this.context().fields).map(p=>[p.channel,p.extended?'扩展帧':'标准帧',p.pgn??'',p.id,p.mask,p.signals.join(';'),'由DBC定义，待现场验证；保留原有规则'])];this.download('CAN待验证筛选清单.csv','\uFEFF'+rows.map(row=>row.map(this.csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 }
 rows(){const ctx=this.context();return ctx?.dataset?auditRows(ctx.dataset,ctx):[];}
 render(){const ctx=this.context();if(!ctx?.dataset)return;const plan=forwardingPlan(ctx.dataset,ctx),host=document.getElementById(this.id);host.querySelector('[data-forward-body]').innerHTML=this.rows().map(row=>'<tr>'+row.map(cell=>`<td>${esc(cell)}</td>`).join('')+'</tr>').join('');host.querySelector('[data-export-forward]').disabled=!plan.length;host.querySelector('[data-forward-summary]').textContent=ctx.demo?'合成演示 · 筛选建议未启用':`设备 ${ctx.device} · 可增补 ${plan.length} 项`;}
 export(planOnly){const ctx=this.context();let rows;if(planOnly){const plan=forwardingPlan(ctx.dataset,ctx);if(!plan.length)return;rows=[['CAN通道','帧类型','PGN','建议筛选ID','掩码_1参与匹配','实测CAN_ID','信号','可解码样本数'],...plan.map(p=>[p.channel,p.extended?'扩展帧':'标准帧',p.pgn??'',p.id,p.mask,p.observedIds.join(';'),p.signals.join(';'),p.samples])];}else rows=[AUDIT_HEADERS,...this.rows()];this.download(planOnly?'CAN转发筛选建议.csv':'信号核对表.csv','\uFEFF'+rows.map(row=>row.map(this.csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
}
