import test from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../src/server.js';
test('custom agent names persist, remain role independent, and reject oversized names',async()=>{
 const app=createApp({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 try{const s=await(await fetch(base+'/api/sessions',{method:'POST'})).json();const p=base+'/api/sessions/'+s.id,headers={Authorization:'Bearer '+s.tokens.researcher,'Content-Type':'application/json'};
 const save=b=>fetch(p+'/agents',{method:'POST',headers,body:JSON.stringify({role:'A',kind:'demo',enabled:false,...b})});
 assert.equal((await save({name:' 豆包同学 '})).status,200);
 let view=await(await fetch(p,{headers})).json();assert.equal(view.agents.A.name,'豆包同学');assert.equal(view.role,'A');
 await save({});assert.equal((await(await fetch(p+'/agents',{headers})).json()).A.name,'豆包同学');
 assert.equal((await save({name:'长'.repeat(41)})).status,400);
 assert.equal((await save({name:'非法\n名字'})).status,400);
 const out=await(await fetch(p+'/export',{headers})).json();assert.equal(out.settings.agents.A.name,'豆包同学');
 }finally{await app.close();}
});
