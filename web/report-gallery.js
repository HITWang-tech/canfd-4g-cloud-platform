export const REPORT_FIGURES=[
 {id:'emissions',title:'后处理系统出口排放速率',subtitle:'NOx · CO₂ · PM',file:'emission-rates.png',description:'沿用原分析系统的三联图，展示 NOx、CO₂、PM 出口排放速率随时间的变化，原图单位为 kg/s。'},
 {id:'correlation',title:'关键指标关联热力图',subtitle:'运行工况与排放关联',file:'correlation-heatmap.png',description:'展示燃油、车速、发动机与牵引功率、驱动力、阻力以及 NOx、CO₂、PM 的相关性。相关性不表示因果关系。'}
];
const url=figure=>'./assets/analysis-reports/'+figure.file;
export class ReportGallery{
 constructor(id){
  this.host=document.getElementById(id);this.scale=1;this.base=1;
  this.host.innerHTML='<div class="report-grid">'+REPORT_FIGURES.map(figure=>`<article class="card report-card"><div class="card-head"><div><span class="eyebrow">${figure.subtitle}</span><h3>${figure.title}</h3></div><div class="inline"><button class="button primary" data-open-report="${figure.id}">放大查看</button><a class="button subtle" href="${url(figure)}" download="${figure.file}">下载原图</a></div></div><button class="report-image-button" data-open-report="${figure.id}" aria-label="放大查看${figure.title}"><img src="${url(figure)}" alt="${figure.title}，来源于既有仿真分析结果" loading="lazy" draggable="false"></button></article>`).join('')+'</div>';
  const dialog=document.createElement('dialog');dialog.id='report-image-dialog';dialog.innerHTML='<div class="dialog-head"><div><h2 data-report-title></h2></div><button type="button" data-report-close aria-label="关闭图像">×</button></div><div class="report-view-tools"><div class="inline"><button class="button subtle" data-report-zoom="out" aria-label="缩小图片">−</button><span data-report-scale></span><button class="button subtle" data-report-zoom="in" aria-label="放大图片">＋</button><button class="button subtle" data-report-zoom="fit">适应窗口</button><button class="button subtle" data-report-zoom="native">原始大小</button></div><a class="button primary" data-report-download>下载原图</a></div><div class="report-image-stage" tabindex="0" aria-label="图像查看区域"><div class="report-image-canvas"><img draggable="false"></div></div>';
  document.body.append(dialog);this.dialog=dialog;this.stage=dialog.querySelector('.report-image-stage');this.image=dialog.querySelector('img');this.canvas=dialog.querySelector('.report-image-canvas');
  this.host.querySelectorAll('[data-open-report]').forEach(button=>button.onclick=()=>this.open(button.dataset.openReport));dialog.querySelector('[data-report-close]').onclick=()=>dialog.close();
  dialog.querySelectorAll('[data-report-zoom]').forEach(button=>button.onclick=()=>{const action=button.dataset.reportZoom;this.setScale(action==='fit'?1:action==='native'?1/this.base:this.scale*(action==='in'?1.25:.8));});
  this.image.onload=()=>{this.scale=1;this.fit();this.stage.scrollTo(0,0);};this.image.onerror=()=>{dialog.querySelector('[data-report-scale]').textContent='图像加载失败，请刷新后重试';};
  this.stage.addEventListener('keydown',event=>{if(['+','=','-','0'].includes(event.key)){event.preventDefault();this.setScale(event.key==='0'?1:this.scale*(event.key==='-'?.8:1.25));}});
  this.stage.addEventListener('pointerdown',event=>{if(event.button!==0)return;this.drag={x:event.clientX,y:event.clientY,left:this.stage.scrollLeft,top:this.stage.scrollTop};this.stage.setPointerCapture(event.pointerId);this.stage.classList.add('dragging');});
  this.stage.addEventListener('pointermove',event=>{if(!this.drag)return;this.stage.scrollLeft=this.drag.left+this.drag.x-event.clientX;this.stage.scrollTop=this.drag.top+this.drag.y-event.clientY;});
  const stop=()=>{this.drag=null;this.stage.classList.remove('dragging');};this.stage.addEventListener('pointerup',stop);this.stage.addEventListener('pointercancel',stop);dialog.addEventListener('close',stop);
  window.addEventListener('resize',()=>{if(dialog.open)this.fit();});
 }
 open(id){const figure=REPORT_FIGURES.find(f=>f.id===id);if(!figure)return;this.dialog.querySelector('[data-report-title]').textContent=figure.title;this.image.alt=figure.title;const link=this.dialog.querySelector('[data-report-download]');link.href=url(figure);link.download=figure.file;this.dialog.showModal();this.scale=1;this.image.src=url(figure);if(this.image.complete&&this.image.naturalWidth)this.fit();}
 fit(){if(!this.image.naturalWidth)return;this.base=Math.min(1,(this.stage.clientWidth-24)/this.image.naturalWidth,(this.stage.clientHeight-24)/this.image.naturalHeight);this.setScale(this.scale);}
 setScale(scale){this.scale=Math.max(.25,Math.min(8,scale));const width=this.image.naturalWidth*this.base*this.scale,height=this.image.naturalHeight*this.base*this.scale;this.image.style.width=width+'px';this.image.style.height=height+'px';this.canvas.style.minWidth=width+24+'px';this.canvas.style.minHeight=height+24+'px';this.dialog.querySelector('[data-report-scale]').textContent=Math.round(this.base*this.scale*100)+'%';}
}
