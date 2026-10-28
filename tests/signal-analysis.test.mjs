import test from 'node:test';import assert from 'node:assert/strict';
import {FIELDS} from '../web/fields.js';
import {SIGNAL_GROUPS,powerSpectrum,uniformSegment,workpointHistogram} from '../web/signal-analysis.js';
test('groups contain all 22 supported fields exactly once',()=>{
 const keys=SIGNAL_GROUPS.flatMap(g=>g.keys);
 assert.equal(new Set(keys).size,22);assert.deepEqual(keys.slice().sort(),FIELDS.map(f=>f.key).sort());
});
test('Welch PSD resolves a known tone and preserves its mean-square power',()=>{
 const fs=20,a=3,frequency=1.25,series=Array.from({length:4096},(_,i)=>[i/fs,50+a*Math.sin(2*Math.PI*frequency*i/fs)]);
 const result=powerSpectrum(series);assert.equal(result.ok,true);
 assert.ok(Math.abs(result.peakFrequency-frequency)<=result.df);
 const integral=result.points.reduce((sum,p)=>sum+p[1]*result.df,0);
 assert.ok(Math.abs(integral-a*a/2)<.03,integral);
 assert.ok(Math.abs(result.fs-fs)<1e-8);assert.ok(Math.abs(result.nyquist-10)<1e-8);
});
test('resampling handles jitter and duplicate timestamps, but never bridges invalid values or long gaps',()=>{
 const tone=Array.from({length:300},(_,i)=>[i*.1+(i%2)*.003,20+Math.sin(i*.1*2*Math.PI)]);
 tone.splice(10,0,tone[10].slice());const r=powerSpectrum(tone);assert.equal(r.ok,true);assert.equal(r.duplicates,1);assert.ok(Math.abs(r.peakFrequency-1)<.05);
 const split=Array.from({length:120},(_,i)=>[i*.1,i===60?null:Math.sin(i)]);
 assert.equal(powerSpectrum(split).ok,false);
 const gap=[...Array.from({length:40},(_,i)=>[i*.1,i]),...Array.from({length:40},(_,i)=>[100+i*.1,i])];
 assert.equal(uniformSegment(gap).ok,false);
 const constant=Array.from({length:200},(_,i)=>[i*.1,42]);assert.equal(powerSpectrum(constant).ok,false);
});
test('histogram uses valid overlapping dwell time rather than incoming-frame counts',()=>{
 const rpm=[[0,1000],[1,1000],[2,2000],[3,2000],[4,2000]],torque=[[0,10],[.2,10],[.4,10],[.6,10],[.8,10],[1,10],[2,20],[4,20]];
 const result=workpointHistogram(rpm,torque,{ttl:3});assert.equal(result.ok,true);assert.equal(result.totalSeconds,4);
 assert.equal(result.points.length,2);for(const cell of result.points)assert.ok(Math.abs(cell[2]-50)<1e-8);
 const invalid=workpointHistogram([[0,1000],[1,null],[2,1000],[4,1000]],[[0,10],[4,10]],{ttl:1});
 assert.equal(invalid.totalSeconds,1);
 assert.equal(workpointHistogram([[0,0],[4,0]],[[0,10],[4,10]]).ok,false);
});
