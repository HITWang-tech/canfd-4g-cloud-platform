import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {gaugeOptions} from '../web/gauge-options.js';
test('actual ECharts gauge survives missing, valid zero, normal, missing and valid transitions',()=>{
 const exports={};vm.runInNewContext(fs.readFileSync(new URL('../web/vendor/echarts.min.js',import.meta.url),'utf8'),{exports,module:{exports},console,setTimeout,clearTimeout});
 const chart=exports.init(null,null,{renderer:'svg',ssr:true,width:300,height:240});
 try{for(const value of [null,null,0,22.5,null,41,0,null]){
  chart.setOption({...gaugeOptions({key:'EngFuelRate',color:'#248a7e'},value,{min:0,max:60},{font:'serif',format:String}),animation:false});
  const svg=chart.renderToSVGString();assert.ok(svg.includes('<svg'));assert.ok(svg.includes(value===null?'—':String(value)));
 }}finally{chart.dispose();}
});
