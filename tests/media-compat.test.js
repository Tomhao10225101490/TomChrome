const {test}=require('node:test');const assert=require('node:assert/strict');const privacy=require('../src/privacy');const {defaults}=require('../src/core');
test('MissAV main-media compatibility is restricted to its known CDN with existing Origin; ads/cookies/Tor stay protected',()=>{
 const source='https://missav.ws/same-252?private=do-not-send';const request={url:'https://surrit.com/anonymous-fixture/playlist.m3u8',resourceType:'xhr',referrer:source,requestHeaders:{Origin:'https://missav.ws',Referer:source,Cookie:'do-not-send'}};
 const headers=privacy.requestHeaders(request,defaults,null);assert.equal(headers.Referer,'https://missav.ws/');assert.equal(headers.Cookie,undefined);assert.equal(headers.DNT,'1');assert.equal(headers['Sec-GPC'],'1');
 for(const change of [{url:'https://surrit.com.attacker.example/playlist.m3u8'},{url:'https://other.example/playlist.m3u8'},{url:'http://surrit.com/playlist.m3u8'},{resourceType:'script'},{initiatorOrigin:'https://other.example'},{requestHeaders:{Referer:source}},{requestHeaders:{Origin:'https://other.example',Referer:source}}])assert.equal(privacy.requestHeaders({...request,...change},defaults,null).Referer,undefined);
 assert.equal(privacy.requestHeaders(request,defaults,{phase:'connected'}).Referer,undefined);
 const adblock=require('../src/adblock');assert.equal(adblock.popupBlocked('https://advertising.example','https://missav.ws/same-252',defaults,'new-window'),true);assert.equal(adblock.match({url:'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',resourceType:'script',referrer:source},defaults),'ads');
});
test('Bilibili media CDN gets only an Origin it already received, never video paths/cookies or a Tor exception',()=>{
 const source='https://www.bilibili.com/video/BVexample/?private-query=never-send';
 const request={url:'https://upos-sz-mirror.bilivideo.com/media/test.m4s',resourceType:'xhr',referrer:source,requestHeaders:{Origin:'https://www.bilibili.com',Referer:source,Cookie:'private-cookie'}};
 const result=privacy.requestHeaders(request,defaults,null);assert.equal(result.Referer,'https://www.bilibili.com/');assert.equal(result.Cookie,undefined);assert.equal(result.DNT,'1');assert.equal(result['Sec-GPC'],'1');
 for(const change of [{url:'https://bilivideo.com.attacker.example/test'},{url:'http://upos-sz-mirror.bilivideo.com/test'},{resourceType:'script'},{initiatorOrigin:'https://unrelated.example'}, {requestHeaders:{Referer:source}}, {requestHeaders:{Referer:source,Origin:'https://unrelated.example'}}])assert.equal(privacy.requestHeaders({...request,...change},defaults,null).Referer,undefined);
 assert.equal(privacy.requestHeaders(request,defaults,{phase:'connected'}).Referer,undefined);
});
