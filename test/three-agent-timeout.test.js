import test from 'node:test';
import assert from 'node:assert/strict';
import {invokeAgent} from '../src/agents.js';

test('reasoning models get five minutes while HTTP adapters retain one minute',async t=>{
 const waits=[];
 t.mock.method(AbortSignal,'timeout',ms=>{waits.push(ms);return new AbortController().signal;});
 const requests=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  requests.push(JSON.parse(options.body));
  return new Response(JSON.stringify(String(url).endsWith('/chat/completions')?{choices:[{message:{content:'{"action":null}'}}]}:{action:null}));
 });
 await invokeAgent({phase:'playing',messages:[]},{kind:'openai',endpoint:'https://ark.cn-beijing.volces.com/api/v3',model:'doubao-seed-2-1-pro-260915'});
 await invokeAgent({phase:'playing',messages:[]},{kind:'http',endpoint:'http://127.0.0.1:4331/act'});
 assert.deepEqual(waits,[300000,60000]);
 assert.equal(requests[0].thinking,undefined,'do not silently disable reasoning');
});

test('timeout reports elapsed limit and pauses rather than multiplying expensive requests',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new DOMException('timed out','TimeoutError');});
 await assert.rejects(invokeAgent({phase:'playing',messages:[]},{kind:'openai',endpoint:'https://example.com',model:'test'}),e=>e.retryable===false&&/300/.test(e.message)&&/超时/.test(e.message));
});

test('WorkBuddy no-poll timeout is not reported as a credential error',async t=>{
 t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({code:'WORKBUDDY_NOT_POLLING'}),{status:504}));
 await assert.rejects(invokeAgent({},{kind:'http',endpoint:'http://127.0.0.1:4331/act'}),e=>e.retryable&&/未领取/.test(e.message)&&!/凭据/.test(e.message));
});
