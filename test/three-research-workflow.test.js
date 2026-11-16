import test from 'node:test';
import assert from 'node:assert/strict';
import {createSession,applyAction,observation} from '../src/engine.js';
import {createApp} from '../src/server.js';
import http from 'node:http';

test('research XLSX preserves the supplied 18-column layout, text and signed relative times',async()=>{
 const {researchWorkbook}=await import('../src/research-xlsx.js');
 const ExcelJS=(await import('exceljs')).default;
 const s=createSession();s.agents.A.name='研究角色甲';
 const t=Date.UTC(2026,9,28,2);s.startedAt=t;
 const events=[{seq:1,at:t-5000,role:'A',type:'chat',payload:{text:'=不是公式，你好'}},{seq:2,at:t,role:'researcher',type:'start',payload:{}},{seq:3,at:t+60000,role:'A',type:'submit',payload:{}}];
 const buffer=await researchWorkbook(s,events);const wb=new ExcelJS.Workbook();await wb.xlsx.load(buffer);
 assert.deepEqual(wb.worksheets[0].getRow(1).values.slice(1),['team_id','username','content','data1','data2','data3','timestamp','进度','state','starttime','firstsubmit','startlevel2','diff1','diff2','diff3','min1','min2','min3']);
 const row=wb.worksheets[0].getRow(2);assert.equal(row.getCell(2).value,'研究角色甲');assert.equal(row.getCell(5).value,'=不是公式，你好');assert.equal(row.getCell(7).value,'2026-10-28 10:00:00'.replace('10:00:00','09:59:55'));assert.equal(row.getCell(13).value,-5);assert.equal(row.getCell(9).value,null);assert.ok(wb.getWorksheet('字段与编码说明'));assert.equal(JSON.stringify(wb.model).includes(s.tokens.researcher),false);
});

test('graduating from practice is excluded from the first formal submission milestone',async()=>{
 const {researchWorkbook}=await import('../src/research-xlsx.js');const ExcelJS=(await import('exceljs')).default,s=createSession(),t=Date.UTC(2026,9,28);
 const events=[{at:t,role:'researcher',type:'start',phase:'practice',level:0,payload:{}},{at:t+10000,role:'C',type:'submit',phase:'playing',level:0,payload:{}},{at:t+20000,role:'A',type:'submit',phase:'playing',level:0,payload:{}}];
 const w=new ExcelJS.Workbook();await w.xlsx.load(await researchWorkbook(s,events));assert.equal(w.worksheets[0].getRow(2).getCell(11).value,'2026-10-28 08:00:20');assert.equal(w.worksheets[0].getRow(3).getCell(8).value,'练习');
});

