// オフラインでも学習できるよう、アプリ一式をキャッシュする（ネット優先・失敗時にキャッシュ）
const CACHE = "lang90-v6";
const FILES = ["./", "index.html", "style.css", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png",
  "data/meanings.js", "data/lang/zh.js", "data/days.js", "data/patterns.js", "data/grammar.js",
  "data/homophones.js", "data/vocab.js", "data/scenes.js", "data/langs.js",
  "sync/app.js", "sync/firebase-config.js", "sync/core/cloud-sync.js", "sync/core/merge-deep.js", "sync/core/sync-card.js",
  "vendor/firebase/firebase-app.js", "vendor/firebase/firebase-auth.js", "vendor/firebase/firebase-firestore-lite.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
