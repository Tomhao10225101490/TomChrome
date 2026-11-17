const fs=require('node:fs');const path=require('node:path');const {FiltersEngine,Request}=require('@ghostery/adblocker');const {getDomain}=require('tldts');
const privacy=require('./privacy');const crypto=require('node:crypto');
const directory=path.join(__dirname,'../assets/adblock');let ads,tracking;
const types={mainFrame:'main_frame',subFrame:'sub_frame',xhr:'xmlhttprequest',webSocket:'websocket',ping:'ping',cspReport:'csp_report',object:'object'};
function loadEngine(kind,{cache=true}={}){
 const files=kind==='ads'?['easylist.txt','easylistchina.txt']:['easyprivacy.txt'];const sources=files.map(file=>fs.readFileSync(path.join(directory,file)));
 if(cache)try{
   const manifest=JSON.parse(fs.readFileSync(path.join(directory,'cache-manifest.json'),'utf8'));const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
   if(manifest.format!==1||manifest.engine!=='2.20.3'||manifest[kind].rules.length!==files.length||files.some((file,i)=>manifest[kind].rules[i].file!==file||manifest[kind].rules[i].sha256!==digest(sources[i])))throw Error('Stale filter cache');
   const bytes=fs.readFileSync(path.join(directory,kind+'.bin'));if(digest(bytes)!==manifest[kind].sha256)throw Error('Invalid filter cache');
   return FiltersEngine.deserialize(bytes);
 }catch{} // Missing, changed or incompatible cache: retain the original protection.
 return FiltersEngine.parse(sources.map(bytes=>bytes.toString('utf8')).join('\n'),kind==='ads'?{loadExtendedSelectors:false}:{loadCosmeticFilters:false});
}
function engine(kind){return kind==='ads'?(ads||(ads=loadEngine(kind))):(tracking||(tracking=loadEngine(kind)));}
function host(url){try{return new URL(url).hostname;}catch{return '';}}
function allowlisted(prefs,url){return (prefs.adblockAllowlist||[]).includes(host(url));}
function enabled(prefs,url){return prefs.adblock!==false&&!allowlisted(prefs,url);}
function match(details,prefs){const source=privacy.topURL(details)||details.url;if(allowlisted(prefs,source)||details.resourceType==='mainFrame')return null;const request=Request.fromRawDetails({url:details.url,sourceUrl:source,type:types[details.resourceType]||details.resourceType||'other'});if(prefs.adblock!==false&&engine('ads').match(request).match)return 'ads';if(prefs.blockTrackers!==false&&engine('tracking').match(request).match)return 'trackers';return null;}
function popupBlocked(url,source,prefs,disposition){if(allowlisted(prefs,source))return false;return prefs.blockTrackers!==false&&privacy.tracker(url)||prefs.adblock!==false&&engine('ads').match(Request.fromRawDetails({url,sourceUrl:source,type:'script'})).match||prefs.blockPopups!==false&&!['foreground-tab','background-tab'].includes(disposition);}
function cosmetics(url,prefs,dom={}){if(!enabled(prefs,url))return '';const hostname=host(url),domain=getDomain(hostname,{allowPrivateDomains:true})||hostname;const {styles}=engine('ads').getCosmeticsFilters({url,hostname,domain,...dom,getInjectionRules:false,getExtendedRules:false});return styles;}
module.exports={match,cosmetics,enabled,popupBlocked,host,loadEngine};
