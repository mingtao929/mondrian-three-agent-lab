import test from 'node:test';import assert from 'node:assert/strict';import {createRelay} from '../src/workbuddy-mcp.js';
import {spawn} from 'node:child_process';import {createInterface} from 'node:readline';import {mkdtemp,writeFile,unlink,rmdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
test('WorkBuddy MCP relays only bound B turns, accepts decision once and rejects stale submissions',async()=>{
 const token='x'.repeat(40);const app=createRelay({token,sessionId:'room',turnTimeoutMs:500});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=(path,b,auth=token)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${auth}`},body:JSON.stringify(b)});
 try{
 assert.equal((await call('/act',{protocol:'mgf-agent-v1',instructions:'x',observation:{role:'A',sessionId:'room'}})).status,403);
 assert.equal((await call('/next',{},'wrong')).status,401);
 const waiting=call('/act',{protocol:'mgf-agent-v1',instructions:'rules',observation:{role:'B',sessionId:'room',phase:'practice',pieces:[]}});
 const job=await (await call('/next',{})).json();assert.equal(job.observation.role,'B');assert.equal(job.instructions,'rules');
 const decision={requestId:job.requestId,message:'ready',action:{type:'submit'}};
 assert.equal((await call('/submit',decision)).status,200);assert.equal((await (await waiting).json()).action.type,'submit');assert.equal((await call('/submit',decision)).status,409);
 }finally{await app.close();}
});
test('real stdio MCP handshake and tool calls deliver a B decision end to end',{timeout:10000},async()=>{
 const token='y'.repeat(40),app=createRelay({token,sessionId:'stdio-room',turnTimeoutMs:4000});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 const dir=await mkdtemp(join(tmpdir(),'mgf-mcp-')),file=join(dir,'config.json');const port=app.server.address().port;await writeFile(file,JSON.stringify({token,port}));
 const child=spawn(process.execPath,[fileURLToPath(new URL('../src/workbuddy-mcp.js',import.meta.url)),'--stdio',file],{windowsHide:true,stdio:['pipe','pipe','pipe']});const pending=new Map();let id=0;
 createInterface({input:child.stdout}).on('line',line=>{const m=JSON.parse(line);pending.get(m.id)?.(m);pending.delete(m.id);});child.stderr.on('data',()=>{});
 const rpc=(method,params)=>new Promise((resolve,reject)=>{const i=++id,t=setTimeout(()=>{pending.delete(i);reject(Error('MCP response timeout'));},3500);pending.set(i,m=>{clearTimeout(t);m.error?reject(Error(m.error.message)):resolve(m.result);});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:i,method,params})+'\n');});
 try{
 assert.equal((await rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'test',version:'1'}})).serverInfo.name,'mondrian-agent-b');
 assert.deepEqual((await rpc('tools/list',{})).tools.map(t=>t.name),['next_puzzle_turn','submit_puzzle_turn']);
 const actionResponse=fetch(`http://127.0.0.1:${port}/act`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({protocol:'mgf-agent-v1',instructions:'rules',observation:{sessionId:'stdio-room',role:'B'}})});
 const turn=JSON.parse((await rpc('tools/call',{name:'next_puzzle_turn',arguments:{}})).content[0].text);
 assert.equal(turn.observation.role,'B');assert.equal((await rpc('tools/call',{name:'submit_puzzle_turn',arguments:{requestId:turn.requestId,action:{type:'submit'}}})).isError,false);
 assert.equal((await (await actionResponse).json()).action.type,'submit');
 }finally{child.kill();await app.close();await unlink(file);await rmdir(dir);}
});


test('relay distinguishes a missing desktop consumer from a claimed but unanswered turn',async()=>{
 for(const claimed of [false,true]){
  const token='z'.repeat(40),app=createRelay({token,sessionId:'timeout-room',turnTimeoutMs:80});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
  const call=(path,b)=>fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(b)});
  try{const pending=call('/act',{protocol:'mgf-agent-v1',observation:{sessionId:'timeout-room',role:'B'}});if(claimed)await call('/next',{});const response=await pending;assert.equal(response.status,504);assert.equal((await response.json()).code,claimed?'WORKBUDDY_SUBMIT_TIMEOUT':'WORKBUDDY_NOT_POLLING');}finally{await app.close();}
 }
});
