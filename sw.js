// ════════════════════════════════════════
//  MBSU Prod — Service Worker
// ════════════════════════════════════════
const CACHE = 'mbsu-v2';
const SHELL = ['./','./index.html','./icon-192.png','./icon-512.png'];

// ── INSTALL: cache app shell ─────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: clean old caches ───────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first, fallback cache ─
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  // Firebase / external APIs: network only
  if(e.request.url.includes('firestore') ||
     e.request.url.includes('googleapis') ||
     e.request.url.includes('gstatic')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
  );
});

// ── PUSH: FCM / Web Push 수신 ────────────
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'MBSU Prod';
  const opts = {
    body:  data.body  || '',
    icon:  './icon-192.png',
    badge: './icon-192.png',
    tag:   data.tag   || 'mbsu',
    data:  data,
    vibrate: [200, 100, 200],
    requireInteraction: false
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

// ── NOTIFICATION CLICK ───────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({type:'window', includeUncontrolled:true}).then(cls => {
      if(cls.length) return cls[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

// ── MESSAGE: 앱→SW 예약 알림 ─────────────
// 앱에서 { type:'SCHEDULE', id, title, body, fireAt } 메시지를 보내면
// 해당 시각에 알림을 표시합니다.
const _timers = {};
self.addEventListener('message', e => {
  if(!e.data) return;

  if(e.data.type === 'SCHEDULE') {
    const { id, title, body, fireAt } = e.data;
    const delay = fireAt - Date.now();
    if(delay < 0) return;           // 이미 지난 시각
    clearTimeout(_timers[id]);
    _timers[id] = setTimeout(() => {
      self.registration.showNotification(title, {
        body,
        icon:  './icon-192.png',
        badge: './icon-192.png',
        tag:   'ev-' + id,
        vibrate: [200, 100, 200]
      });
    }, delay);
  }

  if(e.data.type === 'CANCEL') {
    clearTimeout(_timers[e.data.id]);
    delete _timers[e.data.id];
  }
});
