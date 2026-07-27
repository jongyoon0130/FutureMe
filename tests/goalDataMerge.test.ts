// 기기 간 목표 데이터 병합. 여기가 틀리면 한 기기의 편집(체크·시간)이 다른 기기에 반영이
// 안 되거나, 한 기기 저장이 다른 기기가 올린 할 일을 지워버려 알림 예약까지 사라진다.
// 핵심: **일상 할 일은 항목별 updatedAt으로 최신을 가린다** (있으면). 없으면(옛 데이터)
// 번들 단위 규칙으로 물러난다.
import { describe, expect, it } from 'bun:test'
import { mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'

function misc(id: string, over: Partial<MiscTodoItem> = {}): MiscTodoItem {
  return { id, label: id, done: false, tier: 'daily', periodKey: '2026-07-27', ...over }
}

function bundle(updatedAt: number, miscTodos: MiscTodoItem[]): GoalDataBundle {
  return { ownerId: 'o', plans: [], miscTodos, routines: [], updatedAt }
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
