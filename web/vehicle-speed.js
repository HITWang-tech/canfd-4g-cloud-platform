// The legacy UI key remains stable; its displayed source is GPS only.
export const VEHICLE_SPEED_KEY='WheelBasedVehicleSpeed';
export function gpsVehicleSpeed(event){
 return event?.valid===true&&Number.isFinite(event.latitude)&&Math.abs(event.latitude)<=90&&Number.isFinite(event.longitude)&&Math.abs(event.longitude)<=180&&Number.isFinite(event.speed)&&event.speed>=0?event.speed:null;
}
export function vehicleTimeline(timeline){
 const points=[];let previous=null;
 for(const e of timeline.events){if(e.kind!=='gps')continue;if(previous&&e.t-previous.t>3)points.push([previous.t+3,null]);points.push([e.t,gpsVehicleSpeed(e)]);previous=e;}
 return {...timeline,series:{...timeline.series,[VEHICLE_SPEED_KEY]:points},vehicleSpeedSource:'GPS'};
}
export function vehicleLiveView(view){
 const signals=new Map(view.signals);signals.delete(VEHICLE_SPEED_KEY);
 if(view.gps)signals.set(VEHICLE_SPEED_KEY,{value:gpsVehicleSpeed(view.gps),event:view.gps});
 return {...view,signals};
}
export function vehicleCSVRows(timeline,fields,valueAt){
 const keys=fields.filter(f=>f.key!==VEHICLE_SPEED_KEY).map(f=>f.key);
 const header=['Time_s','Device','CAN_Channel','SourceAddress','CAN_ID','DataSource','latitude','longitude','gpsSpeed','gpsValid',...keys];
 const rows=timeline.events.filter(e=>e.kind==='gps'||e.values).map(e=>{
  if(e.kind==='gps')return [e.t,e.device,'','','','GPS',e.latitude,e.longitude,gpsVehicleSpeed(e),e.valid===true,...keys.map(()=>null)];
  return [e.t,e.device,e.channel,e.source===null?'':`0x${e.source.toString(16).toUpperCase()}`,e.id===undefined?'':`0x${e.id.toString(16).toUpperCase()}`,e.kind==='can'?'CAN':'physical',null,null,null,null,...keys.map(k=>k==='IntegratedFuel_L'&&Object.hasOwn(e.values||{},'EngFuelRate')?valueAt(timeline.series[k],e.t,Infinity):e.values?.[k]??null)];
 });return [header,...rows];
}
