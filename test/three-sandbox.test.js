import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {createSandboxService} from '../src/sandbox-server.js';
import http from 'node:http';
test('sandbox package excludes credentials, limits privileges and exposes only the gateway on host loopback',()=>{
 const root=new URL('../',import.meta.url),compose=JSON.parse(readFileSync(new URL('compose.sandbox.json',root),'utf8')),service=compose.services.task;
 assert.equal(service.read_only,true);assert.deepEqual(service.cap_drop,['ALL']);assert.ok(service.security_opt.includes('no-new-privileges:true'));assert.equal(service.user,'1000:1000');assert.equal(service.ports,undefined);assert.ok(service.pids_limit<=128);assert.ok(service.mem_limit);assert.equal(compose.networks.isolated.internal,true);assert.ok(!JSON.stringify(compose).includes('docker.sock'));assert.deepEqual(service.volumes,['records:/app/data']);
 const proxy=compose.services.entry;assert.ok(proxy.ports.every(p=>p.startsWith('127.0.0.1:')));assert.equal(proxy.read_only,true);assert.equal(proxy.volumes,undefined);assert.deepEqual(service.networks,['isolated']);assert.deepEqual(proxy.networks,['isolated','entry']);
 const docker=readFileSync(new URL('Dockerfile.sandbox',root),'utf8');assert.match(docker,/USER node/);assert.doesNotMatch(docker,/COPY\s+\.\s/);const ignored=readFileSync(new URL('.dockerignore',root),'utf8');assert.match(ignored,/^\*\*/);assert.ok(!ignored.includes('!data'));
});
test('SSH tunnel mode accepts only loopback HTTP, keeps visitor isolation and matches forwarded Host/Origin',async()=>{
 const options={publicOrigin:'http://127.0.0.1:4328',tunnelMode:true,invitationToken:'i'.repeat(64),gatewaySecret:'g'.repeat(64),database:':memory:',port:0,privatePort:0};
 await assert.rejects(()=>createSandboxService({...options,publicOrigin:'http://114.214.255.194:4328'}));
 const service=await createSandboxService(options);
 const call=(path,{cookie,body,token}={})=>new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port:service.gateway.address().port,path,method:body?'POST':'GET',headers:{Host:'127.0.0.1:4328',Origin:'http://127.0.0.1:4328','x-mgf-client':'1','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(token?{Authorization:'Bearer '+token}:{})}},async res=>{let text='';for await(const c of res)text+=c;resolve({status:res.statusCode,headers:res.headers,text});});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});
 try{const joined=await call('/join/'+options.invitationToken);assert.equal(joined.status,302);assert.ok(joined.headers['set-cookie'].every(v=>v.includes('HttpOnly')&&!v.includes('; Secure')));const cookie=joined.headers['set-cookie'].map(v=>v.split(';')[0]).join('; ');const created=await call('/api/sessions',{cookie,body:{}});assert.equal(created.status,201);const room=JSON.parse(created.text);const issued=await call('/api/sessions/'+room.id+'/desktop',{cookie,token:room.tokens.researcher,body:{role:'A'}});assert.equal(issued.status,200);assert.ok(JSON.parse(issued.text).desktop.url.startsWith('http://127.0.0.1:4328/mcp/'));assert.equal((await call('/api/sessions',{body:{}})).status,403);}
 finally{await service.close();}
});
test('sandbox service validates configuration and keeps researcher backend off the exposed listener',async()=>{
 await assert.rejects(()=>createSandboxService({publicOrigin:'http://example.org'}),/HTTPS/);
 const service=await createSandboxService({publicOrigin:'https://sandbox.example.test',invitationToken:'i'.repeat(64),gatewaySecret:'g'.repeat(64),database:':memory:',port:0,privatePort:0});
 try{assert.equal(service.gateway.address().address,'127.0.0.1');assert.equal(service.app.server.address().address,'127.0.0.1');const response=await fetch('http://127.0.0.1:'+service.gateway.address().port+'/api/sessions',{method:'POST',body:'{}'});assert.equal(response.status,403);}
 finally{await service.close();}
});
