import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createApp} from '../src/server.js';
test('connection test is researcher-only, does not save settings or expose puzzle data',{timeout:5000},async()=>{
 let received;const model=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received=JSON.parse(raw);res.end(JSON.stringify({choices:[{message:{content:'{"message":"连接正常","action":null}'}}]}));});await new Promise(r=>model.listen(0,'127.0.0.1',r));
 const app=createApp({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 try{const session=await (await fetch(base+'/api/sessions',{method:'POST'})).json();const path=base+'/api/sessions/'+session.id;const payload={role:'A',preset:'custom',kind:'openai',endpoint:`http://127.0.0.1:${model.address().port}`,model:'test',apiKey:'test-provider-key',profile:'DO-NOT-SEND',profileEnabled:true};
 const call=token=>fetch(path+'/connection',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 assert.equal((await call(session.tokens.human)).status,403);const result=await call(session.tokens.researcher);assert.equal(result.status,200);assert.equal((await result.json()).ok,true);assert.equal(JSON.stringify(received).includes('DO-NOT-SEND'),false);assert.equal(JSON.stringify(received).includes('worldVertices'),false);
 const agents=await (await fetch(path+'/agents',{headers:{Authorization:'Bearer '+session.tokens.researcher}})).json();assert.equal(agents.A.kind,'demo');
 }finally{await app.close();model.closeAllConnections();await new Promise(r=>model.close(r));}
});
