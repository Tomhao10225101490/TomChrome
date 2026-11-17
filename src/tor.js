const {EventEmitter}=require('node:events');
const {spawn}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');
const freePort=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
class TorProcess extends EventEmitter {
  constructor(bundle,{timeout=90000,spawnProcess=spawn}={}){super();this.bundle=bundle;this.timeout=timeout;this.spawnProcess=spawnProcess;this.state={phase:'idle',progress:0,message:'尚未连接 Tor'};this.child=null;this.port=0;this.directory=null;this.stopping=false;this.started=false;this.cancelStart=null;}
  update(patch){this.state={...this.state,...patch};this.emit('state',this.state);}
  async start(){
    if(this.started)throw Error('Tor instance cannot be reused');
    this.started=true;this.stopping=false;this.port=await freePort();
    if(this.stopping)throw Error('Tor connection cancelled');
    this.directory=fs.mkdtempSync(path.join(os.tmpdir(),'tom-tor-'));fs.chmodSync(this.directory,0o700);
    this.update({phase:'connecting',progress:0,message:'正在连接 Tor 网络；验证出口前禁止浏览'});
    const args=['--ignore-missing-torrc','-f',path.join(this.directory,'no-torrc'),'--DataDirectory',this.directory,'--SocksPort',`127.0.0.1:${this.port} IsolateDestAddr IsolateDestPort`,'--ControlPort','0','--DNSPort','0','--TransPort','0','--ClientOnly','1','--AvoidDiskWrites','1','--SafeLogging','1','--SafeSocks','1','--ClientRejectInternalAddresses','1','--ClientDNSRejectInternalAddresses','1','--GeoIPFile',path.join(this.bundle,'geoip'),'--GeoIPv6File',path.join(this.bundle,'geoip6'),'--Log','notice stdout','--__OwningControllerProcess',String(process.pid)];
    return new Promise((resolve,reject)=>{
      let settled=false,buffer='';
      this.cancelStart=()=>{if(!settled){settled=true;reject(Error('Tor connection cancelled'));}};
      const fail=(message)=>{if(this.stopping)return;this.update({phase:'failed',message});if(!settled){settled=true;reject(Error(message));}this.stop(false);};
      const timer=setTimeout(()=>fail('Tor 连接超时，已阻断联网。当前网络可能需要网桥；不会回退直连。'),this.timeout);
      this.timer=timer;
      this.child=this.spawnProcess(path.join(this.bundle,'tor'),args,{stdio:['ignore','pipe','pipe'],env:{PATH:'/usr/bin:/bin',HOME:this.directory}});
      const onData=chunk=>{if(this.stopping)return;buffer+=chunk.toString();let index;while((index=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,index);buffer=buffer.slice(index+1);const m=line.match(/Bootstrapped (\d+)%/);if(m){const progress=Number(m[1]);this.update({progress,message:`Tor 引导 ${progress}% · 验证出口前禁止浏览`});if(progress===100&&!settled){settled=true;this.cancelStart=null;clearTimeout(timer);this.update({phase:'verifying',message:'Tor 引导完成，正在验证真实出口'});resolve(this.port);}}if(/\[err\]/i.test(line))fail('Tor 启动失败，已阻断联网。请检查本机网络或重新连接。');}};
      this.child.stdout.on('data',onData);this.child.stderr.on('data',onData);
      this.child.once('error',()=>{clearTimeout(timer);this.child=null;fail('无法启动内置 Tor 进程；已阻断联网。');this.cleanup();});
      this.child.once('exit',()=>{clearTimeout(timer);this.child=null;if(!this.stopping)fail('Tor 进程已停止；所有 Tor 窗口请求均被阻断。');this.cleanup();});
    });
  }
  connected(){if(this.state.phase==='verifying')this.update({phase:'connected',progress:100,message:'已验证 Tor 出口 · 不保证 Tor Browser 级匿名性'});}
  fail(message){this.update({phase:'failed',message});this.stop(false);}
  stop(showStatus=true){this.stopping=true;this.cancelStart?.();this.cancelStart=null;clearTimeout(this.timer);if(this.child){const child=this.child;child.kill('SIGTERM');const kill=setTimeout(()=>{if(this.child===child)child.kill('SIGKILL');},2000);kill.unref();}else this.cleanup();if(showStatus)this.update({phase:'stopped',progress:0,message:'Tor 已断开，禁止直连'});}
  cleanup(){if(this.directory){try{fs.rmSync(this.directory,{recursive:true,force:true});}catch{}this.directory=null;}}
}
module.exports={TorProcess};
