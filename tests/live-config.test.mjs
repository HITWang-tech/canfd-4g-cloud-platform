import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConnection,parseConnectionFragment} from '../web/live-config.js';
import {connectionArtifacts} from '../server/https-bridge.mjs';
test('server-generated private shortcut and imported config preserve token and endpoint',()=>{
 const endpoint='https://test-name.trycloudflare.com',token='private+test/token=with&symbols';
 const artifacts=connectionArtifacts(endpoint,token);
 assert.deepEqual(validateConnection(JSON.parse(artifacts.config)),{endpoint,token});
 const link=artifacts.shortcut.match(/URL=(.*)/)[1].trim();
 assert.equal(new URL(link).origin,'https://hitwang-tech.github.io');
 assert.equal(new URL(link).search,'');
 assert.deepEqual(parseConnectionFragment(new URL(link).hash),{endpoint,token});
});
test('connection import rejects insecure addresses, credentials, paths and invalid tokens',()=>{
 for(const endpoint of ['http://example.com','https://user:pass@example.com','https://example.com/api','https://example.com/?token=bad','https://example.com/#bad'])assert.throws(()=>validateConnection({endpoint,token:'valid-test-token-123'}));
 for(const token of [null,'short','bad-token-with-space ','bad\ncontrol-token'])assert.throws(()=>validateConnection({endpoint:'https://example.com',token}));
 assert.equal(parseConnectionFragment('#overview'),null);
});
