import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {invokeAgent} from '../src/agents.js';
import {createSession,observation} from '../src/engine.js';
test('HTTP adapter receives only role observation and respects action response',async()=>{
 let request;const srv=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;request=JSON.parse(b);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:'我准备好了',action:{type:'move',pieceId:'B1',dx:1,dy:0}}));});await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 try{const o=observation(createSession(),'B');const r=await invokeAgent(o,{kind:'http',endpoint:`http://127.0.0.1:${srv.address().port}`,apiKey:'secret'});assert.equal(r.message,'我准备好了');assert.equal(request.observation.role,'B');assert.equal(JSON.stringify(request).includes('targetX'),false);assert.equal(request.apiKey,undefined);}finally{srv.close();}
});
test('OpenAI compatible adapter sends independent messages and parses JSON',async()=>{
 let request;const srv=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;request=JSON.parse(b);res.end(JSON.stringify({choices:[{message:{content:'```json\n{"message":"收到","action":null}\n```'}}]}));});await new Promise(r=>srv.listen(0,'127.0.0.1',r));
 try{const r=await invokeAgent(observation(createSession(),'C'),{kind:'openai',endpoint:`http://127.0.0.1:${srv.address().port}/v1`,model:'test-model',apiKey:'secret'});assert.equal(r.message,'收到');assert.equal(request.model,'test-model');assert.equal(request.messages.length,2);assert.ok(request.messages[1].content.includes('"role":"C"'));}finally{srv.close();}
});
test('real provider failures are errors rather than fabricated replies',async()=>{await assert.rejects(invokeAgent(observation(createSession(),'B'),{kind:'openai',endpoint:'',model:'x'}),/地址/);});

test('adapter response limit counts bytes before buffering the entire body',async()=>{const srv=http.createServer((req,res)=>res.end(JSON.stringify({message:'界'.repeat(80000)})));await new Promise(r=>srv.listen(0,'127.0.0.1',r));try{await assert.rejects(invokeAgent(observation(createSession(),'B'),{kind:'http',endpoint:`http://127.0.0.1:${srv.address().port}`}),/响应过大/);}finally{srv.close();}});
