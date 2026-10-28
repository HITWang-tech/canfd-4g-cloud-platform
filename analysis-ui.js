import {powerSpectrum,workpointHistogram} from './signal-analysis.js';

export class AnalysisPanel{
 constructor({getContext,format,clock}){
  this.getContext=getContext;this.format=format;this.clock=clock;this.charts=new Map();this.ready=false;this.source=null;
  document.getElementById('run-analysis').onclick=()=>this.run();
  document.getElementById('analysis-window').onchange=()=>this.run();
  for(const button of document.querySelectorAll('[data-analysis-export]'))button.onclick=()=>this.export(button.dataset.analysisExport);
 }
 changed(source){
  if(source!==this.source){
   this.source=source;this.ready=false;for(const chart of this.charts.values())chart.clear();
   for(const id of ['spectrum-rpm','spectrum-torque','workpoint-heatmap']){
    document.getElementById(id+'-empty').textContent='点击“更新分析”计算当前来源。';document.getElementById(id+'-empty').hidden=false;
    document.getElementById(id+'-meta').textContent='';document.querySelector(`[data-analysis-export="${id}"]`).disabled=true;
   }
  }
  document.getElementById('analysis-status').textContent=this.ready?'已收到新数据；点击“更新分析”可重新计算当前来源。':'按当前设备、CAN 通道和 ECU 的数据计算；无有效样本时不生成图像。';
 }
 show(){if(!this.ready)this.run();else this.resize();}
 resize(){for(const chart of this.charts.values())chart.resize();}
 chart(id){if(!this.charts.has(id))this.charts.set(id,echarts.init(document.getElementById(id)));return this.charts.get(id);}
 empty(id,message){
  this.chart(id).clear();document.getElementById(id+'-empty').textContent=message;document.getElementById(id+'-empty').hidden=false;
  document.querySelector(`[data-analysis-export="${id}"]`).disabled=true;
 }
 filled(id){document.getElementById(id+'-empty').hidden=true;document.querySelector(`[data-analysis-export="${id}"]`).disabled=false;}
 run(){
  const {timeline,ttl,sourceLabel,demo}=this.getContext();if(!timeline)return;
  const fields=[['spectrum-rpm','EngSpeed','发动机转速波动功率谱','rpm'],['spectrum-torque','ActualEngPercentTorque','发动机实际扭矩百分比波动功率谱','%']];
  const ends=fields.map(([,key])=>timeline.series[key]?.at(-1)?.[0]).filter(Number.isFinite),end=ends.length?Math.max(...ends):timeline.end;
  const seconds=Number(document.getElementById('analysis-window').value),start=seconds?end-seconds:timeline.start;
  const common={animation:false,textStyle:{fontFamily:'Times New Roman, SimSun, serif',fontSize:13}};
  for(const [id,key,title,unit]of fields){
   const result=powerSpectrum(timeline.series[key]||[],{start,end});
   if(!result.ok){this.empty(id,result.reason);document.getElementById(id+'-meta').textContent='当前数据不足以进行频谱分析';continue;}
   this.filled(id);this.chart(id).setOption({...common,grid:{left:75,right:24,top:42,bottom:70},tooltip:{trigger:'axis',formatter:items=>{const p=items[0]?.data;return p?`频率：${this.format(p[0],4)} Hz<br>功率谱密度：${p[1].toPrecision(5)} ${unit}²/Hz`:'';}},xAxis:{type:'value',name:'频率 / Hz',min:0,max:result.nyquist,nameLocation:'middle',nameGap:30,axisLabel:{formatter:v=>String(Number(v.toPrecision(4))),hideOverlap:true}},yAxis:{type:'value',name:`${unit}²/Hz`,min:0,axisLabel:{formatter:v=>Math.abs(v)>=1e4||(v!==0&&Math.abs(v)<.001)?v.toExponential(1):String(Number(v.toPrecision(4)))},splitLine:{lineStyle:{color:'#edf2f4'}}},dataZoom:[{type:'inside'},{type:'slider',height:12,bottom:6,end:Math.min(100,Math.max(10,result.peakFrequency/result.nyquist*600)),showDetail:false}],series:[{name:title,type:'line',data:result.points,showSymbol:false,lineStyle:{color:key==='EngSpeed'?'#2f718f':'#b98749',width:1.7},areaStyle:{opacity:.06},markLine:{silent:true,symbol:'none',label:{show:false},data:[{xAxis:result.peakFrequency}],lineStyle:{type:'dashed',color:'#71858d'}}}]},true);
   document.getElementById(id+'-meta').textContent=`有效片段 ${this.clock(result.start)}—${this.clock(result.end)}；主峰 ${this.format(result.peakFrequency,4)} Hz，采样率 ${this.format(result.fs,3)} Hz，最高分析频率 ${this.format(result.nyquist,3)} Hz，分辨率 ${this.format(result.df,4)} Hz。${result.count} 点，${result.windows} 个平均窗口；间隔偏差 ${this.format(result.jitter*100,1)}%。${result.segmentCount>1?'已选择最长连续片段；缺口未拼接。':''}`;
  }
  const heat=workpointHistogram(timeline.series.EngSpeed||[],timeline.series.ActualEngPercentTorque||[],{start,end,ttl});
  if(!heat.ok){this.empty('workpoint-heatmap',heat.reason);document.getElementById('workpoint-heatmap-meta').textContent='等待同时有效的转速与扭矩百分比';}
  else{
   this.filled('workpoint-heatmap');const maximum=Math.max(...heat.points.map(p=>p[2]));
   this.chart('workpoint-heatmap').setOption({...common,grid:{left:85,right:100,top:30,bottom:75},tooltip:{position:'top',formatter:p=>`转速区间中心：${this.format(heat.xCenters[p.data[0]],1)} rpm<br>扭矩区间中心：${this.format(heat.yCenters[p.data[1]],1)} %<br>停留时间：${this.format(p.data[3],2)} s<br>有效时间占比：${this.format(p.data[2],2)} %`},xAxis:{type:'category',data:heat.xCenters.map(v=>this.format(v,0)),name:'发动机转速 / rpm',nameLocation:'middle',nameGap:42,axisLabel:{interval:Math.max(0,Math.floor(heat.xCenters.length/8)),rotate:20}},yAxis:{type:'category',data:heat.yCenters.map(v=>this.format(v,1)),name:'实际扭矩百分比 / %',nameLocation:'middle',nameGap:60,axisLabel:{interval:Math.max(0,Math.floor(heat.yCenters.length/8))}},visualMap:{min:0,max:maximum||1,dimension:2,calculable:true,orient:'vertical',right:8,top:'center',text:['占比 / %',''],precision:2,inRange:{color:['#eef5f6','#a9d4d0','#438f95','#1c4e6b']}},series:[{type:'heatmap',data:heat.points,label:{show:false},emphasis:{itemStyle:{borderColor:'#173343',borderWidth:1}}}]},true);
   document.getElementById('workpoint-heatmap-meta').textContent=`统计转速 > 0 rpm 的有效运行片段；共同有效时间 ${this.format(heat.totalSeconds,2)} s。颜色表示停留时间占比，合计 100%；按时间加权，不按报文条数计权。超时或无效信号不参与。`;
  }
  document.getElementById('analysis-status').textContent=`${demo?'合成演示数据 · ':''}${sourceLabel} · 分析区间 ${this.clock(Math.max(start,timeline.start))}—${this.clock(end)}。结果为当前已载入数据的快照，点击“更新分析”刷新。`;
  this.ready=true;this.resize();
 }
 export(id){
  const chart=this.charts.get(id);if(!chart||document.getElementById(id+'-empty').hidden===false)return;
  const title=document.getElementById(id+'-title').textContent+(this.getContext().demo?'（合成演示数据）':''),image=chart.getRenderedCanvas({pixelRatio:2,backgroundColor:'#fff'}),canvas=document.createElement('canvas');
  canvas.width=image.width;canvas.height=image.height+95;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#173343';ctx.textAlign='center';ctx.font='26px "Times New Roman", SimSun';ctx.fillText(title,canvas.width/2,40);ctx.drawImage(image,0,65);
  const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=id+'.png';a.click();
 }
}
