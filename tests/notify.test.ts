// 알림을 못 켜는 이유를 사람 말로 돌려주는 부분
// 여기가 틀리면 아이폰에서 "왜 안 되는지 모른 채" 막히게 된다 — 단계 0의 핵심.
import { describe, expect, it } from 'bun:test'
import {
  decodeVapidPublicKey,
  describeNotifyBlocker,
  describePushSubscribeResult,
  pushServiceHost,
  sameApplicationServerKey,
  type NotifyEnv,
  type PushSubscribeResult,
} from '../src/lib/notify'

function env(over: Partial<NotifyEnv> = {}): NotifyEnv {
  return {
    standalone: true,
    isIOS: false,
    supportsServiceWorker: true,
    supportsNotification: true,
    supportsPush: true,
    permission: 'default',
    secure: true,
    ...over,
  }
}

describe('describeNotifyBlocker', () => {
  it('다 갖춰졌으면 막는 게 없다', () => {
    expect(describeNotifyBlocker(env())).toBeNull()
    expect(describeNotifyBlocker(env({ permission: 'granted' }))).toBeNull()
  })

  it('https가 아니면 그것부터 말한다', () => {
    expect(describeNotifyBlocker(env({ secure: false }))).toContain('https')
  })

  it('아이폰인데 홈 화면에 설치 안 했으면 그걸 말한다', () => {
    const msg = describeNotifyBlocker(env({ isIOS: true, standalone: false }))
    expect(msg).toContain('홈 화면')
  })

  it('아이폰이어도 설치했으면 통과', () => {
    expect(describeNotifyBlocker(env({ isIOS: true, standalone: true }))).toBeNull()
  })

  it('아이폰이 아니면 설치 안 해도 통과 (안드로이드·PC)', () => {
    expect(describeNotifyBlocker(env({ isIOS: false, standalone: false }))).toBeNull()
  })

  it('차단된 상태면 설정에서 풀라고 말한다', () => {
    expect(describeNotifyBlocker(env({ permission: 'denied' }))).toContain('차단')
  })

  it('브라우저가 지원 자체를 안 하면 그걸 말한다', () => {
    expect(describeNotifyBlocker(env({ supportsNotification: false }))).toContain('지원')
    expect(describeNotifyBlocker(env({ supportsServiceWorker: false }))).toContain('지원')
  })

  it('막는 이유가 여러 개면 먼저 풀어야 할 것부터 (https → 설치 → 권한)', () => {
    const all = env({ secure: false, isIOS: true, standalone: false, permission: 'denied' })
    expect(describeNotifyBlocker(all)).toContain('https')
  })
})

// --- 단계 1-a ---------------------------------------------------------------

// 실제로 생성한 P-256 공개키 (0x04 + X + Y = 65바이트)
const VALID_KEY = 'BGNooDTd6YIuht_Gq7sSotl-fwrWMNPRA4rBvuSRIyR-0hcqq637nTBeEZ6ZRW2ElHL0eP8NezZqndnMgzczQu0'

describe('decodeVapidPublicKey', () => {
  it('정상 키는 65바이트로 풀리고 0x04로 시작한다', () => {
    const bytes = decodeVapidPublicKey(VALID_KEY)
    expect(bytes).not.toBeNull()
    expect(bytes!.length).toBe(65)
    expect(bytes![0]).toBe(0x04)
  })

  it('앞뒤 공백은 무시한다 (환경변수에 딸려오기 쉬운 값)', () => {
    expect(decodeVapidPublicKey(`  ${VALID_KEY}\n`)).not.toBeNull()
  })

  it('빈 값·엉뚱한 문자열은 null', () => {
    expect(decodeVapidPublicKey('')).toBeNull()
    expect(decodeVapidPublicKey('여기에-키-붙여넣기')).toBeNull()
  })

  it('표준 base64(+, /, =)로 붙여넣으면 null — base64url이어야 한다', () => {
    expect(decodeVapidPublicKey('BGNooDTd6YIuht+Gq7sSotl/fwrW=')).toBeNull()
  })

  it('길이가 65바이트가 아니면 null (잘려 붙여넣은 키를 잡는다)', () => {
    expect(decodeVapidPublicKey(VALID_KEY.slice(0, 40))).toBeNull()
  })
})

describe('sameApplicationServerKey', () => {
  const key = decodeVapidPublicKey(VALID_KEY)!

  it('구독이 없으면 false', () => {
    expect(sameApplicationServerKey(null, key)).toBe(false)
    expect(sameApplicationServerKey(undefined, key)).toBe(false)
  })

  it('같은 키면 true', () => {
    expect(sameApplicationServerKey(key.slice().buffer, key)).toBe(true)
  })

  it('키를 바꿨으면 false — 옛 주소를 버리고 다시 받아야 한다', () => {
    const other = key.slice()
    other[64] ^= 0xff
    expect(sameApplicationServerKey(other.buffer, key)).toBe(false)
  })

  it('길이가 다르면 false', () => {
    expect(sameApplicationServerKey(new Uint8Array(10).buffer, key)).toBe(false)
  })
})

describe('pushServiceHost', () => {
  it('아이폰이면 애플 푸시 서버가 나온다 — 이 단계에서 보고 싶은 값', () => {
    expect(pushServiceHost('https://web.push.apple.com/QF8x…')).toBe('web.push.apple.com')
  })

  it('크롬이면 구글', () => {
    expect(pushServiceHost('https://fcm.googleapis.com/fcm/send/abc')).toBe('fcm.googleapis.com')
  })

  it('주소 형식이 아니어도 던지지 않는다', () => {
    expect(pushServiceHost('주소아님')).toContain('못 읽었어')
  })
})

describe('describePushSubscribeResult', () => {
  it('성공하면 어느 서버가 줬는지 말한다', () => {
    const r: PushSubscribeResult = {
      ok: true,
      endpoint: 'https://web.push.apple.com/x',
      host: 'web.push.apple.com',
      reused: false,
    }
    expect(describePushSubscribeResult(r)).toContain('web.push.apple.com')
    expect(describePushSubscribeResult({ ...r, reused: true })).toContain('이미')
  })

  it('키가 없는 것과 형식이 틀린 것을 구분해서 말한다', () => {
    expect(describePushSubscribeResult({ ok: false, reason: 'no_key' })).toContain(
      'VITE_VAPID_PUBLIC_KEY',
    )
    expect(describePushSubscribeResult({ ok: false, reason: 'bad_key' })).toContain('형식')
  })

  it('막힌 이유가 있으면 그 이유를 그대로 전한다', () => {
    const msg = describePushSubscribeResult({
      ok: false,
      reason: 'blocked',
      detail: '아이폰은 홈 화면에 추가한 뒤에만 알림을 켤 수 있어',
    })
    expect(msg).toContain('홈 화면')
  })

  it('권한부터 켜라고 말한다', () => {
    expect(describePushSubscribeResult({ ok: false, reason: 'denied' })).toContain('알림을 켜야')
  })

  it('브라우저가 못 하면 그렇게 말한다', () => {
    expect(describePushSubscribeResult({ ok: false, reason: 'unsupported' })).toContain('지원하지')
  })

  it('알 수 없는 실패는 원문을 붙여서 보여준다 (폰에서 원인 추적용)', () => {
    const msg = describePushSubscribeResult({
      ok: false,
      reason: 'failed',
      detail: 'AbortError',
    })
    expect(msg).toContain('AbortError')
  })
})