test('a delayed action body cannot resurrect a room deleted concurrently',async()=>{
 const app=createApp({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const port=app.server.address().port,base='http://127.0.0.1:'+port;
 try{const make=async()=>await(await fetch(base+'/api/sessions',{method:'POST'})).json(),a=await make(),b=await make();
 const payload=JSON.stringify({type:'resume'});let request;const delayed=new Promise((resolve,reject)=>{request=http.request({hostname:'127.0.0.1',port,path:'/api/sessions/'+a.id+'/action',method:'POST',headers:{Authorization:'Bearer '+a.tokens.researcher,'Content-Type':'application/json','Content-Length':Buffer.byteLength(payload)}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});request.on('error',reject);request.write(payload.slice(0,4));});await new Promise(r=>setTimeout(r,30));
 const removed=await fetch(base+'/api/sessions/'+b.id+'/historydelete',{method:'POST',headers:{Authorization:'Bearer '+b.tokens.researcher,'Content-Type':'application/json'},body:JSON.stringify({target:a.id,confirm:a.id})});assert.equal(removed.status,200);assert.equal(app.store.load(a.id),null);request.end(payload.slice(4));assert.equal(await delayed,400);assert.equal(app.store.load(a.id),null);assert.equal(app.store.events(a.id).length,0);
 }finally{await app.close();}
});

test('chat duplicate normalization preserves changed signs and decimal coordinates',()=>{
 const s=createSession();s.phase='playing';s.startedAt=Date.now();for(const text of ['x=-1','x=1','x=0.5','x=05'])applyAction(s,'A',{type:'chat',text});assert.equal(s.messages.length,4);
});

test('a completed role retries transient failures and resumes without waiting for unrelated new chat',{timeout:5000},async t=>{
 const original=globalThis.fetch;let calls=0;const inputs=[];
 t.mock.method(globalThis,'fetch',async(url,options)=>{if(String(url)==='https://test.invalid/mock-act'){const b=JSON.parse(options.body);if(b.observation.role==='A'){inputs.push(b.observation);calls++;if(calls===1)return new Response('unavailable',{status:503});return new Response(JSON.stringify({message:'我已经完成练习，可回答新的规则问题。',action:null}));}return new Response('{}');}return original(url,options);});
 const app=createApp({database:':memory:',schedulerInterval:20,retryDelayMs:20});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const s=createSession();s.phase='practice';s.startedAt=Date.now();s.pausedAt=Date.now();s.practiceIndex.A=4;app.store.save(s);const base='http://127.0.0.1:'+app.server.address().port+'/api/sessions/'+s.id;
 const post=async(route,b)=>{const r=await fetch(base+'/'+route,{method:'POST',headers:{Authorization:'Bearer '+s.tokens.researcher,'Content-Type':'application/json'},body:JSON.stringify(b)});assert.equal(r.status,200,await r.text());};const wait=async n=>{const until=Date.now()+1500;while(calls<n&&Date.now()<until)await new Promise(r=>setTimeout(r,20));assert.equal(calls,n);};
 try{for(const role of ['A','B','C'])await post('agents',{role,kind:'http',endpoint:'https://test.invalid/mock-act',enabled:true});await post('action',{type:'resume'});await wait(2);await new Promise(r=>setTimeout(r,100));assert.equal(calls,2);assert.ok(inputs.every(o=>o.phase==='waiting'&&o.communicationOnly));await post('action',{type:'pause'});await post('action',{type:'resume'});await wait(3);assert.equal(app.store.load(s.id).messages.filter(m=>m.role==='A').length,1);assert.ok(app.store.events(s.id).some(e=>e.type==='chat_suppressed'));
 }finally{await app.close();}
});

test('completed practice permits useful chat, suppresses repeats and still forbids moves',()=>{
 const s=createSession();s.phase='practice';s.startedAt=Date.now();s.practiceIndex.A=4;
 applyAction(s,'A',{type:'chat',text:'我已完成，需要帮助时可以问我。'});assert.equal(s.messages.length,1);
 applyAction(s,'A',{type:'chat',text:'我已完成，需要帮助时可以问我！'});assert.equal(s.messages.length,1);
 assert.throws(()=>applyAction(s,'A',{type:'move',pieceId:'A1',dx:1,dy:0}),/完成练习/);
 assert.equal(observation(s,'A').phase,'waiting');
});

test('fixed host sends each stage script once without reading model credentials',async()=>{
 const {stageIntroduction}=await import('../src/task-host.js');const s=createSession();s.phase='practice';
 const text=stageIntroduction(s);assert.match(text,/练习/);assert.equal(text.includes(s.tokens.researcher),false);s.phase='playing';assert.match(stageIntroduction(s),/第一关/);s.level=1;assert.match(stageIntroduction(s),/第二关/);
});

test('history permanent deletion requires confirmation, removes events, revokes access and preserves another room',async()=>{
 const app=createApp({database:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{const make=async()=>await(await fetch(base+'/api/sessions',{method:'POST'})).json(),a=await make(),b=await make();
 const del=(token,confirm)=>fetch(base+'/api/sessions/'+b.id+'/historydelete',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({target:a.id,confirm})});
 assert.equal((await del(b.tokens.human,a.id)).status,403);assert.equal((await del(b.tokens.researcher,'wrong')).status,400);assert.ok(app.store.load(a.id));assert.equal((await del(b.tokens.researcher,a.id)).status,200);assert.equal(app.store.load(a.id),null);assert.equal(app.store.events(a.id).length,0);assert.ok(app.store.load(b.id));assert.equal((await fetch(base+'/api/sessions/'+a.id,{headers:{Authorization:'Bearer '+a.tokens.researcher}})).status,404);
 }finally{await app.close();}
});
