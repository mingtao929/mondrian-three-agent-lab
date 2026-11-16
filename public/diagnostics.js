export function failureGuidance(o){
 const fault=o.interruption;if(!fault)return null;const agent=o.agents?.[fault.role]||{};const error=fault.error||'未知错误';const occurred=Number.isFinite(fault.at)?new Date(fault.at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}):'';let next;
 if(fault.role==='system'&&/记录写入|存储|磁盘/.test(error))next='先检查本机磁盘空间和数据库文件是否被占用。修复后重新保存配置，确认可写，再补填内存密钥；不要直接反复继续。';
 else if(fault.role==='system'&&/调度/.test(error))next='请检查本机平台日志并导出已保存记录，处理调度错误后再继续实验。';
 else if(fault.role==='system')next='重新填写 A/B 的 API Key；C 使用本机 Codex 快捷接入。检查三个接口后再继续，平台不会自动启动实验。';
 else if(agent.kind==='http'&&/401|403/.test(error))next='桥接连接令牌未通过校验；检查令牌、有效期和角色绑定。这里需要桥接连接令牌，不是 OpenAI API Key。';
 else if(/余额|额度|预算|欠费|账单/.test(error))next='在对应服务商控制台检查余额、免费用量和预算限制；问题解决后重新测试连接。';
 else if(/401/.test(error))next='检查本角色 API Key 是否属于当前服务商、是否有效；不要把其他平台的密钥填到这里。';
 else if(/403/.test(error))next='检查模型开通状态、项目权限和账户计费状态；仅凭403不能确定是欠费或密钥错误。';
 else if(/429|限流/.test(error))next='等待服务商冷却，并核对请求频率和用量限制；不要连续点击启用。';
 else if(/Codex|WorkBuddy|领取|桥接/.test(error))next='检查桌面 Agent 是否仍在运行、是否已登录，以及桥接进程是否在线。';
 else if(/JSON|截断|空的|格式|违规|单轴|边界/.test(error))next='模型输出或动作未通过校验；查看错误原因，核对响应格式或模型参数，再重新测试。';
 else if(/网络|超时|5\d\d/.test(error))next='检查运行平台这台电脑的网络、代理和上游服务状态；确认恢复后测试连接。';
 else next='查看对应角色设置和错误记录，修正后测试连接。';
 return {title:`${fault.role==='system'?'平台服务':fault.role} · ${agent.name||(fault.role==='system'?(/重启/.test(error)?'重启保护':/存储|记录写入/.test(error)?'存储保护':'运行保护'):'Agent '+fault.role)} ${agent.enabled?'配置已更新，等待继续验证':'最近一次中断，尚未验证恢复'}`,detail:(occurred?'最近中断时间（北京时间）：'+occurred+'。':'')+error,next:next+' 整场计时已冻结、进度保留；全部角色就绪后继续整个实验。'};
}
