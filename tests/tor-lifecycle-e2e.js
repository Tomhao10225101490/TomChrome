const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const {execFileSync}=require('node:child_process');
(async()=>{let app;const checks=[];const errors=[];const log=s=>{checks.push(s);console.log('PASS',s)};const timer=setTimeout(()=>{app?.process().kill('SIGTERM');process.exit(1)},155000);
const children=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,comm='],{encoding:'utf8'}).split('\n').map(s=>s.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(m=>m&&Number(m[2])===app.process().pid&&m[3].endsWith('/tor')).map(m=>Number(m[1]));
const none=async()=>{for(let i=0;i<60;i++){if(!children().length)return;await new Promise(r=>setTimeout(r,100));}throw Error('Orphan Tor process remains after cancelling');};
try{
 app=await electron.launch({...(process.env.TOM_EXECUTABLE?{executablePath:process.env.TOM_EXECUTABLE,args:[]}:{args:[path.resolve(__dirname,'..')]}),env:{...process.env,TOM_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'tom-tor-lifecycle-'))},timeout:30000});const ui=await app.firstWindow();ui.on('pageerror',e=>errors.push(e.message));await ui.locator('#newtab-search').waitFor();
 const open=async()=>{await ui.locator('#menu-button').click();const next=app.waitForEvent('window');await ui.getByRole('button',{name:'新建 Tor 窗口',exact:true}).click();const page=await next;page.on('pageerror',e=>errors.push(e.message));return page;};
 let tor=await open();await tor.close();await none();log('Closing newly opened Tor window cancels startup without an orphan process');
 tor=await open();await tor.locator('#tor-status').waitFor();
 for(let cycle=0;cycle<3;cycle++){
  await tor.getByRole('button',{name:'断开连接',exact:true}).click();await tor.locator('#tor-status[data-phase="stopped"]').waitFor();await none();
  if(cycle<2){await tor.getByRole('button',{name:'重试连接',exact:true}).click();await tor.locator('#tor-status').waitFor();}
 }
 log('Three quick disconnect/retry cycles settle old bootstraps and keep the stopped state stable');
 await tor.getByRole('button',{name:'重试连接',exact:true}).click();await tor.locator('#tor-status[data-phase="connected"], #tor-status[data-phase="failed"]').waitFor({timeout:120000});assert.equal(await tor.locator('#tor-status').getAttribute('data-phase'),'connected',await tor.locator('#tor-status').textContent());await tor.waitForTimeout(500);assert.equal(children().length,1);log('After cancellations the newest connection alone verifies a real Tor exit');
 await tor.close();await none();assert.deepEqual(errors,[]);log('Closing connected window stops its final process; no shell errors');
 fs.writeFileSync('evidence/tor-lifecycle-e2e.json',JSON.stringify({date:new Date().toISOString(),executable:process.env.TOM_EXECUTABLE||'development',checks,errors,remainingTorChildren:children().length},null,2));
}catch(error){fs.writeFileSync('evidence/tor-lifecycle-failure-'+Date.now()+'.json',JSON.stringify({date:new Date().toISOString(),executable:process.env.TOM_EXECUTABLE||'development',checks,error:error.message},null,2));throw error;}finally{clearTimeout(timer);await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1});
