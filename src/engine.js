import {randomUUID,randomBytes} from 'node:crypto';
import {lessonLevels,levelTotal,regionScore,lessonView,practiceLevel,practiceText} from './lesson3.js';
import {fixedHost} from './task-host.js';
import {duplicateChat} from './communication.js';
export const ROLES=['A','B','C'];
const step=v=>Number.isFinite(v)&&v>=.5&&v<=10&&Number.isInteger(v*2);
const map=fn=>Object.fromEntries(ROLES.map(r=>[r,fn(r)]));
function exercise(index,role){const l=practiceLevel(index);for(const p of l.pieces){p.id=role+p.id.slice(1);p.owner=role;p.color={A:'#FB8871',B:'#41C8CE',C:'#E7CD35'}[role];}l.targets[0].visibleTo=[role];return l;}
export function createSession(){return {id:randomUUID(),version:'mgf-three-agents-v1',createdAt:Date.now(),phase:'tutorial',level:0,levels:lessonLevels(),startedAt:null,duration:2400,energy:1000,steps:map(()=>0),selected:map(()=>null),stepSize:map(()=>1),messages:[],moderator:fixedHost(),processed:[],completed:0,revision:0,boardRevision:0,lastResult:null,ready:map(()=>false),practiceIndex:map(()=>0),practiceStartedAt:map(()=>null),practiceResults:map(()=>null),practices:map(r=>exercise(0,r)),tokens:{researcher:randomBytes(24).toString('hex'),human:randomBytes(24).toString('hex')},agents:map(()=>({kind:'demo',model:'',endpoint:'',enabled:false,status:'未启动'}))};}
export const timeLeft=(s,now=Date.now())=>s.startedAt?Math.max(0,s.duration-Math.floor(((s.endedAt??s.pausedAt??now)-s.startedAt-(s.pausedMs||0))/1000)):s.duration;
export const score=s=>s.completed+regionScore(s.levels[s.level]);
export function observation(s,role,now=Date.now()){
 if(!ROLES.includes(role))throw Error('未知角色');const practising=s.phase==='practice',done=practising&&s.practiceIndex[role]===4;
 const geometry=done?{...lessonView(s.practices[role],role),pieces:[],visibleTargets:[]}:lessonView(practising?s.practices[role]:s.levels[s.level],role);
 return {...geometry,sessionId:s.id,version:s.version,role,phase:done?'waiting':s.phase,sessionPhase:s.phase,paused:!!s.pausedAt,interruption:s.serviceInterruption||null,level:s.level,revision:s.revision,boardRevision:s.boardRevision,timeLeft:timeLeft(s,now),rotationStep:90,energy:s.energy,steps:{...s.steps},selected:s.selected[role],stepSize:s.stepSize[role],practiceIndex:s.practiceIndex[role],practiceProgress:{...s.practiceIndex},practiceResult:s.practiceResults[role],practiceStartedAt:s.practiceStartedAt?.[role]||s.practiceResults[role]?.time||s.startedAt,ready:{...s.ready},lastResult:s.lastResult,instruction:practising?(done?'已完成四道练习。可以回应队友的新问题或澄清规则；不要操作碎片或重复报告完成，没有新信息时等待。':practiceText[s.practiceIndex[role]]):'三位agent通过公开聊天交换线索；完成后各自submit，三方确认后统一判分。移动或旋转将清空全部待提交确认。',messages:s.messages.slice(-100),moderator:s.moderator?{name:s.moderator.name,enabled:s.moderator.enabled,status:s.moderator.status}:null,agents:map(r=>({name:s.agents[r].name||`Agent ${r}`,kind:s.agents[r].kind,enabled:s.agents[r].enabled,status:s.agents[r].status}))};
}
export function applyAction(s,role,a){
 if(!a||typeof a!=='object'||Array.isArray(a))throw Error('无效操作');
 if(a.id&&s.processed.includes(a.id))throw Error('重复操作');
 if(['practice','playing'].includes(s.phase)&&!timeLeft(s)){s.phase='finished';s.endedAt=Date.now();throw Error('实验时间已结束');}
 if(role==='researcher'){
  if(a.type==='start'){if(s.phase!=='tutorial')throw Error('当前不能开始');if(!ROLES.every(r=>s.agents[r].enabled))throw Error('请先配置并启动三个agent');s.phase='practice';s.startedAt=Date.now();s.practiceStartedAt=map(()=>s.startedAt);}
  else if(a.type==='pause'&&['practice','playing'].includes(s.phase)&&!s.pausedAt){s.pausedAt=Date.now();s.runEpoch=(s.runEpoch||0)+1;}
  else if(a.type==='resume'&&['practice','playing'].includes(s.phase)&&s.pausedAt){s.pausedMs=(s.pausedMs||0)+Date.now()-s.pausedAt;s.pausedAt=null;s.runEpoch=(s.runEpoch||0)+1;}
  else if(a.type==='stop'&&['practice','playing'].includes(s.phase)){const endedAt=Date.now();if(s.pausedAt)s.pausedMs=(s.pausedMs||0)+endedAt-s.pausedAt;s.endedAt=endedAt;s.pausedAt=null;s.runEpoch=(s.runEpoch||0)+1;s.phase='finished';}
  else throw Error('研究者只能启动、暂停、继续或结束实验，不能替agent操作');
 }else{
  if(!ROLES.includes(role))throw Error('未知角色');if(s.pausedAt)throw Error('实验已暂停');if(!['practice','playing'].includes(s.phase))throw Error('当前阶段不能操作');
  if(s.phase==='practice'&&s.practiceIndex[role]===4&&a.type!=='chat')throw Error('已完成练习，只能交流，不能再次操作或提交');
  if(a.type==='chat'){if(typeof a.text!=='string'||!a.text.trim()||a.text.length>2000)throw Error('消息应为1至2000字');if(duplicateChat(s,role,a.text))return s;s.messages.push({role,text:a.text.trim(),time:Date.now(),level:s.level,phase:s.phase});}
  else if(a.type==='submit'){
   if(s.phase==='practice'){const index=s.practiceIndex[role],l=s.practices[role],success=regionScore(l)===1&&s.steps[role]<=l.maxSteps;s.practiceResults[role]={index,success,time:Date.now()};if(success)s.practiceIndex[role]++;if(s.practiceIndex[role]<4)s.practices[role]=exercise(s.practiceIndex[role],role);s.practiceStartedAt??=map(()=>s.startedAt);s.practiceStartedAt[role]=Date.now();s.steps[role]=0;s.selected[role]=null;s.stepSize[role]=1;
    if(ROLES.every(r=>s.practiceIndex[r]===4)){s.phase='playing';s.steps=map(()=>0);s.selected=map(()=>null);}
   }else{s.ready[role]=true;if(ROLES.every(r=>s.ready[r])){const total=s.levels.slice(0,s.level+1).reduce((n,l)=>n+levelTotal(l),0),n=score(s);s.lastResult={score:n,total,success:n===total,level:s.level,time:Date.now(),steps:{...s.steps}};s.ready=map(()=>false);if(n===total){if(s.level===0){s.completed=levelTotal(s.levels[0]);s.level=1;s.selected=map(()=>null);}else {s.phase='finished';s.endedAt=Date.now();}}}}
  }else if(a.type==='step'){if(!step(a.value))throw Error('无效步长');s.stepSize[role]=a.value;}
  else if(a.type==='unselect')s.selected[role]=null;
  else{const l=s.phase==='practice'?s.practices[role]:s.levels[s.level],p=l.pieces.find(p=>p.id===a.pieceId);if(!p||p.owner!==role)throw Error('只能操作本人碎片');
   if(a.type==='select')s.selected[role]=p.id;
   else if(a.type==='move'||a.type==='rotate'){
    if(s.phase==='playing'&&s.energy<=0)throw Error('能量已耗尽');
    if(a.type==='move'){if(!Number.isFinite(a.dx)||!Number.isFinite(a.dy)||!((a.dx===0&&step(Math.abs(a.dy)))||(a.dy===0&&step(Math.abs(a.dx)))))throw Error('移动仅允许单轴0.5至10格');if(p.x+a.dx< -8||p.x+a.dx>22||p.y+a.dy< -6||p.y+a.dy>20)throw Error('超出画布边界');p.x+=a.dx;p.y+=a.dy;}
    else{if(![1,-1].includes(a.direction))throw Error('无效旋转');p.angle=(p.angle+a.direction*90+360)%360;}
    s.steps[role]++;if(s.phase==='playing'){s.energy--;s.boardRevision++;s.ready=map(()=>false);}
   }else throw Error('不允许的操作');
  }
 }
 if(s.phase==='finished'&&!s.endedAt)s.endedAt=Date.now();
 if(a.id){s.processed.push(a.id);if(s.processed.length>10000)s.processed.shift();}s.revision++;return s;
}
