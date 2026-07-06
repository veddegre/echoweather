const CACHE = 'echo-weather-v115';
const ICON_Q = '?v=86';
const ASSETS = [
  './manifest.json',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png' + ICON_Q,
  './icon-512.png' + ICON_Q,
  './apple-touch-icon.png' + ICON_Q,
  './apple-touch-icon.png',
  './logo.svg'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if(e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if(e.data?.type === 'CLEAR_CACHE'){
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});

function isNavigate(req, u){
  return req.mode === 'navigate'
    || u.pathname === '/'
    || u.pathname.endsWith('/index.html');
}

function isAsset(u){
  const p = u.pathname;
  return ASSETS.some(a => p.endsWith(a.replace('./', '').split('?')[0]));
}

function isIconRequest(u){
  return /\/(apple-touch-icon|icon-192|icon-512)\.png$/i.test(u.pathname);
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;

  if(isNavigate(e.request, u)){
    e.respondWith(fetch(e.request));
    return;
  }

  if(isAsset(u)){
    const fetchFresh = fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    });
    e.respondWith(
      isIconRequest(u)
        ? fetchFresh.catch(() => caches.match(e.request))
        : caches.match(e.request).then(cached => fetchFresh.catch(() => cached))
    );
  }
});
