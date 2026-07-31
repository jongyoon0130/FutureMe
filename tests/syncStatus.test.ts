// 클라우드 저장 상태 배너 로직 테스트.
// 핵심 보장:
//   1) 첫 실패는 배너를 띄우지 않는다 (일시 깜빡임에 겁주지 않음)
//   2) 재시도까지 실패하면(2회째) 배너를 켠다
//   3) 성공하면 즉시 끄고 재시도 타이머를 정리한다
//   4) 실패 시 등록된 재시도 함수를 백오프로 호출한다 (자가복구)
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  isCloudPushFailing,
  noteCloudPushFailure,
  noteCloudPushSuccess,
  registerCloudRetry,
  __resetCloudPushStatusForTest,
} from '../src/lib/syncStatus'

beforeEach(() => __resetCloudPushStatusForTest())
afterEach(() => __resetCloudPushStatusForTest())

describe('클라우드 저장 상태', () => {
  it('첫 실패는 배너를 띄우지 않는다', () => {
    noteCloudPushFailure()
    expect(isCloudPushFailing()).toBe(false)
  })

  it('재시도까지 실패하면(2회째) 배너를 켠다', () => {
    noteCloudPushFailure()
    noteCloudPushFailure()
    expect(isCloudPushFailing()).toBe(true)
  })

  it('성공하면 배너를 끈다', () => {
    noteCloudPushFailure()
    noteCloudPushFailure()
    expect(isCloudPushFailing()).toBe(true)
    noteCloudPushSuccess()
    expect(isCloudPushFailing()).toBe(false)
  })

  it('성공 후 다시 첫 실패는 유예된다 (카운터 초기화)', () => {
    noteCloudPushFailure()
    noteCloudPushFailure()
    noteCloudPushSuccess()
    noteCloudPushFailure()
    expect(isCloudPushFailing()).toBe(false)
  })

  it('실패하면 등록된 재시도 함수를 백오프로 호출한다', async () => {
    let calls = 0
    registerCloudRetry(async () => {
      calls += 1
    })
    noteCloudPushFailure()
    // 첫 백오프는 3s — 즉시는 안 불린다
    expect(calls).toBe(0)
    await new Promise((r) => setTimeout(r, 3100))
    expect(calls).toBe(1)
  })

  it('성공하면 예약된 재시도를 취소한다', async () => {
    let calls = 0
    registerCloudRetry(async () => {
      calls += 1
    })
    noteCloudPushFailure()
    noteCloudPushSuccess()
    await new Promise((r) => setTimeout(r, 3100))
    expect(calls).toBe(0)
  })
})
