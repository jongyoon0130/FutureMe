// ---------------------------------------------------------------------------
// Future Me 서비스 워커 — 알림 수신기
//
// 앱(탭)이 꺼져 있어도 살아남아서 알림을 받아 띄우는 작은 프로그램이다.
// 아이폰은 홈 화면에 설치된 상태에서만 이걸 통해 알림을 줄 수 있다.
//
// **캐시는 일부러 하지 않는다.** 오프라인 캐시를 넣으면 배포한 새 버전 대신
// 옛 화면이 뜨는 사고가 나기 쉽다. 지금 이 워커가 하는 일은 알림뿐이다.
// ---------------------------------------------------------------------------

self.addEventListener('install', () => {
  // 새 워커가 기다리지 않고 바로 교체되게
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

/**
 * 서버가 보낸 푸시 (2단계에서 실제로 쓰인다).
 * 지금은 받을 서버가 없지만, 형식만 맞춰 미리 넣어둔다.
 */
self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Future Me'
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/** 알림을 누르면 앱을 연다 (이미 열려 있으면 그 창으로) */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
