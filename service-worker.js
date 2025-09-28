/* Service Worker - precache assets */
const CACHE_NAME = 'tapgrid-final-v1758468830';
const ASSETS = [
  "./app.js",
  "./assets/final-reward.png",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./index.html",
  "./manifest.json",
  "./offline.html"
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const req = event.request;
  if(req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')){
    event.respondWith(caches.match('./index.html').then(resp => resp || fetch(req).catch(()=>caches.match('./offline.html'))));
    return;
  }
  event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(networkResp => { if(networkResp && networkResp.status === 200) caches.open(CACHE_NAME).then(cache => cache.put(req, networkResp.clone())); return networkResp; }).catch(()=>caches.match('./offline.html'))));
});
