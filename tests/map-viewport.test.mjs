import test from 'node:test';import assert from 'node:assert/strict';
import {TrackViewport} from '../web/map-viewport.js';
function fixture(){const fits=[],pans=[],bounds={isValid:()=>true};let contains=true;const map={getMaxZoom:()=>19,getBounds:()=>({contains:()=>contains}),fitBounds:(b,options)=>fits.push({b,options}),panTo:(p,options)=>pans.push({p,options})};return {view:new TrackViewport(map),fits,pans,bounds,outside:()=>{contains=false;}};}
test('first GPS track is fitted at up to 19 zoom with padding, even before the CAN cursor reaches GPS',()=>{
 const f=fixture();f.view.update(f.bounds,null,{changed:true,now:0});assert.equal(f.fits.length,1);assert.equal(f.fits[0].options.maxZoom,19);assert.deepEqual(f.fits[0].options.padding,[28,28]);
 f.view.update(f.bounds,[1,2],{changed:true,now:2000});assert.equal(f.fits.length,1);assert.equal(f.pans.length,0);
});
test('user zoom survives new data; following can only pan and cannot refit or reset the zoom',()=>{
 const f=fixture();f.view.update(f.bounds,[1,2],{now:0});f.view.manual();f.outside();
 for(let now=1000;now<6000;now+=1000)f.view.update(f.bounds,[1,now],{changed:true,now});
 assert.equal(f.fits.length,1);assert.equal(f.pans.length,5);assert.ok(f.pans.every(p=>p.options.animate===false));
 f.view.update(f.bounds,[1,9],{follow:false,now:7000});assert.equal(f.pans.length,5);
});
test('automatic view expands only for changed tracks outside the viewport and coalesces rapid updates',()=>{
 const f=fixture();f.view.update(f.bounds,[1,2],{now:0});f.outside();f.view.update(f.bounds,[1,3],{changed:true,now:100});assert.equal(f.fits.length,1);
 f.view.update(f.bounds,[1,3],{now:1100});assert.equal(f.fits.length,2);
 f.view.update(f.bounds,[1,3],{now:2500});assert.equal(f.fits.length,2);
});
test('explicit full-track action restores adaptive view; empty locations wait for valid bounds',()=>{
 const f=fixture();f.view.update({isValid:()=>false},null,{now:0});assert.equal(f.fits.length,0);assert.equal(f.view.fitted,false);
 f.view.update(f.bounds,null,{now:100});f.view.manual();assert.equal(f.view.auto,false);f.view.fitTrack(f.bounds,200);assert.equal(f.view.auto,true);assert.equal(f.fits.length,2);
 f.view.reset();assert.equal(f.view.fitted,false);f.view.update(f.bounds,[1,2],{now:300});assert.equal(f.fits.length,3);
});
