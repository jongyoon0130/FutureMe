// 기기 간 목표 데이터 병합. 여기가 틀리면 한 기기 저장이 다른 기기가 올린 할 일을
// 지워버리고, 그 할 일에 걸린 알림 예약(futureme_reminders)까지 같이 사라진다.
// pushLocalGoalData가 "올리기 전에 원격과 병합"할 때 이 보장에 기댄다.
import { describe, expect, it } from 'bun:test'
import { mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
import type { MiscTodoItem } from '../src/lib/goalMiscTodos'

function misc(id: string, over: Partial<MiscTodoItem> = {}): MiscTodoItem {
  return { id, label: id, done: false, tier: 'daily', periodKey: '2026-07-27', ...over }
}

function bundle(updatedAt: number, miscTodos: MiscTodoItem[]): GoalDataBundle {
  return { ownerId: 'o', plans: [], miscTodos, routines: [], updatedAt }
}

describe('mergeGoalDataBundles (기기 간 덮어쓰기 방지)', () => {
  it('로컬이 더 최신이어도 원격에만 있는 할 일은 보존한다 (예약 사라짐 방지)', () => {
    const local = bundle(200, [misc('Y')]) // 이 기기가 방금 편집 — 더 최신
    const remote = bundle(100, [misc('X')]) // 다른 기기가 먼저 올린 것 — 이 기기는 모른다
    const merged = mergeGoalDataBundles(local, remote)
    expect(merged.miscTodos.map((t) => t.id).sort()).toEqual(['X', 'Y'])
  })

  it('같은 id 충돌은 더 최신 쪽 내용을 쓴다', () => {
    const local = bundle(200, [misc('X', { label: '로컬-최신' })])
    const remote = bundle(100, [misc('X', { label: '원격-옛것' })])
    const merged = mergeGoalDataBundles(local, remote)
    expect(merged.miscTodos.find((t) => t.id === 'X')?.label).toBe('로컬-최신')
  })

  it('원격이 더 최신이면 원격 내용을 쓰되, 로컬에만 있는 할 일도 보존한다', () => {
    const local = bundle(100, [misc('X', { label: '로컬-옛것' }), misc('Z')])
    const remote = bundle(200, [misc('X', { label: '원격-최신' })])
    const merged = mergeGoalDataBundles(local, remote)
    expect(merged.miscTodos.find((t) => t.id === 'X')?.label).toBe('원격-최신')
    expect(merged.miscTodos.map((t) => t.id).sort()).toEqual(['X', 'Z'])
  })
})
