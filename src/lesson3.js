import levels from './lesson3.json' with {type:'json'};
export const lessonLevels=()=>structuredClone(levels);
export const levelTotal=l=>l.targets?.length??l.pieces.length;
export function regionComplete(level,target){
 const pieces=level.pieces.filter(p=>p.groupType===target.groupType);
 if(!pieces.length||!pieces.every(p=>Math.abs(p.x-target.x)<0.01&&Math.abs(p.y-target.y)<0.01&&target.angles.includes((p.angle+360)%360)))return false;
 return pieces.length===1||pieces.length===2&&(pieces[0].angle-pieces[1].angle+360)%360===180;
}
export const regionScore=l=>l.targets.filter(t=>regionComplete(l,t)).length;
export const practiceText=[
 '1. 选择碎片，用方向按钮将它平移到淡色目标位置。每次移动记一步。',
 '2. 调整控制器右侧的步长，四步以内到达目标。步长范围为0.5至10格。',
 '3. 通过平移和90°旋转，将矩形放回目标位置。每次旋转也记一步。',
 '4. 将两块三角形平移、旋转，合作拼成完整的目标矩形。'
];
export function practiceLevel(index){
 const triangle=[[1,-3],[-1,3],[1,3]],rect=[[-1,-3],[1,-3],[1,3],[-1,3]];
 return {frame:{width:14,height:15},maxSteps:index===1?4:999999,
  pieces:Array.from({length:index===3?2:1},(_,i)=>({id:`A${i+1}`,code:String.fromCharCode(65+i),owner:'A',color:'#FFA491',vertices:index===3?triangle:rect,x:i===1?12:-1,y:index===3&&i===0?7:11,angle:index===2?90:index===3?(i===0?90:180):0,groupType:1})),
  targets:[{regionId:'练习目标',number:'',groupType:1,x:8,y:7,width:2,height:6,angles:[0,180],visibleTo:['A']}]};
}
function world(p){const a=p.angle*Math.PI/180;return p.vertices.map(([x,y])=>[p.x+x*Math.cos(a)-y*Math.sin(a),p.y+x*Math.sin(a)+y*Math.cos(a)]);}
// Clip peer geometry to the visible frame before handing it to either a person or an agent.
function clip(poly,frame){
 for(const [axis,bound,sign] of [[0,0,1],[0,frame.width,-1],[1,0,1],[1,frame.height,-1]]){
  const input=poly;poly=[];if(!input.length)break;
  for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ia=(a[axis]-bound)*sign>=0,ib=(b[axis]-bound)*sign>=0;
   if(ia)poly.push(a);if(ia!==ib){const r=(bound-a[axis])/(b[axis]-a[axis]);poly.push([a[0]+r*(b[0]-a[0]),a[1]+r*(b[1]-a[1])]);}
  }
 }return poly;
}
export function lessonView(level,role){
 const pieces=[];
 for(const p of level.pieces){const {id,owner,color,code,vertices,x,y,angle}=p;
  if(owner===role)pieces.push({id,owner,color,code,vertices,x,y,angle,worldVertices:world(p).map(v=>v.map(n=>Math.round(n*1e6)/1e6))});
  else{const points=clip(world(p),level.frame);const area=Math.abs(points.reduce((a,v,i)=>a+v[0]*points[(i+1)%points.length][1]-v[1]*points[(i+1)%points.length][0],0))/2;
   if(points.length>=3&&area>0.0001)pieces.push({id,owner,color,code,vertices:points,worldVertices:points,x:0,y:0,angle:0,clipped:true});
  }
 }
 return {frame:level.frame,coordinateSystem:'piece-center',rotationCenter:'piece-origin',targetCount:level.targets.length,pieceCount:level.pieces.length,pieces,
  visibleTargets:level.targets.filter(t=>t.visibleTo.includes(role)).map(t=>({regionId:t.regionId,number:t.number,x:t.x,y:t.y,width:t.width,height:t.height,worldVertices:[[t.x-t.width/2,t.y-t.height/2],[t.x+t.width/2,t.y-t.height/2],[t.x+t.width/2,t.y+t.height/2],[t.x-t.width/2,t.y+t.height/2]],vertices:[[-t.width/2,-t.height/2],[t.width/2,-t.height/2],[t.width/2,t.height/2],[-t.width/2,t.height/2]]}))};
}
