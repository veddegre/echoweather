const CACHE = 'echo-weather-v262';
const ICON_Q = '?v=255';
const ASSETS = [
  './app.css',
  './app.js',
  './tabs.js',
  './nav.js',
  './impact.js',
  './marine.js',
  './air.js',
  './forecast-extras.js',
  './mesonet.js',
  './climo.js',
  './obs.js',
  './aviation.js',
  './storm.js',
  './loc-compare.js',
  './radar.js',
  './boot.js',
  './manifest.json',
  './icon.svg' + ICON_Q,
  './icon-maskable.svg' + ICON_Q,
  './icon-192.png' + ICON_Q,
  './icon-512.png' + ICON_Q,
  './apple-touch-icon.png' + ICON_Q,
  './logo.svg' + ICON_Q
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

function isBrandingRequest(u){
  return isIconRequest(u)
    || /\/(icon|icon-maskable|logo)\.svg$/i.test(u.pathname)
    || u.pathname.endsWith('/manifest.json');
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if(e.request.method !== 'GET' || u.origin !== location.origin) return;

  if(isNavigate(e.request, u)){
    e.respondWith(fetch(e.request));
    return;
  }

  if(isAsset(u)){
    const isCode = /\.(js|css)$/.test(u.pathname);
    const fetchFresh = fetch(e.request).then(r => {
      if(!r.ok) return r;
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    });
    // ignoreSearch: precache entries and page requests may disagree on ?v= strings
    const cachedMatch = () => caches.match(e.request, { ignoreSearch: true });
    if(isCode){
      e.respondWith(fetchFresh.catch(cachedMatch));
      return;
    }
    e.respondWith(
      isBrandingRequest(u)
        ? fetchFresh.catch(cachedMatch)
        : cachedMatch().then(cached => fetchFresh.catch(() => cached))
    );
  }
});
