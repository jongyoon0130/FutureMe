import { describe, expect, it } from 'bun:test'

import { dedupeHierarchyItemIds, dedupePlansHierarchyItemIds } from '../src/lib/goalSectionHydration'
import type { GoalPlan } from '../src/types/goalPlan'

function planWithDuplicateDayItemIds(): GoalPlan {
  return {
    id: 'plan-a',
    profileId: 'p1',
    templateType: 'backplan',
    title: '앱 출시',
    intake: { goal: '앱', deadline: '2026-07-31', successCriteria: '', progress: 'not_started' },
    sections: [],
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    hierarchy: {
      horizon: 'week-day',
      rangeLabel: '7월',
      focus: '앱 출시',
      startDate: '2026-07-01',
      deadline: '2026-07-31',
      months: [],
      currentWeekId: 'w1',
      weeks: [
        {
          id: 'w1',
          globalIndex: 1,
          label: 'W1',
          dateLabel: '7/13~7/19',
          focus: '',
          items: [],
          monthKeys: [],
          days: [
            { id: 'd1', dateLabel: '7/19', dayOfWeek: '일', focus: '', items: [{ id: 'shared', label: '운동', done: false }] },
          ],
        },
        {
          id: 'w2',
          globalIndex: 2,
          label: 'W2',
          dateLabel: '7/20~7/26',
          focus: '',
          items: [],
          monthKeys: [],
          days: [
            { id: 'd2', dateLabel: '7/20', dayOfWeek: '월', focus: '', items: [{ id: 'shared', label: '운동', done: true }] },
          ],
        },
      ],
      days: [],
    },
  }
}

describe('dedupeHierarchyItemIds', () => {
  it('여러 날에 박힌 중복 항목 id를 새 id로 갈라준다', () => {
    const plan = planWithDuplicateDayItemIds()
    const fixed = dedupeHierarchyItemIds(plan)

    const firstId = fixed.hierarchy!.weeks[0].days[0].items[0].id
    const secondId = fixed.hierarchy!.weeks[1].days[0].items[0].id
    expect(firstId).toBe('shared')
    expect(secondId).not.toBe('shared')
    expect(fixed.hierarchy!.weeks[1].days[0].items[0].done).toBe(true)
    expect(fixed.hierarchyIdsDedupedV1).toBe(1)
  })

  it('이미 정리된 플랜은 다시 건드리지 않는다(버전 플래그)', () => {
    const plan = { ...planWithDuplicateDayItemIds(), hierarchyIdsDedupedV1: 1 }
    const fixed = dedupeHierarchyItemIds(plan)
    expect(fixed).toBe(plan)
    expect(fixed.hierarchy!.weeks[1].days[0].items[0].id).toBe('shared')
  })

  it('배치 헬퍼는 변경된 플랜만 changed로 표시한다', () => {
    const dup = planWithDuplicateDayItemIds()
    const clean = { ...dup, id: 'plan-b', hierarchyIdsDedupedV1: 1 as number | undefined }
    const { plans, changed } = dedupePlansHierarchyItemIds([dup, clean])
    expect(changed).toBe(true)
    expect(plans[1]).toBe(clean)
  })
})
