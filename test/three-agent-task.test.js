import test from 'node:test';import assert from 'node:assert/strict';
import {createAgentTask} from '../public/agent-installer.js';
const descriptor={role:'C',sessionId:'12345678-room',expiresAt:Date.now()+3600000,url:'https://example.test/mcp/room/C',token:'ONLY_C_TOKEN',codexInlineConfig:'[mcp_servers.only_C]\ncommand="node"',inlineConfig:'{"mcpServers":{"only_C":{"command":"node"}}}',httpConfig:'{"mcpServers":{"only_C":{"type":"http","url":"https://example.test/mcp/room/C","headers":{"Authorization":"Bearer ONLY_C_TOKEN"}}}}',prompt:'你是C角色，仅操作自己的碎片，按requestId提交。',otherRoleSecret:'PRIVATE_B',tlsMode:'deployment-ca'};
test('one task includes ordered installation, actual connection acceptance and role execution without requiring another prompt',()=>{
 const task=createAgentTask(descriptor,'codex');assert.ok(task.indexOf('阶段一')<task.indexOf('阶段二'));assert.ok(task.indexOf('阶段二')<task.indexOf('阶段三'));assert.match(task,/不是只做连接测试/);assert.match(task,/尚未安装/);assert.match(task,/\[mcp_servers.only_C\]/);assert.match(task,/next_puzzle_turn/);assert.match(task,/submit_puzzle_turn/);assert.match(task,/waiting/);assert.match(task,/你是C角色/);assert.match(task,/同一文件/);assert.ok(!task.includes('PRIVATE_B'));
});
test('Doubao task includes HTTP authentication and explicitly identifies the remaining certificate blocker',()=>{
 const task=createAgentTask(descriptor,'doubao');assert.match(task,/ONLY_C_TOKEN/);assert.match(task,/自签名/);assert.match(task,/证书/);assert.match(task,/不得关闭/);assert.match(task,/阶段三/);assert.ok(!task.includes('config.toml'));assert.ok(!task.includes('PRIVATE_B'));
});

test('automatic task identifies its own client and includes all supported transports for only this role',()=>{
 const task=createAgentTask(descriptor);assert.match(task,/自行识别/);assert.match(task,/不要让用户选择/);assert.match(task,/CODEX_HOME/);assert.match(task,/WorkBuddy/);assert.match(task,/只选适合当前客户端的一种/);assert.match(task,/codexToml/);assert.match(task,/remoteHttp/);assert.match(task,/ONLY_C_TOKEN/);assert.match(task,/你是C角色/);assert.ok(!task.includes('PRIVATE_B'));
});

test('cross-computer onboarding states actual host, recipient environment and preflight boundaries',()=>{
 const task=createAgentTask(descriptor);assert.match(task,/https:\/\/example.test/);assert.match(task,/接收方电脑/);assert.match(task,/不得领取实验回合/);assert.match(task,/不能自动继承/);assert.match(task,/不能假装修改了桌面宿主配置/);assert.match(task,/不得用命令行临时启动桥接脚本/);
 const local=createAgentTask({...descriptor,url:'http://127.0.0.1:4328/mcp/test/C'});assert.match(local,/回环地址/);assert.match(local,/其他电脑必须停止安装/);
});
