import {POWER_PLOTS,AFTER_PLOTS} from './monitor-spec.js';
import {NOX_KEYS,scrEfficiency,regenSummary,STATE_LABELS,observedPeriod,volumeDosing} from './monitor-data.js';
const font='Times New Roman, SimSun, serif',colors=['#2f718f','#b98749','#248a7e','#806daa'];
const powerKeys=['ActualEngPercentTorque','DriversDemandEngPercentTorque','EngOilPress','EngCoolantTemp','EngIntakeManifold1Press','EngIntakeManifold1Temp'];
const afterKeys=['DOCInletTemp','DPFInletTemp','SCRInletTemp','DPFDifferentialPressure','DPFSootLoadPercent','UreaTankLevel','UreaDosingMassRate'];
const states=['PassiveRegenStatus','ActiveRegenStatus','RegenInhibitStatus','SCRSystemState','NOxInletPower','NOxInletAtTemp','NOxInletStable','NOxOutletPower','NOxOutletAtTemp','NOxOutletStable'];
export class MonitorPanel{
 constructor(id,{kind,context,format,onEdit}){
  this.id=id;this.kind=kind;this.context=context;this.format=format;this.onEdit=onEdit;this.charts=new Map();this.gauges=new Map();this.zoom=new Map();this.legends=new Map();this.seconds=120;this.selection=null;
  this.keys=kind==='power'?powerKeys:afterKeys;this.plots=kind==='power'?POWER_PLOTS:AFTER_PLOTS;
  const host=document.getElementById(id);
  host.innerHTML=`<p class="notice" data-monitor-channel hidden>此页面用于 CAN2 整车数据，请在顶部切换到 CAN2。</p><div data-monitor-body><div class="monitor-toolbar"><p data-monitor-source></p><label>显示区间 <select data-monitor-window><option value="30">30 秒</option><option value="60">60 秒</option><option value="120" selected>120 秒</option><option value="0">完整记录</option></select></label></div><div class="monitor-metrics ${kind==='power'?'with-gauges':''}">${this.keys.map(key=>`<article class="card monitor-value"><h3 data-label="${key}"></h3>${kind==='power'?`<div class="monitor-gauge" data-monitor-gauge="${key}"></div>`:''}<strong data-monitor-value="${key}">—</strong><small data-monitor-state="${key}"></small></article>`).join('')}</div>${kind==='power'?'<div class="monitor-summary"><article class="card"><h3>需求与实际扭矩差</h3><strong data-torque-difference>—</strong><p>单位为百分点；仅作响应对比，不直接判定动力损失。</p></article><article class="card"><h3>发动机扭矩模式</h3><strong data-torque-mode>—</strong><p>DBC 未提供文字枚举，保留原始模式码。</p></article><article class="card"><h3>PTO 机具负载</h3><strong data-pto-speed>—</strong><p>PTO 扭矩：当前 DBC 未定义 N·m 信号，待补充厂家定义。</p></article></div>':`<div class="monitor-summary"><article class="card"><h3>再生状态</h3><strong data-regen-summary>—</strong><p>中断状态：当前 DBC 未提供明确中断标志，不由状态跳变推断。</p></article><article class="card"><h3>SCR 转化效率</h3><strong data-scr-efficiency>—</strong><p data-efficiency-reason></p></article><article class="card"><h3>尿素喷射单位</h3><strong data-urea-volume>—</strong><p>DBC 原始单位为 g/h；换算 mL/s 需在设置中填写实际溶液密度。</p></article></div><div class="monitor-states">${states.map(key=>`<article class="state-indicator" data-state-card="${key}"><i></i><div><span data-state-label="${key}"></span><strong data-enum="${key}">未收到</strong></div></article>`).join('')}<article class="state-indicator" data-tone="unknown"><i></i><div><span>再生中断标志</span><strong>当前 DBC 未定义</strong></div></article></div>`}<div class="monitor-plots">${this.plots.map(plot=>`<article class="card monitor-plot ${plot.wide?'wide':''}"><div class="card-head"><div><h3 data-plot-title="${plot.id}">${plot.title}</h3><p data-plot-period="${plot.id}"></p></div><div class="inline"><button class="button subtle" data-edit-monitor="${plot.id}">图窗设置</button><button class="button subtle" data-export-monitor="${plot.id}" disabled>导出图片</button></div></div><div class="monitor-chart" id="${plot.id}"></div><p class="hint" data-plot-empty="${plot.id}">等待有效样本</p></article>`).join('')}</div></div>`;
  host.querySelector('[data-monitor-window]').onchange=e=>{this.seconds=Number(e.target.value);this.zoom.clear();this.render();};
  for(const plot of this.plots){host.querySelector(`[data-edit-monitor="${plot.id}"]`).onclick=()=>onEdit(plot.id);host.querySelector(`[data-export-monitor="${plot.id}"]`).onclick=()=>this.export(plot.id);}
 }
 chart(plot){
  if(!this.charts.has(plot.id)){
   const chart=echarts.init(document.getElementById(plot.id));
   chart.on('datazoom',()=>{const z=chart.getOption().dataZoom[1];this.zoom.set(plot.id,{start:z.start,end:z.end});});
   chart.on('legendselectchanged',event=>this.legends.set(plot.id,event.selected));this.charts.set(plot.id,chart);
  }return this.charts.get(plot.id);
 }
 render(){
  const host=document.getElementById(this.id);if(!host.getClientRects().length)return;
  const ctx=this.context();if(!ctx?.timeline)return;
  const enabled=Number(ctx.channel)===2;host.querySelector('[data-monitor-channel]').hidden=enabled;host.querySelector('[data-monitor-body]').hidden=!enabled;if(!enabled)return;
  if(this.selection!==ctx.selection){this.selection=ctx.selection;this.zoom.clear();this.legends.clear();}
  host.querySelector('[data-monitor-source]').textContent=this.kind==='power'?ctx.sourceLabel.split('；')[0]+' · PTO 来源 '+ctx.ptoSourceLabel:ctx.sourceLabel;
  for(const key of this.keys){
   const field=ctx.fields.find(f=>f.key===key),sample=ctx.sample(key),value=sample?.value;
   host.querySelector(`[data-label="${key}"]`).textContent=field.label;
   const card=host.querySelector(`[data-monitor-value="${key}"]`).closest('article');card.classList.toggle('data-stale',sample.state==='stale');
   host.querySelector(`[data-monitor-value="${key}"]`).textContent=`${this.format(value,1)} ${field.unit}`;
   host.querySelector(`[data-monitor-state="${key}"]`).textContent=sample.state==='stale'?'上次值，已过期':sample.state==='invalid'?'报文信号无效':!Number.isFinite(value)?'尚无有效样本':ctx.demo?'合成演示数据':ctx.live?'实时接入':'记录回放';
   if(this.kind==='power'){
    if(!this.gauges.has(key))this.gauges.set(key,echarts.init(host.querySelector(`[data-monitor-gauge="${key}"]`)));
    this.gauges.get(key).setOption({animation:false,textStyle:{fontFamily:font},series:[{type:'gauge',startAngle:210,endAngle:-30,min:field.minimum,max:field.maximum,center:['50%','58%'],radius:'95%',pointer:{show:Number.isFinite(value)},axisLine:{lineStyle:{width:7,color:[[1,'#e5edf0']]}},progress:{show:Number.isFinite(value),width:7,itemStyle:{color:'#2f718f'}},axisTick:{show:false},splitLine:{length:7,distance:4},splitNumber:4,axisLabel:{distance:12,fontSize:10,fontFamily:font,formatter:v=>String(Math.round(v))},detail:{show:false},title:{show:false},data:[{value:Number.isFinite(value)?value:field.minimum}]}]},true);
   }
  }
  if(this.kind==='power'){
   const demand=ctx.sample('DriversDemandEngPercentTorque'),actual=ctx.sample('ActualEngPercentTorque');
   const valid=Number.isFinite(demand.value)&&Number.isFinite(actual.value)&&demand.state==='fresh'&&actual.state==='fresh'&&Math.abs(demand.t-actual.t)<=1;
   host.querySelector('[data-torque-difference]').textContent=valid?`${this.format(demand.value-actual.value,1)} 个百分点`:'—';
   const mode=ctx.sample('EngTorqueMode');host.querySelector('[data-torque-mode]').textContent=mode.state==='fresh'&&Number.isFinite(mode.value)?`模式码 ${mode.value}`:'尚无有效模式码';
   const pto=ctx.sample('PowerTakeoffSpeed');host.querySelector('[data-pto-speed]').textContent=`PTO 转速 ${this.format(pto.value,0)} rpm${pto.state==='stale'?'（上次值已过期）':''}`;
  }else{
   const samples=Object.fromEntries([...NOX_KEYS,'PassiveRegenStatus','ActiveRegenStatus','RegenInhibitStatus'].map(key=>[key,ctx.sample(key)])),eff=scrEfficiency(samples,1.5,ctx.confirmedNoxPair),regen=regenSummary(samples);
   host.querySelector('[data-regen-summary]').textContent=regen.text;host.querySelector('[data-scr-efficiency]').textContent=eff.value===null?'—':`${this.format(eff.value,1)} %`;host.querySelector('[data-efficiency-reason]').textContent=eff.reason;
   const dosing=ctx.sample('UreaDosingMassRate'),volume=dosing.state==='fresh'?volumeDosing(dosing.value,ctx.ureaDensity):null;
   host.querySelector('[data-urea-volume]').textContent=volume===null?'mL/s 待密度或有效数据':`${this.format(volume,3)} mL/s`;
   for(const key of states){
    const field=ctx.fields.find(f=>f.key===key),sample=ctx.sample(key),card=host.querySelector(`[data-state-card="${key}"]`);
    const known=sample.state==='fresh'&&Number.isFinite(sample.value),label=known?(STATE_LABELS[key]?.[sample.value]??`状态码 ${sample.value}`):sample.state==='stale'?'上次状态已过期':'尚无有效状态';
    card.dataset.tone=!known?'unknown':key.startsWith('NOx')?(sample.value===1?'success':'warning'):key==='RegenInhibitStatus'?(sample.value===1?'warning':'neutral'):key==='SCRSystemState'?(sample.value===2?'success':[3,14].includes(sample.value)?'warning':'neutral'):sample.value===1?'success':sample.value===2?'warning':'neutral';
    if(known&&!Object.hasOwn(STATE_LABELS[key]||{},sample.value))card.dataset.tone='unknown';if(known&&/错误/.test(label)&&!(key==='SCRSystemState'&&sample.value===3))card.dataset.tone='error';
    host.querySelector(`[data-state-label="${key}"]`).textContent=field.label;host.querySelector(`[data-enum="${key}"]`).textContent=label;
   }
  }
  const end=Math.max(ctx.timeline.start,ctx.cursor),start=this.seconds?Math.max(ctx.timeline.start,end-this.seconds):ctx.timeline.start;
  for(const plot of this.plots){
   const custom=ctx.styles[plot.id]||{},title=custom.title||plot.title,unit=plot.id==='after-dosing'&&ctx.ureaDensity?'mL/s':plot.unit;
   host.querySelector(`[data-plot-title="${plot.id}"]`).textContent=title;
   const series=plot.keys.map((key,i)=>{
    const points=ctx.series(key),out=[];let old=null;
    for(const [t,value]of points){if(t>end)break;if(t<start-ctx.ttl){old=t;continue;}if(old!==null&&t-old>ctx.ttl)out.push([old-ctx.timeline.start+.001,null]);out.push([t-ctx.timeline.start,plot.id==='after-dosing'&&ctx.ureaDensity?volumeDosing(value,ctx.ureaDensity):value]);old=t;}
    return {name:ctx.fields.find(f=>f.key===key)?.label||key,type:'line',yAxisIndex:plot.secondUnit?i:0,data:out,showSymbol:false,connectNulls:false,sampling:'lttb',lineStyle:{width:1.7,color:colors[i]},itemStyle:{color:colors[i]}};
   });
   const hasData=series.some(s=>s.data.some(p=>Number.isFinite(p[1]))),periods=plot.keys.map(key=>observedPeriod(ctx.series(key))).filter(Number.isFinite);
   host.querySelector(`[data-plot-empty="${plot.id}"]`).hidden=hasData;host.querySelector(`[data-export-monitor="${plot.id}"]`).disabled=!hasData;
   document.getElementById(plot.id).hidden=!hasData;
   host.querySelector(`[data-plot-period="${plot.id}"]`).textContent=`${this.kind==='after'?'后处理报文典型周期约 1 s':'动力报文保留原始采样点'} · ${periods.length?'观测间隔 '+periods.map(p=>this.format(p<1?p*1000:p,1)+(p<1?' ms':' s')).join(' / '):'尚无可统计的周期'}；${unit}${plot.secondUnit?' / '+plot.secondUnit:''}`;
   if(!hasData){this.charts.get(plot.id)?.clear();continue;}
   const axes=[{type:'value',name:unit,min:custom.min??undefined,max:custom.max??undefined,scale:true,splitLine:{lineStyle:{color:'#edf2f4'}}}];if(plot.secondUnit)axes.push({type:'value',name:plot.secondUnit,min:0,max:100,splitLine:{show:false}});
   this.chart(plot).setOption({animation:false,textStyle:{fontFamily:font,fontSize:custom.fontSize||13},tooltip:{trigger:'axis'},legend:{show:custom.legend!==false,selected:this.legends.get(plot.id)||{},top:7,type:'scroll'},grid:{left:74,right:plot.secondUnit?62:25,top:50,bottom:66},xAxis:{type:'value',min:start-ctx.timeline.start,max:Math.max(start-ctx.timeline.start+.1,end-ctx.timeline.start),name:'时间 / s',nameLocation:'middle',nameGap:28,axisLabel:{formatter:value=>this.format(value,1),hideOverlap:true,showMaxLabel:false},splitLine:{lineStyle:{color:'#edf2f4'}}},yAxis:axes,dataZoom:[{type:'inside',filterMode:'none'},{type:'slider',height:12,bottom:6,start:this.zoom.get(plot.id)?.start??0,end:this.zoom.get(plot.id)?.end??100,showDetail:false}],series},true);
  }
 }
 resize(){for(const chart of [...this.charts.values(),...this.gauges.values()])chart.resize();}
 export(id){const chart=this.charts.get(id);if(!chart)return;const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight+110;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#173343';ctx.font='45px "Times New Roman",SimSun,serif';ctx.textAlign='center';ctx.fillText(this.context().styles[id]?.title||this.plots.find(p=>p.id===id).title,canvas.width/2,70,canvas.width-100);ctx.drawImage(image,0,110);const a=document.createElement('a');a.href=canvas.toDataURL();a.download=id+'.png';a.click();};image.src=chart.getDataURL({pixelRatio:3,backgroundColor:'#fff'});}
}
