import net from 'node:net';

// Fixed destination only. This process has no credentials, records volume,
// shell execution, HTTP CONNECT support or configurable upstream address.
let connections=0;
const server=net.createServer(socket=>{
 if(connections>=128){socket.destroy();return;}connections++;
 const upstream=net.connect({host:'task',port:4391});
 socket.setTimeout(120000,()=>socket.destroy());upstream.setTimeout(120000,()=>upstream.destroy());
 socket.on('error',()=>upstream.destroy());upstream.on('error',()=>socket.destroy());
 socket.once('close',()=>{connections--;upstream.destroy();});upstream.once('close',()=>socket.destroy());
 socket.pipe(upstream);upstream.pipe(socket);
});
server.listen(4391,'0.0.0.0');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{server.close();setTimeout(()=>process.exit(0),1000).unref();});
