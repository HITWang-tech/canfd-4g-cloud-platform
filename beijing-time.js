const formatter=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
export const formatBeijing=milliseconds=>formatter.format(new Date(milliseconds));
export class NetworkClock{
 constructor({monotonic=()=>performance.now(),wall=()=>Date.now()}={}){this.monotonic=monotonic;this.wall=wall;this.anchor=null;this.syncedAt=null;}
 now(){return this.anchor===null?this.wall():this.anchor+this.monotonic()-this.syncedAt;}
 calibrate(dateHeader,ageHeader,started,ended){
  const server=Date.parse(dateHeader),age=Number(ageHeader||0),rtt=ended-started;
  if(!Number.isFinite(server)||!Number.isFinite(age)||age<0||rtt<0||rtt>10000)throw Error('网络时间响应无效');
  this.anchor=server+age*1000+rtt/2;this.syncedAt=ended;
 }
 get synchronized(){return this.anchor!==null;}
}
