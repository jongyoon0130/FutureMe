// 반복 일정(루틴) — "무슨 날에 할 일을 만들지"의 순수 로직
// 여기가 틀리면 안 만들어야 할 날에 할 일이 생기거나(압박), 만들어야 할 날에 안 생긴다.
import { describe, expect, it } from 'bun:test'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'
import {
  describeRoutineDays,
  pendingRoutineOccurrences,
  routineOccursOn,
  type MiscRoutine,
} from '../src/lib/goalRoutines'

const WED = new Date('2026-07-22T09:00:00') // 수요일

function routine(over: Partial<MiscRoutine> = {}): MiscRoutine {
  return {
    id: 'r1',
    label: '운동',
    days: [2, 4], // 화·목
    startKey: '2026-07-22',
    skips: [],
    ...over,
  }
}

function item(over: Partial<MiscTodoItem> = {}): MiscTodoItem {
  return { id: 'i1', label: '운동', done: false, tier: 'daily', periodKey: '2026-07-23', ...over }
}

describe('routineOccursOn', () => {
  it('정한 요일에만 생긴다', () => {
    const r = routine()
    expect(routineOccursOn(r, '2026-07-23')).toBe(true) // 목
    expect(routineOccursOn(r, '2026-07-24')).toBe(false) // 금
    expect(routineOccursOn(r, '2026-07-28')).toBe(true) // 화
  })

  it('시작일 전에는 안 생긴다', () => {
    expect(routineOccursOn(routine({ startKey: '2026-08-01' }), '2026-07-23')).toBe(false)
  })

  it('"이 날만 빼기"한 날은 건너뛴다', () => {
    expect(routineOccursOn(routine({ skips: ['2026-07-23'] }), '2026-07-23')).toBe(false)
    expect(routineOccursOn(routine({ skips: ['2026-07-23'] }), '2026-07-28')).toBe(true)
  })

  it('반복을 끝낸 뒤로는 안 생긴다', () => {
    const r = routine({ endedKey: '2026-07-23' })
    expect(routineOccursOn(r, '2026-07-23')).toBe(true)
    expect(routineOccursOn(r, '2026-07-28')).toBe(false)
  })
})

describe('pendingRoutineOccurrences', () => {
  it('오늘부터 앞으로 2주치만 만든다 — 지난 날은 만들지 않는다', () => {
    const out = pendingRoutineOccurrences([routine()], [], WED)
    const keys = out.map((o) => o.dateKey)

    expect(keys).toEqual(['2026-07-23', '2026-07-28', '2026-07-30', '2026-08-04'])
    expect(keys.every((k) => k >= '2026-07-22')).toBe(true)
  })

  it('이미 만들어둔 날은 다시 만들지 않는다 (앱을 여러 번 열어도 하나)', () => {
    const existing = [item({ periodKey: '2026-07-23', routineId: 'r1' })]
    const out = pendingRoutineOccurrences([routine()], existing, WED)

    expect(out.map((o) => o.dateKey)).toEqual(['2026-07-28', '2026-07-30', '2026-08-04'])
  })

  it('루틴에서 안 나온 같은 날 할 일이 있어도 따로 만든다', () => {
    const unrelated = [item({ id: 'x', periodKey: '2026-07-23' })] // routineId 없음
    const out = pendingRoutineOccurrences([routine()], unrelated, WED)

    expect(out.map((o) => o.dateKey)).toContain('2026-07-23')
  })

  it('매일 반복이면 오늘 포함 15일치', () => {
    const out = pendingRoutineOccurrences([routine({ days: [0, 1, 2, 3, 4, 5, 6] })], [], WED)
    expect(out).toHaveLength(15)
    expect(out[0].dateKey).toBe('2026-07-22')
  })
})

describe('describeRoutineDays', () => {
  it('사람이 읽는 말로 옮긴다', () => {
    expect(describeRoutineDays([0, 1, 2, 3, 4, 5, 6])).toBe('매일')
    expect(describeRoutineDays([1, 2, 3, 4, 5])).toBe('평일')
    expect(describeRoutineDays([2, 4])).toBe('화·목')
    expect(describeRoutineDays([])).toBe('')
  })
})
