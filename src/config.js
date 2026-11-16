import {PRESETS,inferPreset} from '../public/presets.js';
export function normalizeCredential(b){if(b.apiKey===undefined)return;if(typeof b.apiKey!=='string'||b.apiKey.length>4096)throw Error('密钥格式错误');b.apiKey=b.apiKey.trim();if(/[^\x21-\x7e]/.test(b.apiKey))throw Error('密钥格式错误：仅允许可见ASCII字符，不能包含内部空白或控制字符');}
export function normalizeAgentConfig(b,old={},role='A'){
 for(const flag of ['enabled','profileEnabled'])if(b[flag]!==undefined&&typeof b[flag]!=='boolean')throw Error(flag+' 格式应为布尔值');
 const preset=b.preset??inferPreset(old);if(preset!=='custom'&&!PRESETS[preset])throw Error('未知模型服务商');const p=PRESETS[preset];
 const switched=b.preset!==undefined&&b.preset!==inferPreset(old);
 const kind=b.kind??(switched?(p?'openai':'demo'):(old.kind||(p?'openai':'demo')));if(!['demo','openai','http'].includes(kind))throw Error('无效agent配置');
 const name=String(b.name??old.name??`Agent ${role}`).trim()||`Agent ${role}`;if(name.length>40||/[\x00-\x1f\x7f]/.test(name))throw Error('名称最多40个字符，不能含换行或控制字符');
 const endpoint=String(b.endpoint??(switched?p?.endpoint:old.endpoint)??p?.endpoint??'').trim(),model=String(b.model??(switched?p?.models[0]:old.model)??p?.models[0]??'').trim();
 if(endpoint.length>2000||model.length>200)throw Error('接口地址或模型名称过长');if(kind!=='demo'&&(!endpoint||kind==='openai'&&!model))throw Error('请填写接口地址和模型');
 if(kind!=='demo'){let u;try{u=new URL(endpoint);}catch{throw Error('接口地址不是有效URL');}if(u.username||u.password||[...u.searchParams.keys()].some(k=>/^(api[_-]?key|access[_-]?token|token|secret|authorization)$/i.test(k)))throw Error('接口地址不能包含凭据或密钥，请在密钥字段填写');if(u.hash||kind==='openai'&&u.search)throw Error('模型API基址不能包含查询参数或片段');if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('远程接口须使用HTTPS');}
 const profile=b.profile??old.profile??'';if(typeof profile!=='string'||profile.length>4000||profile.includes('\0'))throw Error('画像应为最多4000字符的文本');
 const enabled=b.enabled??old.enabled??false;
 return {name,kind,preset,endpoint,model,profile,profileEnabled:b.profileEnabled===undefined?!!old.profileEnabled:b.profileEnabled===true,enabled,status:enabled?'等待调用':'已暂停'};
}
export function canReuseKey(old,next){const canonical=value=>{try{return new URL(value).toString().replace(/\/$/,'');}catch{return value;}};return old.kind===next.kind&&canonical(old.endpoint)===canonical(next.endpoint)&&inferPreset(old)===next.preset;}
