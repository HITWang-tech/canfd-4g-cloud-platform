const finite=Number.isFinite;
const median=values=>{const a=values.slice().sort((x,y)=>x-y),n=a.length;return n?(a[(n-1)>>1]+a[n>>1])/2:null;};

export const SIGNAL_GROUPS=[
 {name:'动力与操纵',keys:['WheelBasedVehicleSpeed','EngSpeed','ActualEngPercentTorque','ActlMaxAvailableEngPercentTorque','AccelPedalPos1']},
 {name:'燃油系统',keys:['EngFuelRate','EngFuelDeliveryPress','EngFuelTemp1','EngTripFuel','IntegratedFuel_L']},
 {name:'润滑与冷却',keys:['EngOilPress','EngOilTemp1','EngCoolantTemp','EngOilLevel','EngCoolantLevel']},
 {name:'电气系统',keys:['BatteryPotential_PowerInput1','KeyswitchBatteryPotential','ChargingSystemPotential']},
 {name:'环境参数',keys:['BarometricPress','AmbientAirTemp']},
 {name:'累计统计',keys:['EngTotalHoursOfOperation','EngTotalRevolutions']}
];
export const CUMULATIVE_KEYS=new Set(['EngTripFuel','IntegratedFuel_L','EngTotalHoursOfOperation','EngTotalRevolutions']);

// Retain the last observation at duplicate timestamps, including an explicit
// invalid observation. Invalid values remain boundaries, never interpolation knots.
function observations(series,start,end){
 const out=[];let duplicates=0;
 for(const [t,v]of series){if(!finite(t)||t<start||t>end)continue;
  const point=[t,finite(v)?v:null];
  if(out.length&&t===out.at(-1)[0]){out[out.length-1]=point;duplicates++;}
  else if(!out.length||t>out.at(-1)[0])out.push(point);
 }
 return {points:out,duplicates};
}

export function uniformSegment(series,{start=-Infinity,end=Infinity,minSamples=64,maxSamples=32768}={}){
 const {points,duplicates}=observations(series,start,end);
 const intervals=[];for(let i=1;i<points.length;i++)if(points[i][1]!==null&&points[i-1][1]!==null)intervals.push(points[i][0]-points[i-1][0]);
 const typical=median(intervals);
 if(!typical||!finite(typical))return {ok:false,reason:'没有足够的连续有效样本。'};
 const segments=[];let current=[];
 for(const p of points){if(p[1]===null){if(current.length)segments.push(current);current=[];continue;}
  if(current.length&&p[0]-current.at(-1)[0]>typical*3){segments.push(current);current=[];}
  current.push(p);
 }
 if(current.length)segments.push(current);
 const chosen=segments.reduce((a,b)=>b.length>a.length?b:a,[]);
 if(chosen.length<minSamples)return {ok:false,reason:`最长连续片段只有 ${chosen.length} 个有效样本，至少需要 ${minSamples} 个。`};
 const steps=chosen.slice(1).map((p,i)=>p[0]-chosen[i][0]),dt=median(steps);
 const jitter=Math.sqrt(steps.reduce((sum,v)=>sum+(v-dt)**2,0)/steps.length)/dt;
 let first=chosen[0][0],last=chosen.at(-1)[0],count=Math.floor((last-first)/dt+1e-6)+1;
 if(count>maxSamples){count=maxSamples;first=last-(count-1)*dt;}
 if(count<minSamples)return {ok:false,reason:'有效片段过短，无法计算频谱。'};
 const values=[];let i=0;
 for(let k=0;k<count;k++){
  const t=first+k*dt;while(i+1<chosen.length-1&&chosen[i+1][0]<t)i++;
  const a=chosen[i],b=chosen[i+1],ratio=b?Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))):0;
  values.push(b?a[1]+ratio*(b[1]-a[1]):a[1]);
 }
 return {ok:true,values,dt,fs:1/dt,start:first,end:first+(count-1)*dt,count,rawCount:chosen.length,jitter,duplicates,segmentCount:segments.length};
}

function fft(real,imag){
 const n=real.length;
 for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[real[i],real[j]]=[real[j],real[i]];[imag[i],imag[j]]=[imag[j],imag[i]];}}
 for(let len=2;len<=n;len<<=1){const angle=-2*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
  for(let base=0;base<n;base+=len){let ur=1,ui=0;
   for(let j=0;j<len/2;j++){const a=base+j,b=a+len/2,tr=real[b]*ur-imag[b]*ui,ti=real[b]*ui+imag[b]*ur;
    real[b]=real[a]-tr;imag[b]=imag[a]-ti;real[a]+=tr;imag[a]+=ti;
    const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;
   }
  }
 }
}

