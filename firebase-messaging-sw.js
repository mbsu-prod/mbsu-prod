// ════════════════════════════════════════
//  MBSU Prod — Unified Service Worker
//  PWA 캐싱 + FCM 푸시 수신
// ════════════════════════════════════════

// ── FCM 백그라운드 푸시 수신 ──────────────
// Firebase SDK 없이 브라우저 기본 push 이벤트로 직접 처리
// → SDK가 push를 가로채는 문제 없이 안정적으로 동작
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try { payload = event.data.json(); } catch(e) { return; }

  // webpush.notification 또는 data 필드에서 제목/내용 추출
  const n = (payload.notification) || {};
  const d = payload.data || {};
  const title   = n.title   || d.title   || 'MBSU Prod';
  const body    = n.body    || d.body    || '';
  const eventId = d.eventId || '';

  event.waitUntil(
    // 포그라운드 탭이 있으면 OS 알림 생략 (앱 내 토스트로 처리)
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const hasFocus = clients.some(c => c.visibilityState === 'visible');
        if (hasFocus) return;
        return self.registration.showNotification(title, {
          body,
          icon:    './icon-192.png',
          badge:   './icon-192.png',
          tag:     eventId ? 'mbsu-' + eventId : 'mbsu-update',
          data:    d,
          vibrate: [200, 100, 200]
        });
      })
  );
});

// ── 알림 클릭 → 앱 열기 ──────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow('./');
    })
  );
});

// ── PWA 캐시 ─────────────────────────────
const CACHE = 'mbsu-v4';
const SHELL = ['./', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('firestore') ||
      e.request.url.includes('googleapis') ||
      e.request.url.includes('gstatic') ||
      e.request.url.includes('firebase')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── 앱→SW 예약 알림 ──────────────────────
const _timers = {};
self.addEventListener('message', e => {
  if (!e.data) return;
  if (e.data.type === 'SCHEDULE') {
    const { id, title, body, fireAt } = e.data;
    const delay = fireAt - Date.now();
    if (delay < 0) return;
    clearTimeout(_timers[id]);
    _timers[id] = setTimeout(() => {
      self.registration.showNotification(title, {
        body, icon: './icon-192.png', badge: './icon-192.png',
        tag: 'ev-' + id, vibrate: [200, 100, 200]
      });
    }, delay);
  }
  if (e.data.type === 'CANCEL') {
    clearTimeout(_timers[e.data.id]);
    delete _timers[e.data.id];
  }
});
