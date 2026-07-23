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

// ---------------------------------------------------------------------------
// 단계 1-a — 푸시 구독(= 이 기기의 "배송 주소") 발급.
//
// 단계 0에서 확인한 "서버 알림 지원 ●"은 브라우저에 PushManager가 **있다**는 뜻일 뿐이다.
// 실제로 주소가 발급되는지는 별개고, 아이폰은 여기서 막히는 경우가 있다.
// 그래서 저장(1-b)·서버 발송(2단계)보다 **발급 성공/실패부터** 눈으로 확인한다.
//
// 여기서도 서버는 안 쓴다. 발급받은 주소를 화면에 보여주고 끝이다.
// ---------------------------------------------------------------------------

/**
 * VAPID 공개키 — "이 알림은 Future Me가 보낸 게 맞다"는 신분증의 공개 쪽.
 * 앱 번들에 들어가도 되는 값이다(비밀키는 절대 안 된다 — 그건 2단계에서 서버에만).
 */
export function readVapidPublicKey(): string | null {
  const raw = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  const key = raw?.trim()
  return key ? key : null
}

/**
 * base64url로 적힌 VAPID 공개키를 브라우저가 요구하는 바이트로 바꾼다.
 *
 * 형식이 틀리면 여기서 null을 돌려준다. 브라우저에 그대로 넘기면
 * "InvalidAccessError" 같은 알아볼 수 없는 오류만 나오기 때문에,
 * **키를 잘못 붙여넣은 것**과 **기기가 못 하는 것**을 구분해주려는 것이다.
 */
export function decodeVapidPublicKey(base64url: string): Uint8Array<ArrayBuffer> | null {
  const trimmed = base64url.trim()
  if (!/^[A-Za-z0-9\-_]+$/.test(trimmed)) return null

  const padded = trimmed.padEnd(trimmed.length + ((4 - (trimmed.length % 4)) % 4), '=')
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')

  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return null
  }

  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

  // P-256 비압축 공개키: 0x04 + X(32) + Y(32) = 65바이트. 아니면 키가 아니다
  if (bytes.length !== 65 || bytes[0] !== 0x04) return null
  return bytes
}

/** 이미 발급된 구독이 지금 쓰는 키로 만들어진 것인지 (키를 바꾸면 재발급해야 한다) */
export function sameApplicationServerKey(
  existing: ArrayBuffer | null | undefined,
  current: Uint8Array,
): boolean {
  if (!existing) return false
  const a = new Uint8Array(existing)
  if (a.length !== current.length) return false
  return a.every((byte, i) => byte === current[i])
}

/**
 * 주소를 발급해준 푸시 서비스 이름. 아이폰이면 `web.push.apple.com`이 나온다.
 * — 애플 서버가 실제로 주소를 내줬다는 확인이라, 이 단계에서 제일 보고 싶은 값이다.
 */
export function pushServiceHost(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return '(주소 형식을 못 읽었어)'
  }
}

export type PushSubscribeResult =
  | { ok: true; endpoint: string; host: string; reused: boolean }
  | {
      ok: false
      reason: 'unsupported' | 'blocked' | 'denied' | 'no_key' | 'bad_key' | 'no_worker' | 'failed'
      detail?: string
    }

/** 발급 결과를 사람 말 한 줄로 */
export function describePushSubscribeResult(result: PushSubscribeResult): string {
  if (result.ok) {
    return result.reused
      ? `이미 발급돼 있던 주소를 찾았어 — ${result.host}`
      : `주소를 새로 발급받았어 — ${result.host}`
  }
  switch (result.reason) {
    case 'unsupported':
      return '이 브라우저는 서버 알림(푸시)을 지원하지 않아.'
    case 'blocked':
      return result.detail ?? '지금은 발급받을 수 없어.'
    case 'denied':
      return '먼저 위에서 알림을 켜야 주소를 발급받을 수 있어.'
    case 'no_key':
      return 'VAPID 공개키가 앱에 안 들어가 있어 — 환경변수 VITE_VAPID_PUBLIC_KEY를 설정해야 해.'
    case 'bad_key':
      return 'VAPID 공개키 형식이 잘못됐어 — 값을 다시 확인해줘.'
    case 'no_worker':
      return '알림 수신기가 아직 준비 안 됐어 — 새로고침하고 다시.'
    default:
      return `발급에 실패했어${result.detail ? ` (${result.detail})` : ''}`
  }
}

/** 지금 이 기기에 발급된 주소가 있으면 돌려준다 (화면에 현재 상태를 보여주려고) */
export async function readPushSubscription(): Promise<PushSubscription | null> {
  if (typeof window === 'undefined' || !('PushManager' in window)) return null
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return (await reg?.pushManager.getSubscription()) ?? null
  } catch {
    return null
  }
}

/**
 * 배송 주소 발급 — **1-a의 전부.**
 * 성공하면 주소를 돌려주기만 한다. 서버에 저장하는 건 1-b.
 */
export async function subscribeToPush(): Promise<PushSubscribeResult> {
  const env = readNotifyEnv()
  if (!env.supportsPush || !env.supportsServiceWorker) return { ok: false, reason: 'unsupported' }

  const blocker = describeNotifyBlocker(env)
  if (blocker) return { ok: false, reason: 'blocked', detail: blocker }
  if (env.permission !== 'granted') return { ok: false, reason: 'denied' }

  const rawKey = readVapidPublicKey()
  if (!rawKey) return { ok: false, reason: 'no_key' }
  const applicationServerKey = decodeVapidPublicKey(rawKey)
  if (!applicationServerKey) return { ok: false, reason: 'bad_key' }

  const reg = await readyNotifyWorker()
  if (!reg) return { ok: false, reason: 'no_worker' }

  try {
    const existing = await reg.pushManager.getSubscription()
    if (existing) {
      // 키가 그대로면 재사용. 키를 바꿨다면 옛 주소는 못 쓰니 버리고 다시 받는다
      if (sameApplicationServerKey(existing.options.applicationServerKey, applicationServerKey)) {
        return { ok: true, endpoint: existing.endpoint, host: pushServiceHost(existing.endpoint), reused: true }
      }
      await existing.unsubscribe()
    }

    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
    return { ok: true, endpoint: sub.endpoint, host: pushServiceHost(sub.endpoint), reused: false }
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) }
  }
}

/** 발급받은 주소 버리기 — 폰에서 처음부터 다시 시험해보려고 */
export async function unsubscribeFromPush(): Promise<boolean> {
  const sub = await readPushSubscription()
  if (!sub) return false
  try {
    return await sub.unsubscribe()
  } catch {
    return false
  }
}