export function powerSpectrum(series,options={}){
 const sample=uniformSegment(series,options);if(!sample.ok)return sample;
 const values=sample.values,mean=values.reduce((a,b)=>a+b,0)/values.length;
 const variance=values.reduce((sum,v)=>sum+(v-mean)**2,0)/values.length;
 if(variance<Math.max(1e-16,mean*mean*1e-20))return {...sample,ok:false,reason:'该片段近似恒定，没有可分析的波动频谱。'};
 const n=2**Math.floor(Math.log2(Math.min(1024,Math.max(64,values.length/2)))),hop=n/2,window=Array.from({length:n},(_,i)=>.5-.5*Math.cos(2*Math.PI*i/(n-1)));
 const energy=window.reduce((s,v)=>s+v*v,0),density=new Array(n/2+1).fill(0);let windows=0;
 for(let offset=0;offset+n<=values.length;offset+=hop){
  let center=0;for(let i=0;i<n;i++)center+=values[offset+i]/n;
  const real=window.map((w,i)=>(values[offset+i]-center)*w),imag=new Array(n).fill(0);fft(real,imag);
  for(let k=0;k<density.length;k++)density[k]+=(real[k]**2+imag[k]**2)/(sample.fs*energy)*(k>0&&k<n/2?2:1);
  windows++;
 }
 const df=sample.fs/n,points=density.map((p,k)=>[k*df,p/windows]);
 let peak=1;for(let k=2;k<points.length;k++)if(points[k][1]>points[peak][1])peak=k;
 return {...sample,points,df,nyquist:sample.fs/2,windows,fftSize:n,peakFrequency:points[peak][0],mean,rms:Math.sqrt(variance)};
}

// Merge the two signal timelines and integrate their overlapping valid holds.
// A fast-transmitting signal must not get more histogram weight than a slow one.
export function workpointHistogram(rpmSeries,torqueSeries,{start=-Infinity,end=Infinity,ttl=3,bins=20}={}){
 const rpm=observations(rpmSeries,-Infinity,end).points,torque=observations(torqueSeries,-Infinity,end).points;
 if(!rpm.length||!torque.length)return {ok:false,reason:'需要同一 CAN 通道、同一 ECU 的有效转速和扭矩百分比。'};
 const begin=Math.max(start,rpm[0][0],torque[0][0]),finish=Math.min(end,Math.max(rpm.at(-1)[0],torque.at(-1)[0]));
 const times=[...new Set([begin,finish,...rpm.map(p=>p[0]),...torque.map(p=>p[0])].filter(t=>t>=begin&&t<=finish))].sort((a,b)=>a-b);
 let ri=-1,ti=-1;const intervals=[];
 for(let k=0;k<times.length-1;k++){
  const t=times[k];while(ri+1<rpm.length&&rpm[ri+1][0]<=t)ri++;while(ti+1<torque.length&&torque[ti+1][0]<=t)ti++;
  const r=rpm[ri],q=torque[ti];if(!r||!q||r[1]===null||q[1]===null||r[1]<=0)continue;
  const duration=Math.min(times[k+1],r[0]+ttl,q[0]+ttl,finish)-t;
  if(duration>0)intervals.push({rpm:r[1],torque:q[1],duration});
 }
 if(!intervals.length)return {ok:false,reason:'没有转速大于 0 且两项信号均在有效时限内的重叠片段。'};
 let xmin=Infinity,xmax=-Infinity,ymin=Infinity,ymax=-Infinity,total=0;
 for(const p of intervals){xmin=Math.min(xmin,p.rpm);xmax=Math.max(xmax,p.rpm);ymin=Math.min(ymin,p.torque);ymax=Math.max(ymax,p.torque);total+=p.duration;}
 const width=(lo,hi)=>hi>lo?(hi-lo)/bins:Math.max(1,Math.abs(lo)*.02),dx=width(xmin,xmax),dy=width(ymin,ymax);
 if(xmax===xmin){xmin-=dx/2;xmax=xmin+dx;}if(ymax===ymin){ymin-=dy/2;ymax=ymin+dy;}
 const nx=Math.min(bins,Math.max(1,Math.ceil((xmax-xmin)/dx-1e-9))),ny=Math.min(bins,Math.max(1,Math.ceil((ymax-ymin)/dy-1e-9))),cells=new Map();
 for(const p of intervals){const x=Math.max(0,Math.min(nx-1,Math.floor((p.rpm-xmin)/dx))),y=Math.max(0,Math.min(ny-1,Math.floor((p.torque-ymin)/dy))),id=x+':'+y;cells.set(id,(cells.get(id)||0)+p.duration);}
 const points=[...cells].map(([id,seconds])=>[...id.split(':').map(Number),seconds/total*100,seconds]);
 return {ok:true,points,xCenters:Array.from({length:nx},(_,i)=>xmin+(i+.5)*dx),yCenters:Array.from({length:ny},(_,i)=>ymin+(i+.5)*dy),totalSeconds:total,intervals:intervals.length,start:begin,end:finish,dx,dy};
}
