import {readJson} from './http-json.js';
import http from 'node:http';import {spawn} from 'node:child_process';import {readFileSync,mkdirSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {formatCurrentObservation} from './agents.js';
export function workBuddyArgs(cli,instructions){return [cli,'--print','--output-format','json','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--permission-mode','dontAsk','--setting-sources','user','--settings','{"disableAllHooks":true}','--max-turns','1','--no-session-persistence','--effort','low','--model','glm-5.1','--system-prompt',instructions];}
export function parseWorkBuddyOutput(text){
 const events=text.split('\n').flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
 const result=events.findLast(e=>e.type==='result');if(!result)throw Error('WorkBuddy 未返回有效结果，请检查本机 CLI 登录');
 if(result.is_error||result.subtype&&result.subtype!=='success')throw Error('WorkBuddy 执行失败');
 let r;try{r=JSON.parse(String(result.result).replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));}catch{throw Error('WorkBuddy 返回JSON格式错误，未执行本轮动作');}
 if(!r||typeof r!=='object'||Array.isArray(r))throw Error('WorkBuddy 未返回JSON对象');
 if(r.action&&!['move','rotate','select','unselect','submit'].includes(r.action.type))throw Error('WorkBuddy 返回不允许的操作');
 if(r.message!==undefined&&(typeof r.message!=='string'||r.message.length>2000))throw Error('WorkBuddy 消息格式错误');
 return {...r,usage:result.usage};
}
export function createWorkBuddyBridge({node,cli,cwd,profile,proxy,token,port=4331}){
 if(!node||!cli||!cwd||!token||token.length<32)throw Error('缺少本机适配器配置');mkdirSync(cwd,{recursive:true});let busy=false;
 const server=http.createServer({requestTimeout:15000,headersTimeout:10000},async(req,res)=>{
  const reply=(status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
  if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')||req.headers.origin)return reply(403,{error:'仅允许本机服务调用'});
  if(req.headers.authorization!==`Bearer ${token}`)return reply(401,{error:'无效适配器凭据'});
  if(req.method!=='POST'||req.url!=='/act')return reply(404,{error:'不存在'});
  if(busy)return reply(429,{error:'正在处理上一回合'});let own=false,child,timer;
  try{
   const b=await readJson(req,1048576);if(b.protocol!=='mgf-agent-v1'||!['A','B','C'].includes(b.observation?.role)||typeof b.instructions!=='string'||b.instructions.length>10000)throw Error('无效拼图请求');
   if(busy)return reply(429,{error:'正在处理上一回合'});busy=true;own=true;
   child=spawn(node,workBuddyArgs(cli,b.instructions+'\n仅输出最终JSON，不调用任何工具。'),{cwd,windowsHide:true,env:{...process.env,CODEBUDDY_CONFIG_DIR:profile,WORKBUDDY_CONFIG_DIR:profile,CODEBUDDY_SKIP_GIT_BASH_CHECK:'1',...(proxy?{HTTPS_PROXY:proxy,HTTP_PROXY:proxy}:{})},stdio:['pipe','pipe','pipe']});
   const output=await new Promise((ok,fail)=>{child.stdout.setEncoding('utf8');let out='';timer=setTimeout(()=>{child.kill();fail(Error('WorkBuddy 调用超时'));},55000);child.stdout.on('data',c=>{out+=c;if(out.length>2000000){child.kill();fail(Error('响应过大'));}});child.stderr.on('data',()=>{});child.on('error',fail);child.on('close',code=>code===0?ok(out):fail(Error('WorkBuddy CLI 执行失败，请检查登录状态')));child.stdin.on('error',()=>{});child.stdin.end(formatCurrentObservation(b.observation));res.on('close',()=>{if(!res.writableEnded)child.kill();});});
   reply(200,parseWorkBuddyOutput(output));
  }catch(e){console.error(JSON.stringify({event:'workbuddy_adapter_error',error:e.message}));reply(502,{error:e.message});}finally{clearTimeout(timer);if(own)busy=false;}
 });return {server,listen:()=>server.listen(port,'127.0.0.1')};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const config=JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));createWorkBuddyBridge(config).listen();console.log('Local WorkBuddy puzzle adapter ready');}
