const {randomUUID}=require('node:crypto');
const initialShortcuts=[
 {id:'default-bing',title:'必应',url:'https://www.bing.com/'},
 {id:'default-google',title:'Google',url:'https://www.google.com/'},
 {id:'default-wikipedia',title:'维基百科',url:'https://zh.wikipedia.org/'},
 {id:'default-bilibili',title:'哔哩哔哩',url:'https://www.bilibili.com/'},
 {id:'default-github',title:'GitHub',url:'https://github.com/'}
];
function validateShortcut(payload){
 const title=String(payload?.title||'').trim();let input=String(payload?.url||'').trim();
 if(!title||title.length>60)throw Error('名称须为 1–60 个字符');
 if(!/^[a-z][\w+.-]*:/i.test(input))input='https://'+input;
 let url;try{url=new URL(input);}catch{throw Error('请输入有效网址');}
 if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.href.length>2048)throw Error('快捷方式只支持不含账号密码的 HTTP / HTTPS 网址');
 return {title,url:url.href};
}
function saveShortcut(list,payload){
 const value=validateShortcut(payload);const index=list.findIndex(s=>s.id===payload?.id);
 if(payload?.id&&index<0)throw Error('该快捷方式已被删除');
 if(index<0&&list.length>=10)throw Error('最多添加 10 个快捷方式');
 if(index>=0)list[index]={id:list[index].id,...value};else list.push({id:randomUUID(),...value});
 return list;
}
module.exports={initialShortcuts,validateShortcut,saveShortcut};
