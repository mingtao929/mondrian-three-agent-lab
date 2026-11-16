import {ROLES} from './engine.js';

export function buildTurnExport(s,events){
 if(s.phase!=='finished')throw Error('请结束实验后再导出Agent逐回合数据');
 const turns=new Map();
 function get(e,id){const key=e.role+':'+id;if(!turns.has(key))turns.set(key,{role:e.role,requestId:id,firstEventAt:e.at,input:null,deliveries:[],submissions:[],decision:{summary:null,source:'not_provided',references:[]},output:null,execution:null,rejections:[],replays:0,clientInternalPrompt:null,clientInternalReasoning:null,modelUsage:null});return turns.get(key);}
 for(const e of events){if(!ROLES.includes(e.role))continue;const p=e.payload||{};
  if(e.type==='agent_turn_input'){const t=get(e,p.requestId);t.input={at:e.at,stateVersion:p.stateVersion,instructions:p.instructions,observation:p.observation,clientInternalContext:p.clientInternalContext||'not_captured'};}
  else if(e.type==='mcp_input'&&p.tool==='submit_puzzle_turn'&&p.arguments?.requestId){const a=p.arguments,t=get(e,a.requestId);t.submissions.push({at:e.at,...a});if(!t.execution){t.output={action:a.action||null,message:a.message||null};t.decision.summary=a.decisionSummary?.trim()||null;t.decision.source=a.decisionSummary?'agent_declared':'not_provided';}}
  else if(e.type==='agent_turn_result'||e.type==='mcp_action'&&p.requestId){const t=get(e,p.requestId);if(e.type==='mcp_action'&&t.execution)continue;t.decision={summary:p.decisionSummary||null,source:p.decisionSource||'not_provided',references:p.references||[]};t.output=p.output||{action:p.action||null,message:p.message||null};t.execution=p.result||null;t.completedAt=e.at;}
  else if(e.type==='mcp_output'&&p.result?.requestId){const t=get(e,p.result.requestId);if(p.tool==='next_puzzle_turn')t.deliveries.push({at:e.at,result:p.result,bytes:p.bytes??null});else{if(p.result.replayed)t.replays++;if(!t.execution)t.execution=p.result;if(p.result.isError||p.result.status==='rejected')t.rejections.push({at:e.at,result:p.result});}}
  else if(e.type==='mcp_rejected'&&p.requestId)get(e,p.requestId).rejections.push({at:e.at,reason:p.reason});
 }
 const list=[...turns.values()].map(t=>({...t,missing:[...(!t.input?['role_input']:[]),...((t.output?.action||t.output?.message)&&!t.decision.summary?['decision_summary']:[]),...(!t.execution?['execution_result']:[])]}));
 return {format:'mondrian-agent-turns-v1',experimentId:s.id,exportedAt:Date.now(),tracePolicy:s.tracePolicy||'legacy',collaborationConclusion:'not_automatically_determined',boundaries:{input:'平台实际提供的角色信息；不包含客户端额外上下文',decision:'Agent自述的简短依据与计划，不是内部推理原文',references:'验证队友消息已送达；是否实际影响决策仍属Agent声明',independentClientIsolation:'not_attested_by_mcp',modelTokenUsage:'not_captured'},roles:Object.fromEntries(ROLES.map(role=>{const own=list.filter(t=>t.role===role);return [role,{name:s.agents[role].name||'Agent '+role,turns:own.length,executedTurns:own.filter(t=>t.execution?.status==='executed').length,turnsWithPeerReferences:own.filter(t=>t.decision.references.some(r=>r.delivered&&r.role!==role&&ROLES.includes(r.role))).length,missingDecisionSummaries:own.filter(t=>t.missing.includes('decision_summary')).length}];})),turns:list};
}
