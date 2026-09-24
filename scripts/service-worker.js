// The Substitute's service worker, deployed as sw.js by scripts/build-site.mjs, which fills in
// BUILD with the build's id and a content hash for every file. It is only registered on a
// deployed build (see src/offline.js), never by `npm start`.
//
// - Models, fonts, three.js and every other file listed in BUILD are cached under their content
//   hash, so a repeat visit loads them from this cache and a redeploy only downloads the files
//   whose content changed.
// - The page itself is fetched from the network first, so a new deploy shows up on the next
//   visit; it comes from the cache only when the network fails.
const BUILD = /* BUILD */ { id: 'dev', files: {} } /* /BUILD */;
const CACHE = 'substitute';

const scope = new URL(self.registration.scope);

// the build-relative path of a request, or null if it isn't one of the site's files
function sitePath(request) {
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return null;
  const path = url.pathname.slice(scope.pathname.length) || 'index.html';
  return path.endsWith('/') ? path + 'index.html' : path;
}

function versionedKey(path) {
  return new URL(path + '?v=' + BUILD.files[path], scope).href;
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  // forget cached files that are not part of this build
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const keep = new Set(Object.keys(BUILD.files).map(versionedKey));
    for (const request of await cache.keys()) {
      if (!keep.has(request.url)) await cache.delete(request);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const path = sitePath(request);
  if (!path || !(path in BUILD.files)) return;
  const key = versionedKey(path);
  if (request.mode === 'navigate' || path === 'index.html') {
    event.respondWith(networkFirst(request, key));
  } else {
    event.respondWith(cacheFirst(request, key));
  }
});

async function cacheFirst(request, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(key, response.clone());
  return response;
}

async function networkFirst(request, key) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(key, response.clone());
    return response;
  } catch (err) {
    const hit = await cache.match(key);
    if (hit) return hit;
    return Response.error(err);
  }
}
