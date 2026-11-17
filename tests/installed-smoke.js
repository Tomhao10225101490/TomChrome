const {_electron:electron}=require('playwright');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
(async()=>{let app;const errors=[];const results=[];try{
  const executable=path.join(os.homedir(),'Applications/Tom chrome.app/Contents/MacOS/Tom chrome');
  app=await electron.launch({executablePath:executable,env:{...process.env,TOM_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'tom-installed-'))},timeout:20000});
  const shortcut=async(key,shift=false,web=false)=>app.evaluate(({app,BrowserWindow},{key,shift,web})=>{app.focus({steal:true});const w=BrowserWindow.getAllWindows()[0];w.focus();const wc=web?w.contentView.children.filter(v=>v.webContents).at(-1).webContents:w.webContents;wc.focus();const modifiers=shift?['meta','shift']:['meta'];wc.sendInputEvent({type:'keyDown',keyCode:key,modifiers});wc.sendInputEvent({type:'keyUp',keyCode:key,modifiers});},{key,shift,web});
  const ui=await app.firstWindow();ui.on('pageerror',e=>errors.push(e.message));await ui.locator('#newtab-search').waitFor();
  await shortcut('t');await ui.locator('.tab').nth(1).waitFor();assert.equal(await ui.locator('.tab').count(),2);results.push('Cmd+T opens tab');
  await shortcut('w');await ui.waitForFunction(()=>document.querySelectorAll('.tab').length===1);results.push('Cmd+W closes active tab');
  await ui.locator('#address').fill('Chromium browser');const livePromise=app.waitForEvent('window',{timeout:15000});await ui.locator('#address').press('Enter');
  const live=await livePromise;await live.waitForLoadState('domcontentloaded',{timeout:30000});assert.match(live.url(),/^https:\/\/www.bing.com\/search\?q=Chromium%20browser/);
  const body=await live.locator('body').innerText();assert.ok(body.length>200);results.push({liveSearch:{url:live.url(),title:await live.title(),textSample:body.slice(0,500)}});
  await shortcut('l',false,true);await ui.waitForFunction(()=>document.activeElement?.id==='address');results.push('Cmd+L from live web page focuses trusted omnibox');
  await ui.locator('#address').press('Escape');
  await shortcut('d',false,true);await ui.locator('.bookmark-item').waitFor();results.push('Cmd+D bookmarks live page');
  await ui.locator('#menu-button').click();await ui.locator('#web-preview').waitFor();results.push('Menu overlays captured webpage without blanking page');await ui.keyboard.press('Escape');
  const privPromise=app.waitForEvent('window',{timeout:15000});await shortcut('n',true);const priv=await privPromise;await priv.locator('.private-intro').waitFor();results.push('Cmd+Shift+N opens private window');await priv.close();
  const info=await app.evaluate(({app})=>({appPath:app.getAppPath(),packaged:app.isPackaged,versions:process.versions}));assert.ok(info.packaged);assert.match(info.appPath,/Applications\/Tom chrome.app\/Contents\/Resources\/app.asar$/);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.resolve(__dirname,'../evidence/installed-smoke.json'),JSON.stringify({date:new Date().toISOString(),results,info,errors},null,2));console.log(JSON.stringify(results,null,2));
}finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1});
