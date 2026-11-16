import {createAgentTask} from './agent-installer.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function setupMcpSettings(container,agents,{save,connectDesktop,desktopStatus,notify}){
 container.innerHTML='<p class="mcp-guide"><b>一次复制，交给 Agent 完成接入</b><br>每个角色点击“复制并接入 Agent”，把完整内容发送给一个独立 Agent 会话。Agent 自行识别客户端，安装 MCP、验证连接并等待实验开始；无需选择客户端或另发指令。首次客户端授权仍需本人确认。</p>'+['A','B','C'].map(role=>{const c=agents[role]||{};return `<section class="agent-config" data-role="${role}"><h3>角色 ${role} · MCP</h3><output class="mcp-state">${c.kind==='mcp'?'已有角色连接，请检查状态':'等待接入'}</output><div class="config-actions"><button data-connect class="primary">复制并接入 Agent</button></div><p class="config-status" role="status"></p><details class="connection-management"><summary>角色设置与连接管理</summary><label>Agent 名称<input name="name" maxlength="40" value="${esc(c.name||'Agent '+role)}"></label><label><input name="profileEnabled" type="checkbox" ${c.profileEnabled?'checked':''}>启用本角色私有画像</label><textarea name="profile" rows="4" maxlength="4000">${esc(c.profile||'')}</textarea><label>导入 TXT / JSON<input class="profileFile" type="file" accept=".txt,.json"></label><div class="config-actions"><button data-bridge>下载本角色 MCP 文件（豆包恢复用）</button><button data-status>检查连接</button><button data-save>保存名称与画像</button><button data-enable>启用本角色</button><button data-disable>停用本角色</button><button data-renew>撤销旧连接并重新复制</button></div><p>其他电脑须能访问校园网／VPN。仅向本角色 Agent 提供接入内容。</p></details><details class="task-preview" hidden><summary>自动复制失败时：查看并手动复制完整任务</summary><textarea class="mcp-bundle" rows="8" readonly aria-label="完整角色接入任务"></textarea></details></section>`;}).join('');
 for(const sec of container.querySelectorAll('[data-role]')){
  const role=sec.dataset.role,field=n=>sec.querySelector(`[name="${n}"]`),report=text=>{sec.querySelector('.config-status').textContent=text;notify(text);};
  const read=()=>({role,name:field('name').value,profile:field('profile').value,profileEnabled:field('profileEnabled').checked});
  let descriptor=null;
  const lock=async fn=>{const buttons=[...sec.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){report(e.message);}finally{buttons.forEach(b=>b.disabled=false);}};
  const check=async()=>{const all=await desktopStatus(),s=all[role];if(all.audit?.healthy===false)throw Error(all.audit.error);sec.querySelector('.mcp-state').textContent=s?.connected?'角色通道有领取回合请求（最近一分钟）；客户端身份与独立会话未经验证':s?.expiresAt?(s.lastRequestAt?'已收到 '+s.lastRequestMethod+'；等待 Agent 领取回合':'等待 Agent 安装并调用 MCP 工具'):'尚无有效 MCP 连接';return Boolean(s?.connected);};
  const connect=async(renew=false)=>{
   // Repeated copying must not revoke credentials already handed to an Agent.
   const getTask=async()=>{if(renew||!descriptor||descriptor.expiresAt<=Date.now()){const result=await connectDesktop(read());descriptor=result.desktop;}return createAgentTask(descriptor,'auto');};
   let task;
   try{
    // Start the clipboard write inside the click gesture, before awaiting network.
    if(navigator.clipboard?.write&&typeof ClipboardItem!=='undefined'){
     const blob=getTask().then(value=>{task=value;return new Blob([value],{type:'text/plain'});});
     await navigator.clipboard.write([new ClipboardItem({'text/plain':blob})]);
    }else{task=await getTask();await navigator.clipboard.writeText(task);}
    report('已复制完整任务。直接发送给本角色 Agent；无需选择客户端或另发指令。等待实际工具连接。');
   }catch(e){
    if(!task&&descriptor)task=createAgentTask(descriptor,'auto');
    if(!task)throw e;
    const preview=sec.querySelector('.task-preview');preview.hidden=false;preview.open=true;const area=preview.querySelector('textarea');area.value=task;area.focus();area.select();report('浏览器禁止自动复制。完整任务已选中，请按 Ctrl+C（手机长按复制），然后发给 Agent。');
   }
   if(descriptor)sec.querySelector('.mcp-state').textContent='接入任务已生成，等待 Agent 实际连接';
  };
  sec.querySelector('[data-bridge]').onclick=()=>lock(async()=>{
   if(!descriptor||descriptor.expiresAt<=Date.now()){
    if(!confirm('生成新的角色凭据会撤销此角色之前的连接。继续？'))return;
    descriptor=(await connectDesktop(read())).desktop;
   }
   const name='mondrian-'+descriptor.sessionId.slice(0,8)+'-'+role+'.cjs';
   const instructions=JSON.stringify({role,sessionId:descriptor.sessionId,expiresAt:descriptor.expiresAt,instructions:descriptor.prompt});
   const source='// 蒙德里安角色文件。作为本地 stdio 连接器运行。\n// '+instructions.replace(/[\u2028\u2029]/g,' ')+'\n'+descriptor.clientSource;
   const url=URL.createObjectURL(new Blob([source],{type:'text/javascript;charset=utf-8'}));
   const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   report('请将 '+name+' 保存在运行豆包的电脑。自定义连接器选择本地 stdio，命令填该电脑的 Node 可执行文件，参数只填此文件的实际绝对路径（一项）。启用后从豆包会话调用 next_puzzle_turn。');
  });
  sec.querySelector('[data-connect]').onclick=()=>lock(()=>connect());
  sec.querySelector('[data-renew]').onclick=()=>lock(()=>connect(true));
  sec.querySelector('[data-status]').onclick=()=>lock(async()=>{await check();report(sec.querySelector('.mcp-state').textContent);});
  sec.querySelector('[data-save]').onclick=()=>lock(async()=>{await save(read());report('名称与画像已保存。修改前请暂停实验。');});
  sec.querySelector('[data-enable]').onclick=()=>lock(async()=>{await save({...read(),enabled:true});await check();report('本角色已启用。');});
  sec.querySelector('[data-disable]').onclick=()=>lock(async()=>{await save({...read(),enabled:false});report('本角色已停用。');});
  sec.querySelector('.profileFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>65536)throw Error('画像不能超过64KB');let text=await file.text();if(file.name.endsWith('.json'))text=JSON.stringify(JSON.parse(text),null,2);if(text.length>4000)throw Error('画像不能超过4000字符');field('profile').value=text;field('profileEnabled').checked=true;report('画像已导入，保存后生效。');}catch(e){report(e.message);}finally{e.target.value='';}};
 }
}
