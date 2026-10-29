const osmCredit='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const BASEMAPS={
 osm:{name:'标准底图',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:osmCredit},
 hot:{name:'备用底图',url:'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',attribution:osmCredit+' · <a href="https://www.openstreetmap.fr/">OSM France</a> · <a href="https://www.hotosm.org/">HOT</a>'}
};

// Tile failures belong to TileLayer, not to the Leaflet map. Switching replaces
// the background layer only: coordinates, track layers, zoom and markers survive.
export class BasemapController{
 constructor(map,leaflet,{mode='auto',onStatus=()=>{},timeout=12000,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
  this.map=map;this.leaflet=leaflet;this.onStatus=onStatus;this.timeout=timeout;this.setTimer=setTimer;this.clearTimer=clearTimer;this.generation=0;this.timer=null;this.layer=null;
  this.setMode(mode);
 }
 status(text,warning=false){this.onStatus({text,warning,provider:this.provider});}
 stopTimer(){if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;}
 setMode(mode){this.mode=['auto','osm','hot'].includes(mode)?mode:'auto';this.tried=new Set();this.attach(this.mode==='hot'?'hot':'osm');}
 retry(){this.setMode(this.mode);}
 fail(){
  this.stopTimer();
  const generation=this.generation;if(this.pendingFailure===generation)return;this.pendingFailure=generation;
  // Leaflet still accesses its map after firing tileerror. Replacing the layer
  // inside that event would null its map before _tileReady finishes.
  queueMicrotask(()=>{if(generation!==this.generation)return;this.pendingFailure=null;
   if(this.mode==='auto'&&!this.tried.has('hot')){this.attach('hot');return;}
   this.status('底图加载失败：定位与轨迹仍可查看，请重试或切换底图。',true);
  });
 }
 attach(provider){
  this.stopTimer();this.pendingFailure=null;const generation=++this.generation;this.provider=provider;this.tried.add(provider);this.errors=0;this.loaded=0;
  if(this.layer)this.map.removeLayer(this.layer);
  const source=BASEMAPS[provider];this.status(source.name+'加载中…');
  const layer=this.leaflet.tileLayer(source.url,{minZoom:1,maxZoom:19,attribution:source.attribution,referrerPolicy:'strict-origin-when-cross-origin'});this.layer=layer;
  const current=()=>generation===this.generation;
  layer.on('loading',()=>{if(!current())return;this.stopTimer();this.errors=0;this.loaded=0;this.status(source.name+'加载中…');
   this.timer=this.setTimer(()=>{if(!current())return;this.timer=null;if(this.loaded===0)this.fail();else this.status(source.name+'部分区域加载较慢，可点击“重试底图”。',true);},this.timeout);
  });
  layer.on('tileload',()=>{if(current())this.loaded++;});
  layer.on('tileerror',()=>{if(!current())return;this.errors++;if(this.errors>=3)this.fail();});
  layer.on('load',()=>{if(!current())return;this.stopTimer();if(this.loaded===0&&this.errors)this.fail();else if(this.errors)this.status(source.name+'部分区域未加载，可点击“重试底图”。',true);else this.status(source.name+(provider==='hot'&&this.mode==='auto'?' · 已自动切换':'')+'已加载');});
  layer.addTo(this.map);
 }
 destroy(){this.stopTimer();this.generation++;if(this.layer)this.map.removeLayer(this.layer);this.layer=null;}
}
