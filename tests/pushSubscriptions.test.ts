// 발급받은 주소를 서버에 저장하기 전에 거르는 부분 (단계 1-b).
// 여기가 틀리면 2단계에서 "왜 알림이 안 오지"로 돌아오게 된다 — 암호화 키가 빠진
// 주소는 저장돼도 발송이 안 되기 때문이다.
import { describe, expect, it } from 'bun:test'
import {
  describePushSaveResult,
  toPushRecord,
  type PushSaveResult,
} from '../src/lib/pushSubscriptions'

const ENDPOINT = 'https://web.push.apple.com/QFcJ0bVLr6dO0AwF8uW5pLhMOhK5wTo919ClFe4iAePZM'

function raw(over: Record<string, unknown> = {}) {
  return {
    endpoint: ENDPOINT,
    expirationTime: null,
    keys: { p256dh: 'BJxc...p256', auth: 'aUtH0' },
    ...over,
  }
}

describe('toPushRecord', () => {
  it('정상 구독은 저장할 형태로 바뀐다', () => {
    const r = toPushRecord(raw(), 'Asia/Seoul', 'iPhone')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.record.endpoint).toBe(ENDPOINT)
    expect(r.record.subscription.keys.p256dh).toBe('BJxc...p256')
    expect(r.record.subscription.keys.auth).toBe('aUtH0')
    expect(r.record.timezone).toBe('Asia/Seoul')
    expect(r.record.user_agent).toBe('iPhone')
  })

  it('endpoint를 구독 안에도 같이 넣는다 (서버가 그것만 보고 발송한다)', () => {
    const r = toPushRecord(raw(), 'Asia/Seoul', null)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.record.subscription.endpoint).toBe(r.record.endpoint)
  })

  it('endpoint가 없으면 거른다', () => {
    expect(toPushRecord(raw({ endpoint: '' }), 'Asia/Seoul', null)).toEqual({
      ok: false,
      reason: 'no_endpoint',
    })
    expect(toPushRecord(null, 'Asia/Seoul', null)).toEqual({ ok: false, reason: 'no_endpoint' })
  })

  it('공백뿐인 endpoint도 거른다', () => {
    expect(toPushRecord(raw({ endpoint: '   ' }), 'Asia/Seoul', null).ok).toBe(false)
  })

  it('암호화 키가 빠지면 거른다 — 저장돼도 발송이 안 되기 때문', () => {
    expect(toPushRecord(raw({ keys: undefined }), 'Asia/Seoul', null)).toEqual({
      ok: false,
      reason: 'no_keys',
    })
    expect(toPushRecord(raw({ keys: { p256dh: 'x' } }), 'Asia/Seoul', null).reason).toBe('no_keys')
    expect(toPushRecord(raw({ keys: { auth: 'y' } }), 'Asia/Seoul', null).reason).toBe('no_keys')
  })

  it('키가 빈 문자열이어도 거른다', () => {
    expect(toPushRecord(raw({ keys: { p256dh: '', auth: 'y' } }), 'Asia/Seoul', null).ok).toBe(false)
  })

  it('user_agent는 없어도 된다', () => {
    const r = toPushRecord(raw(), 'Asia/Seoul', null)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.record.user_agent).toBeNull()
  })

  it('해외 타임존도 그대로 실린다 (서버가 이걸로 현지 시각을 계산한다)', () => {
    const r = toPushRecord(raw(), 'America/Los_Angeles', null)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.record.timezone).toBe('America/Los_Angeles')
  })
})

describe('describePushSaveResult', () => {
  it('성공하면 서버가 이 기기를 안다고 말한다', () => {
    expect(describePushSaveResult({ ok: true, endpoint: ENDPOINT })).toContain('저장했어')
  })

  it('로그인이 필요한 이유까지 말한다', () => {
    expect(describePushSaveResult({ ok: false, reason: 'not_logged_in' })).toContain('로그인')
  })

  it('키가 빠진 주소는 다시 발급받으라고 말한다', () => {
    const msg = describePushSaveResult({ ok: false, reason: 'bad_subscription' })
    expect(msg).toContain('다시 발급')
  })

  it('알 수 없는 실패는 원문을 붙인다', () => {
    const r: PushSaveResult = { ok: false, reason: 'failed', detail: 'permission denied for table' }
    expect(describePushSaveResult(r)).toContain('permission denied')
  })
})
