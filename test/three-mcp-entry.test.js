import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import http from 'node:http';
import {createApp} from '../src/server.js';
import {createGuestGateway} from '../src/guest-gateway.js';
import {createMcpTaskBroker} from '../src/mcp-task-broker.js';
import {createSession,score} from '../src/engine.js';

async function fixture(options={}){
 const app=createApp({database:':memory:',mcpOnly:true,schedulerInterval:30,...options});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+app.server.address().port,clients=[];
 async function api(path,token,data){const r=await fetch(base+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+(token||'')},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,data:await r.json()};}
 const {data:room}=await api('/api/sessions','',{}),path='/api/sessions/'+room.id;
 const research=(route,data)=>api(path+'/'+route,room.tokens.researcher,data);
 async function attach(role,profile){const issued=await research('desktop',{role,name:'Test '+role,profile:profile||'',profileEnabled:!!profile});assert.equal(issued.status,200,JSON.stringify(issued.data));const d=issued.data.desktop,client=new Client({name:'mcp-entry-test',version:'1.0.0'});await client.connect(new StreamableHTTPClientTransport(new URL(d.url),{requestInit:{headers:{Authorization:'Bearer '+d.token}}}));clients.push(client);return {d,client,call:async(name,args={})=>{if(name==='submit_puzzle_turn')args={decisionSummary:'协议测试驱动：依据当前可见状态验证动作执行。',...args};const r=await client.callTool({name,arguments:args});return {isError:!!r.isError,...JSON.parse(r.content[0].text)};}};}
 return {app,base,room,path,api,research,attach,close:async()=>{await Promise.allSettled(clients.map(c=>c.close()));await app.close();}};
}

