// Keep provider bodies out of logs: error messages can contain credentials.
export async function providerFailure(res){
 let raw='',size=0,payload;try{for await(const chunk of res.body){size+=chunk.byteLength;if(size>8192)break;raw+=Buffer.from(chunk).toString('utf8');}payload=JSON.parse(raw);}catch(e){if(e.name==='TimeoutError'||e.name==='AbortError')throw e;}
 const code=String(payload?.error?.code||payload?.code||payload?.error?.type||'');
 const overdue=/overdue/i.test(code),unopened=/ServiceNotOpen|ModelNotOpen/i.test(code);
 const quota=overdue||/quota|balance|credit|spend|billing|arrears/i.test(code),status=res.status;
 const category=quota?'quota':unopened?'configuration':[401,403].includes(status)?'credentials':status===429?'rate_limit':status>=500?'upstream':'request';
 let message=overdue?'服务商返回账户欠费或计费项不可用，请核对账单及计费状态':unopened?'模型服务未开通，请在服务商控制台核对开通状态':quota?'接口余额、用量或预算额度不足，请检查服务商控制台':status===429?'接口限流，请等待冷却后重试':[401,403].includes(status)?'接口凭据或权限错误':status===404?'接口地址或模型不存在':status>=500?'上游服务异常或响应超时':'请求被服务商拒绝';
 const local={WORKBUDDY_NOT_POLLING:'WorkBuddy 未领取回合，请检查桌面任务是否仍在运行',WORKBUDDY_SUBMIT_TIMEOUT:'WorkBuddy 已领取回合，但未在期限内提交动作',CODEX_AUTH:'Codex 登录失效，请重新登录',CODEX_LIMIT:'Codex 用量限制或限流，请等待恢复',CODEX_NETWORK:'Codex 网络或代理连接失败',CODEX_CLI:'Codex CLI 路径或参数失效，请重新运行启动平台脚本',CODEX_TIMEOUT:'Codex 回合超时，未执行本轮动作',CODEX_FAILED:'Codex 回合失败，未执行本轮动作，请测试连接'};
 if([502,503,504].includes(status)&&local[payload?.code])message=local[payload.code];
 const error=Error(`接口返回 HTTP ${status}：${message}`);error.category=category;error.httpStatus=status;
 const header=res.headers.get('retry-after');let wait=header===null?0:/^\d+(\.\d+)?$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now();if(!Number.isFinite(wait)||wait<0)wait=0;
 error.retryAfterMs=Math.ceil(wait);error.retryable=!quota&&!['CODEX_AUTH','CODEX_LIMIT','CODEX_CLI','CODEX_TIMEOUT'].includes(payload?.code)&&([408,409,429].includes(status)||status>=500)&&wait<=120000;
 return error;
}
