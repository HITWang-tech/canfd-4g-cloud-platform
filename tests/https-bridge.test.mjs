import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createCollector} from '../server/collector.mjs';
import {verifyEndpoint} from '../server/https-bridge.mjs';
test('bridge readiness checks authentication, snapshot shape and browser preflight against receiver',async()=>{
 const collector=createCollector({token:'private-testing-token',origins:['https://hitwang-tech.github.io']});
 collector.web.listen(0,'127.0.0.1');await once(collector.web,'listening');
 const endpoint='http://127.0.0.1:'+collector.web.address().port;
 try{await verifyEndpoint(endpoint,'private-testing-token');await assert.rejects(()=>verifyEndpoint(endpoint,'wrong-token'));}
 finally{await new Promise(resolve=>collector.web.close(resolve));}
});
