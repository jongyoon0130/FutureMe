// 기기 간 목표 데이터 병합. 여기가 틀리면 한 기기의 편집(체크·시간)이 다른 기기에 반영이
// 안 되거나, 한 기기 저장이 다른 기기가 올린 할 일을 지워버려 알림 예약까지 사라진다.
// 핵심: **일상 할 일은 항목별 updatedAt으로 최신을 가린다** (있으면). 없으면(옛 데이터)
// 번들 단위 규칙으로 물러난다.
import { describe, expect, it } from 'bun:test'
import { mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'
import type { GoalPlan } from '../src/types/goalPlan'

function misc(id: string, over: Partial<MiscTodoItem> = {}): MiscTodoItem {
  return { id, label: id, done: false, tier: 'daily', periodKey: '2026-07-27', ...over }
}

function bundle(updatedAt: number, miscTodos: MiscTodoItem[]): GoalDataBundle {
  return { ownerId: 'o', plans: [], miscTodos, routines: [], updatedAt }
}

// 병합은 id/updatedAt/deletedAt만 본다 — 나머지 필드는 최소로 채운다
function plan(id: string, updatedAtIso: string, over: Partial<GoalPlan> = {}): GoalPlan {
  return { id, updatedAt: updatedAtIso, title: id, ...over } as unknown as GoalPlan
}

function planBundle(updatedAt: number, plans: GoalPlan[]): GoalDataBundle {
  return { ownerId: 'o', plans, miscTodos: [], routines: [], updatedAt }
}

// 항목 updatedAt이 없는 옛 데이터 — 번들 단위 규칙(preferLocal)으로 물러난다
describe('mergeGoalDataBundles — 항목 시각 없는 옛 데이터(번들 규칙)', () => {
  it('로컬이 더 최신이어도 원격에만 있는 할 일은 보존한다 (예약 사라짐 방지)', () => {
    const merged = mergeGoalDataBundles(bundle(200, [misc('Y')]), bundle(100, [misc('X')]))
    expect(merged.miscTodos.map((t) => t.id).sort()).toEqual(['X', 'Y'])
  })

  it('같은 id 충돌은 번들이 더 최신인 쪽을 쓴다', () => {
    const local = bundle(200, [misc('X', { label: '로컬-최신' })])
    const remote = bundle(100, [misc('X', { label: '원격-옛것' })])
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.label).toBe('로컬-최신')
  })

  it('원격 번들이 더 최신이면 원격을 쓰되, 로컬에만 있는 할 일도 보존한다', () => {
    const local = bundle(100, [misc('X', { label: '로컬-옛것' }), misc('Z')])
    const remote = bundle(200, [misc('X', { label: '원격-최신' })])
    const merged = mergeGoalDataBundles(local, remote)
    expect(merged.miscTodos.find((t) => t.id === 'X')?.label).toBe('원격-최신')
    expect(merged.miscTodos.map((t) => t.id).sort()).toEqual(['X', 'Z'])
  })
})

// 항목 updatedAt이 있으면 그걸로 판정 — 방향과 무관하게 최신 편집이 이긴다
describe('mergeGoalDataBundles — 항목별 최신 우선(updatedAt)', () => {
  it('원격에서 체크한 항목은, 로컬 번들 updatedAt이 더 커도 반영된다 (맥→폰 체크 전파)', () => {
    // 로컬 번들이 더 최신(200)이지만, 정작 X를 고친 건 원격(항목 updatedAt=5000)
    const local = bundle(200, [misc('X', { done: false })]) // 이 기기 X는 손 안 댐(항목 시각 없음)
    const remote = bundle(100, [misc('X', { done: true, updatedAt: 5000 })])
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.done).toBe(true)
  })

  it('로컬에서 방금 넣은 시간(항목 updatedAt)은 원격 번들이 더 최신이어도 유지된다 (회귀 방지)', () => {
    const local = bundle(100, [misc('X', { timeStart: '19:00', updatedAt: 9000 })])
    const remote = bundle(999, [misc('X', { updatedAt: 1000 })]) // 원격 번들은 최신이나 X는 옛 편집
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.timeStart).toBe('19:00')
  })

  it('둘 다 항목 updatedAt이 있으면 더 큰 쪽이 이긴다', () => {
    const local = bundle(0, [misc('X', { label: '로컬', updatedAt: 100 })])
    const remote = bundle(0, [misc('X', { label: '원격', updatedAt: 200 })])
    expect(mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')?.label).toBe('원격')
  })
})

// 삭제 전파 — 툼스톤(deletedAt)이 병합에서 어떻게 이기고 지는가
describe('mergeGoalDataBundles — 삭제 전파(툼스톤)', () => {
  it('지운 항목은 원격에 아직 살아 있어도 되살아나지 않는다', () => {
    const local = bundle(0, [misc('X', { deletedAt: 5000 })]) // 이 기기서 지움
    const remote = bundle(999, [misc('X', { updatedAt: 1000 })]) // 다른 기기엔 아직 살아 있음(옛 편집)
    const x = mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')
    expect(x?.deletedAt).toBe(5000) // 여전히 삭제 상태 → 화면에서 걸러짐
  })

  it('삭제한 뒤 다른 기기에서 더 늦게 고치면 되살아난다', () => {
    const local = bundle(0, [misc('X', { deletedAt: 1000 })])
    const remote = bundle(0, [misc('X', { label: 'X부활', updatedAt: 5000 })])
    const x = mergeGoalDataBundles(local, remote).miscTodos.find((t) => t.id === 'X')
    expect(x?.deletedAt).toBeUndefined()
    expect(x?.label).toBe('X부활')
  })
})

// 목표(습관/프로젝트) 삭제 전파 — 툼스톤이 없던 시절엔 지운 목표가 병합 때 되살아났다 (이 버그의 회귀 방지)
describe('mergeGoalDataBundles — 목표(GoalPlan) 삭제 전파(툼스톤)', () => {
  it('지운 목표는 원격에 아직 살아 있어도 되살아나지 않는다', () => {
    // 원격 번들이 더 최신(999)이라도, deletedAt(5000) > 원격 목표 updatedAt(2026-01-01) 이면 삭제가 이긴다
    const local = planBundle(0, [plan('G', '2026-01-01T00:00:00.000Z', { deletedAt: 5_000_000_000_000 })])
    const remote = planBundle(999, [plan('G', '2026-01-01T00:00:00.000Z')])
    const g = mergeGoalDataBundles(local, remote).plans.find((p) => p.id === 'G')
    expect(g?.deletedAt).toBe(5_000_000_000_000) // 여전히 삭제 상태 → 화면에서 걸러짐
  })

  it('삭제한 뒤 다른 기기에서 더 늦게 만들면 되살아난다', () => {
    const local = planBundle(0, [plan('G', '2026-01-01T00:00:00.000Z', { deletedAt: 1000 })])
    const remote = planBundle(0, [plan('G', '2026-07-01T00:00:00.000Z', { title: 'G부활' })])
    const g = mergeGoalDataBundles(local, remote).plans.find((p) => p.id === 'G')
    expect(g?.deletedAt).toBeUndefined()
    expect(g?.title).toBe('G부활')
  })

  it('삭제 안 된 목표는 종전대로 최신 updatedAt이 이긴다', () => {
    const local = planBundle(0, [plan('G', '2026-07-10T00:00:00.000Z', { title: '로컬-최신' })])
    const remote = planBundle(0, [plan('G', '2026-07-01T00:00:00.000Z', { title: '원격-옛것' })])
    expect(mergeGoalDataBundles(local, remote).plans.find((p) => p.id === 'G')?.title).toBe('로컬-최신')
  })
})
