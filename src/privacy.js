const { getDomain } = require('tldts');
const net = require('node:net');
// Small, auditable built-in denylist; not a comprehensive ad blocker or malware database.
const TRACKERS = ['doubleclick.net','google-analytics.com','googletagmanager.com','googlesyndication.com','googleadservices.com','adservice.google.com','connect.facebook.net','facebook.net','analytics.twitter.com','ads-twitter.com','hotjar.com','hotjar.io','clarity.ms','bat.bing.com','segment.io','segment.com','mixpanel.com','amplitude.com','scorecardresearch.com','quantserve.com','criteo.com','criteo.net','adsrvr.org','taboola.com','outbrain.com','demdex.net','omtrdc.net','data.bilibili.com'];
const matches = (host,domain) => host===domain||host.endsWith('.'+domain);
const MEDIA_ORIGIN_PAIRS=[['bilibili.com',['bilivideo.com','bilivideo.cn']],['missav.ws',['surrit.com']]];
function parsed(value) { try { return new URL(value); } catch { return null; } }
function site(value) { const u=parsed(value);return u ? getDomain(u.hostname,{allowPrivateDomains:true})||u.hostname : ''; }
function thirdParty(url,top) { return !!site(top)&&site(url)!==site(top); }
function isLocal(host) {
  host=host.toLowerCase().replace(/^\[|\]$/g,'').replace(/\.$/,'');
  if(!host.includes('.')&&!net.isIP(host))return true;
  if(['localhost','local','internal','lan','home','invalid'].some(d=>matches(host,d)))return true;
  if(net.isIPv4(host)){const n=host.split('.').map(Number);return n[0]===0||n[0]===10||n[0]===127||n[0]>=224||n[0]===169&&n[1]===254||n[0]===172&&n[1]>=16&&n[1]<=31||n[0]===192&&n[1]===168||n[0]===100&&n[1]>=64&&n[1]<=127||n[0]===198&&n[1]>=18&&n[1]<=19;}
  if(net.isIPv6(host))return host==='::'||host==='::1'||/^(fc|fd|fe[89ab])/i.test(host)||host.startsWith('::ffff:');
  return false;
}
function tracker(url) {const u=parsed(url);return !!u&&(TRACKERS.some(d=>matches(u.hostname,d))||(matches(u.hostname,'hdslb.com')&&/\/bfs\/(seed\/log\/|activity-seed\/.*activity-report)/.test(u.pathname)));}
function compatibleUA(ua) { return ua.replace(/\sElectron\/[^\s]+/g,'').replace(/\sTomchrome\/[^\s]+/gi,'').replace(/\sTom[- ]?chrome\/[^\s]+/gi,'').replace(/Chrome\/(\d+)\.[\d.]+/,'Chrome/$1.0.0.0'); }
function topURL(details) {try {return details.webContents?.getURL()||details.initiatorOrigin||details.referrer||'';}catch{return details.initiatorOrigin||details.referrer||'';}}
function upgrade(url) {const u=parsed(url);if(u?.protocol==='http:'&&!isLocal(u.hostname)&&!u.hostname.endsWith('.onion')){u.protocol='https:';return u.href;}return url;}
function requestDecision(details,prefs,tor) {
  const u=parsed(details.url);if(!u)return {cancel:true,reason:'invalid'};
  if(tor){
    if(!['http:','https:','ws:','wss:'].includes(u.protocol)||isLocal(u.hostname))return {cancel:true,reason:'tor-local'};
    if(tor.phase!=='connected'&&!(tor.phase==='verifying'&&details.url==='https://check.torproject.org/api/ip'&&(!details.webContentsId||details.webContentsId===-1)))return {cancel:true,reason:'tor-gate'};
  } else if(u.hostname.endsWith('.onion'))return {cancel:true,reason:'onion-requires-tor'};
  const exception=!tor&&(prefs.adblockAllowlist||[]).includes(parsed(topURL(details))?.hostname);
  if((tor||prefs.blockTrackers)&&!exception&&details.resourceType!=='mainFrame'&&tracker(details.url))return {cancel:true,reason:'tracker'};
  if((tor||prefs.httpsOnly)&&details.resourceType==='mainFrame'&&upgrade(details.url)!==details.url)return {redirectURL:upgrade(details.url)};
  return {cancel:false};
}
function requestHeaders(details,prefs,tor) {
  const headers={...details.requestHeaders};const strip=name=>{for(const key of Object.keys(headers))if(key.toLowerCase()===name)delete headers[key];};
  if(prefs.privacySignals||tor){strip('dnt');strip('sec-gpc');headers.DNT='1';headers['Sec-GPC']='1';}
  if((prefs.blockThirdPartyCookies||tor)&&details.resourceType!=='mainFrame'&&thirdParty(details.url,topURL(details)))strip('cookie');
  // Strip cross-site URL paths and queries. A narrow video CDN compatibility rule
  // may repeat only an Origin already present in the request; never fabricate one.
  if((prefs.privacySignals||tor)&&thirdParty(details.url,details.referrer)){
    const key=Object.keys(headers).find(k=>k.toLowerCase()==='referer');const ref=parsed(key?headers[key]:'');const source=parsed(topURL(details)),target=parsed(details.url);
    const originKey=Object.keys(headers).find(k=>k.toLowerCase()==='origin');
    const videoCDN=!tor&&['media','xhr'].includes(details.resourceType)&&source?.protocol==='https:'&&target?.protocol==='https:'&&ref?.origin===source.origin&&!!originKey&&headers[originKey]===source.origin&&MEDIA_ORIGIN_PAIRS.some(([site,cdn])=>matches(source.hostname,site)&&cdn.some(domain=>matches(target.hostname,domain)));
    if(videoCDN&&key)headers[key]=source.origin+'/';else strip('referer');
  }
  return headers;
}
function responseHeaders(details,prefs,tor) {
  const headers={...details.responseHeaders};
  if((prefs.blockThirdPartyCookies||tor)&&details.resourceType!=='mainFrame'&&thirdParty(details.url,topURL(details)))for(const key of Object.keys(headers))if(key.toLowerCase()==='set-cookie')delete headers[key];
  return headers;
}
module.exports={TRACKERS,site,thirdParty,isLocal,tracker,compatibleUA,upgrade,topURL,requestDecision,requestHeaders,responseHeaders};
