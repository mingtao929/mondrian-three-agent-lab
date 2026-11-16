import test from 'node:test';import assert from 'node:assert/strict';
import {createSession,applyAction,timeLeft,observation} from '../src/engine.js';
test('ending during a pause records actual end time while retaining frozen active time',t=>{let now=1000000;t.mock.method(Date,'now',()=>now);const s=createSession();for(const r of ['A','B','C'])s.agents[r].enabled=true;applyAction(s,'researcher',{type:'start'});now+=10000;applyAction(s,'researcher',{type:'pause'});const left=timeLeft(s);now+=300000;applyAction(s,'researcher',{type:'stop'});assert.equal(s.endedAt,now);assert.equal(timeLeft(s),left);});
test('whole experiment pause freezes time, blocks agent actions and resumes without resetting progress',t=>{
 let now=1000000;t.mock.method(Date,'now',()=>now);const s=createSession();for(const r of ['A','B','C'])s.agents[r].enabled=true;
 applyAction(s,'researcher',{type:'start'});now+=10000;const before=timeLeft(s);const piece=observation(s,'A').pieces[0];
 applyAction(s,'researcher',{type:'pause'});assert.equal(observation(s,'A').paused,true);now+=500000;assert.equal(timeLeft(s),before);
 assert.throws(()=>applyAction(s,'A',{type:'move',pieceId:piece.id,dx:1,dy:0}),/暂停/);
 assert.throws(()=>applyAction(s,'researcher',{type:'pause'}));applyAction(s,'researcher',{type:'resume'});assert.equal(timeLeft(s),before);now+=2000;assert.equal(timeLeft(s),before-2);
 assert.equal(observation(s,'A').pieces[0].x,piece.x);assert.equal(s.phase,'practice');
 applyAction(s,'researcher',{type:'pause'});applyAction(s,'researcher',{type:'stop'});const left=timeLeft(s);now+=900000;assert.equal(timeLeft(s),left);assert.equal(s.phase,'finished');assert.throws(()=>applyAction(s,'researcher',{type:'resume'}));
});
