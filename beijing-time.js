const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const formatBeijing=milliseconds=>formatter.format(new Date(milliseconds));
export class NetworkClock{
 constructor({monotonic=()=>performance.now(),wall=()=>Date.now()}={}){this.monotonic=monotonic;this.wall=wall;this.anchor=null;this.syncedAt=null;}
 now(){return this.anchor===null?this.wall():this.anchor+this.monotonic()-this.syncedAt;}
 calibrate(dateHeader,ageHeader,started,ended){
  const server=Date.parse(dateHeader),age=Number(ageHeader||0),rtt=ended-started;
  if(!Number.isFinite(server)||!Number.isFinite(age)||age<0||rtt<0||rtt>10000)throw Error('网络时间响应无效');
  // Only accept a fresh response. CDN Date and Age may refer to different hops;
  // adding Age can double-count cache residence time when a proxy rewrites Date.
  if(age>2)throw Error('校时响应已缓存，拒绝使用陈旧时间');
  this.anchor=server+rtt/2;this.syncedAt=ended;
 }
 get synchronized(){return this.anchor!==null;}
}
