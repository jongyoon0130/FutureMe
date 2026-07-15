// 실행 리듬 테스트 — 밀린 할 일, 멈춘 목표, 완료 통계, 회고 회상
// 이 로직이 틀리면 미래의 나가 엉뚱한 타이밍에 다그치거나, 위로 카드가 안 뜬다.
import { describe, expect, it } from 'bun:test'
import { emptyProfile, type SelfProfile } from '../src/types/self'
import {
  addCompletionReflection,
  addGoal,
  addPlanTask,
  completePlanTask,
  completionStats,
  overdueTasks,
  plannerOf,
  recentReflectionsWithTask,
  stalledGoals,
} from '../src/lib/plannerStore'

const TODAY = '2026-07-15'
const DAY_MS = 24 * 60 * 60 * 1000

function base(): SelfProfile {
  return { ...emptyProfile(), id: 'p1', name: '나' }
}

describe('overdueTasks — 밀린 할 일', () => {
  it('기한이 지난 미완료만 골라 오래된 순으로 준다', () => {
    let p = addPlanTask(base(), { title: '어제 일', scheduledFor: '2026-07-14', priority: 'must' })
    p = addPlanTask(p, { title: '그저께 일', scheduledFor: '2026-07-13', priority: 'should' })
    p = addPlanTask(p, { title: '오늘 일', scheduledFor: TODAY, priority: 'should' })
    p = addPlanTask(p, { title: '완료된 옛일', scheduledFor: '2026-07-10', priority: 'could' })
    const doneTask = plannerOf(p).tasks.find((t) => t.title === '완료된 옛일')!
    p = completePlanTask(p, doneTask.id)

    const overdue = overdueTasks(p, TODAY)
    expect(overdue.map((t) => t.title)).toEqual(['그저께 일', '어제 일'])
  })
})

describe('stalledGoals — 멈춘 목표', () => {
  it('연결된 할 일 움직임이 오래 없으면 멈춤으로 잡는다', () => {
    const p = addGoal(base(), {
      title: '이직 준비', purpose: '성장', desiredOutcome: '지원 3곳',
      futureConnection: '', domain: 'work', horizon: 'half_year',
      startDate: TODAY, targetDate: '2027-01-15',
    })
    const now = Date.now()
    // 방금 만든 목표 — 아직 멈춤 아님
    expect(stalledGoals(p, now, 5)).toHaveLength(0)
    // 7일 뒤 시점에서 보면 멈춤
    const stalled = stalledGoals(p, now + 7 * DAY_MS, 5)
    expect(stalled).toHaveLength(1)
    expect(stalled[0].goal.title).toBe('이직 준비')
    expect(stalled[0].stalledDays).toBeGreaterThanOrEqual(5)
  })

  it('최근에 연결된 할 일을 완료했으면 멈춤이 아니다', () => {
    let p = addGoal(base(), {
      title: '이직 준비', purpose: '성장', desiredOutcome: '지원 3곳',
      futureConnection: '', domain: 'work', horizon: 'half_year',
      startDate: TODAY, targetDate: '2027-01-15',
    })
    const goal = plannerOf(p).goals[0]
    p = addPlanTask(p, { title: '이력서 열기', goalId: goal.id, scheduledFor: TODAY, priority: 'must' })
    p = completePlanTask(p, plannerOf(p).tasks[0].id)

    expect(stalledGoals(p, Date.now() + 2 * DAY_MS, 5)).toHaveLength(0)
  })
})

describe('completionStats — AI 초안용 리듬', () => {
  it('최근 완료 수와 밀린 수를 센다', () => {
    let p = addPlanTask(base(), { title: '한 일', scheduledFor: '2026-07-14', priority: 'must' })
    p = completePlanTask(p, plannerOf(p).tasks[0].id)
    p = addPlanTask(p, { title: '밀린 일', scheduledFor: '2026-07-13', priority: 'should' })

    expect(completionStats(p, TODAY)).toEqual({ done: 1, overdue: 1 })
  })
})

describe('recentReflectionsWithTask — 회상 재료', () => {
  it('회고에 해당 할 일 제목을 붙여서 준다', () => {
    let p = addPlanTask(base(), { title: '목차 적기', scheduledFor: TODAY, priority: 'must' })
    const task = plannerOf(p).tasks[0]
    p = completePlanTask(p, task.id)
    p = addCompletionReflection(p, { taskId: task.id, emotion: '뿌듯해', pride: '첫 줄 시작' })

    const recalls = recentReflectionsWithTask(p)
    expect(recalls[0]).toMatchObject({ taskTitle: '목차 적기', emotion: '뿌듯해', pride: '첫 줄 시작' })
  })
})
