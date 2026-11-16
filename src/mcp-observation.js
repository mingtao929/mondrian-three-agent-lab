import {observation,ROLES} from './engine.js';
import {completedRole} from './communication.js';

const pick=(object,keys)=>Object.fromEntries(keys.filter(k=>object?.[k]!==undefined).map(k=>[k,object[k]]));
const roles=value=>Object.fromEntries(ROLES.map(r=>[r,value?.[r]??null]));
const points=vertices=>vertices.map(v=>[v[0],v[1]]);
export const publicMessages=(s,start=0)=>s.messages.slice(start).map((m,i)=>({...pick(m,['role','text','time','phase','level']),seq:start+i+1}));

// This contract is deliberately independent of the researcher/observer payload.
// Every nested record is projected too: new engine metadata is private by default.
export function mcpObservation(s,role){
 const o=observation(s,role),chatWindowStart=Math.max(0,s.messages.length-100);
 return {
  ...pick(o,['sessionId','version','role','phase','sessionPhase','paused','level','revision','boardRevision','timeLeft','rotationStep','energy','selected','stepSize','practiceIndex','instruction','targetCount','pieceCount']),
  peerChat:'open',schemaVersion:'mondrian-role-v2',tracePolicy:s.tracePolicy||'legacy',frame:pick(o.frame,['width','height']),coordinateSystem:'piece-center',rotationCenter:'piece-origin',
  pieces:o.pieces.map(p=>({...pick(p,['id','owner','color','code','clipped']),...(p.clipped?{}:pick(p,['x','y','angle'])),worldVertices:points(p.worldVertices)})),
  visibleTargets:o.visibleTargets.map(t=>pick(t,['number','x','y','width','height'])),
  steps:roles(o.steps),practiceProgress:roles(o.practiceProgress),ready:roles(o.ready),
  practiceResult:o.practiceResult?pick(o.practiceResult,['index','success','time']):null,
  lastResult:o.lastResult?{...pick(o.lastResult,['score','total','success','level','time']),steps:roles(o.lastResult.steps)}:null,
  agents:Object.fromEntries(ROLES.map(r=>[r,{name:s.agents[r].name||'Agent '+r,enabled:!!s.agents[r].enabled}])),
  moderator:s.moderator?{name:s.moderator.name,enabled:!!s.moderator.enabled}:null,
  selfProfile:s.agents[role].profileEnabled?s.agents[role].profile||'':null,
  communicationOnly:completedRole(s,role),messages:publicMessages(s,chatWindowStart),chatCursor:s.messages.length,chatWindowStart
 };
}

export function observationDelta(before,after,s){
 const set={};for(const [k,value] of Object.entries(after))if(!['pieces','messages'].includes(k)&&JSON.stringify(before[k])!==JSON.stringify(value))set[k]=value;
 const old=new Map(before.pieces.map(p=>[p.id,p])),current=new Set(after.pieces.map(p=>p.id));
 return {set,pieces:{upsert:after.pieces.filter(p=>JSON.stringify(old.get(p.id))!==JSON.stringify(p)),remove:before.pieces.filter(p=>!current.has(p.id)).map(p=>p.id)},messages:{append:publicMessages(s,before.chatCursor),windowStart:after.chatWindowStart,chatCursor:after.chatCursor}};
}

export function sameObservationStage(a,b){return a.sessionId===b.sessionId&&a.role===b.role&&a.sessionPhase===b.sessionPhase&&a.phase===b.phase&&a.level===b.level&&a.practiceIndex===b.practiceIndex&&a.selfProfile===b.selfProfile;}
