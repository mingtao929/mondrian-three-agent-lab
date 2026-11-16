import test from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../src/server.js';
test('cross-port browser origins and cross-room credentials cannot control sessions',async()=>{
 const app=createApp({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 try{
 const page=await fetch(base+'/');assert.equal(page.headers.get('x-frame-options'),'DENY');assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const blocked=await fetch(base+'/api/sessions',{method:'POST',headers:{Origin:'http://127.0.0.1:1'}});assert.equal(blocked.status,403);
 const create=async()=> (await fetch(base+'/api/sessions',{method:'POST',headers:{Origin:base}})).json();const a=await create(),b=await create();
 const wrong=await fetch(base+'/api/sessions/'+b.id+'/agents',{method:'POST',headers:{Authorization:'Bearer '+a.tokens.researcher,'Content-Type':'application/json'},body:JSON.stringify({role:'A',kind:'demo',enabled:true})});assert.equal(wrong.status,401);
 const observer=await fetch(base+'/api/sessions/'+a.id+'/action',{method:'POST',headers:{Authorization:'Bearer '+a.tokens.human,'Content-Type':'application/json'},body:JSON.stringify({type:'pause'})});assert.equal(observer.status,403);
 }finally{await app.close();}
});
