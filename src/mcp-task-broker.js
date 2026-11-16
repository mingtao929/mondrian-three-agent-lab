import {inlineClientSource} from './stdio-access.js';
import {randomBytes,randomUUID,timingSafeEqual} from 'node:crypto';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {CallToolRequestSchema,ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {applyAction,timeLeft,ROLES} from './engine.js';
import {completedRole,duplicateChat,conversationTrigger,CHAT_COOLDOWN_MS} from './communication.js';
import {desktopClientSource} from './guest-desktop.js';
import {readJson} from './http-json.js';
import {mcpObservation,observationDelta,sameObservationStage} from './mcp-observation.js';

const actionTypes=['select','unselect','move','rotate','submit'];
const toolDefinitions=role=>[
 {name:'next_puzzle_turn',description:`领取角色 ${role} 的可见任务和一次性回合。只按返回信息决策；waiting 时按 retryAfterMs 等待，不要连续空转。`,inputSchema:{type:'object',properties:{ackVersion:{type:'string',maxLength:64,description:'已收到的上一stateVersion，用于领取增量；首次调用不填'},reset:{type:'boolean',description:'需要完整快照时设为true'}},additionalProperties:false}},
 {name:'submit_puzzle_turn',description:`提交角色 ${role} 刚领取回合的一项动作及可选公开消息。返回游戏引擎的实际执行结果。无新增信息可不发言，action=null 表示等待。`,inputSchema:{type:'object',properties:{requestId:{type:'string'},message:{type:'string',maxLength:500},decisionSummary:{type:'string',minLength:1,maxLength:240,description:'简述本回合的可见依据和行动目的，非内部思维链；只供研究者事后导出'},usedMessageSeqs:{type:'array',items:{type:'integer',minimum:1},maxItems:8,uniqueItems:true,description:'声明实际参考的队友消息seq；未参考填空数组，不能虚构引用'},action:{type:['object','null'],properties:{type:{type:'string',enum:actionTypes},pieceId:{type:'string'},dx:{type:'number'},dy:{type:'number'},direction:{type:'integer',enum:[-1,1]}},required:['type'],additionalProperties:false}},required:['requestId'],additionalProperties:false}}
];
const rules='你是独立的拼图协作 Agent。只使用本角色的两个 MCP 工具；不能读取平台文件、数据库、其他角色或研究者界面。先完成四道练习，再完成两关。只能移动自己的碎片：单轴平移0.5至10格，步长为0.5倍数；旋转为90度。坐标表示碎片中心，不代表已完成几何对齐。通过公开消息交换各自可见线索。pieces.worldVertices是当前世界坐标多边形，x/y是旋转中心；目标由中心x/y与width/height定义。三方submit才判分，移动会清空提交确认。每次只提交一项动作；不重复发言。没有新信息时等待。工具返回executed才表示执行成功，rejected需读取原因纠正。';
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
function fields(value,allowed){if(!plain(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw Error('包含不允许的字段');}
function validate(name,args){
 if(name==='next_puzzle_turn'){fields(args,['ackVersion','reset']);if(args.ackVersion!==undefined&&(typeof args.ackVersion!=='string'||args.ackVersion.length>64))throw Error('无效状态版本');if(args.reset!==undefined&&typeof args.reset!=='boolean')throw Error('无效reset参数');return;}
 if(name!=='submit_puzzle_turn')throw Error('未知工具');fields(args,['requestId','message','action','decisionSummary','usedMessageSeqs']);
 if(args.decisionSummary!==undefined&&(typeof args.decisionSummary!=='string'||!args.decisionSummary.trim()||args.decisionSummary.length>240))throw Error('决策说明应为1至240字符');if(args.usedMessageSeqs!==undefined&&(!Array.isArray(args.usedMessageSeqs)||args.usedMessageSeqs.length>8||new Set(args.usedMessageSeqs).size!==args.usedMessageSeqs.length||args.usedMessageSeqs.some(n=>!Number.isSafeInteger(n)||n<1)))throw Error('队友消息引用最多8个不重复的正整数seq');
 if(typeof args.requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(args.requestId))throw Error('无效回合编号');
 if(args.message!==undefined&&(typeof args.message!=='string'||args.message.length>500||args.message.includes('\0')))throw Error('公开消息最多500字符');
 if(args.action!=null){fields(args.action,['type','pieceId','dx','dy','direction']);const a=args.action;if(!actionTypes.includes(a.type))throw Error('不允许的动作');const expected={select:['type','pieceId'],unselect:['type'],move:['type','pieceId','dx','dy'],rotate:['type','pieceId','direction'],submit:['type']}[a.type];if(Object.keys(a).some(k=>!expected.includes(k))||expected.some(k=>!(k in a)))throw Error('动作参数不完整或包含多余字段');if('pieceId'in a&&(typeof a.pieceId!=='string'||a.pieceId.length>40))throw Error('无效碎片编号');if(a.type==='move'&&(!Number.isFinite(a.dx)||!Number.isFinite(a.dy)))throw Error('位移参数必须为有限数字');if(a.type==='rotate'&&![-1,1].includes(a.direction))throw Error('旋转方向必须为-1或1');}
}
const epoch=s=>[s.runEpoch||0,s.phase,s.level];
const stamp=(s,role)=>JSON.stringify([...epoch(s),s.practiceIndex[role]]);
const fingerprint=o=>JSON.stringify([o.phase,o.level,o.boardRevision,o.selected,o.practiceIndex,o.practiceResult,o.ready,o.pieces,o.visibleTargets,o.frame,o.messages,o.selfProfile,o.communicationOnly]);

export function createMcpTaskBroker({getSession,record,publish,introduce=()=>{},pause,baseUrl,ttlMs=4*3600000,maxChannels=48,audit=()=>{},tlsCaPem}={}){
 const channels=new Map(),transports=new Set();let closed=false;
 const key=(id,r)=>id+':'+r;
 const live=(c,s)=>!!c&&!!s&&!closed&&!s.deleted&&!s.archived&&Date.now()<c.expiresAt;
 const send=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 const latest=c=>getSession(c.id);
 const log=(s,r,type,payload)=>record(s,r,type,payload);
 function access(reason,id,role,extra={}){return audit({at:Date.now(),sessionId:id,role,reason,...extra});}
 function secrets(s){return [...Object.values(s.tokens||{}),...[...channels.values()].map(c=>c.token)].filter(v=>typeof v==='string'&&v.length>=16);}
 function safeResult(s,value){let raw=JSON.stringify(value);for(const secret of secrets(s))raw=raw.replaceAll(secret,'[REDACTED]');return JSON.parse(raw);}
 function issue(s,role,{baseUrl:address}={}){
  if(!ROLES.includes(role)||s.deleted||s.archived||s.phase==='finished')throw Error('不能生成此角色连接');
  if(['practice','playing'].includes(s.phase)&&!s.pausedAt)throw Error('请先暂停整个实验再生成连接');
  for(const [k,c] of channels)if(!live(c,latest(c)))channels.delete(k);
  if(!channels.has(key(s.id,role))&&channels.size>=maxChannels)throw Error('MCP连接数量已达上限');
  const root=new URL(address||baseUrl);if(root.username||root.password||root.search||root.hash||root.pathname!=='/'||root.protocol!=='https:'&&!(root.protocol==='http:'&&['127.0.0.1','localhost'].includes(root.hostname)))throw Error('异地MCP需要HTTPS地址，本机使用回环地址');
  const token=randomBytes(32).toString('hex'),expiresAt=Date.now()+ttlMs,url=root.origin+'/mcp/'+s.id+'/'+role,label='mondrian_'+s.id.slice(0,8)+'_'+role;
  const descriptor={role,sessionId:s.id,expiresAt,url,clientSource:inlineClientSource(url,token,tlsCaPem),token,
   httpConfig:JSON.stringify({mcpServers:{[label]:{type:'http',url,headers:{Authorization:'Bearer '+token}}}},null,2),
   codexConfig:`[mcp_servers.${label}]\nurl = ${JSON.stringify(url)}\nhttp_headers = { Authorization = ${JSON.stringify('Bearer '+token)} }\n`,
   stdioConfig:JSON.stringify({mcpServers:{[label]:{type:'stdio',command:'node',args:['替换为下载的MCP客户端完整路径'],alwaysLoad:true}}},null,2),
   prompt:`你是蒙德里安几何狂想的 ${role} 角色。仅启用此角色连接器，禁用文件、浏览器及其他角色工具；使用独立会话。先调用 next_puzzle_turn，收到 waiting 按 retryAfterMs 等待。拿到 requestId 后独立规划，再调用 submit_puzzle_turn；以执行回执为准。完成自己的任务后可回应新问题，不重复催促。${rules}收到stateVersion后，下次领取将其作为ackVersion，减少重复上下文。delta以baseVersion为基础，更新set、碎片upsert/remove和聊天append；若缺少基础状态或版本不匹配，reset:true领取完整快照。每次发言或动作提交都需decisionSummary，简短说明可见依据和下一步目的，不提交内部思维链；usedMessageSeqs只列实际参考的队友消息seq，未参考填[]。决策说明仅供研究者事后导出，不会公开给队友，不要把它当作公开聊天。`};
  const inlineSource=inlineClientSource(url,token,tlsCaPem),inlineEntry={command:'node',args:['-e',inlineSource]};
  descriptor.inlineConfig=JSON.stringify({mcpServers:{[label]:{type:'stdio',...inlineEntry}}},null,2);
  descriptor.workbuddyConfig=JSON.stringify({mcpServers:{[label]:{type:'streamableHttp',url,headers:{Authorization:'Bearer '+token},timeout:30000}}},null,2);
  descriptor.codexInlineConfig='[mcp_servers.'+label+']\ncommand = "node"\nargs = '+JSON.stringify(inlineEntry.args)+'\n';
  descriptor.tlsMode=tlsCaPem?'deployment-ca':'system-ca';
  channels.set(key(s.id,role),{id:s.id,role,token,expiresAt,lastSeen:0,pending:null,receipts:new Map(),previousResult:null,lastFingerprint:null,baseline:null,seenMessages:new Set()});return {descriptor};
 }
 function status(id){const s=getSession(id);return Object.fromEntries(ROLES.map(r=>{const c=channels.get(key(id,r));return [r,{connected:live(c,s)&&s.phase!=='finished'&&s.agents[r].enabled&&Date.now()-c.lastSeen<60000,expiresAt:c?.expiresAt||null,pending:!!c?.pending,lastRequestAt:c?.lastRequestAt||null,lastRequestMethod:c?.lastRequestMethod||null}];}));}
 function assertReady(s){for(const role of ROLES){const c=channels.get(key(s.id,role));if(s.agents[role].kind!=='mcp'||!s.agents[role].enabled||!live(c,s)||Date.now()-c.lastSeen>=60000)throw Error(role+' 的MCP Agent尚未就绪，请配置对应连接器并调用 next_puzzle_turn');}}
 function invoke(c,name,args){
  const s=latest(c);if(!live(c,s))return {status:'rejected',error:'角色连接失效，请联系研究者重新生成',isError:true};
  try{validate(name,args);if(name==='submit_puzzle_turn'&&s.tracePolicy==='decision-v1'&&(args.action||args.message?.trim())&&!args.decisionSummary?.trim())throw Error('本实验要求提交decisionSummary，简述可见依据和行动目的');if(name==='submit_puzzle_turn'&&(args.usedMessageSeqs||[]).some(seq=>!c.seenMessages.has(seq)||!ROLES.includes(s.messages[seq-1]?.role)||s.messages[seq-1]?.role===c.role))throw Error('只能引用本角色已收到的队友公开消息');if(name==='submit_puzzle_turn'&&[args.message,args.decisionSummary].some(text=>text&&secrets(s).some(value=>text.includes(value))))throw Error('公开消息不能包含连接凭据');}catch(e){access('invalid_tool_arguments',s.id,c.role,{tool:['next_puzzle_turn','submit_puzzle_turn'].includes(name)?name:'unknown'});log(s,c.role,'mcp_rejected',{tool:['next_puzzle_turn','submit_puzzle_turn'].includes(name)?name:'unknown',reason:e.message,requestId:args.requestId===c.pending?.requestId||c.receipts.has(args.requestId)?args.requestId:null});throw e;}c.lastSeen=Date.now();s.agents[c.role].status=s.phase==='finished'?'实验已结束':s.agents[c.role].enabled?'MCP Agent已连接':'已停用';log(s,c.role,'mcp_input',{tool:name,arguments:safeResult(s,args)});
  let result;
  if(name==='next_puzzle_turn'){
   introduce(s);const o=mcpObservation(s,c.role);
   if(s.phase==='finished')result={status:'finished',reason:'本次实验已结束，请停止调用',previousResult:c.previousResult,result:o.lastResult};
   else if(s.pausedAt||!s.agents[c.role].enabled||!['practice','playing'].includes(s.phase))result={status:'waiting',reason:s.pausedAt?'实验已暂停，请等待研究者恢复':!s.agents[c.role].enabled?'本角色已停用':'等待研究者开始实验',retryAfterMs:5000,previousResult:c.previousResult};
   else if(!timeLeft(s))result={status:'waiting',reason:'实验时间已结束',retryAfterMs:10000};
   else{
    if(c.pending&&(c.pending.stamp!==stamp(s,c.role)||Date.now()>=c.pending.expiresAt)){c.pending=null;c.lastFingerprint=null;}
    if(c.pending)result=args.reset||args.ackVersion!==c.pending.job.baseVersion?c.pending.fullJob:c.pending.job;
    else if(completedRole(s,c.role)&&c.completedTurn&&(c.completedTurn.trigger===conversationTrigger(s,c.role)||Date.now()-c.completedTurn.at<CHAT_COOLDOWN_MS)||c.lastFingerprint===fingerprint(o))result={status:'waiting',reason:'没有新的可见信息或尚在交流冷却期',retryAfterMs:3000,previousResult:c.previousResult};
    else{const requestId=randomUUID(),stateVersion=randomUUID(),base=c.baseline,fullJob={status:'turn',requestId,stateVersion,delivery:'snapshot',instructions:rules,observation:o,previousResult:c.previousResult};
     result=!args.reset&&base&&args.ackVersion===base.version&&sameObservationStage(base.observation,o)?{status:'turn',requestId,stateVersion,delivery:'delta',baseVersion:base.version,observationDelta:observationDelta(base.observation,o,s),previousResult:c.previousResult}:fullJob;
     c.pending={requestId,stamp:stamp(s,c.role),boardRevision:s.boardRevision,expiresAt:Date.now()+300000,job:result,fullJob};c.baseline={version:stateVersion,observation:structuredClone(o)};c.lastFingerprint=fingerprint(o);if(completedRole(s,c.role))c.completedTurn={trigger:conversationTrigger(s,c.role),at:Date.now()};}
   }
   if(result.status==='waiting'&&args.reset&&!s.pausedAt&&s.agents[c.role].enabled&&['practice','playing'].includes(s.phase)){const stateVersion=randomUUID();result={...result,stateVersion,delivery:'snapshot',instructions:rules,observation:o};c.baseline={version:stateVersion,observation:structuredClone(o)};}
  }else{
   const serialized=JSON.stringify({message:args.message||'',action:args.action||null,decisionSummary:args.decisionSummary?.trim()||null,usedMessageSeqs:args.usedMessageSeqs||[]}),prior=c.receipts.get(args.requestId);
   if(prior){result=prior.serialized===serialized?{...prior.result,replayed:true}:{requestId:args.requestId,status:'rejected',error:'同一回合不能更换提交内容',isError:true};}
   else{
    const p=c.pending;
    if(!p||p.requestId!==args.requestId||p.stamp!==stamp(s,c.role)||Date.now()>=p.expiresAt||s.phase==='finished'||s.pausedAt||!s.agents[c.role].enabled||!timeLeft(s)||args.action?.type==='submit'&&s.phase==='playing'&&p.boardRevision!==s.boardRevision){if(p?.requestId===args.requestId){c.pending=null;c.lastFingerprint=null;}result={requestId:args.requestId,status:'rejected',error:'回合已过期或实验状态已变化，请重新领取',isError:true};}
    else{
     const candidate=structuredClone(s),decision={decisionSummary:args.decisionSummary?.trim()||null,decisionSource:args.decisionSummary?'agent_declared':'not_provided',references:(args.usedMessageSeqs||[]).map(seq=>({seq,role:s.messages[seq-1].role,text:s.messages[seq-1].text,time:s.messages[seq-1].time,delivered:true,claimedUsed:true}))};try{
      if(completedRole(s,c.role)&&args.action)throw Error('本角色已提交确认或完成练习，本回合只能交流或等待');
      if(args.action)applyAction(candidate,c.role,{...args.action,id:args.requestId});
      const text=args.message?.trim(),chat=text&&!duplicateChat(s,c.role,text);
      if(chat){if(candidate.phase==='finished')candidate.messages.push({role:c.role,text,time:Date.now(),phase:s.phase,level:s.level});else applyAction(candidate,c.role,{type:'chat',text});}
      // Commit one durable state+event before acknowledging the actual engine result.
      result={requestId:args.requestId,status:'executed',applied:!!args.action,messagePublished:!!chat,revision:candidate.revision,practiceIndex:candidate.practiceIndex[c.role],phase:candidate.phase,level:candidate.level};
      Object.assign(s,candidate);log(s,c.role,'mcp_action',{requestId:args.requestId,action:args.action||null,message:chat?text:null,result,...decision});
     }catch(e){if(e.statusCode===503)throw e;result={requestId:args.requestId,status:'rejected',error:e.message,isError:true};}
     log(s,c.role,'agent_turn_result',safeResult(s,{requestId:args.requestId,decisionSummary:decision.decisionSummary,decisionSource:decision.decisionSource,references:decision.references,output:{action:args.action||null,message:args.message?.trim()||null},result}));
     c.pending=null;c.previousResult=result;if(result.isError||result.applied||result.messagePublished)c.lastFingerprint=null;c.receipts.set(args.requestId,{serialized,result});if(c.receipts.size>128)c.receipts.delete(c.receipts.keys().next().value);
    }
   }
  }
  result=safeResult(s,result);if(name==='next_puzzle_turn'){for(const message of result.observation?.messages||result.observationDelta?.messages?.append||[])c.seenMessages.add(message.seq);if(result.requestId&&c.pending&&!c.pending.inputLogged){log(s,c.role,'agent_turn_input',safeResult(s,{requestId:result.requestId,stateVersion:result.stateVersion,instructions:rules,observation:c.pending.fullJob.observation,delivery:result.delivery,clientInternalContext:'not_captured'}));c.pending.inputLogged=true;}}const bytes=Buffer.byteLength(JSON.stringify(result));log(s,c.role,'mcp_output',{tool:name,result,bytes});publish(s);return result;
 }
 async function handle(req,res,id,role){
  const c=channels.get(key(id,role)),s=c&&latest(c);if(!live(c,s)){access('inactive_channel',id,role);return send(res,403,{error:'角色连接已失效，请联系研究者重新生成'});}
  const auth=Buffer.from(req.headers.authorization||''),expected=Buffer.from('Bearer '+c.token);if(auth.length!==expected.length||!timingSafeEqual(auth,expected)){access('invalid_credential',id,role);return send(res,401,{error:'无效角色凭据'});}
  if(req.method!=='POST'){access('invalid_method',id,role);return send(res,405,{error:'此MCP使用Streamable HTTP POST'});}
  const server=new Server({name:'mondrian-'+role.toLowerCase(),version:'3.0.0'},{capabilities:{tools:{}}}),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  transports.add(transport);res.once('close',()=>{transports.delete(transport);void server.close();});
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:toolDefinitions(role)}));
  server.setRequestHandler(CallToolRequestSchema,async request=>{try{const result=invoke(c,request.params.name,request.params.arguments||{});return {content:[{type:'text',text:JSON.stringify(result)}],isError:!!result.isError};}catch(e){return {content:[{type:'text',text:JSON.stringify({status:'rejected',error:e.statusCode===503?'实验记录写入失败，已保护暂停':e.message})}],isError:true};}});
  try{let body;try{body=await readJson(req,20000);}catch{access('invalid_json',id,role);throw Error('invalid_json');}if(access('protocol_request',id,role,{method:['initialize','ping','tools/list','tools/call','notifications/initialized'].includes(body.method)?body.method:'unknown'})===false){pause(s,role,'MCP访问审计写入失败，实验已保护暂停，请检查数据目录');return send(res,503,{error:'MCP访问日志写入失败，实验已暂停'});}c.lastRequestAt=Date.now();c.lastRequestMethod=['initialize','ping','tools/list','tools/call','notifications/initialized'].includes(body.method)?body.method:'unknown';await server.connect(transport);await transport.handleRequest(req,res,body);}catch{if(!res.headersSent)send(res,400,{error:'无效MCP请求'});else res.end();}
 }
 function checkHealth(s){if(s.pausedAt||!['practice','playing'].includes(s.phase))return;for(const r of ROLES){const c=channels.get(key(s.id,r));if(!s.agents[r].enabled||!live(c,s)||Date.now()-c.lastSeen>(c?.pending?300000:90000)){pause(s,r,'MCP Agent连接已中断或凭据过期，请重新连接后恢复');break;}}}
 return {issue,handle,status,assertReady,checkHealth,revokeSession:async id=>{for(const k of channels.keys())if(k.startsWith(id+':'))channels.delete(k);},close:async()=>{closed=true;channels.clear();await Promise.allSettled([...transports].map(t=>t.close()));transports.clear();}};
}