test('MCP-only production creates role connectors locally and refuses model/adapter bypasses',async()=>{
 const f=await fixture();try{
  const html=await(await fetch(f.base)).text();assert.match(html,/data-mcp-only="true"/);
  for(const route of ['connection','models','agents']){const r=await f.research(route,{role:'A',kind:'openai',endpoint:'https://example.com/v1',model:'fake',apiKey:'do-not-call',enabled:true});assert.equal(r.status,403,route);}
  const a=await f.attach('A');assert.equal((await a.client.listTools()).tools.length,2);assert.equal(JSON.parse(a.d.workbuddyConfig).mcpServers[Object.keys(JSON.parse(a.d.workbuddyConfig).mcpServers)[0]].type,'streamableHttp');const inline=JSON.parse(a.d.inlineConfig);const entry=Object.values(inline.mcpServers)[0];assert.equal(entry.args[0],'-e');const simple=new Client({name:'inline-test',version:'1'});try{await simple.connect(new StdioClientTransport({command:process.execPath,args:entry.args,stderr:'pipe'}));assert.equal((await simple.listTools()).tools.length,2);}finally{await simple.close();}
  const denied=await fetch(a.d.url.replace(/\/A$/,'B'),{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.d.token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.notEqual(denied.status,200);
  assert.equal((await f.api(f.path+'/desktop',f.room.tokens.human,{role:'B'})).status,403);
  assert.equal((await f.research('action',{type:'start'})).status,400);
 }finally{await f.close();}
});

test('actual MCP turn mutates the engine once, returns final receipt, rejects stale/cross-role actions and logs IO',async()=>{
 const f=await fixture();try{
  const a=await f.attach('A','PRIVATE_A'),b=await f.attach('B','PRIVATE_B'),c=await f.attach('C');
  for(const agent of [a,b,c])assert.equal((await agent.call('next_puzzle_turn')).status,'waiting');
  assert.equal((await f.research('action',{type:'start'})).status,200);
  const job=await a.call('next_puzzle_turn');assert.equal(job.observation.role,'A');assert.equal(job.observation.selfProfile,'PRIVATE_A');assert.ok(!JSON.stringify(job).includes('PRIVATE_B'));assert.ok(!JSON.stringify(job).includes('groupType'));
  assert.equal((await a.call('next_puzzle_turn')).requestId,job.requestId);
  const payload={requestId:job.requestId,action:{type:'move',pieceId:'A1',dx:1,dy:0},message:'新增信息'};
  const receipt=await a.call('submit_puzzle_turn',payload);assert.equal(receipt.status,'executed');assert.equal(receipt.applied,true);
  const replay=await a.call('submit_puzzle_turn',payload);assert.equal(replay.status,'executed');assert.equal(replay.replayed,true);
  assert.equal((await a.call('submit_puzzle_turn',{...payload,message:'different'})).isError,true);
  let state=(await f.research('state')).data;assert.equal(state.steps.A,1);assert.equal(state.messages.filter(m=>m.text==='新增信息').length,1);
  let next=await a.call('next_puzzle_turn');assert.equal(next.previousResult.requestId,job.requestId);
  const wrong=await a.call('submit_puzzle_turn',{requestId:next.requestId,action:{type:'move',pieceId:'B1',dx:1,dy:0},message:'SHOULD_NOT_APPEAR'});assert.equal(wrong.isError,true);
  state=(await f.research('state')).data;assert.ok(!JSON.stringify(state).includes('SHOULD_NOT_APPEAR'));
  next=await a.call('next_puzzle_turn');await f.research('action',{type:'pause'});
  assert.equal((await a.call('submit_puzzle_turn',{requestId:next.requestId,action:{type:'move',pieceId:'A1',dx:1,dy:0}})).isError,true);
  const exported=(await f.research('export')).data;assert.ok(exported.events.some(e=>e.type==='mcp_input'));assert.ok(exported.events.some(e=>e.type==='mcp_output'));assert.ok(!JSON.stringify(exported).includes(a.d.token));
  assert.equal((await f.research('history?target='+f.room.id+'&format=turns')).status,400);
  await f.research('action',{type:'stop'});const turns=await f.research('history?target='+f.room.id+'&format=turns');assert.equal(turns.status,200);assert.equal(turns.data.format,'mondrian-agent-turns-v1');assert.ok(turns.data.turns.some(t=>t.role==='A'&&t.input&&t.decision.summary));assert.ok(!JSON.stringify(turns.data).includes(a.d.token));
  for(const route of ['export','history?target='+f.room.id+'&format=json']){const integrated=await f.research(route);assert.equal(integrated.status,200);assert.ok(integrated.data.agentTurns.turns.some(t=>t.role==='A'&&t.input&&t.output?.message==='新增信息'));assert.ok(!JSON.stringify(integrated.data).includes(a.d.token));}
  const csvResponse=await fetch(f.base+f.path+'/history?target='+f.room.id+'&format=csv',{headers:{Authorization:'Bearer '+f.room.tokens.researcher}});assert.equal(csvResponse.status,200);const csv=await csvResponse.text();assert.match(csv,/agent_input/);assert.match(csv,/agent_output/);assert.match(csv,/新增信息/);assert.ok(!csv.includes(a.d.token));

 }finally{await f.close();}
});

test('downloaded local stdio connector works with the official MCP Client; reissue revokes old credentials',async()=>{
 const f=await fixture(),dir=mkdtempSync(join(tmpdir(),'mondrian-mcp-')),stdio=new Client({name:'stdio-test',version:'1.0.0'});
 try{const a=await f.attach('A'),file=join(dir,'client.mjs');writeFileSync(file,a.d.clientSource);await stdio.connect(new StdioClientTransport({command:process.execPath,args:[file],stderr:'pipe'}));assert.equal((await stdio.listTools()).tools.length,2);const r=await stdio.callTool({name:'next_puzzle_turn',arguments:{}});assert.equal(JSON.parse(r.content[0].text).status,'waiting');await f.attach('A');await assert.rejects(()=>a.client.listTools());}
 finally{await stdio.close();await f.close();rmSync(dir,{recursive:true,force:true});}
});

test('three independent MCP clients complete all twelve practice exercises without model APIs',async()=>{
 const f=await fixture();try{
  const actors=await Promise.all(['A','B','C'].map(r=>f.attach(r)));for(const a of actors)await a.call('next_puzzle_turn');await f.research('action',{type:'start'});
  for(let turn=0;turn<65;turn++){
   const state=(await f.research('state')).data;if(state.sessionPhase==='playing')break;
   for(const a of actors){const job=await a.call('next_puzzle_turn');if(job.status!=='turn')continue;const o=job.observation;let action=null;
    if(o.phase==='practice')for(const p of o.pieces.filter(p=>p.owner===o.role)){const target=o.visibleTargets[0],angle=p.id.endsWith('2')?180:0;if(p.angle!==angle){action={type:'rotate',pieceId:p.id,direction:1};break;}for(const axis of ['x','y']){const d=target[axis]-p[axis];if(Math.abs(d)>=.5){action={type:'move',pieceId:p.id,dx:axis==='x'?Math.sign(d)*Math.min(10,Math.abs(d)):0,dy:axis==='y'?Math.sign(d)*Math.min(10,Math.abs(d)):0};break;}}if(action)break;}
    if(o.phase==='practice')action??={type:'submit'};
    const result=await a.call('submit_puzzle_turn',{requestId:job.requestId,action});assert.equal(result.status,'executed',JSON.stringify(result));
   }
  }
  const state=(await f.research('state')).data;assert.equal(state.sessionPhase,'playing');assert.deepEqual(state.practiceProgress,{A:4,B:4,C:4});assert.equal(state.energy,1000);
  const events=(await f.research('events')).data;assert.equal(events.filter(e=>e.type==='mcp_action'&&e.payload.action?.type==='submit').length,12);assert.equal(events.filter(e=>e.type==='agent_request').length,0);
  const old=await actors[0].call('next_puzzle_turn'),peer=await actors[1].call('next_puzzle_turn'),p=peer.observation.pieces.find(p=>p.owner==='B');
  assert.equal((await actors[1].call('submit_puzzle_turn',{requestId:peer.requestId,action:{type:'move',pieceId:p.id,dx:p.x>10?-.5:.5,dy:0}})).status,'executed');
  assert.equal((await actors[0].call('submit_puzzle_turn',{requestId:old.requestId,action:{type:'submit'}})).isError,true);
  const refreshed=await actors[0].call('next_puzzle_turn');assert.notEqual(refreshed.requestId,old.requestId);assert.ok(refreshed.observation.boardRevision>old.observation.boardRevision);
 }finally{await f.close();}
});

test('expired unsubmitted turns can be reclaimed when the visible state has not changed',async()=>{
 const f=await fixture({schedulerInterval:3600000}),now=Date.now;try{const actors=await Promise.all(['A','B','C'].map(r=>f.attach(r)));for(const a of actors)await a.call('next_puzzle_turn');await f.research('action',{type:'start'});const a=actors[0],job=await a.call('next_puzzle_turn');Date.now=()=>now()+300001;const replacement=await a.call('next_puzzle_turn');assert.equal(replacement.status,'turn');assert.notEqual(replacement.requestId,job.requestId);}
 finally{Date.now=now;await f.close();}
});

test('lost final submit receipt remains replayable without permitting new actions',async()=>{
 const s=createSession();s.phase='playing';s.level=1;s.completed=s.levels[0].targets.length;s.startedAt=Date.now();s.ready.B=s.ready.C=true;
 const level=s.levels[1];for(const target of level.targets){const pieces=level.pieces.filter(p=>p.groupType===target.groupType);pieces.forEach((p,i)=>{p.x=target.x;p.y=target.y;p.angle=(target.angles[0]+i*180)%360;});}assert.equal(score(s),s.completed+level.targets.length);
 s.pausedAt=Date.now();s.agents.A={kind:'mcp',enabled:true};const broker=createMcpTaskBroker({getSession:()=>s,record:()=>{},publish:()=>{},pause:()=>{}}),server=http.createServer((req,res)=>broker.handle(req,res,s.id,'A'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,issued=broker.issue(s,'A',{baseUrl:base}).descriptor,client=new Client({name:'receipt-test',version:'1.0.0'});s.pausedAt=null;
 try{await client.connect(new StreamableHTTPClientTransport(new URL(issued.url),{requestInit:{headers:{Authorization:'Bearer '+issued.token}}}));const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});return {...JSON.parse(r.content[0].text),isError:!!r.isError};};const job=await call('next_puzzle_turn'),payload={requestId:job.requestId,action:{type:'submit'}};assert.equal((await call('submit_puzzle_turn',payload)).status,'executed');assert.equal(s.phase,'finished');assert.equal((await call('submit_puzzle_turn',payload)).replayed,true);assert.equal((await call('next_puzzle_turn')).status,'finished');assert.equal((await call('submit_puzzle_turn',{requestId:'new',action:{type:'move',pieceId:'A1',dx:1,dy:0}})).isError,true);}
 finally{await client.close();server.closeAllConnections();await new Promise(r=>server.close(r));await broker.close();}
});

test('MCP waiting does not fabricate new turns; malformed arguments never publish a message',async()=>{
 const f=await fixture();try{const actors=await Promise.all(['A','B','C'].map(r=>f.attach(r)));for(const a of actors)await a.call('next_puzzle_turn');await f.research('action',{type:'start'});const a=actors[0],job=await a.call('next_puzzle_turn');
  assert.equal((await a.call('submit_puzzle_turn',{requestId:job.requestId,message:'NOT_PUBLISHED',role:'B'})).isError,true);
  assert.equal((await a.call('submit_puzzle_turn',{requestId:job.requestId,action:null})).status,'executed');
  assert.equal((await a.call('next_puzzle_turn')).status,'waiting');
  assert.ok(!JSON.stringify((await f.research('state')).data).includes('NOT_PUBLISHED'));
 }finally{await f.close();}
});

test('remote gateway exposes the same scoped tools and supports official HTTP MCP clients',async()=>{
 const secret='gateway-test-'.repeat(4),invite='invite-test-'.repeat(4),domain='share.example.test';
 const app=createApp({database:':memory:',mcpOnly:true,mcpBaseUrl:'https://'+domain,sharing:{gatewaySecret:secret}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const gateway=createGuestGateway({domain,privatePort:app.server.address().port,invitationToken:invite,gatewaySecret:secret,desktop:app.mcp});await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+gateway.address().port,client=new Client({name:'remote-test',version:'1.0.0'});
 // Node fetch rewrites Host. Use a test-only HTTP fetch adapter to emulate a
 // real HTTPS reverse proxy forwarding the public Host to the local gateway.
 const remoteFetch=async(input,init={})=>{const request=new Request(input,init),body=['GET','HEAD'].includes(request.method)?null:Buffer.from(await request.arrayBuffer());return new Promise((resolve,reject)=>{const req=http.request(request.url,{method:request.method,headers:Object.fromEntries(request.headers)},async res=>{const chunks=[];for await(const c of res)chunks.push(c);const headers=new Headers();for(const [k,v] of Object.entries(res.headers))for(const item of Array.isArray(v)?v:[v])if(item!==undefined)headers.append(k,item);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers}));});req.on('error',reject);req.end(body);});};
 try{
  const joined=await remoteFetch(base+'/join/'+invite,{headers:{Host:domain},redirect:'manual'}),cookie=joined.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const post=async(path,token,data)=>{const r=await remoteFetch(base+path,{method:'POST',headers:{Host:domain,Cookie:cookie,'x-mgf-client':'1','Content-Type':'application/json',Authorization:'Bearer '+(token||'')},body:JSON.stringify(data)});assert.ok(r.ok,'gateway HTTP '+r.status);return r.json();};
  const room=await post('/api/sessions','',{}),issued=await post('/api/sessions/'+room.id+'/desktop',room.tokens.researcher,{role:'C'}),d=issued.desktop;assert.ok(d.url.startsWith('https://'+domain+'/mcp/'));
  await client.connect(new StreamableHTTPClientTransport(new URL(base+'/mcp/'+room.id+'/C'),{fetch:remoteFetch,requestInit:{headers:{Host:domain,Authorization:'Bearer '+d.token}}}));
  assert.equal((await client.listTools()).tools.length,2);const response=JSON.parse((await client.callTool({name:'next_puzzle_turn',arguments:{}})).content[0].text);assert.equal(response.status,'waiting');
  const admin=await remoteFetch(base+'/api/sessions/'+room.id+'/export',{headers:{Host:domain,Authorization:'Bearer '+d.token}});assert.equal(admin.status,401);
 }finally{await client.close();gateway.closeAllConnections();await new Promise(r=>gateway.close(r));await app.close();}
});
