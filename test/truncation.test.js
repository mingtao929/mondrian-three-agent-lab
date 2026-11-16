import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {invokeAgent} from '../src/agents.js';import {createSession,observation} from '../src/engine.js';
test('truncation is output budget failure rather than illegal agent action',async()=>{
 const srv=http.createServer((req,res)=>res.end(JSON.stringify({choices:[{finish_reason:'length',message:{content:''}}]})));await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 try{await assert.rejects(invokeAgent(observation(createSession(),'A'),{kind:'openai',endpoint:`http://127.0.0.1:${srv.address().port}`,model:'test'}),e=>e.category==='output_budget'&&!e.agentResponse);}finally{srv.close();}
});
