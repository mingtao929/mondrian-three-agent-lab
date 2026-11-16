import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,readdirSync,rmSync,existsSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {installAgent,createWindowsInstaller} from '../public/agent-installer.js';
const payload=client=>({client,label:'mondrian_1234abcd_C',expiresAt:Date.now()+3600000,prompt:'仅领取C角色任务',source:'if(process.argv.includes("--check"))console.log(JSON.stringify({ok:true,tools:["next_puzzle_turn","submit_puzzle_turn"]}));'});
test('Codex installer preserves user config, creates backup and is idempotent without duplicate MCP tables',async()=>{
 const home=mkdtempSync(join(tmpdir(),'mondrian-install-'));try{mkdirSync(join(home,'.codex'));const config=join(home,'.codex/config.toml'),original='model = "existing-model"\n[mcp_servers.other]\ncommand = "existing-command"\n';writeFileSync(config,original);
 const first=await installAgent(payload('codex'),{home,open:false});assert.equal(readFileSync(first.backup,'utf8'),original);assert.ok(readFileSync(config,'utf8').includes(original.trim()));assert.ok(existsSync(first.bridge));
 await installAgent(payload('codex'),{home,open:false});const content=readFileSync(config,'utf8');assert.equal(content.split('[mcp_servers.mondrian_1234abcd_C]').length-1,1);assert.ok(content.includes('[mcp_servers.other]'));assert.ok(content.includes(JSON.stringify(process.execPath)));
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('WorkBuddy installer merges only the selected role and backs up existing data',async()=>{
 const home=mkdtempSync(join(tmpdir(),'mondrian-install-'));try{mkdirSync(join(home,'.workbuddy'));const path=join(home,'.workbuddy/mcp.json'),original={mcpServers:{other:{command:'preserved'}},extra:'keep'};writeFileSync(path,JSON.stringify(original));const installed=await installAgent(payload('workbuddy'),{home,open:false});const result=JSON.parse(readFileSync(path,'utf8'));assert.deepEqual(result.mcpServers.other,original.mcpServers.other);assert.equal(result.extra,'keep');assert.equal(result.mcpServers.mondrian_1234abcd_C.command,process.execPath);assert.equal(result.mcpServers.mondrian_1234abcd_C.args[0],installed.bridge);assert.equal(result.mcpServers.mondrian_1234abcd_C.disabled,false);assert.deepEqual(JSON.parse(readFileSync(installed.backup,'utf8')),original);
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('expired packages, failed connections, invalid config and manually owned entries fail without overwriting config',async()=>{
 const home=mkdtempSync(join(tmpdir(),'mondrian-install-'));try{
  await assert.rejects(()=>installAgent({...payload('codex'),expiresAt:1},{home,open:false}),/过期/);assert.equal(readdirSync(home).length,0);
  mkdirSync(join(home,'.codex'));const path=join(home,'.codex/config.toml'),original='[mcp_servers.mondrian_1234abcd_C]\ncommand="manual"\n';writeFileSync(path,original);
  await assert.rejects(()=>installAgent({...payload('codex'),source:'process.stderr.write("网络不可达");process.exitCode=1;'},{home,open:false}),/连接检查未通过/);assert.equal(readFileSync(path,'utf8'),original);
  await assert.rejects(()=>installAgent(payload('codex'),{home,open:false}),/手动配置/);assert.equal(readFileSync(path,'utf8'),original);
  mkdirSync(join(home,'.workbuddy'));const broken=join(home,'.workbuddy/mcp.json');writeFileSync(broken,'{broken-secret-config');await assert.rejects(()=>installAgent(payload('workbuddy'),{home,open:false}),e=>e.message.includes('有效 JSON')&&!e.message.includes('secret-config'));assert.equal(readFileSync(broken,'utf8'),'{broken-secret-config');
 }finally{rmSync(home,{recursive:true,force:true});}
});
test('downloaded installer contains literal data and no shell substitution of role credentials',()=>{
 const p=payload('codex'),source=createWindowsInstaller({inlineConfig:JSON.stringify({mcpServers:{[p.label]:{}}}),expiresAt:p.expiresAt,clientSource:p.source,prompt:p.prompt},'codex');assert.ok(source.startsWith('/* 2>nul'));assert.ok(source.includes('node "%~f0"'));assert.ok(source.includes('installAgent'));assert.ok(!source.includes('ExecutionPolicy'));assert.throws(()=>createWindowsInstaller({},'doubao'),/尚无/);
});
