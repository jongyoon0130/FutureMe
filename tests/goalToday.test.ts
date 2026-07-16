// '오늘' 판정 테스트 — 저장된 isToday 박제 버그의 재발 방지
import { describe, expect, it } from 'bun:test'
import { isDayToday } from '../src/lib/goalHierarchyEngine'

describe('isDayToday — 실시간 오늘 판정', () => {
  const friday = new Date('2026-07-17T09:00:00') // 금요일

  it('날짜와 요일이 모두 맞아야 오늘이다', () => {
    expect(isDayToday({ dateLabel: '7/17', dayOfWeek: '금' }, friday)).toBe(true)
    expect(isDayToday({ dateLabel: '7/16', dayOfWeek: '목' }, friday)).toBe(false)
  })

  it('목표를 만든 날(isToday 박제)과 무관하게 판정한다', () => {
    // 어제 만들어져 isToday=true로 저장된 날이라도, 오늘이 아니면 false
    const staleDay = { dateLabel: '7/16', dayOfWeek: '목', isToday: true }
    expect(isDayToday(staleDay, friday)).toBe(false)
  })
})
