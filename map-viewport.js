// Keep automatic track fitting separate from explicit user zoom.
export class TrackViewport{
 constructor(map,{padding=28,maxZoom=19}={}){this.map=map;this.padding=padding;this.maxZoom=maxZoom;this.reset();}
 reset(){this.auto=true;this.fitted=false;this.pending=false;this.lastFit=-Infinity;this.lastCurrent=null;}
 manual(){this.auto=false;this.pending=false;this.lastCurrent=null;}
 fit(bounds,now=performance.now()){
  if(!bounds?.isValid())return false;
  this.map.fitBounds(bounds,{padding:[this.padding,this.padding],maxZoom:Math.min(this.maxZoom,this.map.getMaxZoom()),animate:false});
  this.fitted=true;this.pending=false;this.lastFit=now;return true;
 }
 fitTrack(bounds,now){this.auto=true;return this.fit(bounds,now);}
 update(bounds,current,{changed=false,follow=true,now=performance.now()}={}){
  if(!this.fitted){this.fit(bounds,now);return;}
  if(this.auto){
   if(changed)this.pending=true;
   if(follow&&this.pending&&now-this.lastFit>=1000){
    if(bounds?.isValid()&&!this.map.getBounds().contains(bounds))this.fit(bounds,now);
    this.pending=false;
   }
   return;
  }
  if(follow&&current&&(!this.lastCurrent||current[0]!==this.lastCurrent[0]||current[1]!==this.lastCurrent[1])){
   this.map.panTo(current,{animate:false});this.lastCurrent=[...current];
  }
 }
}
