import {PRESETS} from '../public/presets.js';
const endpoints=new Set([...Object.values(PRESETS).map(p=>p.endpoint.replace(/\/$/,'')),'https://api.deepseek.com/v1','https://api.moonshot.ai/v1','https://dashscope-intl.aliyuncs.com/compatible-mode/v1']);
export function guestOwner(req){return /^[a-f0-9]{64}$/.test(req.headers['x-guest-owner']||'')?req.headers['x-guest-owner']:null;}
export function guestCanRead(current,target,owner){return current.id===target.id||!!owner&&target.ownerId===owner;}
export function validateGuestAgent(cfg,desktopEndpoint){
 if(cfg.kind==='demo')return;
 if(cfg.kind==='http'){if(desktopEndpoint&&cfg.endpoint===desktopEndpoint)return;throw Error('分享版桌面Agent须点击“生成桌面MCP连接”，不能调用服务器内网或自定义HTTP地址');}
 if(!endpoints.has(cfg.endpoint.replace(/\/$/,'')))throw Error('分享版仅允许列表中的官方模型API地址；自定义服务请联系研究者');
}
