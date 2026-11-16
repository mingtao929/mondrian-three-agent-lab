import test from 'node:test';import assert from 'node:assert/strict';import {createSession} from '../src/engine.js';import {publicModeratorInput,invokeModerator} from '../src/moderator.js';
test('moderator input is an explicit public allowlist without geometry, profiles or credentials',()=>{
 const s=createSession();s.agents.A.profile='private-profile';s.messages.push({role:'A',text:'public clue',time:1,level:0,phase:'playing'});s.moderator={name:'引导员',apiKey:'secret-not-public'};
 const input=publicModeratorInput(s);const raw=JSON.stringify(input);assert.ok(raw.includes('public clue'));for(const hidden of ['private-profile','secret-not-public',s.tokens.researcher,'vertices','visibleTargets','levels','pieces'])assert.equal(raw.includes(hidden),false);
});
test('moderator output can only be a public message and cannot execute a puzzle action',async t=>{
 let action=null;const requests=[];t.mock.method(globalThis,'fetch',async(url,options)=>{requests.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({message:'请交流可见线索',action})}}]}));});
 const cfg={kind:'openai',endpoint:'https://example.com/v1',model:'test'};assert.equal((await invokeModerator(publicModeratorInput(createSession()),cfg)).message,'请交流可见线索');action={type:'submit'};await assert.rejects(invokeModerator({},cfg),/主持人/);assert.ok(requests[0].messages[0].content.includes('不能移动'));
});
