// ---------------------------------------------------------------------------
// 알림 — 단계 0: "이 기기에서 알림이 뜨긴 하나"를 확인하는 데까지.
//
// 서버는 아직 없다. 여기 있는 건 전부 기기 안에서 끝나는 일이다:
//   ① 서비스 워커(알림 수신기) 등록  ② 권한 요청  ③ 테스트 알림 띄우기
//
// 아이폰 주의점 두 가지 — 이게 이 단계의 전부라고 해도 된다:
//   - **홈 화면에 추가한 상태**에서만 알림이 된다. 사파리 탭에서는 권한조차 못 받는다
//   - `new Notification()` 은 iOS에서 안 된다. 반드시 서비스 워커의
//     `registration.showNotification()` 을 써야 한다
// ---------------------------------------------------------------------------

export type NotifyPermission = NotificationPermission | 'unsupported'

export interface NotifyEnv {
  /** 홈 화면에 설치된 앱으로 열렸나 (사파리 탭이면 false) */
  standalone: boolean
  isIOS: boolean
  supportsServiceWorker: boolean
  supportsNotification: boolean
  /** 서버 푸시(2단계)까지 가능한가 — 설치된 PWA에서만 true가 된다 */
  supportsPush: boolean
  permission: NotifyPermission
  /** 보안 컨텍스트(https 또는 localhost) — 아니면 아무것도 안 된다 */
  secure: boolean
}

const SW_URL = '/sw.js'

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS는 navigator.standalone, 나머지는 display-mode 미디어쿼리
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return iosStandalone || displayMode
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // iPadOS는 데스크톱 사파리로 위장하므로 터치 지원 여부까지 본다
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

export function readNotifyEnv(): NotifyEnv {
  const supportsServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
  const supportsNotification = typeof window !== 'undefined' && 'Notification' in window
  const supportsPush = typeof window !== 'undefined' && 'PushManager' in window

  return {
    standalone: detectStandalone(),
    isIOS: detectIOS(),
    supportsServiceWorker,
    supportsNotification,
    supportsPush,
    permission: supportsNotification ? Notification.permission : 'unsupported',
    secure: typeof window !== 'undefined' && window.isSecureContext,
  }
}

/** 서비스 워커 등록 — 앱 시작할 때 한 번. 실패해도 앱은 그대로 돌아간다 */
export async function registerNotifyWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  } catch (e) {
    console.info('[FutureMe/notify] 서비스 워커 등록 실패', e)
    return null
  }
}

/** 등록된 워커가 실제로 준비될 때까지 기다린다 */
export async function readyNotifyWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    const existing = await navigator.serviceWorker.getRegistration('/')
    if (existing) return existing
    await registerNotifyWorker()
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/**
 * 알림 권한 요청 — **반드시 버튼 클릭 같은 사용자 조작 안에서** 불러야 한다.
 * (그렇지 않으면 브라우저가 조용히 거절한다)
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export type TestNotifyResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'denied' | 'no_worker' | 'failed'; detail?: string }

/**
 * 테스트 알림 — delayMs 뒤에 뜬다.
 * 기다리는 동안 앱을 닫아보면, 앱이 꺼져도 알림이 오는지까지 확인할 수 있다.
 * (단계 0은 여기까지다. 진짜 서버 발송은 2단계)
 */
export async function showTestNotification(delayMs = 5000): Promise<TestNotifyResult> {
  const env = readNotifyEnv()
  if (!env.supportsNotification || !env.supportsServiceWorker) {
    return { ok: false, reason: 'unsupported' }
  }
  if (env.permission !== 'granted') {
    return { ok: false, reason: 'denied' }
  }

  const reg = await readyNotifyWorker()
  if (!reg) return { ok: false, reason: 'no_worker' }

  await new Promise((resolve) => setTimeout(resolve, delayMs))

  try {
    await reg.showNotification('Future Me', {
      body: '알림 테스트 — 여기까지 오면 성공이야.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'futureme-test',
      data: { url: '/' },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }
  }
}

/** 지금 이 기기에서 알림을 켤 수 있는지 + 안 되면 왜 안 되는지 한 줄 */
export function describeNotifyBlocker(env: NotifyEnv): string | null {
  if (!env.secure) return 'https로 열어야 알림을 켤 수 있어 (localhost는 예외)'
  if (!env.supportsNotification || !env.supportsServiceWorker) {
    return '이 브라우저는 알림을 지원하지 않아'
  }
  if (env.isIOS && !env.standalone) {
    return '아이폰은 홈 화면에 추가한 뒤에만 알림을 켤 수 있어'
  }
  if (env.permission === 'denied') {
    return '알림이 차단돼 있어 — 브라우저(또는 iOS 설정 → 알림)에서 허용으로 바꿔야 해'
  }
  return null
}
