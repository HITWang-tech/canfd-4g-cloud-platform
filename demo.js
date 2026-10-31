import {gpsRecording} from './demo-gps.js?v=20261031-demo0647';
import {recording} from './demo-recording.js?v=20261031-demo0647';
export const DEMO_NAME='实车测试演示 · 2026-10-31';
export const DEMO_METADATA={...recording.metadata,gpsAvailable:true,gps:gpsRecording.metadata,description:'实车 CAN 与 GPS 按原始设备时间合并，未插值、未移时；GPS 已获授权公开。'};
export function createDemo(){
 const events=recording.rows.map(([us,channel,extended,id,hex])=>({kind:'can',device:'实车演示',t:recording.metadata.start+us/1e6,channel,extended:!!extended,id,source:extended?id&255:null,flags:extended?1:0,data:Uint8Array.from(hex.match(/../g)||[],b=>parseInt(b,16))}));
 events.push(...gpsRecording.events.map(e=>({...e})));events.sort((a,b)=>a.t-b.t);
 return {events,report:{packets:events.length,malformed:0,truncated:0,discardedBytes:0},metadata:DEMO_METADATA};
}
