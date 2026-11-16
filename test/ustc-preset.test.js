import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeAgentConfig} from '../src/config.js';
import {agentRequestPolicy} from '../src/agents.js';
test('USTC preset selects university gateway rather than DeepSeek official gateway',()=>{
 const cfg=normalizeAgentConfig({preset:'ustc',enabled:true});
 assert.equal(cfg.endpoint,'https://api.llm.ustc.edu.cn/v1');assert.equal(cfg.model,'deepseek-flash');
 assert.equal(cfg.kind,'openai');assert.equal(agentRequestPolicy(cfg).maxOutputTokens,8192);
});
