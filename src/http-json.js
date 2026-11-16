// Decode complete UTF-8, bound bytes and never include request contents in errors.
export async function readJson(req,limit=20000){
 const chunks=[];let bytes=0;
 for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=buffer.length;if(bytes>limit)throw Object.assign(Error('请求过大'),{statusCode:413});chunks.push(buffer);}
 let result;try{const raw=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks));result=raw?JSON.parse(raw):{};}catch{throw Error('请求JSON格式或UTF-8编码错误');}
 if(!result||typeof result!=='object'||Array.isArray(result))throw Error('请求须为JSON对象');return result;
}
