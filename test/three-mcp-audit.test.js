import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createAccessAudit} from '../src/mcp-access-audit.js';

test('access audit persists safe metadata, aggregates unauthenticated floods and rotates without overwriting',()=>{
 const dir=mkdtempSync(join(tmpdir(),'mcp-audit-'));let audit;try{
  audit=createAccessAudit({directory:dir,maxBytes:240});
  const event={at:1000,sessionId:'00000000-0000-4000-8000-000000000001',role:'A',reason:'invalid_credential',authorization:'Bearer SECRET',body:'RAW_SECRET'};
  for(let i=0;i<50;i++)assert.equal(audit.record(event),true);
  audit.record({...event,reason:'invalid_json'});audit.record({...event,reason:'protocol_request',method:'tools/call'});audit.close();
  const files=readdirSync(dir).filter(f=>f.endsWith('.ndjson')),raw=files.map(f=>readFileSync(join(dir,f),'utf8')).join('');assert.ok(files.length>1);assert.ok(!raw.includes('SECRET'));
  const rows=raw.trim().split('\n').map(v=>JSON.parse(v));assert.equal(rows.filter(r=>r.reason==='invalid_credential').reduce((n,r)=>n+r.count,0),50);assert.equal(audit.status().healthy,true);
 }finally{audit?.close();rmSync(dir,{recursive:true,force:true});}
});

test('audit storage failure is reported instead of claiming the record was saved',()=>{
 const audit=createAccessAudit({directory:'unused',write:()=>{throw Error('do-not-expose-private-path');}});try{assert.equal(audit.record({reason:'protocol_request',method:'tools/call',role:'A'}),false);assert.equal(audit.status().healthy,false);assert.ok(!JSON.stringify(audit.status()).includes('do-not-expose'));}finally{audit.close();}
});
