import test from 'node:test';import assert from 'node:assert/strict';import {normalizeAgentConfig} from '../src/config.js';import {invokeAgent} from '../src/agents.js';
test('provider preset fills endpoint and model with only a key, custom values remain supported',()=>{
 const c=normalizeAgentConfig({preset:'doubao',apiKey:'do-not-save',enabled:true},{});assert.equal(c.endpoint,'https://ark.cn-beijing.volces.com/api/v3');assert.equal(c.model,'doubao-seed-2-1-pro-260915');assert.equal(c.kind,'openai');assert.equal(c.apiKey,undefined);
 assert.equal(normalizeAgentConfig({preset:'deepseek',model:'my-model'},{}).model,'my-model');assert.throws(()=>normalizeAgentConfig({preset:'unknown'},{}));
 assert.throws(()=>normalizeAgentConfig({kind:'demo',profile:'x'.repeat(4001)},{}),/画像/);
});
test('profile is sent only when enabled, in the own-role observation, not as system instructions',async t=>{
 const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:'{"action":null}'}}]}));});
 const o={phase:'practice',role:'A',messages:[]},c={kind:'openai',endpoint:'https://example.com/v1',model:'test',profile:'研究画像A',profileEnabled:true};
 await invokeAgent(o,c);await invokeAgent(o,{...c,profileEnabled:false});assert.ok(requests[0].messages[1].content.includes('研究画像A'));assert.equal(requests[0].messages[0].content.includes('研究画像A'),false);assert.equal(requests[1].messages[1].content.includes('研究画像A'),false);assert.equal(o.selfProfile,undefined);
});
