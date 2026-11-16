import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {createSession} from '../src/engine.js';import {createMcpTaskBroker} from '../src/mcp-task-broker.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function fixture(){
 const s=createSession(),events=[],audit=[];let auditHealthy=true;s.agents.A={kind:'mcp',enabled:true,name:'Alpha',profileEnabled:true,profile:'OWN_PROFILE'};
 const broker=createMcpTaskBroker({getSession:id=>id===s.id?s:null,record:(state,role,type,payload)=>events.push({role,type,payload:structuredClone(payload)}),publish:()=>{},pause:()=>{s.pausedAt=Date.now();},audit:event=>{audit.push(event);return auditHealthy;}});
 const server=http.createServer((req,res)=>broker.handle(req,res,s.id,'A'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const d=broker.issue(s,'A',{baseUrl:'http://127.0.0.1:'+server.address().port}).descriptor;
 s.phase='practice';s.startedAt=Date.now();
 const client=new Client({name:'hardening-test',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(d.url),{requestInit:{headers:{Authorization:'Bearer '+d.token}}}));
 return {s,d,events,audit,client,failAudit:()=>{auditHealthy=false;},call:async(name,args={})=>{const r=await client.callTool({name,arguments:args});return {...JSON.parse(r.content[0].text),isError:!!r.isError};},close:async()=>{await client.close();server.closeAllConnections();await new Promise(r=>server.close(r));await broker.close();}};
}

test('role tool uses nested allowlists and never emits other profiles, private metadata or admin errors',async()=>{
 const f=await fixture();try{
  f.s.agents.B={name:'Beta',profile:'HIDDEN_PROFILE',status:'HIDDEN_DIAGNOSTIC'};
  f.s.serviceInterruption={role:'B',at:1,error:'HIDDEN_ADMIN_ERROR',privateField:'HIDDEN_EXTRA'};
  f.s.messages.push({role:'B',text:'公开线索',time:2,phase:'practice',level:0,privateData:'HIDDEN_MESSAGE_METADATA'});
  f.s.practiceResults.A={index:0,success:false,time:1,hidden:'HIDDEN_RESULT_METADATA'};
  const job=await f.call('next_puzzle_turn'),raw=JSON.stringify(job);for(const value of ['HIDDEN_PROFILE','HIDDEN_DIAGNOSTIC','HIDDEN_ADMIN_ERROR','HIDDEN_EXTRA','HIDDEN_MESSAGE_METADATA','HIDDEN_RESULT_METADATA',f.s.tokens.researcher,f.d.token])assert.ok(!raw.includes(value),value);
  assert.equal(job.observation.selfProfile,'OWN_PROFILE');assert.equal(job.observation.messages[0].text,'公开线索');assert.ok(job.observation.pieces[0].worldVertices);assert.equal(job.observation.pieces[0].vertices,undefined);assert.equal(job.observation.visibleTargets[0].regionId,undefined);
 }finally{await f.close();}
});

test('acknowledged delta omits unchanged history and rules; unknown version/reset resynchronizes same lease',async t=>{
 const f=await fixture();try{
  for(let i=0;i<30;i++)f.s.messages.push({role:'B',text:'公开历史消息'+i+'。'.repeat(50),time:i,phase:'practice',level:0});
  const initial=await f.call('next_puzzle_turn');assert.equal(initial.delivery,'snapshot');assert.ok(initial.stateVersion);
  await f.call('submit_puzzle_turn',{requestId:initial.requestId,action:{type:'move',pieceId:'A1',dx:1,dy:0}});
  f.s.messages.push({role:'B',text:'新的公开信息',time:100,phase:'practice',level:0});
  const next=await f.call('next_puzzle_turn',{ackVersion:initial.stateVersion});assert.equal(next.delivery,'delta');assert.equal(next.baseVersion,initial.stateVersion);assert.equal(next.instructions,undefined);assert.equal(next.observation,undefined);
  assert.equal(next.observationDelta.pieces.upsert.length,1);assert.equal(next.observationDelta.messages.append.length,1);assert.equal(next.observationDelta.messages.append[0].text,'新的公开信息');
  const reset=await f.call('next_puzzle_turn',{reset:true});assert.equal(reset.requestId,next.requestId);assert.equal(reset.stateVersion,next.stateVersion);assert.equal(reset.delivery,'snapshot');assert.equal(reset.observation.pieces[0].x,initial.observation.pieces[0].x+1);
  const rebuilt=structuredClone(initial.observation),delta=next.observationDelta;Object.assign(rebuilt,delta.set);const pieces=new Map(rebuilt.pieces.map(p=>[p.id,p]));for(const id of delta.pieces.remove)pieces.delete(id);for(const p of delta.pieces.upsert)pieces.set(p.id,p);rebuilt.pieces=[...pieces.values()];rebuilt.messages=[...rebuilt.messages,...delta.messages.append].filter(m=>m.seq>delta.messages.windowStart);assert.deepEqual(rebuilt,reset.observation);
  assert.ok(Buffer.byteLength(JSON.stringify(next))<Buffer.byteLength(JSON.stringify(reset))/2);
  t.diagnostic(JSON.stringify({snapshotBytes:Buffer.byteLength(JSON.stringify(reset)),deltaBytes:Buffer.byteLength(JSON.stringify(next))}));
  const fallback=await f.call('next_puzzle_turn',{ackVersion:'unknown'});assert.equal(fallback.delivery,'snapshot');assert.equal(fallback.requestId,next.requestId);
 }finally{await f.close();}
});

test('rejected credentials, malformed JSON and extra tool fields leave sanitized audit records',async()=>{
 const f=await fixture();try{
  const bad=await fetch(f.d.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer BAD_SECRET_SENTINEL'},body:'{}'});assert.equal(bad.status,401);
  const malformed=await fetch(f.d.url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+f.d.token},body:'{"private":"RAW_SECRET_SENTINEL"'});assert.equal(malformed.status,400);
  assert.equal((await f.call('next_puzzle_turn',{unexpected:'TOOL_SECRET_SENTINEL'})).isError,true);
  assert.ok(f.audit.some(e=>e.reason==='invalid_credential'));assert.ok(f.audit.some(e=>e.reason==='invalid_json'));assert.ok(f.audit.some(e=>e.reason==='invalid_tool_arguments'));
  const raw=JSON.stringify([f.events,f.audit]);for(const value of ['BAD_SECRET_SENTINEL','RAW_SECRET_SENTINEL','TOOL_SECRET_SENTINEL',f.d.token])assert.ok(!raw.includes(value),value);
 }finally{await f.close();}
});

