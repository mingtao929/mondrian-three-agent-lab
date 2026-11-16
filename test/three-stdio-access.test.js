import test from 'node:test';import assert from 'node:assert/strict';import https from 'node:https';import {readFileSync} from 'node:fs';import {spawn} from 'node:child_process';
import {inlineClientSource} from '../src/stdio-access.js';
const ca=readFileSync(new URL('./fixtures/test-only-ca.pem',import.meta.url),'utf8'),key=readFileSync(new URL('./fixtures/test-only-key.pem',import.meta.url),'utf8');
const run=(code)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['-e',code,'--','--check'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',s=>out+=s);child.stderr.on('data',s=>err+=s);child.on('error',reject);child.on('exit',exit=>resolve({exit,out,err}));});
test('inline stdio verifies a deployment CA without weakening TLS and diagnoses untrusted certificates',async()=>{
 const token='test-only-role-credential',seen=[];
 const server=https.createServer({key,cert:ca},async(req,res)=>{assert.equal(req.headers.authorization,'Bearer '+token);let body='';for await(const c of req)body+=c;const m=JSON.parse(body);seen.push(m.method);if(!('id'in m)){res.writeHead(204);res.end();return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({jsonrpc:'2.0',id:m.id,result:m.method==='tools/list'?{tools:[{name:'next_puzzle_turn'},{name:'submit_puzzle_turn'}]}:{protocolVersion:'2025-03-26',capabilities:{},serverInfo:{name:'test',version:'1'}}}));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='https://127.0.0.1:'+server.address().port+'/mcp/test/A';
 try{
  const blocked=await run(inlineClientSource(url,token));assert.equal(blocked.exit,1);assert.match(blocked.err,/TLS证书/);assert.ok(!blocked.err.includes(token));assert.equal(seen.length,0);
  const accepted=await run(inlineClientSource(url,token,ca));assert.equal(accepted.exit,0,accepted.err);assert.deepEqual(JSON.parse(accepted.out).tools,['next_puzzle_turn','submit_puzzle_turn']);assert.deepEqual(seen,['initialize','notifications/initialized','tools/list']);
  assert.ok(!inlineClientSource(url,token,ca).includes('rejectUnauthorized:false'));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
