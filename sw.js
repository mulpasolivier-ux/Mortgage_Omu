const CACHE = "mortgage-tool-v2-cache-1";
const ASSETS = ["./","./index.html","./style.css","./app.js","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",(e)=>{e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);self.skipWaiting();})());});
self.addEventListener("activate",(e)=>{e.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null));self.clients.claim();})());});
self.addEventListener("fetch",(e)=>{const r=e.request;if(r.method!=="GET")return;
e.respondWith((async()=>{const c=await caches.open(CACHE);const cached=await c.match(r);if(cached)return cached;
try{const fresh=await fetch(r);if(fresh&&fresh.status===200)c.put(r,fresh.clone());return fresh;}
catch(err){if(r.mode==="navigate")return c.match("./index.html");return cached||Response.error();}})());});
