// Dependency-free stdio adapter. TLS verification remains enabled; a deployment
// may supply its own public CA without changing system-wide trust settings.
async function runBridge(config){
 const {createInterface}=await import('node:readline');
 const {request}=await import(config.url.startsWith('https:')?'node:https':'node:http');
 const target=new URL(config.url);
 if(target.protocol!=='https:'&&!(target.protocol==='http:'&&['localhost','127.0.0.1'].includes(target.hostname)))throw Error('远程 MCP 必须使用 HTTPS');
 const explain=e=>{
  const code=e.code||e.cause?.code;
  if(['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','CERT_HAS_EXPIRED','ERR_TLS_CERT_ALTNAME_INVALID'].includes(code))return 'TLS证书校验失败：请重新生成角色配置，或联系研究者更新服务器证书。';
  if(['ETIMEDOUT','ECONNREFUSED','ENETUNREACH','EHOSTUNREACH','ENOTFOUND','ECONNRESET'].includes(code))return '服务器网络不可达：请连接校园网／学校VPN，检查地址与服务器服务后重试。';
  return 'MCP通信失败：请检查客户端版本、服务器状态及角色配置。';
 };
 const send=message=>new Promise((resolve,reject)=>{
  const body=JSON.stringify(message),req=request(target,{method:'POST',...(config.ca?{ca:config.ca}:{}),rejectUnauthorized:true,headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Authorization:'Bearer '+config.token}},res=>{
   let size=0,text='';res.setEncoding('utf8');res.on('data',chunk=>{size+=Buffer.byteLength(chunk);if(size>4*1024*1024){res.destroy();reject(Error('response_limit'));}else text+=chunk;});res.on('error',reject);res.on('end',()=>{
    if(res.statusCode<200||res.statusCode>=300){const error=Error(res.statusCode===401?'角色凭据无效或过期：请重新生成配置。':res.statusCode===403?'连接被拒绝：检查房间、角色权限与访问地址。':res.statusCode===429?'请求过于频繁：等待一分钟后重试。':'服务器返回HTTP '+res.statusCode+'：请联系研究者检查服务。');error.publicMessage=error.message;return reject(error);}
    if(!('id' in message))return resolve(null);
    try{const result=JSON.parse(text);if(result.id!==message.id)throw Error('id');resolve(result);}catch{reject(Error('invalid_response'));}
   });
  });req.setTimeout(30000,()=>req.destroy(Object.assign(Error('timeout'),{code:'ETIMEDOUT'})));req.on('error',reject);req.end(body);
 });
 if(process.argv.includes('--check')){
  try{await send({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mondrian-check',version:'1'}}});await send({jsonrpc:'2.0',method:'notifications/initialized'});const r=await send({jsonrpc:'2.0',id:2,method:'tools/list',params:{}});if(r.error)throw Error('tool_list');console.log(JSON.stringify({ok:true,tools:r.result.tools.map(t=>t.name)}));}catch(e){console.error(e.publicMessage||explain(e));process.exitCode=1;}return;
 }
 let queue=Promise.resolve();
 createInterface({input:process.stdin}).on('line',line=>{queue=queue.then(async()=>{
  let message;
  try{if(Buffer.byteLength(line)>30000)throw Error('request_limit');message=JSON.parse(line);const result=await send(message);if(result)process.stdout.write(JSON.stringify(result)+String.fromCharCode(10));}
  catch(e){const text=e.publicMessage||explain(e);console.error(text);if(message&&'id' in message)process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,error:{code:-32001,message:text}})+String.fromCharCode(10));}
 });});
}
export function inlineClientSource(url,token,ca){return '('+runBridge.toString()+')('+JSON.stringify({url,token,...(ca?{ca}:{})})+').catch(()=>{console.error("MCP客户端启动失败，请检查Node.js版本。");process.exitCode=1;});';}
