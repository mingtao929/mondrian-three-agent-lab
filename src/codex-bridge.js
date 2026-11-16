import {readJson} from './http-json.js';
// Local-only adapter. Credentials remain in the Codex login store.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdirSync,readFileSync,existsSync,readdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {formatCurrentObservation} from './agents.js';
export function makeCodexPrompt(body){return `${body.instructions}\n仅根据角色当前可见信息决策。不要调用工具、读取文件或浏览网页。仅输出最终JSON。\n${formatCurrentObservation(body.observation)}`;}
export function codexFailure(text=''){
 const entry=/401|unauthori|not logged|refresh.token/i.test(text)?['CODEX_AUTH','Codex 登录已失效，请在桌面端重新登录后测试连接']: /429|usage.limit|quota|rate.limit/i.test(text)?['CODEX_LIMIT','Codex 用量限制或限流，请等待额度恢复后测试连接']: /connect|network|proxy|dns|tls|timed.out/i.test(text)?['CODEX_NETWORK','Codex 网络或代理连接失败，请检查当前网络和代理']: /ENOENT|not found|unknown flag|unexpected argument/i.test(text)?['CODEX_CLI','Codex CLI 路径或启动参数失效，请重新运行启动平台脚本']:['CODEX_FAILED','Codex 回合失败，未执行本轮动作；请测试连接并检查桌面端状态'];
 return Object.assign(Error(entry[1]),{code:entry[0]});
}
function resolveCli(cli){
 if(existsSync(cli))return cli;
 const base=resolve(cli,'../..');
 try{const candidates=readdirSync(base).map(name=>resolve(base,name,'codex.exe')).filter(existsSync).sort((a,b)=>statSync(b).mtimeMs-statSync(a).mtimeMs);if(candidates.length)return candidates[0];}catch{}
 throw codexFailure('ENOENT');
}
export function validateRequest(b){
 if(b?.protocol!=='mgf-agent-v1')throw Error('无效协议');
 if(!['A','B','C'].includes(b.observation?.role))throw Error('无效角色');
 if(typeof b.instructions!=='string'||b.instructions.length>10000)throw Error('无效指令');
}
export function parseCodexOutput(text){
 const events=text.split('\n').filter(Boolean).map(s=>JSON.parse(s));
 if(events.some(e=>e.item&&['command_execution','mcp_tool_call','web_search','file_change'].includes(e.item.type)))throw Error('拒绝工具调用结果');
 const end=events.findLast(e=>e.type==='turn.completed');
 if(!end)throw Error('Codex 未完成完整回合');
 const message=events.findLast(e=>e.type==='item.completed'&&e.item?.type==='agent_message');
 if(!message)throw Error('Codex 未返回消息');
 const result=JSON.parse(message.item.text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));
 if(!result||Array.isArray(result)||typeof result!=='object')throw Error('Codex 未返回JSON对象');
 return {...result,usage:end.usage};
}
export function createCodexBridge({cli,token,cwd,proxy,port=4330,settingsPath},spawnCli=spawn){
 if(!cli||!token||token.length<32)throw Error('缺少本机CLI或适配器Token');
 mkdirSync(cwd,{recursive:true});let busy=false;
 const server=http.createServer({requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
  const reply=(status,b)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(b));}};
  if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')||req.headers.origin)return reply(403,{error:'仅允许本机服务调用'});
  if(req.headers.authorization!==`Bearer ${token}`)return reply(401,{error:'无效凭据'});
  if(req.method==='GET'&&req.url==='/health'){try{resolveCli(cli);return reply(200,{ok:true,busy});}catch(e){return reply(503,{error:e.message,code:e.code});}}
  if(req.method!=='POST'||req.url!=='/act')return reply(404,{error:'不存在'});
  if(busy)return reply(429,{error:'正在执行上一回合'});
  let child,timer,ownsLock=false;
  try{
   const body=await readJson(req,1048576);validateRequest(body);if(busy)return reply(429,{error:'正在执行上一回合'});busy=true;ownsLock=true;
   const flags=['shell_tool','shell_snapshot','unified_exec','apps','browser_use','browser_use_external','multi_agent','plugins','remote_plugin','memories','code_mode','code_mode_host','view_image'];
   const args=['exec','--ignore-user-config','--ephemeral','--skip-git-repo-check','--sandbox','read-only',...flags.flatMap(f=>['--disable',f]),'-c','web_search="disabled"','-c','project_doc_max_bytes=0','-c','model_reasoning_effort="low"','--json','-'];
   let currentProxy=proxy;if(settingsPath){try{currentProxy=JSON.parse(readFileSync(settingsPath,'utf8').replace(/^\uFEFF/,'')).proxy||null;}catch{throw codexFailure('ENOENT');}}
   child=spawnCli(resolveCli(cli),args,{cwd,windowsHide:true,env:{...process.env,HTTPS_PROXY:currentProxy||'',HTTP_PROXY:currentProxy||'',OPENAI_API_KEY:'',CODEX_API_KEY:''},stdio:['pipe','pipe','pipe']});
   const output=await new Promise((ok,fail)=>{
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');let out='',err='';timer=setTimeout(()=>{child.kill();fail(Error('Codex 回合超时'));},300000);
    child.stdout.on('data',c=>{out+=c;if(out.length>2000000){child.kill();fail(Error('响应过大'));return;}if(out.split('\n').some(line=>{try{return JSON.parse(line).type==='turn.completed';}catch{return false;}})){clearTimeout(timer);ok(out);child.kill();}});
    child.stderr.on('data',c=>{err=(err+c).slice(-8192);});child.on('error',e=>fail(codexFailure(e.code)));child.on('close',code=>code===0?ok(out):fail(codexFailure(out.slice(-8192)+'\n'+err)));
    child.stdin.on('error',()=>{});
    child.stdin.end(makeCodexPrompt(body));
    res.on('close',()=>{if(!res.writableEnded)child.kill();});
   });
   reply(200,parseCodexOutput(output));
  }catch(e){const safe=e.code?e:e.message==='Codex 回合超时'?Object.assign(Error(e.message),{code:'CODEX_TIMEOUT'}):codexFailure();console.error(JSON.stringify({event:'codex_adapter_error',at:new Date().toISOString(),code:safe.code,error:safe.message}));reply(502,{error:safe.message,code:safe.code});}finally{clearTimeout(timer);if(ownsLock)busy=false;}
 });
 return {server,listen:()=>server.listen(port,'127.0.0.1')};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const settings=JSON.parse(readFileSync(resolve(process.argv[2]),'utf8').replace(/^\uFEFF/,''));
 createCodexBridge({...settings,settingsPath:resolve(process.argv[2])}).listen();console.log('Local Codex puzzle adapter ready');
}
