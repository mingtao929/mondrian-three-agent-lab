// This module is also embedded, without external dependencies, in a downloaded
// Windows installer. It never executes on the website merely by being imported.
export function createAgentTask(d,client){
 client=client||'auto';
 const automatic=client==='auto';
 const endpoint=new URL(d.url);
 const localOnly=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
 const config=automatic?JSON.stringify({codexToml:d.codexInlineConfig,stdio:JSON.parse(d.inlineConfig),remoteHttp:JSON.parse(d.httpConfig)},null,2):client==='codex'?d.codexInlineConfig:client==='doubao'?d.httpConfig:d.inlineConfig;
 const setup=automatic?'自行识别你当前运行的客户端与操作系统，不要让用户选择 Agent 类型。Codex 使用下方 codexToml 合并到实际 CODEX_HOME/config.toml（未设置时为用户目录 .codex/config.toml）；WorkBuddy 将 stdio.mcpServers 合并到用户目录 .workbuddy/mcp.json。其他支持本地 MCP 的客户端使用 stdio，按自身已核实的配置入口安装，不能猜测配置路径；只支持远程 MCP 的客户端使用 remoteHttp 的 url 和 Authorization。只选适合当前客户端的一种配置，不要把所有配置都安装。stdio 需要 Node.js 22+，先检查本机运行时；没有本机配置权限时准确指出唯一需要本人授权的操作。不要询问用户是在安装还是测试，本任务明确要求安装、验证并参与实验。':client==='codex'?'使用 Codex 本地 stdio MCP；把下面的 TOML 合并到本机 Codex 配置，先备份并保留其他配置。需要 Node.js 22+。':client==='doubao'?'使用豆包工作电脑版的“自定义连接器”，传输类型选 HTTP，按下方 JSON 填入 url 和 Authorization Header。不能把 JSON 仅当作聊天材料读完就停止。':'使用支持 stdio 的 MCP 客户端，按下方 JSON 安装本角色连接器。需要 Node.js 22+。';
 return `# 请执行：安装并接入蒙德里安几何狂想，随后参与协作

你收到的是完整任务，不是只做连接测试，也不是让我再提供一份任务指令。请先完成本角色连接器的安装与验收；研究者开始实验后，继续完成本角色的练习和正式协作任务。

角色：${d.role}
房间：${d.sessionId}
有效至：${new Date(d.expiresAt).toISOString()}（UTC）
本文件已包含连接配置和完整角色指令。保留同一文件即可继续，不需要用户另外复制一段指令。文件含本角色凭据，不要发送给队友或写入公开聊天。

## 接收方电脑的接入前检

所有安装操作在运行你的客户端的那台电脑完成，不是在分享者的电脑。使用你当前机器实际的用户目录、操作系统和 Node 路径，不复制分享者的绝对路径。远程、容器或云端执行环境不能假装修改了桌面宿主配置。
服务器：${endpoint.origin}
网络要求：${localOnly?'此地址是回环地址，仅生成连接的电脑可用；其他电脑必须停止安装并请研究者从校园服务器入口重新生成，绝不能把 localhost 当作研究者服务器。':'接收方电脑需能访问该服务器；当前校园部署通常需要校园网或学校 VPN。分享者浏览器能打开，不代表你的执行环境可达。'}
有效期：${new Date(d.expiresAt).toISOString()}。已过期时不要安装或反复重试，要求研究者重新生成该角色内容。
先检查当前运行环境，再在接收方通过内置桥接的 --check 检查网络、TLS、凭据与工具清单；检查通过再修改客户端配置。此检查不得领取实验回合。stdio 使用包中部署 CA 验证服务器，不依赖分享者已信任的浏览器证书，也不改系统信任库。原生 HTTP 客户端不能自动继承这张 CA；若不支持自定义 CA 且校验失败，报告证书阻塞，禁止关闭验证。
缺少 Node 时核实是否有客户端自带且满足版本的运行时；没有则说明所需依赖，不假设接收方已有安装。断网后保留原配置，恢复网络再检查；401 需换凭据，403 核对权限，429 等待，不能反复重装或重复提交动作。
只安装本角色；其他电脑上的其他 Agent 必须收到它们各自角色的内容，同一角色不能交给两个并行参与者。

## 阶段一：先安装本角色 MCP 连接器

先检查当前是否已有 next_puzzle_turn 和 submit_puzzle_turn。若没有，先判断是否尚未安装或尚未加载；不要只回复“没有工具，已停止”就结束全部任务。

${setup}

### 自动执行要求
先执行可完成的安装步骤，不要把本任务改写成教程、配置交付报告或要求用户再填 JSON。不得盲扫应用数据目录寻找猜测的配置；只使用当前客户端已核实的入口。
- 豆包工作：使用桌面自定义连接器入口；优先用收到的本角色 .cjs 文件（若有）；否则从下方 stdio 配置解析 args[1] 原始字符串并原样写入 .cjs。不可摘要或用“<桥接脚本>”等占位符代替。命令为宿主 Node 的绝对路径，参数为该 .cjs 的实际绝对路径（单个参数）；不要再填写 -e。先用此实际文件执行 --check，若具备获授权的界面操作能力，代为填好本角色配置，停在必须本人确认的授权处。无界面能力时只报告确切阻塞，不能宣称已自动安装。
- WorkBuddy：配置保存后检查连接器是否已启用及当前会话能否发现工具；文件存在不代表加载完成。
- Kimi Work：使用桌面插件机制，先核实当前版本的个人插件导入入口；不要擅自改 Kimi Code／CLI 配置冒充桌面安装。官方说明：https://www.kimi.com/help/plugins-and-skills/overview
- Codex：使用本机 Codex 的 MCP 注册机制，并核查当前会话工具；不得把另一客户端的配置路径用于 Codex。
- Hermes：先检查已安装版本的 MCP 管理命令帮助，使用该版本支持的注册方式，保留原配置；不猜测命令参数。
- DeepSeek Harness：使用官方 @deepseek-ai/dsh-mcp-client 插件，在当前 Agent 的作用域注册本角色工具；不要把通用 mcpServers JSON 直接写入未知配置。参考：https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md

安装前将这份完整任务保存为当前任务目录中的“蒙德里安-角色${d.role}-接入任务.md”（具备文件权限时），以便恢复会话。优先使用客户端支持的重新加载能力；只有确认不支持时才要求重开，并提供该文件的实际路径与一句恢复指令，不要求用户再次寻找网页配置。未经用户允许不要关闭仍在工作的其他会话。
返回状态只能是：安装中／等待本人授权／等待会话加载／会话已连接／参与实验／具体失败原因。只有当前会话真正调用角色工具取得回执，才报告“会话已连接”。若受客户端限制无法继续，报告一个实际必要的下一步，不能承诺绕过授权或强制热加载。

如果你具备本机配置权限，请执行安装；这一阶段仅允许为安装本角色连接器访问必要的本地客户端配置，先备份，保留其他连接器。不得读取平台源码、数据库、研究者网页或其他角色配置。不得把网页操作、模型 API 或手写 HTTP 请求当作实验参与方式。

如果客户端要求用户点一次添加／信任／授权，请明确说出唯一需要用户确认的客户端操作。若不能热加载，说明“配置已安装，当前会话待加载”，让用户重开客户端或新建独立会话，继续使用同一文件；不要声称已接入，也不要要求用户再去找另一份角色指令。不得关闭 TLS 校验。

${d.tlsMode==='deployment-ca'&&(client==='doubao'||automatic)?'当前服务器使用自签名证书。若远程客户端拒绝该证书，优先使用含部署证书的 stdio 配置；只支持远程连接时，这是 HTTPS 信任阻塞；准确报告证书错误并等待研究者修复，不能通过提示词假装连接成功。':''}

### 本角色安装配置

\`\`\`${client==='codex'?'toml':'json'}
${config}
\`\`\`

## 阶段二：验收实际工具连接，再等待研究者开始

必须从当前 Agent 会话的工具列表调用本角色连接器下的 next_puzzle_turn 和 submit_puzzle_turn（允许客户端添加工具名前缀）。不得用命令行临时启动桥接脚本领取回合来冒充会话已加载。命令行仅允许执行 --check 自检；自检成功只代表服务可达。确认客户端已加载上述两个工具，再实际调用 next_puzzle_turn。仅发现工具列表不等于已领取成功。返回 waiting 表示已连接、等待实验开始或新状态，按 retryAfterMs 等待，不是安装失败；返回 requestId 后按阶段三决策。不要在安装测试阶段随意移动碎片或发测试聊天。

成功时简要报告“角色${d.role}已实际领取工具回执，等待研究者开始／继续实验”，然后按工具返回继续。失败时报告当前阶段、客户端实际错误、是否已保存配置；网络、证书、凭据、工具未加载要分别说明，不猜测模型额度，不伪造服务器回执。

## 阶段三：实验开始后执行以下完整角色任务

以下只用角色工具的限制从本阶段生效，不能拿它阻止阶段一安装。三名 Agent 必须独立会话，各自只启用自己的连接器。

${d.prompt}

持续按照实际工具回执完成任务；研究者暂停时等待，实验 finished 后停止。客户端若因自身运行回合限制而停止，准确报告该限制，不宣称任务已完成。
`;
}

