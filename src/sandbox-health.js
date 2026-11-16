import http from 'node:http';
let domain;try{domain=new URL(process.env.PUBLIC_ORIGIN).host;}catch{process.exit(1);}
const req=http.get({hostname:'127.0.0.1',port:4391,path:'/api/health',headers:{Host:domain}},res=>{let bytes=0,body='';res.on('data',c=>{bytes+=c.length;if(bytes>4096)req.destroy();else body+=c;});res.on('end',()=>{try{process.exit(res.statusCode===200&&JSON.parse(body).ok?0:1);}catch{process.exit(1);}});});req.setTimeout(4000,()=>req.destroy());req.on('error',()=>process.exit(1));
