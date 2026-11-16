import test from 'node:test';import assert from 'node:assert/strict';
import {parseWorkBuddyOutput,workBuddyArgs} from '../src/workbuddy-bridge.js';
test('WorkBuddy requires a successful result and valid puzzle JSON',()=>{
 const text=JSON.stringify({type:'result',subtype:'success',result:'{"message":"hello","action":{"type":"submit"}}',usage:{input_tokens:1}});
 assert.equal(parseWorkBuddyOutput(text).action.type,'submit');
 assert.throws(()=>parseWorkBuddyOutput('Authentication required'),/登录/);
 assert.throws(()=>parseWorkBuddyOutput(JSON.stringify({type:'result',is_error:true,result:'failed'})),/执行失败/);
 assert.throws(()=>parseWorkBuddyOutput(JSON.stringify({type:'result',result:'{"action":{"type":"stop"}}'})),/操作/);
});
test('WorkBuddy invocation disables tools and extra MCP servers without skipping permissions',()=>{
 const a=workBuddyArgs('cli','rules');assert.equal(a[a.indexOf('--tools')+1],'');assert.ok(a.includes('--strict-mcp-config'));assert.ok(!a.includes('--dangerously-skip-permissions'));assert.equal(a[a.indexOf('--permission-mode')+1],'dontAsk');
});