export async function installAgent(payload,options={}){
 const fs=await import('node:fs'),path=await import('node:path'),os=await import('node:os'),crypto=await import('node:crypto'),cp=await import('node:child_process');
 if(Number(process.versions.node.split('.')[0])<22)throw Error('请先安装 Node.js 22 或以上版本：https://nodejs.org/');
 if(!['codex','workbuddy'].includes(payload.client)||!/^mondrian_[a-f0-9]{8}_[ABC]$/.test(payload.label))throw Error('安装包客户端或角色标识无效');
 if(!Number.isFinite(payload.expiresAt)||payload.expiresAt<=Date.now())throw Error('角色接入包已过期，请在平台重新生成后下载。');
 if(typeof payload.source!=='string'||payload.source.length>64000||typeof payload.prompt!=='string')throw Error('角色安装包不完整');
 const home=options.home||os.homedir(),root=path.join(home,'.mondrian-mcp',payload.label),fingerprint=crypto.createHash('sha256').update(payload.source).digest('hex').slice(0,16),bridge=path.join(root,'client-'+fingerprint+'.cjs');
 fs.mkdirSync(root,{recursive:true,mode:0o700});
 if(fs.existsSync(bridge)&&fs.lstatSync(bridge).isSymbolicLink())throw Error('安装目标是符号链接，已停止。');
 fs.writeFileSync(bridge,payload.source,{mode:0o600});
 const check=cp.spawnSync(process.execPath,[bridge,'--check'],{encoding:'utf8',timeout:35000,maxBuffer:65536,windowsHide:true});
 if(check.error||check.status!==0)throw Error('连接检查未通过，尚未修改客户端配置。'+(check.stderr?.trim()||'请检查校园网／VPN、服务器和 Node.js。'));
 let result;try{result=JSON.parse(check.stdout);}catch{throw Error('连接检查未返回有效结果，尚未修改客户端配置。');}
 if(result.ok!==true||!['next_puzzle_turn','submit_puzzle_turn'].every(t=>result.tools?.includes(t)))throw Error('服务器未提供所需的两个 MCP 工具，尚未修改客户端配置。');
 const configHome=payload.client==='codex'?(options.codexHome||(!options.home&&process.env.CODEX_HOME)||path.join(home,'.codex')):path.join(home,'.workbuddy');
 fs.mkdirSync(configHome,{recursive:true,mode:0o700});
 const config=path.join(configHome,payload.client==='codex'?'config.toml':'mcp.json');
 if(fs.existsSync(config)&&(!fs.lstatSync(config).isFile()||fs.lstatSync(config).isSymbolicLink()))throw Error('客户端配置不是普通文件，已停止。');
 const before=fs.existsSync(config)?fs.readFileSync(config,'utf8'):null;
 let next;
 if(payload.client==='workbuddy'){
  let data;try{data=before===null?{}:JSON.parse(before.replace(/^\uFEFF/,''));}catch{throw Error('WorkBuddy 原配置不是有效 JSON；原文件已保留，请先在客户端修复。');}
  if(!data||typeof data!=='object'||Array.isArray(data)||data.mcpServers!=null&&(typeof data.mcpServers!=='object'||Array.isArray(data.mcpServers)))throw Error('WorkBuddy 原配置结构异常，原文件已保留。');
  data.mcpServers??={};data.mcpServers[payload.label]={type:'stdio',command:process.execPath,args:[bridge],alwaysLoad:true,disabled:false};next=JSON.stringify(data,null,2)+'\n';
 }else{
  const begin='# BEGIN MONDRIAN '+payload.label,end='# END MONDRIAN '+payload.label,original=before??'',start=original.indexOf(begin),finish=original.indexOf(end);
  let base=original;
  if(start>=0||finish>=0){
   if(start<0||finish<start||original.indexOf(begin,start+begin.length)>=0||original.indexOf(end,finish+end.length)>=0)throw Error('已有自动安装标记异常，原配置已保留。');
   base=original.slice(0,start)+original.slice(finish+end.length);
  }
  if(new RegExp('^\\s*\\[mcp_servers\\.'+payload.label+'(?:\\]|\\.)','m').test(base))throw Error('该角色已有手动配置，请先在 Codex 中删除同名连接器后重新安装；其他配置未修改。');
  if(/^\s*mcp_servers\s*=/m.test(base))throw Error('Codex 使用内联 MCP 配置，请通过客户端设置添加；原配置已保留。');
  next=base.replace(/\s*$/,'')+'\n\n'+begin+'\n[mcp_servers.'+payload.label+']\ncommand = '+JSON.stringify(process.execPath)+'\nargs = '+JSON.stringify([bridge])+'\n'+end+'\n';
 }
 // Never overwrite concurrent edits or a newly substituted symlink.
 if(fs.existsSync(config)&&(!fs.lstatSync(config).isFile()||fs.lstatSync(config).isSymbolicLink()))throw Error('配置文件已变化，请重试。');
 const current=fs.existsSync(config)?fs.readFileSync(config,'utf8'):null;if(current!==before)throw Error('客户端同时修改了配置，请稍后重试；本次未覆盖。');
 let backup=null;
 if(before!==null){backup=config+'.mondrian-backup-'+Date.now()+'-'+crypto.randomBytes(4).toString('hex');fs.writeFileSync(backup,before,{flag:'wx',mode:0o600});}
 const temporary=config+'.mondrian-new-'+crypto.randomBytes(6).toString('hex');
 try{fs.writeFileSync(temporary,next,{flag:'wx',mode:0o600});fs.renameSync(temporary,config);}catch{if(fs.existsSync(temporary))fs.unlinkSync(temporary);throw Error('客户端配置写入失败；如有原文件，其备份已保留，请关闭配置编辑窗口后重试。');}
 const promptFile=path.join(root,'启动角色.txt');fs.writeFileSync(promptFile,payload.prompt,{mode:0o600});
 console.log('安装完成：'+payload.client+' / '+payload.label+'\n服务器连接与两个工具检查已通过。\n配置：'+config+(backup?'\n原配置备份：'+backup:''));
 if(options.open!==false&&process.platform==='win32'){
  cp.spawnSync('clip.exe',[],{input:Buffer.from('\uFEFF'+payload.prompt,'utf16le'),windowsHide:true});
  if(payload.client==='codex'){
   const url='codex://new?prompt='+encodeURIComponent(payload.prompt);const child=cp.spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true});child.on('error',()=>{});child.unref();
   console.log('已请求打开 Codex 新会话。请确认发送预填的角色指令。若工具尚未加载，请重启客户端后新建会话。');
  }else console.log('请在 WorkBuddy 确认启用连接器，然后新建会话，粘贴已复制的角色指令并发送。已打开的旧会话可能需要重启客户端才能加载。');
 }
 console.log('角色指令也已保存：'+promptFile+'\n实际调用 next_puzzle_turn 后，平台才会显示 Agent 已就绪。');
 return {config,backup,bridge,promptFile};
}

export function createWindowsInstaller(descriptor,client){
 if(!['codex','workbuddy'].includes(client))throw Error('此客户端尚无经过验证的自动安装路径，请使用其原生 MCP 设置。');
 const labels=Object.keys(JSON.parse(descriptor.inlineConfig).mcpServers);if(labels.length!==1)throw Error('角色配置无效');
 const payload={client,label:labels[0],expiresAt:descriptor.expiresAt,source:descriptor.clientSource,prompt:descriptor.prompt};
 // Batch/JS polyglot: cmd launches Node using this very file, then exits before
 // reaching the JS body. No shell interpolation of credentials or downloaded code.
 const batch='/* 2>nul\r\n@echo off\r\nchcp 65001 >nul\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (\r\n echo Please install Node.js 22 or newer from https://nodejs.org/\r\n pause\r\n exit /b 1\r\n)\r\nnode "%~f0"\r\nset "mondrian_result=%errorlevel%"\r\npause\r\nexit /b %mondrian_result%\r\n*/\r\n';
 return batch+'('+installAgent.toString()+')('+JSON.stringify(payload)+').catch(e=>{console.error(e.message);process.exitCode=1;});\n';
}
