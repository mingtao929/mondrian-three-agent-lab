import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createApp} from './server.js';
import {createGuestGateway} from './guest-gateway.js';

export async function createSandboxService({publicOrigin,invitationToken,gatewaySecret,database,bindHost='127.0.0.1',port=4391,privatePort=4390,tunnelMode=false}){
 let origin;try{origin=new URL(publicOrigin);}catch{throw Error('需要PUBLIC_ORIGIN的HTTPS域名');}
 const localTunnel=tunnelMode&&origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname);
 if((!localTunnel&&(origin.protocol!=='https:'||origin.port))||origin.origin!==publicOrigin||origin.username||origin.password)throw Error('需要不含路径和凭据的HTTPS域名');
 if(!/^[a-z0-9.-]+$/.test(origin.hostname)||!['127.0.0.1','0.0.0.0'].includes(bindHost))throw Error('无效域名或监听地址');
 if(typeof invitationToken!=='string'||typeof gatewaySecret!=='string'||invitationToken.length<32||gatewaySecret.length<32||invitationToken===gatewaySecret)throw Error('需要独立的邀请与网关凭据，均至少32字符');
 const app=createApp({database,sharing:{gatewaySecret},mcpOnly:true,mcpBaseUrl:publicOrigin});let gateway,closing;
 const close=()=>closing??=(async()=>{if(gateway){gateway.closeAllConnections();if(gateway.listening)await new Promise(r=>gateway.close(r));}await app.close();})();
 try{
  await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(privatePort,'127.0.0.1',resolve);});
  gateway=createGuestGateway({domain:origin.hostname,privatePort:app.server.address().port,invitationToken,gatewaySecret,desktop:app.mcp,...(localTunnel?{tunnelOrigin:publicOrigin}:{})});
  await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(port,bindHost,resolve);});
  return {app,gateway,close};
 }catch(e){await close();throw e;}
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  const service=await createSandboxService({publicOrigin:process.env.PUBLIC_ORIGIN,invitationToken:process.env.INVITATION_TOKEN,gatewaySecret:process.env.GATEWAY_SECRET,database:join(process.env.DATA_DIR||'data','sandbox.sqlite'),bindHost:process.env.MCP_BIND_HOST||'127.0.0.1',tunnelMode:process.env.TUNNEL_MODE==='1'});
  console.log('MCP task gateway ready; researcher backend remains on loopback.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{void service.close().then(()=>process.exit(0),()=>process.exit(1));});
 }catch{console.error('MCP sandbox service startup failed; check HTTPS origin, separate credentials, data volume and ports.');process.exitCode=1;}
}
