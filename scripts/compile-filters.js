// Offline cache only: preserve the auditable text lists and their hashes.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {FiltersEngine}=require('@ghostery/adblocker');
const directory=path.join(__dirname,'../assets/adblock');const digest=data=>crypto.createHash('sha256').update(data).digest('hex');
const definitions={ads:{files:['easylist.txt','easylistchina.txt'],config:{loadExtendedSelectors:false}},tracking:{files:['easyprivacy.txt'],config:{loadCosmeticFilters:false}}};
const manifest={format:1,engine:'2.20.3'};
for(const [kind,{files,config}]of Object.entries(definitions)){
 const sources=files.map(file=>({file,bytes:fs.readFileSync(path.join(directory,file))}));const serialized=FiltersEngine.parse(sources.map(s=>s.bytes.toString('utf8')).join('\n'),config).serialize();
 fs.writeFileSync(path.join(directory,kind+'.bin'),serialized);manifest[kind]={rules:sources.map(s=>({file:s.file,sha256:digest(s.bytes)})),sha256:digest(serialized)};
 console.log(kind,serialized.byteLength,'bytes');
}
fs.writeFileSync(path.join(directory,'cache-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