test('credential strings cannot be sent to public chat or persisted in rejected input',async()=>{
 const f=await fixture();try{const job=await f.call('next_puzzle_turn');const result=await f.call('submit_puzzle_turn',{requestId:job.requestId,message:'请看 '+f.d.token});assert.equal(result.isError,true);assert.equal(f.s.messages.length,0);assert.ok(!JSON.stringify([f.events,f.audit]).includes(f.d.token));}
 finally{await f.close();}
});

test('completed roles do not trigger more thinking on their own messages; peer events respect cooldown',async()=>{
 const f=await fixture(),now=Date.now;try{f.s.practiceIndex.A=4;const job=await f.call('next_puzzle_turn');assert.equal(job.observation.communicationOnly,true);await f.call('submit_puzzle_turn',{requestId:job.requestId,message:'我已完成，可以回答新的问题。'});
  assert.equal((await f.call('next_puzzle_turn')).status,'waiting');
  f.s.messages.push({role:'B',text:'你看到的目标宽度是多少？',time:now(),phase:'practice',level:0});assert.equal((await f.call('next_puzzle_turn')).status,'waiting');
  Date.now=()=>now()+10001;assert.equal((await f.call('next_puzzle_turn')).status,'turn');
 }finally{Date.now=now;await f.close();}
});

test('an explicit reset can recover the complete allowed state while waiting without creating an action lease',async()=>{
 const f=await fixture();try{const job=await f.call('next_puzzle_turn');await f.call('submit_puzzle_turn',{requestId:job.requestId,action:null});assert.equal((await f.call('next_puzzle_turn')).status,'waiting');const recovered=await f.call('next_puzzle_turn',{reset:true});assert.equal(recovered.status,'waiting');assert.equal(recovered.delivery,'snapshot');assert.equal(recovered.observation.role,'A');assert.equal(recovered.requestId,undefined);}
 finally{await f.close();}
});

test('final result uses the same nested information allowlist as running observations',async()=>{
 const f=await fixture();try{f.s.phase='finished';f.s.lastResult={score:1,total:1,success:true,privateMetadata:'HIDDEN_FINAL_RESULT'};const result=await f.call('next_puzzle_turn');assert.equal(result.result.score,1);assert.ok(!JSON.stringify(result).includes('HIDDEN_FINAL_RESULT'));}
 finally{await f.close();}
});

test('invalid action value types are rejected before their raw nested contents enter logs',async()=>{
 const f=await fixture();try{const job=await f.call('next_puzzle_turn');for(const action of [{type:'move',pieceId:'A1',dx:{secret:'RAW_ACTION_SECRET'},dy:0},{type:'rotate',pieceId:'A1',direction:{secret:'RAW_ACTION_SECRET'}}])assert.equal((await f.call('submit_puzzle_turn',{requestId:job.requestId,action})).isError,true);assert.ok(!JSON.stringify([f.events,f.audit]).includes('RAW_ACTION_SECRET'));assert.equal(f.s.steps.A,0);}
 finally{await f.close();}
});

test('failed access audit prevents execution and visibly pauses the experiment',async()=>{
 const f=await fixture();try{f.failAudit();await assert.rejects(()=>f.call('next_puzzle_turn'),e=>e.code===503);assert.ok(f.s.pausedAt);assert.equal(f.events.some(e=>e.type==='mcp_input'),false);}
 finally{await f.close();}
});
