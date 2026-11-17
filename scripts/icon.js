const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
// Shared Chrome/Chromium product-mark geometry, unchanged; replace fills only.
const palette={'#669DF6':'#22b7a5','#AECBFA':'#3998ed','#1A73E8':'#2467bc','#1967D2':'#7165dc'};
(async()=>{
 const original=fs.readFileSync('assets/branding/chromium-product-logo.svg','utf8');
 let svg=original;for(const [from,to]of Object.entries(palette)){if(!svg.includes(`fill="${from}"`))throw Error('Missing reference color '+from);svg=svg.replaceAll(`fill="${from}"`,`fill="${to}"`);}
 fs.writeFileSync('assets/logo.svg',svg);
 fs.mkdirSync('assets/icon.iconset',{recursive:true});
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{const page=await browser.newPage({viewport:{width:1024,height:1024}});await page.setContent('<style>body{margin:0;background:transparent}svg{width:1024px;height:1024px}</style>'+svg);await page.screenshot({path:'assets/icon-1024.png',omitBackground:true});}finally{await browser.close();}
 for(const size of [16,32,128,256,512])for(const scale of [1,2])execFileSync('sips',['-z',String(size*scale),String(size*scale),'assets/icon-1024.png','--out',`assets/icon.iconset/icon_${size}x${size}${scale===2?'@2x':''}.png`],{stdio:'ignore'});
 execFileSync('iconutil',['-c','icns','assets/icon.iconset','-o','assets/icon.icns']);
})().catch(error=>{console.error(error);process.exitCode=1});
