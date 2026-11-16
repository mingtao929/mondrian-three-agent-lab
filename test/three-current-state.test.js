import test from 'node:test';import assert from 'node:assert/strict';
import {formatCurrentObservation} from '../src/agents.js';
test('practice decisions exclude stale chat coordinates and end with authoritative current geometry',()=>{
 const o={phase:'practice',role:'A',pieces:[{id:'A1',x:8,y:-6,angle:180}],visibleTargets:[{x:8,y:7,width:2,height:6}],messages:[{text:'旧坐标(8,11)',phase:'practice'}]};
 const text=formatCurrentObservation(o);assert.equal(text.includes('旧坐标'),false);assert.ok(text.endsWith(JSON.stringify({...o,messages:[]})));assert.match(text,/最新状态/);assert.equal(o.messages.length,1);
});
test('formal collaboration retains public messages before current state without altering visibility',()=>{
 const o={phase:'playing',role:'A',pieces:[{id:'A1',x:0}],visibleTargets:[],messages:[{text:'队友线索',phase:'playing'}]};
 const text=formatCurrentObservation(o);assert.ok(text.includes('队友线索'));assert.ok(text.indexOf('队友线索')<text.indexOf('最新状态'));assert.ok(text.endsWith(JSON.stringify({...o,messages:[]})));
});
