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
 const evidence=signalEvidence(dataset,{device,fields}),wanted=new Set(DOCUMENT_SIGNALS.filter(s=>!s.excluded&&s.key).map(s=>s.key));wanted.add('WheelBasedVehicleSpeed');wanted.add('IN1_Force_kN');
 const groups=new Map();
 for(const f of fields){
  const e=evidence.get(f.key);if(!wanted.has(f.key)||!e?.valid||!Number.isInteger(f.start))continue;
  const groupId=`${f.channel}:${f.extended?f.pgn:f.id}`;
  if(!groups.has(groupId))groups.set(groupId,{channel:f.channel,extended:f.extended,pgn:f.extended?f.pgn:null,id:f.extended?f.pgn<<8:f.id,mask:f.extended?(((f.pgn>>>8)&255)<240?0x03ff0000:0x03ffff00):0x7ff,ids:new Set(),signals:[],samples:0});
  const group=groups.get(groupId);for(const id of e.ids)group.ids.add(id);group.signals.push(f.label);group.samples+=e.valid;
 }
 return [...groups.values()].map(g=>({...g,id:hex(g.id),mask:hex(g.mask),observedIds:[...g.ids].map(id=>hex(id)),ids:undefined}));
}
export function candidatePlan(fields){
 const wanted=new Set(DOCUMENT_SIGNALS.filter(s=>!s.excluded&&s.key).map(s=>s.key));wanted.add('WheelBasedVehicleSpeed');const groups=new Map();
 for(const f of fields){if(f.channel!==2||!wanted.has(f.key)||!Number.isInteger(f.start))continue;if(!groups.has(f.pgn))groups.set(f.pgn,{channel:2,pgn:f.pgn,id:hex(f.pgn<<8),mask:hex(((f.pgn>>>8)&255)<240?0x03ff0000:0x03ffff00),signals:[]});groups.get(f.pgn).signals.push(f.label);}
 return [...groups.values()];
}
const esc=text=>String(text??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class ForwardingAudit{
 constructor(id,{context,download,csvCell}){
  this.id=id;this.context=context;this.download=download;this.csvCell=csvCell;
  const host=document.getElementById(id);
  host.innerHTML='<div class="card-head"><div><h3>文档信号核对与 4G 转发筛选</h3><p>先导入实测 CAN 记录，再按出现有效样本的 ID 生成建议。</p></div><div class="inline"><button class="button subtle" data-export-audit>导出核对表</button><button class="button subtle" data-export-candidates>导出 CAN2 待测清单</button><button class="button primary" data-export-forward disabled>导出实测增补建议</button></div></div><p class="hint" data-forward-summary></p><div class="table-wrap"><table><thead><tr><th>文档信号</th><th>文档 PGN / SPN</th><th>实际 DBC 报文 / PGN</th><th>当前记录</th><th>核对说明</th></tr></thead><tbody data-forward-body></tbody></table></div><p class="hint">实测建议仅用于增补，不能直接覆盖原有白名单；当前没有 CAN2 输入时尤其要保留整车待测规则。待测清单来自 DBC 定义，不代表实测通过。本表不直接修改记录仪。掩码按 1=参与匹配表示；填写厂家工具前核对其掩码约定，并保留 GPS、心跳。未见有效数据不能据此断言设备不支持。</p>';
  host.querySelector('[data-export-audit]').onclick=()=>this.export(false);host.querySelector('[data-export-forward]').onclick=()=>this.export(true);
  host.querySelector('[data-export-candidates]').onclick=()=>{const rows=[['CAN通道','PGN','筛选ID','掩码_1参与匹配','信号','验证状态'],...candidatePlan(this.context().fields).map(p=>[p.channel,p.pgn,p.id,p.mask,p.signals.join(';'),'由DBC定义，待现场验证；保留原有规则'])];this.download('CAN2待验证PGN清单.csv','\uFEFF'+rows.map(row=>row.map(this.csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');};
 }
 rows(){const ctx=this.context();if(!ctx?.dataset)return [];const evidence=signalEvidence(ctx.dataset,ctx);return DOCUMENT_SIGNALS.map(item=>{const f=ctx.fields.find(f=>f.key===item.key),e=evidence.get(item.key);return [item.label,`${item.docPgn} / ${item.docSpn}`,f?`${f.message} / ${f.pgn} (${hex(f.pgn,4)})`:'—',ctx.demo?'合成演示，不作实测依据':item.excluded?'按文档不监控':!f?'当前 DBC 未定义':e?.valid?`${e.valid} 个可解码样本`:e?.matched?'报文存在，样本均无效':'当前记录未见有效输入',item.note];});}
 render(){const ctx=this.context();if(!ctx?.dataset)return;const plan=forwardingPlan(ctx.dataset,ctx),host=document.getElementById(this.id);host.querySelector('[data-forward-body]').innerHTML=this.rows().map(row=>'<tr>'+row.map(cell=>`<td>${esc(cell)}</td>`).join('')+'</tr>').join('');host.querySelector('[data-export-forward]').disabled=!plan.length;host.querySelector('[data-forward-summary]').textContent=ctx.demo?'当前为合成演示：不会生成可用于设备配置的实测筛选建议。':`当前设备 ${ctx.device} · 实测可建议 ${plan.length} 个 CAN ID/PGN 筛选项。字段可解码不等于传感器或工况一定正常；结论仅覆盖已载入记录。`;}
 export(planOnly){const ctx=this.context();let rows;if(planOnly){const plan=forwardingPlan(ctx.dataset,ctx);if(!plan.length)return;rows=[['CAN通道','帧类型','PGN','建议筛选ID','掩码_1参与匹配','实测CAN_ID','信号','可解码样本数'],...plan.map(p=>[p.channel,p.extended?'扩展帧':'标准帧',p.pgn??'',p.id,p.mask,p.observedIds.join(';'),p.signals.join(';'),p.samples])];}else rows=[['文档信号','文档PGN_SPN_待核对','实际DBC报文_PGN','当前记录','核对说明'],...this.rows()];this.download(planOnly?'CAN转发筛选建议.csv':'文档信号核对表.csv','\uFEFF'+rows.map(row=>row.map(this.csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');}
}
