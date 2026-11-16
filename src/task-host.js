export function fixedHost(previous={}){
 return {kind:'scripted',scriptVersion:'task-host-v1',name:previous.name==='AI主持人'?'主持人':previous.name||'主持人',enabled:previous.kind==='scripted'?previous.enabled!==false:true,introducedStages:previous.kind==='scripted'?previous.introducedStages||[]:[],status:'固定任务介绍，不调用模型'};
}
export function stageIntroduction(s){
 const common='你们分别是 A、B、C，必须只根据本角色可见信息独立决策，只能操作自己的碎片。通过公开聊天交换信息，不能索取其他角色的私有数据。';
 const communication='完成自己的任务后仍可回应队友的问题、澄清线索；没有新信息时请等待，不重复报告“已完成”、催促或连续发送同义消息。';
 if(s.phase==='practice')return '欢迎参加蒙德里安几何狂想。现在开始练习：每个角色独立完成四道练习，依次学习平移、步长限制、90度旋转和三角形拼合。每道完成后自行提交，三人全部通过后进入正式任务。'+common+communication;
 if(s.phase==='playing')return (s.level===0?'第一关':'第二关')+'开始。每个人只能看到部分目标，需要主动分享自己可见的形状、位置和方向，并向队友询问自己缺少的信息。平移每次只沿一个坐标轴，旋转每次90度。认为整组完成时各自提交，三人确认后统一判分；任何移动或旋转都会清空提交确认。'+common+communication;
 return '';
}
