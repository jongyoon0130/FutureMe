import { beforeEach, describe, expect, it } from 'bun:test'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() { return this.map.size }
  clear() { this.map.clear() }
  getItem(key: string) { return this.map.get(key) ?? null }
  key(index: number) { return [...this.map.keys()][index] ?? null }
  removeItem(key: string) { this.map.delete(key) }
  setItem(key: string, value: string) { this.map.set(key, value) }
}
globalThis.localStorage = new MemoryStorage()

import { emptyProfile } from '../src/types/self'
import { addCompletionReflection, addGoal, addPlanTask, completePlanTask, plannerOf, postponePlanTask } from '../src/lib/plannerStore'
import { parsePlanSuggestion } from '../src/lib/planSuggestionEngine'

beforeEach(() => localStorage.clear())

function profile() {
  return { ...emptyProfile(), id: 'profile-1', name: '나' }
}

describe('플래너 목표·작업 흐름', () => {
  it('목표와 연결된 작업을 만들고 완료·회고를 남긴다', () => {
    let p = addGoal(profile(), { title: '포트폴리오 완성', purpose: '원하는 직무에 지원하려고', desiredOutcome: '대표 프로젝트 2개가 정리된 상태', futureConnection: '일하는 미래의 나에게 가까워짐', domain: 'work', horizon: 'half_year', startDate: '2026-07-15', targetDate: '2027-01-15' })
    const goal = plannerOf(p).goals[0]
    p = addPlanTask(p, { title: '대표 프로젝트 목차 적기', goalId: goal.id, scheduledFor: '2026-07-15', estimatedMinutes: 30, priority: 'must' })
    const task = plannerOf(p).tasks[0]
    p = completePlanTask(p, task.id)
    p = addCompletionReflection(p, { taskId: task.id, goalId: goal.id, emotion: '뿌듯해', pride: '첫 줄을 시작했다', learning: '', futureCloseness: '' })

    expect(plannerOf(p).tasks[0].status).toBe('done')
    expect(plannerOf(p).reflections[0].emotion).toBe('뿌듯해')
  })

  it('미루기는 완료 상태를 되돌리고 새 날짜를 남긴다', () => {
    let p = addPlanTask(profile(), { title: '운동화 꺼내기', scheduledFor: '2026-07-15', estimatedMinutes: 10, priority: 'could' })
    const task = plannerOf(p).tasks[0]
    p = completePlanTask(p, task.id)
    p = postponePlanTask(p, task.id, '2026-07-16')
    expect(plannerOf(p).tasks[0]).toMatchObject({ status: 'todo', scheduledFor: '2026-07-16' })
  })
})

describe('LLM 계획 제안 파싱', () => {
  it('유효한 JSON에서 안전한 작업만 추린다', () => {
    const parsed = parsePlanSuggestion('```json\n{"summary":"시작하자","assumptions":[],"milestones":[{"title":"첫 초안","targetDate":"2026-08-01"}],"tasks":[{"title":"목차 3개 적기","scheduledFor":"2026-07-15","estimatedMinutes":30,"priority":"must","whyNow":"시작 장벽을 낮춤"}],"caution":"무리하지 않기"}\n```')
    expect(parsed?.tasks[0]).toMatchObject({ title: '목차 3개 적기', priority: 'must', estimatedMinutes: 30 })
  })
})
