// Sandboxed isolated world only. No APIs are exposed to the website.
// Reports selector tokens (never page text, cookies, forms or HTML) for CSS hiding.
const {ipcRenderer}=require('electron');
if(process.isMainFrame){
  let enabled=true,timer,last='',observing=false;
  const observer=new MutationObserver(schedule);
  function schedule(){if(enabled&&!document.hidden&&!timer)timer=setTimeout(scan,750);}
  function scan(){
    timer=null;if(!enabled||document.hidden||!document.documentElement)return;
    const ids=new Set(),classes=new Set();let budget=24000,tokens=0;
    const add=(set,value)=>{if(!value||value.length>128||set.has(value)||tokens>=1500||budget<value.length)return;set.add(value);budget-=value.length;tokens++;};
    let visited=0;const walker=document.createTreeWalker(document.documentElement,NodeFilter.SHOW_ELEMENT);
    let element=walker.currentNode;
    while(element&&visited++<3000&&budget>0&&tokens<1500){add(ids,element.id);for(const name of element.classList||[]){add(classes,name);if(tokens>=1500||budget<=0)break;}element=walker.nextNode();}
    const payload={ids:[...ids],classes:[...classes]};const serialized=JSON.stringify(payload);
    if(serialized!==last){last=serialized;ipcRenderer.send('cosmetic-dom',payload);}
  }
  function observe(){if(enabled&&!observing&&document.documentElement){observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','id']});observing=true;}schedule();}
  ipcRenderer.on('cosmetics-enabled',(_,value)=>{const next=value===true;if(next===enabled)return;enabled=next;if(!enabled){observer.disconnect();observing=false;clearTimeout(timer);timer=null;}else{last='';observe();}});
  ipcRenderer.on('refresh-cosmetics',()=>{last='';schedule();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){last='';schedule();}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',observe,{once:true});else observe();
  window.addEventListener('pagehide',()=>{observer.disconnect();observing=false;clearTimeout(timer);timer=null;});
  window.addEventListener('pageshow',()=>{last='';observe();});
}
