import { describe, expect, it } from 'bun:test'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}
globalThis.localStorage = new MemoryStorage()

import { aggregateForDate } from '../src/lib/goalHierarchyEngine'
import { moveHomeAggregatedItem } from '../src/lib/goalHomeCategoryMove'
import { MISC_PLAN_ID, MISC_PLAN_TITLE } from '../src/lib/goalMiscTodos'

const DATE = new Date('2026-07-16T12:00:00')

const planA = {
  id: 'plan-a',
  profileId: 'p1',
  templateType: 'backplan' as const,
  title: '앱 출시',
  intake: { goal: '앱', deadline: '2026-07-31', successCriteria: '', progress: 'not_started' as const },
  sections: [],
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  hierarchy: {
    horizon: 'day-only' as const,
    rangeLabel: '7월',
    focus: '앱 출시',
    startDate: '2026-07-01',
    deadline: '2026-07-31',
    months: [],
    weeks: [],
    days: [
      {
        id: 'd1',
        dateLabel: '7/16',
        dayOfWeek: '목',
        focus: '',
        items: [{ id: 't1', label: '기존 목표 일', done: false }],
      },
    ],
    currentWeekId: '',
  },
}

describe('moveHomeAggregatedItem', () => {
  it('일상 항목을 목표 카테고리로 옮긴다', () => {
    const miscTodos = [
      { id: 'm1', label: '풋살', done: true, tier: 'daily' as const, periodKey: '2026-07-16' },
    ]
    const item = {
      id: 'm1',
      label: '풋살',
      done: true,
      planId: MISC_PLAN_ID,
      planTitle: MISC_PLAN_TITLE,
      tier: 'daily' as const,
    }

    const moved = moveHomeAggregatedItem({
      plans: [planA],
      miscTodos,
      profileId: 'p1',
      item,
      tier: 'daily',
      date: DATE,
      targetPlanId: 'plan-a',
    })

    // 옮긴 뒤 일상엔 살아 있는 항목이 없다 (원래 항목은 툼스톤으로 남아 다른 기기에도 삭제 전파)
    expect(moved?.miscTodos.filter((t) => !t.deletedAt)).toHaveLength(0)
    const daily = aggregateForDate(moved!.plans, DATE).daily
    expect(daily.some((it) => it.planId === 'plan-a' && it.label === '풋살' && it.done)).toBe(true)
  })

  it('목표 항목을 일상으로 옮긴다', () => {
    const item = {
      id: 't1',
      label: '기존 목표 일',
      done: false,
      planId: 'plan-a',
      planTitle: '앱 출시',
      tier: 'daily' as const,
    }

    const moved = moveHomeAggregatedItem({
      plans: [planA],
      miscTodos: [],
      profileId: 'p1',
      item,
      tier: 'daily',
      date: DATE,
      targetPlanId: MISC_PLAN_ID,
    })

    expect(moved?.miscTodos).toHaveLength(1)
    expect(moved?.miscTodos[0]).toMatchObject({ label: '기존 목표 일', done: false, tier: 'daily' })
    const daily = aggregateForDate(moved!.plans, DATE).daily
    expect(daily.some((it) => it.id === 't1')).toBe(false)
  })
})
