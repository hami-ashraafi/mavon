const CACHE='mavon-shell-v72';
const FILES=['./','./index.html','./app.js','./sync.js','./auth.js','./manifest.json','./icon.svg','./icon-180.png','./icon-192.png','./icon-512.png','./install.html'];
const known=new Set(FILES.map(path=>new URL(path,self.location.href).pathname));
async function cacheable(response,request){
 if(!response.ok||response.redirected||response.type==='opaque')return false;
 if(request.mode==='navigate'||new URL(request.url).pathname.endsWith('.html')||new URL(request.url).pathname===new URL('./',self.location.href).pathname){
  const body=await response.clone().text();return body.includes('ماوون')&&(body.includes('src="app.js"')||body.includes('id="install"'));
 }
 return true;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.all(FILES.map(async path=>{const request=new Request(new URL(path,self.location.href));try{const response=await fetch(request);if(await cacheable(response,request))await cache.put(request,response)}catch{}}))})()));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mavon-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin||!known.has(url.pathname))return;
 event.respondWith((async()=>{try{const response=await fetch(event.request);if(await cacheable(response,event.request)){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone())}return response}catch{const cache=await caches.open(CACHE);return await cache.match(event.request)|| (event.request.mode==='navigate'?await cache.match('./index.html'):null)||Response.error()}})());
});
