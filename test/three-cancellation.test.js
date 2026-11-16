import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createApp} from '../src/server.js';
test('pause cancels a pending adapter call and resume receives a fresh turn',{timeout:6000},async()=>{
 let calls=0,resolveSeen,resolveClosed;const seen=new Promise(r=>resolveSeen=r),closed=new Promise(r=>resolveClosed=r);
 const adapter=http.createServer(async(req,res)=>{for await(const c of req){};calls++;if(calls===1){resolveSeen();res.on('close',resolveClosed);}else res.end(JSON.stringify({action:{type:'move',pieceId:'A1',dx:1,dy:0}}));});await new Promise(r=>adapter.listen(0,'127.0.0.1',r));
 const app=createApp({database:':memory:',schedulerInterval:15});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;let token;
 const call=async(path,b)=>{const r=await fetch(base+path,{method:b?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});assert.ok(r.ok);return r.json();};
 try{const s=await call('/api/sessions',{});token=s.tokens.researcher;const p='/api/sessions/'+s.id;
 for(const role of ['A','B','C'])await call(p+'/agents',{role,kind:role==='A'?'http':'demo',enabled:true,endpoint:`http://127.0.0.1:${adapter.address().port}`});await call(p+'/action',{type:'start'});await seen;
 await call(p+'/action',{type:'pause'});assert.equal(await Promise.race([closed.then(()=>true),new Promise(r=>setTimeout(()=>r(false),500))]),true,'pending adapter connection must close on pause');
 await call(p+'/action',{type:'resume'});let events=[];for(let i=0;i<30;i++){events=await call(p+'/events');if(events.some(e=>e.role==='A'&&e.type==='move'))break;await new Promise(r=>setTimeout(r,20));}assert.ok(events.some(e=>e.role==='A'&&e.type==='move'));
 }finally{adapter.closeAllConnections();await app.close();await new Promise(r=>adapter.close(r));}
});

test('late upstream result cannot apply after a quick pause and resume even if upstream ignores abort',{timeout:6000},async t=>{
 const originalFetch=globalThis.fetch;let resolveOld,resolveSeen,calls=0;const seen=new Promise(r=>resolveSeen=r);
 t.mock.method(globalThis,'fetch',(url,options)=>{if(String(url)==='https://ignored-abort.example/act'){calls++;if(calls===1){resolveSeen();return new Promise(r=>resolveOld=r);}return Promise.resolve(new Response(JSON.stringify({action:{type:'move',pieceId:'A1',dx:1,dy:0}})));}return originalFetch(url,options);});
 const app=createApp({database:':memory:',schedulerInterval:15});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;let token;
 const call=async(path,b)=>{const r=await fetch(base+path,{method:b?'POST':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});assert.ok(r.ok);return r.json();};
 try{const s=await call('/api/sessions',{});token=s.tokens.researcher;const p='/api/sessions/'+s.id;for(const role of ['A','B','C'])await call(p+'/agents',{role,kind:role==='A'?'http':'demo',endpoint:'https://ignored-abort.example/act',enabled:true});await call(p+'/action',{type:'start'});await seen;await call(p+'/action',{type:'pause'});await call(p+'/action',{type:'resume'});
 resolveOld(new Response(JSON.stringify({action:{type:'move',pieceId:'A1',dx:9,dy:0}})));let events=[];for(let i=0;i<40;i++){events=await call(p+'/events');if(events.some(e=>e.role==='A'&&e.type==='move'))break;await new Promise(r=>setTimeout(r,15));}
 assert.ok(events.some(e=>e.type==='agent_discarded'&&e.payload.role==='A'));assert.ok(events.some(e=>e.role==='A'&&e.type==='move'&&e.payload.dx===1));assert.equal(events.some(e=>e.role==='A'&&e.type==='move'&&e.payload.dx===9),false);
 }finally{resolveOld?.(new Response('{}'));await app.close();}
});
