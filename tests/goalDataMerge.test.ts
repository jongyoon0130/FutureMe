// 기기 간 목표 데이터 병합. 여기가 틀리면 한 기기 저장이 다른 기기가 올린 할 일을
// 지워버리고, 그 할 일에 걸린 알림 예약(futureme_reminders)까지 같이 사라진다.
// pushLocalGoalData가 "올리기 전에 원격과 병합"할 때 이 보장에 기댄다.
import { describe, expect, it } from 'bun:test'
import { absorbRemoteOnly, mergeGoalDataBundles, type GoalDataBundle } from '../src/lib/goalDataSync'
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

// 푸시 경로 병합 — 타임스탬프와 무관하게 "이 기기 편집은 무조건 지킨다"가 핵심.
// (폰에서 시간 넣자마자 사라지던 회귀의 수정)
describe('absorbRemoteOnly (푸시 전 병합 — 내 편집 보존)', () => {
  it('같은 id는 원격 타임스탬프와 무관하게 로컬을 쓴다 (방금 넣은 시간이 안 사라짐)', () => {
    const local = [misc('X', { timeStart: '19:00' })] // 방금 시간을 넣음
    const remote = [misc('X', {})] // 원격은 아직 시간이 없는 옛 버전
    const merged = absorbRemoteOnly(local, remote)
    expect(merged.find((t) => t.id === 'X')?.timeStart).toBe('19:00')
    expect(merged).toHaveLength(1)
  })

  it('로컬에 없는 원격 할 일은 흡수한다 (다른 기기 추가 보존 → 예약 안 사라짐)', () => {
    const local = [misc('X')]
    const remote = [misc('X'), misc('Y')] // Y는 다른 기기가 새로 올린 것
    const merged = absorbRemoteOnly(local, remote)
    expect(merged.map((t) => t.id).sort()).toEqual(['X', 'Y'])
  })

  it('흡수할 게 없으면 원본 배열 참조를 그대로 돌려준다 (불필요한 반영 방지)', () => {
    const local = [misc('X')]
    expect(absorbRemoteOnly(local, [misc('X')])).toBe(local)
    expect(absorbRemoteOnly(local, [])).toBe(local)
  })
})
