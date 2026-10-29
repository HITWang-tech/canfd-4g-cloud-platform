import test from 'node:test';import assert from 'node:assert/strict';
import {BasemapController} from '../web/basemap.js';
function fixture(mode='auto'){
 const layers=[],removed=[],timers=new Map(),statuses=[];let id=0;
 const leaflet={tileLayer:(url,options)=>{const handlers={};const layer={url,options,on:(name,fn)=>{handlers[name]=fn;return layer;},fire:name=>handlers[name]?.(),addTo:()=>{layer.fire('loading');return layer;}};layers.push(layer);return layer;}};
 const map={removeLayer:layer=>removed.push(layer)},controller=new BasemapController(map,leaflet,{mode,onStatus:s=>statuses.push(s),setTimer:fn=>{const timer=++id;timers.set(timer,()=>{timers.delete(timer);fn();});return timer;},clearTimer:id=>timers.delete(id)});
 return {controller,layers,removed,timers,statuses};
}
test('tile errors trigger one fallback, with no map or track reset and no retry loop',async()=>{
 const f=fixture(),original=f.layers[0];original.fire('tileerror');original.fire('tileerror');original.fire('tileerror');
 await Promise.resolve();
 assert.equal(f.layers.length,2);assert.equal(f.controller.provider,'hot');assert.deepEqual(f.removed,[original]);assert.equal(f.layers[1].options.crossOrigin,undefined);
 original.fire('tileerror');assert.equal(f.layers.length,2);
 f.layers[1].fire('tileload');f.layers[1].fire('load');assert.match(f.statuses.at(-1).text,/自动切换/);
 f.layers[1].fire('loading');for(let i=0;i<3;i++)f.layers[1].fire('tileerror');await Promise.resolve();assert.equal(f.layers.length,2);assert.equal(f.statuses.at(-1).warning,true);assert.equal(f.timers.size,0);
 f.controller.retry();assert.equal(f.controller.provider,'osm');assert.equal(f.layers.length,3);
});
test('stalled requests time out; manual provider selection is respected',async()=>{
 const f=fixture();[...f.timers.values()][0]();await Promise.resolve();assert.equal(f.controller.provider,'hot');
 const g=fixture('osm');[...g.timers.values()][0]();await Promise.resolve();assert.equal(g.layers.length,1);assert.equal(g.statuses.at(-1).warning,true);
 g.controller.setMode('hot');assert.equal(g.controller.provider,'hot');g.controller.destroy();assert.equal(g.timers.size,0);
});
