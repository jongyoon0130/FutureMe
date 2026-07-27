// 알림 예약표 생성(2-b)의 순수 로직. 여기가 틀리면 엉뚱한 시각·엉뚱한 할 일에
// 알림이 간다 — 서버는 이 표를 그대로 믿고 쏘기 때문에, 거르는 건 여기가 마지막이다.
import { describe, expect, it } from 'bun:test'
import { deriveReminders, normalizeTime } from '../src/lib/notifyReminders'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'

describe('normalizeTime', () => {
  it('올바른 HH:mm만 통과', () => {
    expect(normalizeTime('19:00')).toBe('19:00')
    expect(normalizeTime('00:00')).toBe('00:00')
    expect(normalizeTime('23:59')).toBe('23:59')
  })

  it('앞뒤 공백은 다듬는다', () => {
    expect(normalizeTime(' 09:30 ')).toBe('09:30')
  })

  it('범위를 벗어나면 버린다 (엉뚱한 시각 방지)', () => {
    expect(normalizeTime('24:00')).toBeNull()
    expect(normalizeTime('19:60')).toBeNull()
    expect(normalizeTime('7:00')).toBeNull() // 한 자리 시는 안 받는다
  })

  it('형식이 아니면 버린다', () => {
    expect(normalizeTime(undefined)).toBeNull()
    expect(normalizeTime('')).toBeNull()
    expect(normalizeTime('저녁 7시')).toBeNull()
    expect(normalizeTime('19시')).toBeNull()
  })
})

// --- deriveReminders : 일상 투두(periodKey=날짜)로 테스트한다 ---
// (목표 트리 경로는 날짜→슬롯 매핑이 복잡해 별도로 두고, 여기선 시각·중복·범위를 본다)

function misc(over: Partial<MiscTodoItem>): MiscTodoItem {
  return { id: 'm1', label: '러닝', done: false, tier: 'daily', periodKey: '2026-07-25', ...over }
}

const JUL25 = new Date('2026-07-25T12:00:00')

describe('deriveReminders', () => {
  it('시작·끝 시간이 둘 다 있으면 예약 두 줄', () => {
    const rows = deriveReminders([], [misc({ timeStart: '19:00', timeEnd: '20:00' })], JUL25, 1)
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.kind === 'start')?.fire_time).toBe('19:00')
    expect(rows.find((r) => r.kind === 'end')?.fire_time).toBe('20:00')
    expect(rows[0].fire_date).toBe('2026-07-25')
    expect(rows[0].item_id).toBe('m1')
    expect(rows[0].label).toBe('러닝')
  })

  it('시작만 있으면 한 줄', () => {
    const rows = deriveReminders([], [misc({ timeStart: '07:30' })], JUL25, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('start')
  })

  it('시간이 아예 없는 할 일은 예약을 안 만든다', () => {
    expect(deriveReminders([], [misc({})], JUL25, 1)).toHaveLength(0)
  })

  it('형식이 잘못된 시각은 조용히 버린다', () => {
    const rows = deriveReminders([], [misc({ timeStart: '저녁', timeEnd: '20:00' })], JUL25, 1)
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('end')
  })

  it('완료된 할 일도 예약은 만든다 (안 보냄 판단은 발송 직전 서버 몫)', () => {
    expect(deriveReminders([], [misc({ done: true, timeStart: '19:00' })], JUL25, 1)).toHaveLength(1)
  })

  it('알림을 끈 할 일(notifyOff)은 시간이 있어도 예약을 안 만든다', () => {
    const rows = deriveReminders(
      [],
      [misc({ notifyOff: true, timeStart: '19:00', timeEnd: '20:00' })],
      JUL25,
      1,
    )
    expect(rows).toHaveLength(0)
  })

  it('다른 날짜(periodKey)의 할 일은 그 날짜 범위에 들어와야 잡힌다', () => {
    const items = [
      misc({ id: 'a', periodKey: '2026-07-25', timeStart: '19:00' }),
      misc({ id: 'b', periodKey: '2026-07-26', timeStart: '08:00' }),
    ]
    // 하루만 보면 25일 것만
    expect(deriveReminders([], items, JUL25, 1).map((r) => r.item_id)).toEqual(['a'])
    // 이틀 보면 둘 다, 날짜도 각각
    const two = deriveReminders([], items, JUL25, 2)
    expect(two.map((r) => `${r.item_id}@${r.fire_date}`).sort()).toEqual([
      'a@2026-07-25',
      'b@2026-07-26',
    ])
  })

  it('같은 (날짜·할 일·종류)는 한 줄로 (중복 방지)', () => {
    // 같은 할 일이 두 번 들어와도
    const dup = [misc({ id: 'x', timeStart: '19:00' }), misc({ id: 'x', timeStart: '19:00' })]
    const rows = deriveReminders([], dup, JUL25, 1)
    expect(rows).toHaveLength(1)
  })
})
