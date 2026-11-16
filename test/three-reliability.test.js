import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../src/store.js';
import {createSession,applyAction,timeLeft} from '../src/engine.js';
import {createApp} from '../src/server.js';
import {normalizeAgentConfig} from '../src/config.js';

test('invalid endpoint is rejected before enabling an agent',()=>{
 for(const endpoint of ['oops','http://example.com/act','https://user:secret@example.com/v1','ftp://example.com'])assert.throws(()=>normalizeAgentConfig({kind:'http',endpoint,enabled:true}),/接口|HTTPS/);
 assert.doesNotThrow(()=>normalizeAgentConfig({kind:'http',endpoint:'http://127.0.0.1:4330/act',enabled:true}));
});
test('expired action records terminal time for history',()=>{const s=createSession();s.phase='practice';s.startedAt=Date.now()-3000000;assert.throws(()=>applyAction(s,'researcher',{type:'pause'}),/结束/);assert.equal(s.phase,'finished');assert.ok(s.endedAt);});

test('loading interrupted experiment freezes at last durable checkpoint, preserves geometry and logs recovery',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mgf-restart-')),database=join(dir,'db.sqlite');const store=new Store(database),s=createSession();for(const r of ['A','B','C'])s.agents[r].enabled=true;applyAction(s,'researcher',{type:'start'});s.startedAt=Date.now()-120000;s.runtimeCheckpointAt=s.startedAt+10000;store.save(s);store.close();
 const app=createApp({database,schedulerInterval:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port+'/api/sessions/'+s.id;const headers={Authorization:'Bearer '+s.tokens.researcher,'Content-Type':'application/json'};
 try{const o=await(await fetch(base,{headers})).json();assert.equal(o.paused,true);assert.equal(o.timeLeft,2390);assert.deepEqual(o.steps,s.steps);assert.deepEqual(o.practiceProgress,s.practiceIndex);assert.equal(o.agents.C.enabled,false);assert.match(o.interruption.error,/重启/);assert.equal((await fetch(base+'/action',{method:'POST',headers,body:JSON.stringify({type:'resume'})})).status,400);assert.ok(app.store.events(s.id).some(e=>e.type==='server_restart'));}finally{await app.close();rmSync(dir,{recursive:true});}
});

test('graceful shutdown pauses active experiments and persists frozen remaining time',async()=>{
 const app=createApp({database:':memory:',schedulerInterval:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const s=await(await fetch(base+'/api/sessions',{method:'POST'})).json(),headers={Authorization:'Bearer '+s.tokens.researcher,'Content-Type':'application/json'};for(const role of ['A','B','C'])await fetch(base+'/api/sessions/'+s.id+'/agents',{method:'POST',headers,body:JSON.stringify({role,kind:'demo',enabled:true})});await fetch(base+'/api/sessions/'+s.id+'/action',{method:'POST',headers,body:JSON.stringify({type:'start'})});
 const originalClose=app.store.close.bind(app.store);let saved;app.store.close=()=>{saved=app.store.load(s.id);originalClose();};await app.close();assert.ok(saved.pausedAt);assert.equal(timeLeft(saved,Date.now()+600000),timeLeft(saved));
});

test('missing memory keys block start without consuming clock, disabling a role freezes all',async()=>{
 const app=createApp({database:':memory:',schedulerInterval:100000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;const s=await(await fetch(base+'/api/sessions',{method:'POST'})).json();const p=base+'/api/sessions/'+s.id,headers={Authorization:'Bearer '+s.tokens.researcher,'Content-Type':'application/json'},post=(route,b)=>fetch(p+route,{method:'POST',headers,body:JSON.stringify(b)});
 try{for(const role of ['A','B','C'])await post('/agents',{role,kind:'openai',endpoint:'https://example.com/v1',model:'test',enabled:true});const failed=await post('/action',{type:'start'});assert.equal(failed.status,400);assert.match((await failed.json()).error,/密钥/);assert.equal((await(await fetch(p,{headers})).json()).sessionPhase,'tutorial');for(const role of ['A','B','C'])await post('/agents',{role,kind:'demo',enabled:true});assert.equal((await post('/action',{type:'start'})).status,200);await post('/agents',{role:'B',kind:'demo',enabled:false});const o=await(await fetch(p,{headers})).json();assert.equal(o.paused,true);assert.equal(o.interruption.role,'B');assert.equal((await post('/action',{type:'resume'})).status,400);}finally{await app.close();}
});
