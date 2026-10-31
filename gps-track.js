export function validPosition(e){return e?.kind==='gps'&&e.valid===true&&Number.isFinite(e.t)&&Number.isFinite(e.latitude)&&Math.abs(e.latitude)<=90&&Number.isFinite(e.longitude)&&Math.abs(e.longitude)<=180;}
export function trackSegments(events,{until=Infinity,maxGap=10}={}){
 const segments=[];let segment=[],previous=null;
 for(const e of events){
  if(e.kind!=='gps'||e.t>until)continue;
  if(!validPosition(e)){if(segment.length)segments.push(segment);segment=[];previous=null;continue;}
  if(previous&&(e.device!==previous.device||e.t-previous.t>maxGap||e.t<previous.t)){if(segment.length)segments.push(segment);segment=[];}
  segment.push([e.latitude,e.longitude]);previous=e;
 }
 if(segment.length)segments.push(segment);return segments;
}
