import test from 'node:test';import assert from 'node:assert/strict';import {createSession,observation} from '../src/engine.js';
test('actual vertices derive only from role-visible rotated pieces',()=>{
 const s=createSession();s.phase='practice';s.practices.A.pieces[0].angle=90;
 const o=observation(s,'A'),p=o.pieces[0];assert.deepEqual(p.worldVertices.map(v=>v.map(n=>Math.round(n))),[[2,10],[2,12],[-4,12],[-4,10]]);
 assert.equal(o.pieces.some(p=>p.owner!=='A'),false);assert.equal(JSON.stringify(o).includes('groupType'),false);
 assert.deepEqual(o.visibleTargets[0].worldVertices,[[7,4],[9,4],[9,10],[7,10]]);
});
