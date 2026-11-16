import {readJson} from './http-json.js';
import http from 'node:http';import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';
export function createRemoteGateway({domain,platformPort=4327,relayPorts={}}){
 if(!/^[a-z0-9.-]+$/.test(domain))throw Error('需要精确公网域名');
 const deny=(res,status,message)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify({error:message}));};const active={web:0,stream:0,relay:0,submit:0},observers=new Map(),limits={web:16,stream:16,relay:24,submit:8};
 return http.createServer({requestTimeout:30000,headersTimeout:10000},async(req,res)=>{
  if(req.headers.host!==domain)return deny(res,403,'域名不匹配');
  if(req.headers.origin&&req.headers.origin!==`https://${domain}`)return deny(res,403,'跨站请求被拒绝');
  
  try{const url=new URL(req.url,'https://'+domain);const match=url.pathname.match(/^\/agent\/([ABC])\/(next|submit|client|status)$/);let port,path;
   if(match&&req.method==='POST'){port=relayPorts[match[1]];if(!port)return deny(res,404,'此角色尚未配置远程接入');path='/'+match[2];}
   else if(req.method==='GET'&&(['/','/participant','/app.js','/observer.js','/presets.js','/settings.js','/history.js','/diagnostics.js','/style.css','/media/cover.jpg','/media/three-agent-introduction.mp4','/media/three-agent-introduction.vtt','/media/three-agent-poster.png','/api/health'].includes(url.pathname)||/^\/api\/sessions\/[\w-]+\/(state|stream)$/.test(url.pathname))){port=platformPort;path=url.pathname+url.search;}
   else return deny(res,403,'公网仅开放观察页面和指定角色工具；实验管理请在本机操作');
   const isStream=req.method==='GET'&&url.pathname.endsWith('/stream');const lane=match?(match[2]==='submit'?'submit':'relay'):isStream?'stream':'web';
   const observer=req.headers.authorization||url.searchParams.get('token')||'anonymous';
   if(active[lane]>=limits[lane]||isStream&&(observers.get(observer)||0)>=4)return deny(res,429,'此类连接过多，请关闭多余观察页后重试');
   active[lane]++;if(isStream)observers.set(observer,(observers.get(observer)||0)+1);res.once('close',()=>{active[lane]--;if(isStream){const n=(observers.get(observer)||1)-1;if(n)observers.set(observer,n);else observers.delete(observer);}});
   if(match){
    if(!/^Bearer [^\s]{32,4096}$/.test(req.headers.authorization||''))return deny(res,401,'缺少有效角色连接凭据');
    const status=await new Promise(resolve=>{const check=http.request({hostname:'127.0.0.1',port,path:'/status',method:'POST',headers:{Authorization:req.headers.authorization,'Content-Type':'application/json'}},r=>{r.resume();resolve(r.statusCode);});check.setTimeout(3000,()=>check.destroy());check.on('error',()=>resolve(502));check.end('{}');});
    if(status!==200)return deny(res,status===401||status===403?status:502,'角色凭据无效、已过期或本机桥接未运行');
   }
   let data=Buffer.alloc(0);if(req.method==='POST')data=Buffer.from(JSON.stringify(await readJson(req,150000)));else if(req.headers['transfer-encoding']||Number(req.headers['content-length']||0)>0)return deny(res,400,'GET请求不能携带正文');
   const headers={host:`127.0.0.1:${port}`};for(const key of ['authorization','content-type','range'])if(req.headers[key])headers[key]=req.headers[key];
   const upstream=http.request({hostname:'127.0.0.1',port,path,method:req.method,headers},r=>{res.writeHead(r.statusCode,{...r.headers,'X-Accel-Buffering':'no','Cache-Control':'no-store'});r.pipe(res);});
   upstream.setTimeout(30000,()=>upstream.destroy(Error('上游连接超时')));upstream.on('error',()=>{if(!res.headersSent)deny(res,502,'本机平台或角色桥接未运行');else res.end();});res.on('close',()=>upstream.destroy());upstream.end(data);
  }catch{if(!res.headersSent)deny(res,400,'请求格式错误');else res.end();}
 });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const c=JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''));createRemoteGateway(c).listen(c.port||4328,'127.0.0.1',()=>console.log('Remote gateway ready: '+c.domain));}
