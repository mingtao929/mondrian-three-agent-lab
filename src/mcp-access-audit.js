import {appendFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

const reasons=new Set(['inactive_channel','invalid_credential','invalid_method','invalid_json','invalid_tool_arguments','protocol_request']);
const methods=new Set(['initialize','ping','tools/list','tools/call','notifications/initialized']);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function createAccessAudit({directory,maxBytes=4*1024*1024,write}={}){
 let healthy=true,closed=false,current='',bytes=0,lastWriteAt=null;const buckets=new Map();
 const store=row=>{try{
  const line=JSON.stringify(row)+'\n',size=Buffer.byteLength(line);
  if(write)write(line);else{mkdirSync(directory,{recursive:true});if(!current||bytes+size>maxBytes){current=join(directory,'access-'+Date.now()+'-'+randomUUID()+'.ndjson');bytes=0;}appendFileSync(current,line,{encoding:'utf8',mode:0o600});bytes+=size;}
  healthy=true;lastWriteAt=Date.now();return true;
 }catch{healthy=false;return false;}};
 const flush=()=>{for(const [key,b] of buckets){if(b.count){if(!store({...b.row,count:b.count,at:Date.now()}))return false;b.count=0;}buckets.delete(key);}return true;};
 const timer=setInterval(flush,5000);timer.unref();
 return {
  record(event){if(closed)return false;const row={at:Number.isFinite(event.at)?event.at:Date.now(),sessionId:uuid.test(event.sessionId||'')?event.sessionId:null,role:['A','B','C'].includes(event.role)?event.role:null,reason:reasons.has(event.reason)?event.reason:'invalid_method',...(event.method?{method:methods.has(event.method)?event.method:'unknown'}:{})};
   if(['invalid_credential','inactive_channel','invalid_method'].includes(row.reason)){
    const key=[row.sessionId,row.role,row.reason].join(':');let b=buckets.get(key);if(!b){if(buckets.size>=256&&!flush())return false;b={row,count:0};buckets.set(key,b);return store({...row,count:1});}b.count++;return healthy;
   }return store({...row,count:1});
  },status:()=>({healthy,lastWriteAt,error:healthy?null:'MCP访问审计写入失败，请检查数据目录和磁盘空间'}),
  close(){if(closed)return;clearInterval(timer);flush();closed=true;}
 };
}
