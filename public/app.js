import {setupHistory} from './history.js';
import {failureGuidance} from './diagnostics.js';
import {setupAgentSettings,setupModeratorSettings} from './settings.js';
import {taskDescription,captureBoard,animatePieces} from './observer.js';
const $=id=>document.getElementById(id),participant=location.pathname==='/participant';
const sharedMode=document.body.dataset.shared==='true';
let pollTimer,connectionGeneration=0,creatingRoom=false,replayGeneration=0;
let savedAccessError='';function readSavedAccess(){try{const value=JSON.parse(sessionStorage.getItem(participant?'mgf-three-observer':'mgf-three-research')||'null');if(value&&(typeof value.id!=='string'||typeof value.tokens?.human!=='string'||!participant&&typeof value.tokens?.researcher!=='string'))throw Error();return value;}catch{savedAccessError='本地房间访问凭据损坏，请创建房间或重新导入访问凭据；数据库记录未删除。';return null;}}
let viewRole='A',state,stream,lastMessageKey='',replayEvents=[],replayTimer,session=readSavedAccess();
const incoming=new URLSearchParams(location.hash.slice(1));if(participant&&incoming.has('id')&&incoming.has('token')){session={id:incoming.get('id'),tokens:{human:incoming.get('token')}};sessionStorage.setItem('mgf-three-observer',JSON.stringify(session));history.replaceState(null,'','/participant');}
const names={A:'Agent A',B:'Agent B',C:'Agent C'},esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
function guard(fn){return async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};}
async function api(path='',method='GET',body,research=false){const sep=path.includes('?')?'&':'?';const res=await fetch(`/api/sessions/${session.id}/${path}${sep}role=${viewRole}`,{method,headers:{Authorization:`Bearer ${research?session.tokens.researcher:session.tokens.human}`,'Content-Type':'application/json','x-mgf-client':'1'},...(body?{body:JSON.stringify(body)}:{})});const mime=res.headers.get('content-type')||'';const data=mime.includes('spreadsheetml')?await res.blob():mime.includes('text/csv')?await res.text():await res.json();if(!res.ok)throw Error(data.error||'请求失败');return data;}
async function action(a){const d=await api('action','POST',{...a,id:crypto.randomUUID()},true);render(d.observation);}
function lessonBoard(o,el,interactive){
 const transition=captureBoard(o,el);if(!transition)return;
 if(el.id==='board'){if(transition.descriptions.length)$('motionText').textContent=transition.descriptions.join('；');else if(!transition.old.length)$('motionText').textContent='等待 Agent 操作；画面只展示已执行的动作。';}
 el.setAttribute('viewBox','-7.8 -6.4 29.6 30.067');const pattern='lesson-grid-'+el.id;
 let html=`<defs><pattern id="${pattern}" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#d7d8da" stroke-width=".025"/></pattern><clipPath id="frame-${el.id}"><rect width="${o.frame.width}" height="${o.frame.height}"/></clipPath></defs><rect x="-8" y="-7" width="31" height="32" fill="#f1f1f1"/><rect x="0" y="0" width="${o.frame.width}" height="${o.frame.height}" fill="white"/><rect x="-8" y="-7" width="31" height="32" fill="url(#${pattern})"/>`;
 for(const t of o.visibleTargets){html+=`<rect x="${t.x-t.width/2}" y="${t.y-t.height/2}" width="${t.width}" height="${t.height}" fill="${o.phase==='practice'?'#ffa491':'#ccc'}" fill-opacity="${o.phase==='practice'?'.22':'.8'}" stroke="#6d7781" stroke-width=".07" stroke-dasharray=".18 .12"/>`;if(t.number)html+=`<text x="${t.x}" y="${t.y}" font-size=".48" text-anchor="middle" dominant-baseline="middle" fill="#555">${t.number}</text>`;}
 for(const p of o.pieces){const own=p.owner===o.role,selected=p.id===o.selected,moved=transition.old.some(v=>v.id===p.id&&(v.x!==p.x||v.y!==p.y||v.angle!==p.angle));html+=`<g ${p.clipped?`clip-path="url(#frame-${el.id})"`:''}><g data-motion="${esc(p.id)}" transform="translate(${p.x},${p.y})"><g transform="rotate(${p.angle})" ${interactive&&own?`data-piece="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.id)} 我的碎片"`:''} style="cursor:${own?'pointer':'default'}"><polygon points="${p.vertices.map(v=>v.join(',')).join(' ')}" fill="${p.color}" stroke="${moved?'#2677bb':selected?'#ff6a00':p.color}" stroke-width="${moved?'.10':selected?'.07':'0'}"/>${selected?'<path d="M -.2 0 H .2 M 0 -.2 V .2" stroke="white" stroke-width=".06"/>':''}<text x="0" y="0" font-size=".65" fill="white" text-anchor="middle" dominant-baseline="middle" pointer-events="none">${p.clipped?'':esc(p.id)}</text></g></g></g>`;}
 el.innerHTML=html;if(transition.animate)animatePieces(el,transition.old,o.pieces);if(interactive)el.querySelectorAll('[data-piece]').forEach(g=>{const pick=guard(()=>action({type:'select',pieceId:g.dataset.piece}));g.onclick=pick;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();}};});
}


