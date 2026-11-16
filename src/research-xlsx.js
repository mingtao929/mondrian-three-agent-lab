import {taskConditions} from './history.js';
import {buildTurnExport} from './turn-export.js';
const cps = [
 ['A1','发现成员的观点和能力'],['A2','识别所需协作方式并确立目标'],['A3','理解解决问题所需的角色'],
 ['B1','形成共同表征，协商对问题的理解'],['B2','识别并描述待完成的任务'],['B3','描述角色、团队组织及沟通规则'],
 ['C1','与成员交流已执行的行动'],['C2','执行计划'],['C3','遵循协作规则'],
 ['D1','监测并修正共同理解'],['D2','监测行动结果并评价解题成效'],['D3','监测团队组织与角色，反馈并调整']
];
export const RESEARCH_HEADERS=['team_id','username','content','data1','data2','data3','timestamp','进度','state','starttime','firstsubmit','startlevel2','diff1','diff2','diff3','min1','min2','min3'];
const stamp=t=>t==null?null:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t));
const text=v=>{if(v==null)return null;const s=typeof v==='string'?v:JSON.stringify(v);return s.length>32700?s.slice(0,32650)+' [超长字段截断，完整内容见JSON导出]':s;};
export async function researchWorkbook(s,events,snapshot){
 const rawEvents=events;
 // One MCP commit can contain an engine action and a public message. Preserve
 // the established behavior rows; transport traffic remains in JSON/CSV logs.
 events=events.flatMap(e=>e.type==='mcp_action'?[
  ...(e.payload?.action?[{...e,requestId:e.payload.requestId,type:e.payload.action.type,payload:e.payload.action}]:[]),
  ...(e.payload?.message?[{...e,requestId:e.payload.requestId,type:'chat',payload:{text:e.payload.message}}]:[])
 ]:[e]);
 const {default:ExcelJS}=await import('exceljs');const wb=new ExcelJS.Workbook();wb.creator='蒙德里安几何狂想';wb.created=new Date();
 const sheet=wb.addWorksheet('Sheet1',{views:[{state:'frozen',ySplit:1}]});sheet.addRow(RESEARCH_HEADERS);
 const coding=wb.addWorksheet('协作行为编码',{views:[{state:'frozen',ySplit:1}]});
 coding.addRow(['team_id','事件序号','原表行','时间（北京）','进度','角色','名称','模块','内容','变更前','变更后','实际参数或对话','requestId','OECD CPS 编码','编码依据']);
 const selected={},steps={};
 let firstSubmit=null,lastPhase='tutorial';for(const e of events){if(firstSubmit===null&&e.type==='submit'&&lastPhase==='playing'&&['A','B','C'].includes(e.role))firstSubmit=e.at;if(e.phase)lastPhase=e.phase;}
 const level2=events.find(e=>e.phase==='playing'&&e.level===1)?.at??null;
 const milestones=[s.startedAt??null,firstSubmit,level2];let previous={phase:'tutorial',level:0};
 for(const e of events){const p=e.payload||{},before=previous;previous=e.phase?e:previous;
  if(['agent_turn_input','agent_turn_result','mcp_input','mcp_output','agent_request','agent_call','moderator_request','moderator_call','agent_config','moderator_config','connection_test','model_list_check','desktop_issued','created','archived','unarchived'].includes(e.type))continue;
  const roleName=s.agents[e.role]?.name||({researcher:'研究者',moderator:s.moderator?.name||'主持人',system:'系统'}[e.role])||e.role;
  let content=e.type,data1=null,data2=null,data3=e.role;
  if(e.type==='chat'){content='[A]send[B]';data1=roleName;data2=p.text;}
  else if(e.type==='start')content='Startchallenge';
  else if(e.type==='submit')content='Submitanswer';
  else if(e.type==='select'){content='Select[A]';data1=p.pieceId;}
  else if(e.type==='unselect')content='Unselect[A]';
  else if(e.type==='move'){content='To[A]move[X]steps';data1=p.dx?'X':'Y';data2=p.dx||p.dy;data3=e.role+'/'+(p.pieceId||'');}
  else if(e.type==='rotate'){content='Rotate[A]strangle';data1=p.direction===1?'right':'left';data3=e.role+'/'+(p.pieceId||'');}
  else if(e.type==='step'){content='Changestepsfrom[A]to[B]';data1=null;data2=p.value;}
  else data1=text(p);
  const context=e.type==='submit'?before:previous;
  const progress=context.phase==='practice'?'练习':context.phase==='playing'?(context.level===1?'第二关':'第一关'):context.phase==='finished'?'已结束':context.phase==='tutorial'?'未开始':'未记录';
  const diff=milestones.map(t=>t==null?null:Math.trunc((e.at-t)/1000));
  sheet.addRow([s.id,roleName,content,text(data1),text(data2),text(data3),stamp(e.at),progress,null,...milestones.map(stamp),...diff,...diff.map(v=>v==null?null:Math.trunc(v/60))]);
  if(['start','submit','select','unselect','step','move','rotate','chat'].includes(e.type)){
   const state=snapshot && ['move','rotate'].includes(e.type)?snapshot(e.seq):null;
   const board=state?.phase==='practice'?state.practices?.[e.role]:state?.levels?.[state?.level];
   const piece=board?.pieces?.find(item=>item.id===p.pieceId);
   let label=content,oldValue=null,newValue=null;
   if(e.type==='select'||e.type==='unselect'){
    oldValue=selected[e.role]??null;newValue=e.type==='select'?p.pieceId:null;
    if(oldValue&&newValue&&oldValue!==newValue)label='Change select from [A] to [B]';
    selected[e.role]=newValue;
   } else if(e.type==='step'){oldValue=steps[e.role]??null;newValue=p.value;steps[e.role]=newValue;}
   if(e.type==='submit'){delete selected[e.role];delete steps[e.role];}
   if(piece)newValue=JSON.stringify({pieceId:piece.id,x:piece.x,y:piece.y,angle:piece.angle});
   const row=coding.addRow([s.id,e.seq,sheet.rowCount,stamp(e.at),progress,e.role,roleName,e.type==='chat'?'Chat':'Operation',label,oldValue,newValue,text(e.type==='chat'?p.text:p),e.requestId||null]);
   row.getCell(14).dataValidation={type:'list',allowBlank:true,formulae:['"'+cps.map(entry=>entry[0]).join(',')+'"'],showErrorMessage:true,error:'请选择 A1 至 D3 的一项指标'};
  }
 }
 sheet.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF304861'}};sheet.autoFilter='A1:R'+sheet.rowCount;
 sheet.columns.forEach((col,i)=>{col.width=[38,20,36,26,55,16,23,14,12,23,23,23,12,12,12,12,12,12][i];});
 for(const col of [4,5,6])sheet.getColumn(col).numFmt='@';
 const notes=wb.addWorksheet('字段与编码说明');notes.addRows([
  ['字段 / 项目','本平台定义'],['格式','Sheet1沿用用户提供的18列表头和顺序；以下定义明确本平台映射，并不声称复现原平台未公开的编码。'],
  ['team_id','完整实验房间ID，按文本保存；username为角色配置的名称。'],['content','已知操作沿用模板的事件标签；其他流程、错误、被拦截消息保留本平台事件名。'],
  ['data1 / data2','聊天：发送者名称 / 原文；移动：坐标轴 / 实际有符号格数；旋转：right或left；其余事件data1保留事件载荷。'],
  ['data3','本平台角色；移动或旋转时为角色/碎片ID。原模板data3来源未提供，本列不复用其未知含义。'],
  ['state','留空，待研究者按编码手册人工编码；0也是编码值，不能用作未知的替代。'],
  ['进度','记录动作发生的练习或正式关卡，提交使用提交前关卡。'],['timestamp / starttime','北京时间UTC+8文本，精度到秒；starttime为本场启动时间（含练习）。'],
  ['firstsubmit','本场正式关卡的第一次提交时间，不包含练习提交；没有相应记录时留空。'],['startlevel2','首次进入正式第二关的时间；没有相应记录时留空。'],
  ['diff1 / diff2 / diff3','事件时间减starttime / firstsubmit / startlevel2，单位秒，保留负号；对应节点不存在时留空。'],['min1 / min2 / min3','对应diff除60后向零截断，沿用模板示例的整数分钟形式。'],
  ['数据范围','行为、流程、中断和错误事件；模型完整观察输入、配置、调用用量等见JSON导出，避免把内部请求当作独立行为。'],
  ['安全与完整性','Excel文本按字符串保存，不执行聊天中的公式。超出Excel单元格限制的字段会明确标注截断，完整值见JSON；无房间访问凭据和服务端密钥。'],
  ['固定主持 / 发言策略','主持为预设脚本，不参与解题。完成后按新信息触发交流回合、10秒冷却，同角色同阶段最近12条的规范化重复消息被拦截；这些策略应作为研究条件记录。']
 ]);notes.columns=[{width:27},{width:110}];notes.getColumn(2).alignment={wrapText:true,vertical:'top'};notes.getRow(1).font={bold:true};
 const codes=wb.addWorksheet('OECD CPS 码本');
 codes.addRow(['代码','问题解决过程','协作能力','子技能（中文释义）']);
 for(const [code,label] of cps)codes.addRow([code,({A:'探索与理解',B:'表征与形成',C:'规划与执行',D:'监测与反思'})[code[0]],['建立并维持共同理解','采取适当行动解决问题','建立并维持团队组织'][Number(code[1])-1],label]);
 notes.addRow(['编码单位','据 Xu 等（2024）表 I、III，每行聊天或操作结合上下文人工选一个指标；空白表示尚未编码或证据不足。技术请求不计为协作行为。']);
 notes.addRow(['回合关联','同一房间按角色和 requestId 关联。历史记录无法关联时留空。逐回合数据按字段拆分，长字段按分段序号拼接。']);
 if(s.phase==='finished'){
  const io=wb.addWorksheet('Agent回合输入输出');
  io.addRow(['team_id','角色','名称','requestId','首条记录时间（北京）','字段','分段序号','JSON内容']);
  for(const t of buildTurnExport(s,rawEvents).turns){
   for(const key of ['input','deliveries','submissions','decision','output','execution','rejections','missing']){
    const value=JSON.stringify(t[key]);for(let i=0;i<value.length;i+=30000)io.addRow([s.id,t.role,s.agents[t.role]?.name,t.requestId,stamp(t.firstEventAt),key,1+i/30000,value.slice(i,i+30000)]);
   }
  }
  io.columns.forEach((col,i)=>{col.width=[38,8,20,40,24,20,12,80][i];});
 }
 coding.columns.forEach((col,i)=>{col.width=[38,12,12,24,12,8,20,14,32,22,32,55,38,18,45][i];});
 codes.columns.forEach((col,i)=>{col.width=[10,22,30,48][i];});
 const conditions=wb.addWorksheet('正式任务条件');
 conditions.addRow(['任务版本','正式关卡','碎片总数','目标区域数','角色','本人碎片数','可见目标数','独占目标数','本人碎片中可见对应目标的数量','正式关卡队友聊天']);
 for(const level of taskConditions(s)){
  for(const [role,c] of Object.entries(level.roleCounts)){
   conditions.addRow([level.taskVersion,level.level,level.pieceCount,level.targetCount,role,c.ownedPieces,c.visibleTargets,c.exclusiveTargets,c.ownPiecesWithVisibleTarget,level.peerChat]);
  }
 }
 conditions.columns.forEach((col,i)=>{col.width=[28,12,14,14,10,15,15,15,36][i];});
 notes.addRow(['练习与正式关卡','练习使用独立练习板，应与正式协作分开统计。可见线索数量按该实验保存的关卡计算。回合引用表示消息送达，采纳与纠错由研究者结合后续行动编码。']);
 return Buffer.from(await wb.xlsx.writeBuffer());
}
