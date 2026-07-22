// 알림을 못 켜는 이유를 사람 말로 돌려주는 부분
// 여기가 틀리면 아이폰에서 "왜 안 되는지 모른 채" 막히게 된다 — 단계 0의 핵심.
import { describe, expect, it } from 'bun:test'
import { describeNotifyBlocker, type NotifyEnv } from '../src/lib/notify'

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
