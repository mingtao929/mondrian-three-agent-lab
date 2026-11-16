import {timeLeft,ROLES} from './engine.js';
import {buildTurnExport} from './turn-export.js';
export function historySummary(s,stats={},now=Date.now()){
 const remaining=timeLeft(s,now),finished=s.phase==='finished';
 return {id:s.id,createdAt:s.createdAt,startedAt:s.startedAt||null,endedAt:stats.stoppedAt||s.endedAt||null,lastEventAt:stats.lastEventAt||null,eventCount:stats.eventCount||0,interruptionCount:stats.interruptionCount||0,archived:!!s.archived,archivedAt:s.archivedAt||null,phase:s.phase,status:s.archived?'已归档':finished?'已结束':s.pausedAt?'已暂停':s.startedAt&&remaining===0?'已超时':s.phase==='tutorial'?'未开始':'进行中',paused:!!s.pausedAt,remainingSeconds:remaining,activeSeconds:s.startedAt&&(!finished||s.endedAt)?Math.max(0,s.duration-remaining):null,agents:Object.fromEntries(ROLES.map(r=>[r,{name:s.agents[r].name||`Agent ${r}`,kind:s.agents[r].kind,model:s.agents[r].model}])),practiceProgress:{...s.practiceIndex},level:s.level,lastResult:s.lastResult?{score:s.lastResult.score,total:s.lastResult.total,success:s.lastResult.success}:null,interruption:s.serviceInterruption||null};
}
// Researcher-only metadata. Never include the target visibility map in role observations.
export function taskConditions(session){
 return (session.levels || []).map((level,index)=>{
  const targets=level.targets || [];
  const pieces=level.pieces || [];
  const roleCounts=Object.fromEntries(ROLES.map(role=>{
   const own=pieces.filter(piece=>piece.owner===role);
   const visible=targets.filter(target=>target.visibleTo?.includes(role));
   const matching=own.filter(piece=>piece.groupType!=null && visible.some(target=>target.groupType===piece.groupType));
   return [role,{ownedPieces:own.length,visibleTargets:visible.length,exclusiveTargets:visible.filter(t=>t.visibleTo.length===1).length,ownPiecesWithVisibleTarget:matching.length}];
  }));
  return {level:index+1,phase:'playing',peerChat:session.peerChatCondition||'open',taskVersion:session.version,pieceCount:pieces.length,targetCount:targets.length,roleCounts};
 });
}
export function historyExport(s,summary,events){return {format:'mgf-three-experiment-record-v1',exportedAt:Date.now(),taskConditions:taskConditions(s),version:s.version,summary,settings:{duration:s.duration,agents:s.agents,moderator:s.moderator||null,communication:{version:'event-chat-v1',completedCooldownMs:10000,duplicatePolicy:'normalized-same-role-stage-last-12',completedRolesCanChat:true}},progress:{phase:s.phase,level:s.level,practiceIndex:s.practiceIndex,steps:s.steps,energy:s.energy,ready:s.ready,lastResult:s.lastResult},levels:s.levels,events,agentTurns:s.phase==='finished'?buildTurnExport(s,events):null};}
export function eventsCsv(events,s){
 const cell=v=>{let text=typeof v==='object'&&v!==null?JSON.stringify(v):String(v??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const report=s?.phase==='finished'?buildTurnExport(s,events):null,rows=new Map();
 if(report){
  // Attach each assembled turn once, preferring its canonical execution event.
  const selected=new Map(),priority={agent_turn_result:0,mcp_action:1,agent_turn_input:2,mcp_input:3,mcp_output:4,mcp_rejected:5};
  for(const [index,e] of events.entries()){
   const p=e.payload||{},id=p.requestId||p.arguments?.requestId||p.result?.requestId;
   if(!id||priority[e.type]===undefined)continue;
   const key=e.role+':'+id,old=selected.get(key);
   if(!old||priority[e.type]<old.priority)selected.set(key,{index,priority:priority[e.type]});
  }
  for(const turn of report.turns){const row=selected.get(turn.role+':'+turn.requestId);if(row)rows.set(row.index,turn);}
 }
 const headers=['seq','at_utc','role','type','payload','request_id','agent_name','agent_input','decision_summary','decision_references','agent_output','execution_result','missing_fields','input_output_scope'];
 const data=events.map((e,index)=>{const t=rows.get(index);return [e.seq,new Date(e.at).toISOString(),e.role,e.type,e.payload,...(t?[t.requestId,s.agents[t.role].name||'Agent '+t.role,t.input,t.decision.summary,t.decision.references,t.output,t.execution,t.missing,report.boundaries]:Array(9).fill(''))];});
 return '\uFEFF'+[headers,...data].map(row=>row.map(cell).join(',')).join('\r\n');
}
