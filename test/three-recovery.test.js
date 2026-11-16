import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {createApp} from '../src/server.js';
test('invalid actions feed back privately, transient HTTP failures retry, auth failures pause',{timeout:12000},async()=>{
 const counts={A:0,B:0,C:0};let feedback,rejectA=false,failB=true,failC=false,authCalls=0;
 const adapter=http.createServer(async(req,res)=>{let b='';for await(const c of req)b+=c;const o=JSON.parse(b).observation;counts[o.role]++;
 if(o.role==='A'){if(rejectA||counts.A===1)return res.end(JSON.stringify({action:{type:'move',pieceId:'A1',dx:9,dy:-4}}));if(o.lastActionError)feedback=o.lastActionError;return res.end(JSON.stringify({action:{type:'move',pieceId:'A1',dx:1,dy:0}}));}
 assert.equal(o.lastActionError,undefined);
 if(o.role==='B'&&failB){res.statusCode=503;return res.end('{}');}if(o.role==='C'&&failC){authCalls++;res.statusCode=401;}res.end('{}');});await new Promise(r=>adapter.listen(0,'127.0.0.1',r));
 const app=createApp({database:':memory:',schedulerInterval:15,retryDelayMs:20});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${app.server.address().port}`;let token,id;
 const call=async(path,body)=>{const r=await fetch(base+path,{headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return r.json();};
 try{const s=await call('/api/sessions',{});token=s.tokens.researcher;id=s.id;const p='/api/sessions/'+id;
 for(const role of ['A','B','C'])await call(p+'/agents',{role,kind:'http',enabled:true,endpoint:`http://127.0.0.1:${adapter.address().port}`});await call(p+'/action',{type:'start'});
 let events=[];const until=Date.now()+4000;while(Date.now()<until){events=await call(p+'/events');if(events.some(e=>e.role==='A'&&e.type==='move')&&counts.B>=3)break;await new Promise(r=>setTimeout(r,20));}
 assert.ok(feedback?.reason.includes('单轴'));assert.equal(feedback.action.pieceId,'A1');assert.equal(counts.B,3);
 assert.ok(events.some(e=>e.role==='A'&&e.type==='agent_action_rejected'));assert.ok(events.some(e=>e.role==='B'&&e.type==='agent_retry'));
 const state=await call(p);assert.equal(state.agents.B.enabled,false);assert.equal(state.paused,true);assert.equal(state.agents.C.enabled,true);failB=false;failC=true;await call(p+'/agents',{role:'B',kind:'http',enabled:true,endpoint:`http://127.0.0.1:${adapter.address().port}`});await call(p+'/action',{type:'resume'});for(let i=0;i<100;i++){const current=await call(p);if(current.paused&&!current.agents.C.enabled)break;await new Promise(r=>setTimeout(r,20));}assert.equal(authCalls,1);assert.match((await call(p)).agents.C.status,/接口失败/);failC=false;await call(p+'/agents',{role:'C',kind:'http',enabled:true,endpoint:`http://127.0.0.1:${adapter.address().port}`});
 await call(p+'/agents',{role:'A',kind:'http',enabled:false,endpoint:`http://127.0.0.1:${adapter.address().port}`});
 rejectA=true;const previous=(await call(p+'/events')).filter(e=>e.type==='agent_action_rejected').length;
 await call(p+'/agents',{role:'A',kind:'http',enabled:true,endpoint:`http://127.0.0.1:${adapter.address().port}`});await call(p+'/action',{type:'resume'});
 let stopped;for(let i=0;i<100;i++){stopped=await call(p);if(!stopped.agents.A.enabled)break;await new Promise(r=>setTimeout(r,20));}
 assert.match(stopped.agents.A.status,/动作连续违规/);
 assert.equal((await call(p+'/events')).filter(e=>e.type==='agent_action_rejected').length-previous,3);
 }finally{await app.close();adapter.closeAllConnections();await new Promise(r=>adapter.close(r));}
});
