import test from 'node:test';import assert from 'node:assert/strict';import {createApp} from '../src/server.js';
test('six concurrent rooms retain separate names, progress, observations and access',{timeout:10000},async()=>{
 const app=createApp({database:':memory:',schedulerInterval:20});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const call=async(s,route='',b)=>{const r=await fetch(base+'/api/sessions'+(s?'/'+s.id+'/'+route:''),{method:b?'POST':'GET',headers:{Authorization:'Bearer '+s?.tokens.researcher,'Content-Type':'application/json'},...(b?{body:JSON.stringify(b)}:{})});assert.equal(r.ok,true);return r.json();};
 try{const rooms=await Promise.all(Array.from({length:6},()=>call(null,'',{})));
 await Promise.all(rooms.map(async(s,i)=>{for(const role of ['A','B','C'])await call(s,'agents',{role,kind:'demo',name:`房间${i}-${role}`,enabled:true});await call(s,'action',{type:'start'});}));
 let states=[];for(let i=0;i<200;i++){states=await Promise.all(rooms.map(s=>call(s)));if(states.every(o=>o.phase==='playing'))break;await new Promise(r=>setTimeout(r,20));}
 for(let i=0;i<rooms.length;i++){const o=states[i];assert.equal(o.sessionId,rooms[i].id);assert.equal(o.phase,'playing');assert.deepEqual(o.practiceProgress,{A:4,B:4,C:4});assert.equal(o.agents.A.name,`房间${i}-A`);
 const events=await call(rooms[i],'events');for(const e of events.filter(e=>e.type==='agent_request'))assert.equal(e.payload.observation.sessionId,rooms[i].id);}
 await call(rooms[0],'action',{type:'pause'});assert.equal((await call(rooms[0])).paused,true);assert.equal((await call(rooms[1])).paused,false);
 }finally{await app.close();}
});
