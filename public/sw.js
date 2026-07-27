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
  // 아이폰(WebKit)은 event.data.json()이 간헐적으로 비어서 오는 사례가 있어
  // json() → JSON.parse(text()) → 원문 텍스트 순으로 물러가며 최대한 읽어낸다.
  let payload = {}
  let hadData = false
  if (event.data) {
    hadData = true
    try {
      payload = event.data.json()
    } catch {
      try {
        payload = JSON.parse(event.data.text())
      } catch {
        payload = { body: event.data.text() }
      }
    }
  }

  const title = payload.title || 'Future Me'
  // hadData=false 면 폰이 payload를 아예 못 받은 것(암호화/전달 문제)이다.
  // 이때 조용히 빈칸으로 두지 말고 그 사실이 드러나는 본문을 띄운다 — 진단이 된다.
  const body = payload.body || (hadData ? '' : '알림 내용을 불러오지 못했어')
  const options = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

/**
 * 알림을 누르면 앱을 연다.
 * - 앱이 안 떠 있으면: 새 창을 target으로 연다 (콜드 오픈 → 앱 기본 탭이 '오늘 홈').
 * - 이미 떠 있으면: 그 창을 앞으로 가져오고, "오늘 홈으로 가라"고 메시지를 보낸다.
 *   (이걸 안 하면 사용자가 보던 탭 그대로라, 알림을 눌러도 할 일이 안 보인다)
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'futureme-open', url: target })
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
