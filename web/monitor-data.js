export const NOX_KEYS=['SCRInletNOx','SCROutletNOx','NOxInletPower','NOxInletAtTemp','NOxInletStable','NOxOutletPower','NOxOutletAtTemp','NOxOutletStable'];
export function pointAt(series,t,ttl=3){
 let lo=0,hi=series.length;while(lo<hi){const mid=(lo+hi)>>>1;if(series[mid][0]<=t)lo=mid+1;else hi=mid;}
 const point=series[lo-1];return !point?{value:null,state:'missing'}:{t:point[0],value:Number.isFinite(point[1])?point[1]:null,state:!Number.isFinite(point[1])?'invalid':t-point[0]>ttl?'stale':'fresh'};
}
export function scrEfficiency(samples,maxSkew=1.5,allowDifferentSources=false){
 const points=NOX_KEYS.map(key=>samples[key]);
 if(points.some(p=>!p||p.state!=='fresh'||(!Number.isFinite(p.value)||!Number.isFinite(p.t))))return {value:null,reason:'等待入口、出口 NOx 和传感器有效标志同时更新'};
 const [input,output,...flags]=points;
 if(flags.some(p=>p.value!==1))return {value:null,reason:'NOx 传感器供电、工作温度或读数稳定性未满足要求'};
 if(points.some(p=>p.device!==input.device||p.channel!==input.channel)||points.slice(2,5).some(p=>p.source!==input.source)||points.slice(5).some(p=>p.source!==output.source)||(!allowDifferentSources&&input.source!==output.source))return {value:null,reason:'NOx 来源不一致，需要核对设备与 ECU 绑定'};
 if(Math.max(...points.map(p=>p.t))-Math.min(...points.map(p=>p.t))>maxSkew)return {value:null,reason:'NOx 及有效标志采样时刻不匹配'};
 if(input.value<=0||output.value<0)return {value:null,reason:'入口 NOx 必须大于零，出口 NOx 不能为负'};
 const value=(input.value-output.value)/input.value*100;
 if(value<0||value>100)return {value:null,reason:'浓度比结果超出 0–100%，请核对采样延迟和传感器'};
 return {value,reason:'瞬时浓度比估算；未补偿排气传输延迟'};
}
export function observedPeriod(series){
 const delta=[];let old=null;
 for(const [t]of series){if(old!==null&&t>old&&t-old<30)delta.push(t-old);if(old===null||t>old)old=t;}
 if(!delta.length)return null;delta.sort((a,b)=>a-b);return delta[delta.length>>1];
}
export function volumeDosing(massRate,density){return Number.isFinite(massRate)&&massRate>=0&&Number.isFinite(density)&&density>0?massRate/density/3600:null;}
export function regenSummary(samples){
 const active=samples.ActiveRegenStatus,passive=samples.PassiveRegenStatus,inhibit=samples.RegenInhibitStatus;
 if(inhibit?.state==='fresh'&&inhibit.value===1)return {text:'再生禁止信号置位',tone:'warning'};
 if(active?.state==='fresh'&&active.value===1)return {text:'主动再生进行中',tone:'success'};
 if(active?.state==='fresh'&&active.value===2)return {text:'需要再生／即将主动再生',tone:'warning'};
 if(passive?.state==='fresh'&&passive.value===1)return {text:'被动再生进行中',tone:'success'};
 if(active?.state==='fresh'&&active.value===0&&passive?.state==='fresh'&&passive.value===0)return {text:'当前无主动或被动再生',tone:'neutral'};
 return {text:'再生状态未确认',tone:'unknown'};
}
export const STATE_LABELS={
 PassiveRegenStatus:{0:'未进行被动再生',1:'被动再生进行中'},ActiveRegenStatus:{0:'未进行主动再生',1:'主动再生进行中',2:'需要再生／即将启动'},RegenInhibitStatus:{0:'未禁止再生',1:'禁止再生'},
 SCRSystemState:{0:'休眠',1:'准备喷射',2:'正常喷射',3:'系统错误待确认',5:'高温保护／建压',6:'低温保护／解冻',7:'关闭等待后运行',8:'诊断后运行',9:'服务测试允许喷射',10:'服务测试禁止喷射',14:'系统错误'},
 NOxInletPower:{0:'供电未在工作范围',1:'供电正常',2:'供电错误'},NOxOutletPower:{0:'供电未在工作范围',1:'供电正常',2:'供电错误'},NOxInletAtTemp:{0:'未在工作温区',1:'已在工作温区'},NOxOutletAtTemp:{0:'未在工作温区',1:'已在工作温区',2:'温度状态错误'},NOxInletStable:{0:'读数未稳定',1:'读数稳定',2:'读数错误'},NOxOutletStable:{0:'读数未稳定',1:'读数稳定',2:'读数错误'}
};
