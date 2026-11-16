import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession} from '../src/engine.js';
import {historyExport,eventsCsv} from '../src/history.js';

test('standard JSON and CSV include linked turn inputs and outputs after ending, preserving original events',()=>{
 const s=createSession();s.phase='finished';s.agents.A.name='研究员A';
 const events=[
  {seq:1,at:1,role:'A',type:'agent_turn_input',payload:{requestId:'t1',instructions:'角色规则',observation:{role:'A',messages:[{role:'B',text:'公开线索'}]}}},
  {seq:2,at:2,role:'A',type:'agent_turn_result',payload:{requestId:'t1',decisionSummary:'根据线索移动',output:{message:'开始移动',action:{type:'move',pieceId:'A1',dx:1,dy:0}},result:{status:'executed'}}},
  {seq:3,at:3,role:'B',type:'agent_turn_input',payload:{requestId:'pending',observation:{role:'B'}}}
 ];
 const json=historyExport(s,{id:s.id},events);assert.deepEqual(json.events,events);assert.equal(json.agentTurns.turns.length,2);assert.equal(json.agentTurns.turns[0].input.observation.role,'A');assert.equal(json.agentTurns.turns[0].output.message,'开始移动');assert.equal(json.agentTurns.turns[1].output,null);
 const csv=eventsCsv(events,s);assert.match(csv,/agent_input/);assert.match(csv,/agent_output/);assert.match(csv,/根据线索移动/);assert.match(csv,/开始移动/);assert.match(csv,/角色规则/);assert.match(csv,/研究员A/);assert.match(csv,/execution_result/);assert.equal(csv.split('\r\n').length,events.length+1);
 assert.equal(events[0].payload.agent_input,undefined);
});
test('unfinished exports do not expose the assembled turn report; legacy CSV keeps its event columns',()=>{
 const s=createSession();assert.equal(historyExport(s,{},[]).agentTurns,null);
 assert.ok(eventsCsv([]).startsWith('\uFEFF"seq","at_utc","role","type","payload"'));
 assert.doesNotThrow(()=>eventsCsv([],s));
});
