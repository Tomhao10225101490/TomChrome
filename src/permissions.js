// In-memory grants are scoped to one WebContents, origin and current top-level document.
// A microphone grant must never implicitly become a camera grant.
function origin(value){try{const u=new URL(value);return /^https?:$/.test(u.protocol)?u.origin:null;}catch{return null}}
class TransientPermissions{
 constructor(){this.grants=new WeakMap();this.epochs=new WeakMap();}
 epoch(wc){return this.epochs.get(wc)||0;}
 invalidate(wc){this.grants.delete(wc);this.epochs.set(wc,this.epoch(wc)+1);}
 grant(wc,permission,url,details={}){
  const site=origin(url);if(!site)return false;
  const types=permission==='media'?(details.mediaTypes||[]).filter(t=>['audio','video'].includes(t)):[''];
  if(!types.length)return false;
  const grants=this.grants.get(wc)||new Set();for(const type of types)grants.add(JSON.stringify([site,permission,type]));this.grants.set(wc,grants);return true;
 }
 check(wc,permission,url,details={}){
  const site=origin(details.securityOrigin||url||details.requestingUrl),grants=this.grants.get(wc);if(!site||!grants)return false;
  if(permission==='media')return (['audio','video'].includes(details.mediaType)?[details.mediaType]:['audio','video']).every(type=>grants.has(JSON.stringify([site,permission,type])));
  return grants.has(JSON.stringify([site,permission,'']));
 }
}
module.exports={TransientPermissions};
