export const rotationDelta=(from,to)=>((to-from+540)%360)-180;
export function motionDescription(from,to){
 const parts=[],dx=to.x-from.x,dy=to.y-from.y,angle=rotationDelta(from.angle,to.angle);
 if(dx)parts.push(`${dx>0?'右移':'左移'} ${Math.abs(dx)} 格`);
 if(dy)parts.push(`${dy>0?'下移':'上移'} ${Math.abs(dy)} 格`);
 if(angle)parts.push(`${angle>0?'顺时针':'逆时针'}旋转 ${Math.abs(angle)}°`);
 return parts.length?`${to.id}：${parts.join('，')}`:'';
}
export function taskDescription(o){
 if(o.sessionPhase==='practice'){
  if(o.phase==='waiting')return {title:`Agent ${o.role} · 四道练习已完成`,goal:'等待其他 Agent 完成练习，之后共同进入正式任务。',rule:'每个 Agent 独立完成四道练习。观察者不参与操作。'};
  const goals=['把一块矩形平移到虚线目标内。','在四次移动或旋转以内，把矩形移到虚线目标内。','平移并旋转矩形，使形状与虚线目标重合。','把两块三角形拼成虚线中的一个完整矩形，不能重叠或留空。'];
  return {title:`练习 ${o.practiceIndex+1}/4 · ${['平移','四步挑战','旋转','三角形拼合'][o.practiceIndex]}`,goal:goals[o.practiceIndex],rule:'完成条件：形状覆盖目标后，由 Agent 提交并通过判分。中心对齐不代表形状已对齐。'};
 }
 return {title:o.phase==='finished'?'实验已结束':`正式任务 · 第 ${o.level+1} 关`,goal:'三位 Agent 交换线索，将所有碎片拼回画框中的目标区域。三方都确认提交后统一判分。',rule:'信息不对称：Agent 看不到自己的目标，只能看到部分队友目标；彩色是碎片，灰色虚线是当前视角可见的目标。'};
}
const snapshots=new WeakMap();
export function captureBoard(o,el){
 const context=[o.sessionId,o.role,o.sessionPhase,o.practiceIndex,o.level].join(':');
 const key=JSON.stringify([context,o.pieces,o.visibleTargets,o.selected]);
 const previous=snapshots.get(el);if(previous?.key===key)return null;
 const old=previous?.context===context?previous.pieces:[];
 snapshots.set(el,{key,context,pieces:structuredClone(o.pieces)});
 return {old,animate:old.length>0&&el.id==='board'&&o.phase!=='finished',descriptions:o.pieces.flatMap(p=>{const from=old.find(v=>v.id===p.id&&!v.clipped&&!p.clipped);const text=from&&motionDescription(from,p);return text?[text]:[];})};
}
export function animatePieces(el,old,pieces){
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 for(const p of pieces){const from=old.find(v=>v.id===p.id&&!v.clipped&&!p.clipped);if(!from)continue;
  const root=[...el.querySelectorAll('[data-motion]')].find(g=>g.getAttribute('data-motion')===p.id);if(!root)continue;
  const add=(node,type,start,end)=>{if(start===end)return;const a=document.createElementNS('http://www.w3.org/2000/svg','animateTransform');for(const [k,v] of Object.entries({attributeName:'transform',type,from:start,to:end,dur:'.65s',calcMode:'spline',keyTimes:'0;1',keySplines:'.22 .61 .36 1'}))a.setAttribute(k,v);node.append(a);a.beginElement();};
  add(root,'translate',`${from.x} ${from.y}`,`${p.x} ${p.y}`);
  const delta=rotationDelta(from.angle,p.angle);if(delta)add(root.firstElementChild,'rotate',String(p.angle-delta),String(p.angle));
 }
}
