import test from 'node:test';import assert from 'node:assert/strict';import {taskDescription,motionDescription,rotationDelta} from '../public/observer.js';
test('observer explains triangle goal and formal limited vision',()=>{
 assert.match(taskDescription({sessionPhase:'practice',phase:'practice',practiceIndex:3,role:'A'}).goal,/两块三角形/);
 assert.match(taskDescription({sessionPhase:'playing',phase:'playing',role:'B'}).rule,/自己的目标/);
 assert.match(taskDescription({sessionPhase:'practice',phase:'waiting',practiceIndex:4,role:'C'}).title,/完成/);
});
test('animation and description follow actual deltas, use shortest quarter turn',()=>{
 assert.equal(rotationDelta(270,0),90);assert.equal(rotationDelta(0,270),-90);
 assert.match(motionDescription({id:'A1',x:1,y:2,angle:0},{id:'A1',x:1,y:6,angle:0}),/下移 4/);
 assert.match(motionDescription({id:'A1',x:1,y:2,angle:0},{id:'A1',x:1,y:2,angle:90}),/顺时针/);
});
