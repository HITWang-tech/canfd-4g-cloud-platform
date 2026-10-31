import {recording} from './demo-recording.js?v=20261031-real-demo1';
export const DEMO_NAME='实车测试演示 · 2026-10-31';
export const DEMO_METADATA=recording.metadata;
export function createDemo(){
 const events=recording.rows.map(([us,channel,extended,id,hex])=>({kind:'can',device:'实车演示',t:recording.metadata.start+us/1e6,channel,extended:!!extended,id,source:extended?id&255:null,flags:extended?1:0,data:Uint8Array.from(hex.match(/../g)||[],b=>parseInt(b,16))}));
 return {events,report:{packets:events.length,malformed:0,truncated:0,discardedBytes:0},metadata:recording.metadata};
}
