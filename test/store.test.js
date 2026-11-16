import test from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../src/store.js';import {createSession,applyAction,observation} from '../src/engine.js';

test('replay snapshots retain visible chat without duplicating credential and idempotency history',()=>{
 const store=new Store(':memory:'),s=createSession();s.phase='playing';s.startedAt=Date.now();
 try{for(let i=0;i<110;i++){const action={type:'chat',text:'archive '+i,id:'action-'+i};applyAction(s,'A',action);store.record(s,'A','chat',action);}
 const events=store.events(s.id),snapshot=store.snapshot(s.id,events.at(-1).seq),loaded=store.load(s.id);
 assert.equal(events.length,110);assert.equal(events[0].payload.text,'archive 0');
 assert.deepEqual(observation(snapshot,'A').messages,observation(s,'A').messages);
 assert.equal(snapshot.messages.length,100);assert.equal(snapshot.tokens,undefined);assert.equal(snapshot.processed,undefined);
 assert.equal(loaded.tokens.researcher,s.tokens.researcher);assert.equal(loaded.processed.length,110);
 }finally{store.close();}
});