function renderTask(o){
 const t=taskDescription(o);$('taskTitle').textContent=t.title;$('taskGoal').textContent=t.goal;$('taskRule').textContent=t.rule;
 const practice=o.sessionPhase==='practice',target=o.visibleTargets[0],box=practice&&target?`${target.x-target.width/2-1} ${target.y-target.height/2-1} ${target.width+2} ${target.height+2}`:`-1 -1 ${o.frame.width+2} ${o.frame.height+2}`;
 $('targetPreview').setAttribute('viewBox',box);
 $('targetPreview').innerHTML=o.visibleTargets.map(v=>`<rect x="${v.x-v.width/2}" y="${v.y-v.height/2}" width="${v.width}" height="${v.height}" fill="#eff3f5" stroke="#63788a" stroke-width=".08" stroke-dasharray=".2 .12"/>`).join('');
 $('previewCaption').textContent=o.phase==='waiting'?'练习已通过':practice?'要拼出的形状':'当前视角可见的部分目标';
}

function board(o,el){lessonBoard(o,el,false);}
function render(o){state=o;const diagnostic=failureGuidance(o);$('serviceAlert').hidden=!diagnostic;if(diagnostic){$('serviceAlertTitle').textContent=diagnostic.title;$('serviceAlertDetail').textContent=diagnostic.detail;$('serviceAlertNext').textContent=diagnostic.next;}$('introVideo').pause();for(const r of ['A','B','C']){names[r]=o.agents[r].name||`Agent ${r}`;$('name'+r).textContent=names[r];}renderTask(o);if(o.paused){$('taskTitle').textContent='实验已暂停';$('taskRule').textContent=o.interruption?`角色 ${o.interruption.role} 中断：${o.interruption.error}。计时已冻结，进度保留；修复并启用全部 Agent 后继续整个实验。`:'计时已冻结，Agent 不执行动作；继续后重新领取回合。';}$('pauseExperiment').textContent=o.paused?'继续整个实验':'暂停整个实验（冻结计时）';$('pauseExperiment').disabled=!['practice','playing'].includes(o.sessionPhase);$('welcome').hidden=true;$('lab').hidden=false;$('room').textContent='房间 '+o.sessionId.slice(0,8);$('levelName').textContent=o.sessionPhase==='practice'?`${names[o.role]}（${o.role}） · ${o.phase==='waiting'?'练习完成，等待队友':`练习 ${o.practiceIndex+1} / 4`}`:`${o.level===0?'第一关':'第二关'} · 观察 ${names[o.role]}（${o.role}）`;document.querySelector('.canvas-toolbar h2').textContent=o.instruction;$('clock').textContent=`${String(Math.floor(o.timeLeft/60)).padStart(2,'0')}:${String(o.timeLeft%60).padStart(2,'0')}`;$('steps').textContent=o.steps[o.role];$('energy').textContent=o.energy;$('selected').textContent=o.selected||'由agent自主选择';$('step').value=o.stepSize;$('stepValue').textContent=o.stepSize;board(o,$('board'));
$('pieceList').innerHTML=o.pieces.filter(p=>p.owner===o.role).map(p=>`<span class="piece-chip">${esc(p.code||p.id)}</span>`).join('');for(const r of ['A','B','C']){$('status'+r).textContent=o.paused?'实验已暂停':o.agents[r].status;$('status'+r).title=o.agents[r].status;}
$('agentNote').textContent=`练习进度 A ${o.practiceProgress.A}/4 · B ${o.practiceProgress.B}/4 · C ${o.practiceProgress.C}/4；提交确认 ${['A','B','C'].filter(r=>o.ready[r]).join('、')||'无'}。`;
names.moderator=o.moderator?.name||'主持人';$('moderatorNote').hidden=!o.moderator;$('moderatorNote').textContent=o.moderator?names.moderator+'：'+(o.paused?'实验暂停':o.moderator.status):'';const key=JSON.stringify([o.messages,names]);if(key!==lastMessageKey){$('messages').innerHTML=o.messages.map(m=>`<div class="message"><span class="avatar ${m.role.toLowerCase()}">${m.role==='moderator'?'主持':m.role}</span><div><label>${esc(names[m.role]||m.role)} · ${m.phase==='practice'?'练习':'正式任务'}</label><p>${esc(m.text)}</p></div></div>`).join('')||'<div class="empty-chat">等待三个agent开始交流。</div>';lastMessageKey=key;$('messages').scrollTop=$('messages').scrollHeight;}
document.querySelectorAll('[data-move],[data-rotate],#step,#submit,#chatInput,#chatForm button').forEach(b=>b.disabled=true);$('submit').textContent='等待三方自主提交';$('resultSummary').textContent=o.lastResult?`最近判分：${o.lastResult.score}/${o.lastResult.total}，${o.lastResult.success?'通过':'未通过，继续协作'}`:'尚未判分';
if(o.phase==='tutorial'&&!participant&&!document.querySelector('dialog[open]'))$('tutorial').showModal();if(o.phase==='finished'){$('lab').hidden=true;$('welcome').hidden=false;$('completedNote').hidden=false;for(const dialog of document.querySelectorAll('dialog[open]'))if(dialog.id!=='historyDialog')dialog.close();if(!render.finished){render.finished=true;toast('本次实验已结束，已回到起始界面；记录可导出。');}}else $('completedNote').hidden=true;
}
async function connect(){const requested=viewRole,id=session.id,generation=++connectionGeneration;if(pollTimer){clearInterval(pollTimer);pollTimer=null;}if(stream){stream.close();stream=null;}const o=await api();if(requested!==viewRole||session.id!==id||generation!==connectionGeneration)return;render(o);if(o.sessionPhase==='finished')return;if(sharedMode){let pending=false;const refresh=async()=>{if(pending||session.id!==id||generation!==connectionGeneration)return;pending=true;try{const next=await api();if(session.id!==id||generation!==connectionGeneration)return;render(next);$('connection').textContent='● 远程观察（2秒刷新）';if(next.sessionPhase==='finished'){clearInterval(pollTimer);pollTimer=null;}}catch{$('connection').textContent='分享连接中断，正在重试；当前画面可能不是最新状态';}finally{pending=false;}};pollTimer=setInterval(refresh,2000);$('connection').textContent='● 远程观察（2秒刷新）';return;}stream=new EventSource(`/api/sessions/${id}/stream?token=${encodeURIComponent(session.tokens.human)}&role=${requested}`);const ownStream=stream;ownStream.onmessage=e=>{if(session.id!==id||generation!==connectionGeneration)return;const o=JSON.parse(e.data);if(o.role!==viewRole||o.sessionId!==id)return;render(o);if(o.sessionPhase==='finished')ownStream.close();$('connection').textContent='● 实时观察';};ownStream.onerror=()=>{if(session.id===id&&generation===connectionGeneration)$('connection').textContent='正在重连：服务可能离线，当前画面不是最新状态';};}
$('viewRole').onchange=guard(async()=>{viewRole=$('viewRole').value;await connect();});
async function createRoom() {
  if (creatingRoom) return;
  creatingRoom = true;
  $('create').disabled = true;
  let pausedOldRoom = false;
  try {
    // 只在收到暂停成功的回执后，才向用户报告本次暂停。
    if (session && ['practice', 'playing'].includes(state?.sessionPhase) && !state.paused) {
      await action({ type: 'pause' });
      pausedOldRoom = true;
    }
    const pausedNote = pausedOldRoom ? '。原房间已暂停并保留' : '';
    let response;
    try {
      response = await fetch('/api/sessions', { method: 'POST', headers: { 'x-mgf-client': '1' } });
    } catch {
      throw Error('创建请求未收到响应，请检查网络连接' + pausedNote);
    }
    if (!response.ok) {
      // 网关和应用都可能拒绝建房。保留状态码，并从 JSON 中取可操作的提示。
      const payload = await response.json().catch(() => null);
      const detail = typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim().slice(0, 180) : '请将此状态码反馈给研究者';
      throw Error('创建失败（HTTP ' + response.status + '）：' + detail + pausedNote);
    }
    session = await response.json();
    sessionStorage.setItem('mgf-three-research', JSON.stringify(session));
    render.finished = false;
    await connect();
  } finally {
    creatingRoom = false;
    $('create').disabled = false;
  }
}
$('create').onclick=guard(createRoom);
$('start').onclick=guard(async()=>{await action({type:'start'});$('tutorial').close();toast('三个agent开始独立完成四道练习。');});
$('pauseExperiment').onclick=guard(async()=>{await action({type:state.paused?'resume':'pause'});toast(state.paused?'实验已暂停：计时冻结，在途请求已取消。':'实验已继续，将领取新回合。');});
$('stopExperiment').onclick=guard(async()=>{await action({type:'stop'});toast('本次实验已结束，已回到起始界面。');});
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('research').onclick=guard(async()=>{if(!session)return toast('先进入修复室，再配置实验。');const participantUrl=`${location.origin}/participant#id=${session.id}&token=${session.tokens.human}`;$('participantLink').value=participantUrl;$('participantOpen').href=participantUrl;const agents=await api('agents','GET',null,true),host=await api('moderator','GET',null,true);setupAgentSettings($('agentConfigs'),agents,{save:body=>api('agents','POST',body,true),testConnection:body=>api('connection','POST',body,true),getModels:body=>api('models','POST',body,true),connectDesktop:sharedMode||document.body.dataset.mcpOnly==='true'?body=>api('desktop','POST',body,true):null,desktopStatus:()=>api('desktopstatus','GET',null,true),notify:toast});setupModeratorSettings($('moderatorConfigs'),host,agents,{save:body=>api('moderator','POST',body,true),notify:toast});$('settings').showModal();});
function download(name,text,type){const u=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
$('exportXlsx').onclick=guard(async()=>download('mgf-research-'+session.id.slice(0,8)+'.xlsx',await api('history?target='+session.id+'&format=xlsx','GET',null,true),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
$('exportJson').onclick=guard(async()=>download(`mgf-${session.id.slice(0,8)}.json`,JSON.stringify(await api('export','GET',null,true),null,2),'application/json'));
$('exportCsv').onclick=guard(async()=>download('mgf-events.csv',await api('history?target='+encodeURIComponent(session.id)+'&format=csv','GET',null,true),'text/csv;charset=utf-8'));
async function showReplay(){const generation=++replayGeneration;const e=replayEvents[Number($('timeline').value)];if(!e)return;const snap=await api(`replay?seq=${e.seq}&role=${$('replayRole').value}`,'GET',null,true);if(generation!==replayGeneration)return;board(snap,$('replayBoard'));$('replayInfo').textContent=`${Number($('timeline').value)+1} / ${replayEvents.length} · ${new Date(e.at).toLocaleTimeString()} · ${e.role} · ${e.type}`;$('replayChat').textContent=snap.messages.map(m=>`${m.role}: ${m.text}`).join('\n');}
$('replayOpen').onclick=guard(async()=>{replayEvents=await api('events','GET',null,true);$('timeline').max=Math.max(0,replayEvents.length-1);$('timeline').value=0;$('replay').showModal();await showReplay();});$('timeline').oninput=guard(showReplay);$('replayRole').onchange=guard(showReplay);
$('replayPlay').onclick=()=>{if(replayTimer){clearInterval(replayTimer);replayTimer=null;$('replayPlay').textContent='▶ 播放';return;}$('replayPlay').textContent='Ⅱ 暂停';replayTimer=setInterval(guard(async()=>{if(!$('replay').open||Number($('timeline').value)>=replayEvents.length-1){clearInterval(replayTimer);replayTimer=null;$('replayPlay').textContent='▶ 播放';return;}$('timeline').value=Number($('timeline').value)+1;await showReplay();}),Number($('replaySpeed').value));};
$('exportAccess').onclick=()=>download(`mgf-access-${session.id.slice(0,8)}.json`,JSON.stringify({format:'mgf-three-room-access-v1',id:session.id,tokens:session.tokens},null,2),'application/json');
$('restoreAccess').onchange=guard(async()=>{const file=$('restoreAccess').files[0];if(!file)return;if(file.size>10000)throw Error('凭据文件过大');const saved=JSON.parse(await file.text());if(saved.format!=='mgf-three-room-access-v1'||!saved.id||!saved.tokens?.researcher||!saved.tokens?.human)throw Error('房间凭据格式不正确');const response=await fetch(`/api/sessions/${encodeURIComponent(saved.id)}/agents`,{headers:{Authorization:`Bearer ${saved.tokens.researcher}`}});if(!response.ok)throw Error('凭据无效，或当前数据库没有这个房间');const humanCheck=await fetch(`/api/sessions/${encodeURIComponent(saved.id)}`,{headers:{Authorization:`Bearer ${saved.tokens.human}`}});if(!humanCheck.ok)throw Error('参与凭据无效，请使用完整的房间凭据文件');session={id:saved.id,tokens:{researcher:saved.tokens.researcher,human:saved.tokens.human}};sessionStorage.setItem('mgf-three-research',JSON.stringify(session));render.finished=false;await connect();toast('已恢复房间。服务器重启后请重新生成MCP连接并在Agent中更新。');});
if(participant)$('restoreLabel').hidden=true;

$('newRoom').onclick=guard(async()=>{for(const d of document.querySelectorAll('dialog[open]'))d.close();const history=JSON.parse(sessionStorage.getItem('mgf-three-room-history')||'[]');if(session)history.push(session);sessionStorage.setItem('mgf-three-room-history',JSON.stringify(history));render.finished=false;await createRoom();});


function openIntro(){$('introVideo').pause();$('introDialog').showModal();$('helpVideo').play().catch(()=>{});}$('introDialog').addEventListener('close',()=>$('helpVideo').pause());$('introHelp').onclick=openIntro;$('watchIntroTutorial').onclick=openIntro;
$('tutorialConfigure').onclick=()=>{$('tutorial').close();$('research').click();};
if(participant){for(const id of ['research','create','restoreLabel','tutorialConfigure'])$(id).hidden=true;}
const historyView=setupHistory($('historyDialog'),{request:(path,body)=>api(path,body?'POST':'GET',body,true),notify:toast,download,currentId:()=>session?.id,onDeleted:id=>{if(id===session?.id){sessionStorage.removeItem('mgf-three-research');location.replace('/');}}});
$('historyOpen').onclick=guard(async()=>{if(!session)return toast('请先创建研究者房间或恢复房间访问凭据，再查看本机记录。');$('historyDialog').showModal();await historyView.load();});$('completedRecords').onclick=()=>$('historyOpen').click();$('failureSettings').onclick=guard(async()=>{await $('research').onclick();const role=state?.interruption?.role;if(['A','B','C'].includes(role))document.querySelector(`[data-role="${role}"]`)?.scrollIntoView({block:'center'});});
if(participant){$('historyOpen').hidden=true;$('completedRecords').hidden=true;$('failureSettings').hidden=true;}
if(savedAccessError)toast(savedAccessError);
if(session)connect().catch(e=>toast('无法恢复房间：'+e.message));
