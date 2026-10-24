export function validateConnection(input){
 if(!input||typeof input!=='object')throw Error('连接配置格式不正确');
 const url=new URL(input.endpoint);
 if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('请使用不含路径的 HTTPS 服务地址');
 if(typeof input.token!=='string'||input.token.length<16||input.token.length>512||/[\s\x00-\x1f]/.test(input.token))throw Error('连接配置中的访问令牌无效');
 return {endpoint:url.origin,token:input.token};
}
export function parseConnectionFragment(fragment){
 const params=new URLSearchParams(fragment.replace(/^#/,''));
 if(!params.has('liveEndpoint'))return null;
 return validateConnection({endpoint:params.get('liveEndpoint'),token:params.get('liveToken')});
}
