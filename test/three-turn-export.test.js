import test from 'node:test';import assert from 'node:assert/strict';import {createSession} from '../src/engine.js';
import {buildTurnExport} from '../src/turn-export.js';
test('ended experiment export links role input, declared decision, peer evidence, output and execution without claiming internal reasoning',()=>{
 const s=createSession();s.phase='finished';s.tracePolicy='decision-v1';const observation={role:'A',visibleTargets:[{x:1,y:2}],messages:[{seq:1,role:'B',text:'公开线索'}]};const events=[
 {seq:1,at:10,role:'A',type:'agent_turn_input',payload:{requestId:'turn1',stateVersion:'v1',instructions:'规则',observation,delivery:'snapshot',clientInternalContext:'not_captured'}},
 {seq:2,at:11,role:'A',type:'mcp_output',payload:{tool:'next_puzzle_turn',result:{requestId:'turn1',stateVersion:'v1',delivery:'snapshot',observation}}},
 {seq:3,at:12,role:'A',type:'mcp_input',payload:{tool:'submit_puzzle_turn',arguments:{requestId:'turn1',decisionSummary:'参考B的线索，先移动自己的方块。',usedMessageSeqs:[1],action:{type:'move',pieceId:'A1',dx:1,dy:0},message:'我来移动。'}}},
 {seq:4,at:13,role:'A',type:'agent_turn_result',payload:{requestId:'turn1',decisionSummary:'参考B的线索，先移动自己的方块。',decisionSource:'agent_declared',references:[{seq:1,role:'B',text:'公开线索',delivered:true,claimedUsed:true}],output:{action:{type:'move',pieceId:'A1',dx:1,dy:0},message:'我来移动。'},result:{status:'executed',applied:true,messagePublished:true}}},
 {seq:5,at:14,role:'A',type:'mcp_output',payload:{tool:'submit_puzzle_turn',result:{requestId:'turn1',status:'executed',replayed:true}}},
 {seq:6,at:15,role:'A',type:'mcp_input',payload:{tool:'submit_puzzle_turn',arguments:{requestId:'turn1',decisionSummary:'冲突重试不应覆盖原决策',action:{type:'rotate',pieceId:'A1',direction:1}}}},
 {seq:7,at:16,role:'A',type:'mcp_output',payload:{tool:'submit_puzzle_turn',result:{requestId:'turn1',status:'rejected',isError:true,error:'同一回合不能更换提交内容'}}}
 ];
 const report=buildTurnExport(s,events);assert.equal(report.turns.length,1);const t=report.turns[0];assert.deepEqual(t.input.observation,observation);assert.equal(t.decision.source,'agent_declared');assert.equal(t.execution.status,'executed');assert.equal(t.replays,1);assert.equal(t.output.action.type,'move');assert.equal(t.decision.summary,'参考B的线索，先移动自己的方块。');assert.equal(t.rejections.length,1);assert.equal(t.submissions.length,2);assert.equal(report.roles.A.turnsWithPeerReferences,1);assert.equal(report.collaborationConclusion,'not_automatically_determined');assert.equal(t.clientInternalPrompt,null);assert.equal(t.modelUsage,null);
});
test('missing and legacy inputs remain missing; running experiments cannot export decision datasets',()=>{
 const s=createSession();assert.throws(()=>buildTurnExport(s,[]),/结束/);s.phase='finished';const report=buildTurnExport(s,[{seq:1,at:1,role:'B',type:'mcp_input',payload:{tool:'submit_puzzle_turn',arguments:{requestId:'legacy',action:{type:'submit'}}}},{seq:2,at:2,role:'B',type:'mcp_output',payload:{tool:'submit_puzzle_turn',result:{requestId:'legacy',status:'executed'}}}]);assert.equal(report.turns[0].input,null);assert.equal(report.turns[0].decision.summary,null);assert.ok(report.turns[0].missing.includes('role_input'));assert.ok(report.turns[0].missing.includes('decision_summary'));
});
