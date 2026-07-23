// 서버 발송 요청(2-a)의 결과 해석. 폰에서 알림이 안 왔을 때 **왜 안 왔는지**를
// 화면에서 알 수 있어야 한다 — 서버 로그를 열어보는 건 지웅님 몫이 아니다.
import { describe, expect, it } from 'bun:test'
import { describePushSendResult, toSendFailure } from '../src/lib/pushSend'

describe('toSendFailure', () => {
  it('구독이 없다는 응답을 알아본다', () => {
    expect(toSendFailure('{"error":"no_subscriptions"}').reason).toBe('no_subscriptions')
  })

  it('VAPID 미설정을 알아본다 — 2-a에서 제일 흔한 실수', () => {
    expect(toSendFailure('{"error":"vapid_not_configured"}').reason).toBe('vapid_not_configured')
  })

  it('인증 실패를 알아본다', () => {
    expect(toSendFailure('{"error":"not_authenticated"}').reason).toBe('not_logged_in')
  })

  it('모르는 오류는 원문을 남긴다', () => {
    const r = toSendFailure('Edge Function returned a non-2xx status code')
    expect(r.reason).toBe('failed')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toContain('non-2xx')
  })

  it('아무 정보가 없어도 던지지 않는다', () => {
    expect(toSendFailure(undefined).reason).toBe('failed')
  })
})

describe('describePushSendResult', () => {
  it('성공하면 앱을 끄라고 말한다 — 이게 시험의 핵심', () => {
    const msg = describePushSendResult({ ok: true, devices: 1, delaySeconds: 20 })
    expect(msg).toContain('20초')
    expect(msg).toContain('앱을 완전히 꺼')
  })

  it('기기가 여러 대면 몇 대인지 말한다', () => {
    expect(describePushSendResult({ ok: true, devices: 2, delaySeconds: 20 })).toContain('2대')
  })

  it('기기가 한 대면 대수를 굳이 말하지 않는다', () => {
    expect(describePushSendResult({ ok: true, devices: 1, delaySeconds: 20 })).not.toContain('1대')
  })

  it('주소가 없으면 먼저 발급하라고 안내한다', () => {
    expect(describePushSendResult({ ok: false, reason: 'no_subscriptions' })).toContain(
      '푸시 주소 발급',
    )
  })

  it('VAPID 미설정은 Supabase 비밀값이라고 짚어준다', () => {
    expect(describePushSendResult({ ok: false, reason: 'vapid_not_configured' })).toContain(
      'Supabase',
    )
  })

  it('알 수 없는 실패는 원문을 붙인다', () => {
    const msg = describePushSendResult({ ok: false, reason: 'failed', detail: 'boom' })
    expect(msg).toContain('boom')
  })
})
