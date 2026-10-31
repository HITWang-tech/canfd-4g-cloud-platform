import {FORCE_KEYS} from './channel-profiles.js';
const colors=['#2f718f','#248a7e','#b98749'];
const font='Times New Roman, SimSun, serif';
export class ForcePanel{
 constructor(id,{context,format,onEdit}){
  this.id=id;this.context=context;this.format=format;this.chart=null;this.selection=null;this.zoom=null;this.legendSelected={};
  const host=document.getElementById(id);
  host.innerHTML=`<div class="force-metrics">${FORCE_KEYS.map((key,i)=>`<article><span>传感器力 · IN1</span><strong data-force-value="${key}">—</strong><small data-force-status="${key}">待接收</small></article>`).join('')}</div><article class="card"><div class="card-head"><div><h3 data-force-title>传感器力时域曲线</h3></div><div class="inline"><button type="button" class="button subtle" data-force-edit>图窗设置</button><button type="button" class="button subtle" data-force-export disabled>导出图片</button></div></div><div class="force-chart" role="img" aria-label="传感器力时域曲线"></div><p hidden data-force-note></p></article>`;
  host.querySelector('[data-force-edit]').onclick=onEdit;
  host.querySelector('[data-force-export]').onclick=()=>this.export();
 }
 render(){
  const ctx=this.context(),host=document.getElementById(this.id);if(!ctx||!host.getClientRects().length)return;
  if(!this.chart){this.chart=echarts.init(host.querySelector('.force-chart'));this.chart.on('legendselectchanged',event=>{this.legendSelected=event.selected;});this.chart.on('datazoom',()=>{const z=this.chart.getOption().dataZoom[1];this.zoom={start:z.start,end:z.end};});}
  if(this.selection!==ctx.selection){this.selection=ctx.selection;this.zoom=null;this.legendSelected={};}
  const style=ctx.style||{},defined=FORCE_KEYS.map(k=>ctx.fields.find(f=>f.key===k)).filter(f=>Number.isInteger(f?.start)),names=new Map(defined.map(f=>[f.key,f.label]));
  let valid=0;
  for(const key of FORCE_KEYS){
   const def=ctx.fields.find(f=>f.key===key),configured=Number.isInteger(def?.start),value=configured?ctx.value(key):null,status=configured?ctx.freshness(key):null;
   host.querySelector(`[data-force-value="${key}"]`).textContent=configured?`${this.format(value,2)} kN`:'—';
   host.querySelector(`[data-force-status="${key}"]`).textContent=!configured?'待提供 DBC 定义':status?.state==='stale'?'上次值 · 已过期':status?.state==='invalid'?'信号无效':value===null?'尚未收到有效数据':ctx.demo?'合成演示数据':ctx.live?'实时接入':'记录回放';
   host.querySelector(`[data-force-value="${key}"]`).closest('article').classList.toggle('data-stale',status?.state==='stale');
   if(configured&&(ctx.timeline.series[key]||[]).some(p=>Number.isFinite(p[1])))valid++;
  }
  const missing=FORCE_KEYS.filter(k=>!names.has(k)).map(k=>k.replace('_Force_kN',''));
  host.querySelector('[data-force-note]').textContent=`已定义 ${defined.length}/${FORCE_KEYS.length} 路。${missing.length?missing.join('、')+' 待提供 CAN ID、位位置与标定，不推定为相邻字节。':''} 未收到或超出 DBC 范围的样本保留为空；点击图例切换曲线，滚轮或底部滑块缩放。`;
  const title=style.title||'传感器力时域曲线';host.querySelector('[data-force-title]').textContent=title;
  host.querySelector('[data-force-export]').disabled=!valid;
  const lo=ctx.range[0]-ctx.timeline.start,hi=Math.max(lo+.1,ctx.range[1]-ctx.timeline.start);
  this.chart.setOption({animation:false,textStyle:{fontFamily:font,fontSize:style.fontSize||13},tooltip:{trigger:'axis',valueFormatter:value=>`${this.format(value,2)} kN`},legend:{selected:this.legendSelected,show:style.legend!==false,top:10,right:20,type:'scroll'},grid:{left:68,right:28,top:54,bottom:68},xAxis:{type:'value',name:'时间 / s',nameLocation:'middle',nameGap:28,min:lo,max:hi,splitLine:{lineStyle:{color:'#edf2f4'}}},yAxis:{type:'value',name:'传感器力 / kN',min:style.min??0,max:style.max??Math.max(50,...defined.map(f=>f.maximum)),splitLine:{lineStyle:{color:'#edf2f4'}}},dataZoom:[{type:'inside',filterMode:'none'},{type:'slider',height:14,bottom:7,start:this.zoom?.start??0,end:this.zoom?.end??100,showDetail:false}],series:defined.map(f=>({name:f.label,type:'line',data:ctx.series(f.key),showSymbol:false,connectNulls:false,sampling:'lttb',lineStyle:{width:1.8,color:colors[FORCE_KEYS.indexOf(f.key)]},itemStyle:{color:colors[FORCE_KEYS.indexOf(f.key)]}}))},true);
 }
 resize(){this.chart?.resize();}
 export(){
  if(!this.chart)return;
  const image=new Image();image.onload=()=>{const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight+110;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#173343';ctx.font='48px "Times New Roman",SimSun,serif';ctx.textAlign='center';ctx.fillText(this.context().style?.title||'传感器力时域曲线',canvas.width/2,72,canvas.width-100);ctx.drawImage(image,0,110);const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='sensor_force_CAN1.png';link.click();};
  image.src=this.chart.getDataURL({pixelRatio:3,backgroundColor:'#fff'});
 }
}
