import test from 'node:test';
import assert from 'node:assert/strict';
import {agentRequestPolicy} from '../src/agents.js';
test('USTC gateway has adequate output headroom without changing other custom gateways',()=>{
 const cfg={kind:'openai',endpoint:'https://api.llm.ustc.edu.cn/v1',model:'deepseek-flash',preset:'custom'};
 assert.equal(agentRequestPolicy(cfg).maxOutputTokens,8192);
 assert.equal(agentRequestPolicy({...cfg,endpoint:'https://example.com/v1'}).maxOutputTokens,500);
});
