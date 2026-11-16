import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCodexOutput,validateRequest,makeCodexPrompt,codexFailure,createCodexBridge} from '../src/codex-bridge.js';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('bridge returns completed answer without waiting for CLI process exit',async()=>{
 const cwd=mkdtempSync(join(tmpdir(),'mgf-bridge-')),token='test-token-12345678901234567890123456789';let killed=false;
 const app=createCodexBridge({cli:process.execPath,token,cwd},()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.resume();child.kill=()=>{killed=true;child.emit('close',null)};child.stdin.on('finish',()=>{const answer=Buffer.from(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"message":"完成","action":null}'}})+'\n'),split=answer.indexOf(Buffer.from('完'))+1;child.stdout.write(answer.subarray(0,split));child.stdout.write(answer.subarray(split));child.stdout.write(JSON.stringify({type:'turn.completed',usage:{}})+'\n')});return child;});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/act',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({protocol:'mgf-agent-v1',instructions:'test',observation:{role:'C',messages:Array.from({length:100},()=>({text:'中文'.repeat(750)}))}}),signal:AbortSignal.timeout(2000)});assert.equal(response.status,200);assert.equal((await response.json()).message,'完成');assert.equal(killed,true);}finally{await new Promise(r=>app.server.close(r));rmSync(cwd,{recursive:true});}
});
test('Codex failures classify without disclosing upstream bodies or credentials',()=>{
 assert.match(codexFailure('401 Unauthorized secret-token').message,/登录/);
 assert.match(codexFailure('429 usage limit secret-token').message,/用量|限流/);
 assert.match(codexFailure('connection refused secret-token').message,/网络|代理/);
 assert.equal(codexFailure('unknown secret-token').message.includes('secret-token'),false);
});
test('bridge refreshes configured proxy between calls without restarting platform',async()=>{const cwd=mkdtempSync(join(tmpdir(),'mgf-proxy-')),settingsPath=join(cwd,'bridge.json'),token='test-token-12345678901234567890123456789',seen=[];writeFileSync(settingsPath,JSON.stringify({proxy:'http://127.0.0.1:3001'}));const app=createCodexBridge({cli:process.execPath,token,cwd,settingsPath},(cli,args,options)=>{seen.push(options.env.HTTPS_PROXY);const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.stdin.resume();child.kill=()=>child.emit('close',null);child.stdin.on('finish',()=>child.stdout.end(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"action":null}'}})+'\n'+JSON.stringify({type:'turn.completed'})+'\n'));return child;});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{for(const proxy of ['http://127.0.0.1:3001','http://127.0.0.1:3002']){writeFileSync(settingsPath,JSON.stringify({proxy}));const r=await fetch('http://127.0.0.1:'+app.server.address().port+'/act',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({protocol:'mgf-agent-v1',instructions:'test',observation:{role:'C',messages:[]}})});assert.equal(r.status,200);await r.json();}assert.deepEqual(seen,['http://127.0.0.1:3001','http://127.0.0.1:3002']);}finally{await new Promise(r=>app.server.close(r));rmSync(cwd,{recursive:true});}});
test('Codex adapter accepts final JSON, rejects tools and incomplete turns',()=>{
 const done={type:'item.completed',item:{type:'agent_message',text:'{"message":"hi","action":{"type":"submit"}}'}};
 const end={type:'turn.completed',usage:{input_tokens:20}};
 assert.equal(parseCodexOutput([done,end].map(JSON.stringify).join('\n')).action.type,'submit');
 assert.throws(()=>parseCodexOutput(JSON.stringify(done)),/完整/);
 assert.throws(()=>parseCodexOutput([done,{type:'item.completed',item:{type:'command_execution'}},end].map(JSON.stringify).join('\n')),/工具/);
});
test('Codex practice prompt excludes obsolete chat but retains current geometry and correction',()=>{
 const b={instructions:'rules',observation:{role:'C',phase:'practice',pieces:[{x:8,y:7,worldVertices:[[7,4]]}],messages:[{text:'obsolete coordinate'}],lastActionError:{reason:'bad move'}}};
 const p=makeCodexPrompt(b);assert.equal(p.includes('obsolete coordinate'),false);assert.ok(p.includes('worldVertices'));assert.ok(p.includes('bad move'));assert.ok(p.includes('最新状态'));
});
test('Codex adapter limits input to puzzle protocol',()=>{
 assert.throws(()=>validateRequest({protocol:'other'}),/协议/);
 assert.throws(()=>validateRequest({protocol:'mgf-agent-v1',observation:{role:'X'},instructions:'a'}),/角色/);
 assert.doesNotThrow(()=>validateRequest({protocol:'mgf-agent-v1',observation:{role:'C'},instructions:'a'}));
});
