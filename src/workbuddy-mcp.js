import {readJson} from './http-json.js';
import http from 'node:http';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {createInterface} from 'node:readline';import {fileURLToPath} from 'node:url';
const actions=['select','unselect','move','rotate','submit'];
export function createRelay({token,sessionId,role='B',expiresAt=Infinity,requireExpiry=false,turnTimeoutMs=55000}){
 if((requireExpiry||expiresAt!==Infinity)&&!Number.isFinite(expiresAt))throw Error('必须配置有限数字格式的到期时间');if(!['A','B','C'].includes(role))throw Error('未知角色');if(!token||token.length<32||!sessionId)throw Error('缺少 B 专用连接配置');let pending,clientSeenAt=null;
 const reply=(r,status,b)=>{if(!r.destroyed){r.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});r.end(JSON.stringify(b));}};
 const server=http.createServer({requestTimeout:15000,headersTimeout:10000},async(req,res)=>{try{
  if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')||req.headers.origin)return reply(res,403,{error:'仅允许本机服务调用'});
  if(req.headers.authorization!==`Bearer ${token}`)return reply(res,401,{error:'无效连接凭据'});
  if(Date.now()>=expiresAt)return reply(res,403,{error:'角色接入凭据已过期，请联系研究者重新发放'});
  if(req.method!=='POST')return reply(res,405,{error:'仅支持POST'});
  const b=await readJson(req,req.url==='/act'?1048576:20000);
  if(req.url==='/act'){
   if(b.protocol!=='mgf-agent-v1'||b.observation?.role!==role||b.observation?.sessionId!==sessionId)return reply(res,403,{error:'只允许绑定房间的 B 角色'});
   if(pending)return reply(res,429,{error:'B 上一回合尚未完成'});
   const job={requestId:randomUUID(),observation:b.observation,instructions:b.instructions,leased:false,res};pending=job;
   job.timer=setTimeout(()=>{if(pending===job){pending=undefined;reply(res,504,{code:job.leased?'WORKBUDDY_SUBMIT_TIMEOUT':'WORKBUDDY_NOT_POLLING',error:job.leased?'WorkBuddy 已领取回合，但未及时提交动作':'WorkBuddy 未领取回合，请检查桌面任务是否仍在运行'});}},turnTimeoutMs);
   res.on('close',()=>{if(pending===job){clearTimeout(job.timer);pending=undefined;}});return;
  }
  if(req.url==='/client'){clientSeenAt=Date.now();return reply(res,200,{ok:true});}
  if(req.url==='/status')return reply(res,200,{sessionId,role,clientSeenAt,pending:!!pending,claimed:!!pending?.leased});
  if(req.url==='/next'){
   clientSeenAt=Date.now();
   const until=Date.now()+20000;while(Date.now()<until&&!res.destroyed){if(Date.now()>=expiresAt)return reply(res,403,{error:'角色接入凭据已过期'});if(pending&&!pending.leased){pending.leased=true;const {requestId,instructions,observation}=pending;return reply(res,200,{requestId,instructions,observation});}await new Promise(r=>setTimeout(r,100));}
   return reply(res,200,{waiting:true,message:'尚无新的 B 回合；稍后再次调用 next_puzzle_turn。'});
  }
  if(req.url==='/submit'){
   if(!pending||pending.requestId!==b.requestId)return reply(res,409,{error:'回合已过期或已经提交，须领取新回合'});
   if(b.action&&(!actions.includes(b.action.type)||typeof b.action!=='object'))return reply(res,400,{error:'只允许拼图动作'});
   if(b.message!==undefined&&(typeof b.message!=='string'||b.message.length>2000))return reply(res,400,{error:'公开消息格式错误'});
   if(!b.action&&!b.message)return reply(res,400,{error:'请提供动作或公开消息'});
   const job=pending;pending=undefined;clearTimeout(job.timer);reply(job.res,200,{message:b.message,action:b.action});return reply(res,200,{accepted:true});
  }
  reply(res,404,{error:'不存在'});
 }catch(e){reply(res,e.statusCode||400,{error:e.message});}});
 return {server,close:async()=>{if(pending){clearTimeout(pending.timer);reply(pending.res,503,{error:'连接器正在关闭'});pending=undefined;}server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
export const tools=[
 {name:'next_puzzle_turn',description:'领取蒙德里安几何狂想中 B 角色的最新回合。只返回 B 可见状态、规则及一次性 requestId。单次等待最多20秒。',inputSchema:{type:'object',properties:{},additionalProperties:false}},
 {name:'submit_puzzle_turn',description:'提交刚领取回合的 B 动作和可选公开消息。不能操作其他角色、启动或结束实验。过期回合必须重新领取。',inputSchema:{type:'object',properties:{requestId:{type:'string'},message:{type:'string',maxLength:2000},action:{type:['object','null'],properties:{type:{type:'string',enum:actions},pieceId:{type:'string'},dx:{type:'number'},dy:{type:'number'},direction:{type:'integer',enum:[-1,1]}},additionalProperties:false}},required:['requestId'],additionalProperties:false}}
];
export function relayBaseUrl(config){
 const base=config.baseUrl||('http://127.0.0.1:'+ (config.port||4331));const url=new URL(base);
 if(url.username||url.password||url.search||url.hash)throw Error('连接地址不能包含凭据、查询或片段');
 if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('远程连接必须使用HTTPS');
 return url.toString().replace(/\/$/,'');
}
export function serveStdio(config){
 const base=relayBaseUrl(config),role=config.role||'B';
 const send=x=>process.stdout.write(JSON.stringify(x)+'\n');
 createInterface({input:process.stdin}).on('line',async line=>{let m;try{m=JSON.parse(line);if(!('id'in m))return;let result;
  if(m.method==='initialize'){const connected=await fetch(`${base}/client`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.token}`},body:'{}',signal:AbortSignal.timeout(15000)});if(!connected.ok)throw Error('连接器握手失败：HTTP '+connected.status);result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'mondrian-agent-'+role.toLowerCase(),version:'1.1.0'}};}
  else if(m.method==='ping')result={};
  else if(m.method==='tools/list')result={tools:tools.map(t=>({...t,description:t.description.replaceAll('B',role)}))};
  else if(m.method==='tools/call'){
   const route={next_puzzle_turn:'/next',submit_puzzle_turn:'/submit'}[m.params?.name];if(!route)throw Error('未知拼图工具');
   const r=await fetch(`${base}${route}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.token}`},body:JSON.stringify(m.params.arguments||{}),signal:AbortSignal.timeout(25000)});const data=await r.json();result={content:[{type:'text',text:JSON.stringify(data)}],isError:!r.ok};
  }else{send({jsonrpc:'2.0',id:m.id,error:{code:-32601,message:'方法不存在'}});return;}
  send({jsonrpc:'2.0',id:m.id,result});
 }catch(e){if(m&&'id'in m)send({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:e.message}});}});
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const config=JSON.parse(readFileSync(process.argv[3],'utf8').replace(/^\uFEFF/,''));if(process.argv[2]==='--stdio')serveStdio(config);else if(process.argv[2]==='--serve'){createRelay(config).server.listen(config.port||4331,'127.0.0.1');console.log('WorkBuddy B relay ready');}else throw Error('未知启动模式');}
