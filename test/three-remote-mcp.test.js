import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createRelay,relayBaseUrl} from '../src/workbuddy-mcp.js';
import {createRemoteGateway} from '../src/remote-gateway.js';
test('remote connector URLs require HTTPS and preserve the role path',()=>{
 assert.equal(relayBaseUrl({baseUrl:'https://example.com/agent/B/'}),'https://example.com/agent/B');
 assert.throws(()=>relayBaseUrl({baseUrl:'http://example.com/agent/B'}),/HTTPS/);
 assert.throws(()=>relayBaseUrl({baseUrl:'https://user:secret@example.com'}),/凭据/);
});
test('public gateway exposes only role tools and observer reads, never control APIs',async()=>{
 const token='remote'.repeat(8),relay=createRelay({token,sessionId:'room',role:'C',expiresAt:Date.now()+60000,turnTimeoutMs:2000});await new Promise(r=>relay.server.listen(0,'127.0.0.1',r));
 const gateway=createRemoteGateway({domain:'test.example',platformPort:1,relayPorts:{C:relay.server.address().port}});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${gateway.address().port}`;
 const call=(path,b={},auth=token)=>new Promise((resolve,reject)=>{const req=http.request(base+path,{method:'POST',headers:{Host:'test.example',Authorization:'Bearer '+auth,'Content-Type':'application/json'}},async res=>{const chunks=[];for await(const c of res)chunks.push(c);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode}));});req.on('error',reject);req.end(JSON.stringify(b));});
 try{assert.equal((await call('/api/sessions')).status,403);assert.equal((await call('/agent/C/act')).status,403);assert.equal((await call('/agent/A/next')).status,404);assert.equal((await call('/agent/C/status',{},'wrong')).status,401);
 const action=fetch(`http://127.0.0.1:${relay.server.address().port}/act`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({protocol:'mgf-agent-v1',observation:{sessionId:'room',role:'C'},instructions:'C only'})});
 const job=await(await call('/agent/C/next')).json();assert.equal(job.observation.role,'C');assert.equal((await call('/agent/C/submit',{requestId:job.requestId,action:{type:'submit'}})).status,200);assert.equal((await(await action).json()).action.type,'submit');
 }finally{gateway.closeAllConnections();await new Promise(r=>gateway.close(r));await relay.close();}
});
test('expired remote role credential cannot receive a turn',async()=>{
 const relay=createRelay({token:'expired'.repeat(6),sessionId:'room',role:'A',expiresAt:Date.now()-1});await new Promise(r=>relay.server.listen(0,'127.0.0.1',r));try{const r=await fetch(`http://127.0.0.1:${relay.server.address().port}/status`,{method:'POST',headers:{Authorization:'Bearer '+'expired'.repeat(6)}});assert.equal(r.status,403);}finally{await relay.close();}
});
test('public relay requires a finite explicit expiry and rejects malformed expiry',()=>{
 const base={token:'valid-token'.repeat(4),sessionId:'room',requireExpiry:true};
 for(const expiresAt of [undefined,Infinity,NaN,'tomorrow'])assert.throws(()=>createRelay({...base,expiresAt}),/到期/);
 assert.throws(()=>createRelay({...base,requireExpiry:false,expiresAt:'tomorrow'}),/到期/);
});
