// 목표(습관/프로젝트) 삭제의 스토어 레벨 동작.
// 핵심 보장(이 버그의 회귀 방지):
//   - 지운 목표는 화면(loadGoalPlans)에서 사라진다
//   - 하지만 저장·동기화(loadGoalPlansForSync)에는 툼스톤으로 남아 삭제가 다른 기기로 전파된다
//   - 다른 목표를 저장해도 툼스톤이 날아가지 않는다 (삭제가 되살아나지 않음)
//   - 같은 id를 다시 만들면 되살아난다
import { beforeEach, describe, expect, it } from 'bun:test'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length(): number {
    return this.map.size
  }
  clear(): void {
    this.map.clear()
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
}
globalThis.localStorage = new MemoryStorage()

import type { GoalPlan } from '../src/types/goalPlan'
import {
  deleteGoalPlan,
  loadGoalPlans,
  loadGoalPlansForSync,
  saveGoalPlan,
} from '../src/lib/goalPlanStore'
import { emptyGoalIntake } from '../src/types/goalPlan'

const PROFILE = 'p1'

function makePlan(id: string, title = id): GoalPlan {
  const now = new Date().toISOString()
  return {
    id,
    profileId: PROFILE,
    templateType: 'backplan',
    intake: emptyGoalIntake(),
    title,
    sections: [],
    createdAt: now,
    updatedAt: now,
  }
}

beforeEach(() => localStorage.clear())

describe('deleteGoalPlan — 툼스톤', () => {
  it('지우면 화면에서는 사라지지만 동기화 데이터엔 툼스톤으로 남는다', () => {
    saveGoalPlan(makePlan('G'))
    expect(loadGoalPlans(PROFILE).map((p) => p.id)).toEqual(['G'])

    deleteGoalPlan(PROFILE, 'G')
    expect(loadGoalPlans(PROFILE)).toEqual([]) // 화면에서 사라짐

    const forSync = loadGoalPlansForSync(PROFILE)
    const g = forSync.find((p) => p.id === 'G')
    expect(g?.deletedAt).toBeGreaterThan(0) // 삭제 표식 유지 → 전파됨
  })

  it('다른 목표를 저장해도 툼스톤이 보존된다 (삭제가 되살아나지 않음)', () => {
    saveGoalPlan(makePlan('G'))
    deleteGoalPlan(PROFILE, 'G')
    saveGoalPlan(makePlan('H')) // 다른 목표 저장

    expect(loadGoalPlans(PROFILE).map((p) => p.id)).toEqual(['H'])
    const g = loadGoalPlansForSync(PROFILE).find((p) => p.id === 'G')
    expect(g?.deletedAt).toBeGreaterThan(0) // 여전히 툼스톤
  })

  it('같은 id를 다시 만들면 되살아난다', () => {
    saveGoalPlan(makePlan('G', '원래'))
    deleteGoalPlan(PROFILE, 'G')
    saveGoalPlan(makePlan('G', '다시')) // 같은 id 재생성

    const live = loadGoalPlans(PROFILE).find((p) => p.id === 'G')
    expect(live?.title).toBe('다시')
    expect(live?.deletedAt).toBeUndefined()
  })

  it('구 채팅 프로필 키에 같은 목표가 살아 있어도 되살아나지 않는다 (외부 소스 부활 벡터)', () => {
    saveGoalPlan(makePlan('G'))
    // 구 채팅 앱 시절 저장 키에 같은 목표 복사본을 심어 둔다 (scanExternalPlanSources가 긁는 곳)
    localStorage.setItem('futureme-goal-plans-' + PROFILE, JSON.stringify([makePlan('G')]))

    deleteGoalPlan(PROFILE, 'G')

    // 화면에 안 뜬다 — 외부 키의 살아 있는 복사본이 툼스톤을 이기지 못한다
    expect(loadGoalPlans(PROFILE).some((p) => p.id === 'G')).toBe(false)
  })
})
