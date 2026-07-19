// 계획표 → 미래의 나 다리 테스트
// 홈 계획표(goal-plans-*)의 목표·동기가 프롬프트 요약으로 안전하게 변환되는지 확인.
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

import {
  daysUntilDeadline,
  describeGoalBoardForPrompt,
  buildScheduleAnswerFacts,
  asksScheduleQuestion,
  scheduleQuestionScope,
  readGoalPlansLite,
  todayMiscProgress,
} from '../src/lib/goalPlanBridge'

const NOW = new Date('2026-07-16T09:00:00')

function seedOwner(): string {
  localStorage.setItem('goal-app-owner-id', 'owner-1')
  return 'owner-1'
}

function seedPlan(overrides: Record<string, unknown> = {}): void {
  const owner = seedOwner()
  const plan = {
    id: 'plan-1',
    profileId: owner,
    templateType: 'backplan',
    title: '포트폴리오 완성해서 이직하기',
    intake: { goal: '포트폴리오', deadline: '2026-10-15', successCriteria: '', progress: 'not_started' },
    motivation: {
      'why-truth': '성장이 멈춘 느낌이고, 실력을 증명하고 싶어서',
      'success-both': '가볍게 숨 쉬고 자신감이 생긴다',
      'failure-pattern': '시작만 하고 흐지부지되는 내가 반복될 것 같아',
    },
    sections: [],
    createdAt: '2026-07-16T00:00:00.000Z',
    updatedAt: '2026-07-16T00:00:00.000Z',
    ...overrides,
  }
  localStorage.setItem(`goal-plans-${owner}`, JSON.stringify([plan]))
}

beforeEach(() => localStorage.clear())

describe('readGoalPlansLite — 읽기 전용', () => {
  it('owner가 없으면 빈 배열 (계획표 미사용자)', () => {
    expect(readGoalPlansLite()).toEqual([])
  })

  it('깨진 JSON이어도 앱이 죽지 않는다', () => {
    seedOwner()
    localStorage.setItem('goal-plans-owner-1', '{broken')
    expect(readGoalPlansLite()).toEqual([])
  })

  it('읽어도 저장소를 변형하지 않는다', () => {
    seedPlan()
    const before = localStorage.getItem('goal-plans-owner-1')
    readGoalPlansLite()
    expect(localStorage.getItem('goal-plans-owner-1')).toBe(before)
  })
})

describe('daysUntilDeadline', () => {
  it('D-day를 계산한다', () => {
    expect(daysUntilDeadline('2026-10-15', NOW)).toBe(91)
    expect(daysUntilDeadline('2026-07-16', NOW)).toBe(0)
    expect(daysUntilDeadline('2026-07-10', NOW)).toBe(-6)
    expect(daysUntilDeadline('없는날짜', NOW)).toBeNull()
  })
})

describe('describeGoalBoardForPrompt — 프롬프트 요약', () => {
  it('목표·D-day·동기 3문항을 요약한다', () => {
    seedPlan()
    const out = describeGoalBoardForPrompt(NOW)
    expect(out).toContain('포트폴리오 완성해서 이직하기')
    expect(out).toContain('D-91')
    expect(out).toContain('실력을 증명하고 싶어서')
    expect(out).toContain('가볍게 숨 쉬고 자신감이 생긴다')
    expect(out).toContain('흐지부지되는 내가 반복될 것 같아')
  })

  it('오늘·주·월 할 일 항목과 완료 여부를 나열한다', () => {
    const owner = seedOwner()
    const plan = {
      id: 'plan-1',
      profileId: owner,
      templateType: 'backplan',
      title: '앱 출시',
      intake: { goal: '앱', deadline: '2026-12-01', successCriteria: '', progress: 'not_started' },
      sections: [],
      createdAt: '2026-07-16T00:00:00.000Z',
      updatedAt: '2026-07-16T00:00:00.000Z',
      hierarchy: {
        horizon: 'day-only',
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
            items: [{ id: 't1', label: '스케줄표 업데이트', done: false }],
          },
        ],
        currentWeekId: '',
      },
    }
    localStorage.setItem(`goal-plans-${owner}`, JSON.stringify([plan]))
    localStorage.setItem(
      `goal-misc-todos-${owner}`,
      JSON.stringify([
        { id: 'm1', label: '운동', done: true, tier: 'daily', periodKey: '2026-07-16' },
      ]),
    )

    const out = describeGoalBoardForPrompt(NOW)
    expect(out).toContain('오늘 7/16(목)') // 날짜별 라벨 — "내일" 질문에도 답할 수 있게
    expect(out).toContain('앱 출시 — 스케줄표 업데이트')
    expect(out).toContain('[완료] 일상 — 운동')
  })

  it('내일 이후 일정도 날짜별로 싣는다 — "내일 뭐 있지?"에 답할 수 있게', () => {
    const owner = seedOwner()
    localStorage.setItem(
      `goal-misc-todos-${owner}`,
      JSON.stringify([
        { id: 'm1', label: '오늘 운동', done: true, tier: 'daily', periodKey: '2026-07-16' },
        { id: 'm2', label: '저녁 8시 약속', done: false, tier: 'daily', periodKey: '2026-07-17' },
        { id: 'm3', label: '주말 정리', done: false, tier: 'daily', periodKey: '2026-07-19' },
        { id: 'm4', label: '한참 뒤 일', done: false, tier: 'daily', periodKey: '2026-08-30' },
      ]),
    )

    const out = describeGoalBoardForPrompt(NOW) // 2026-07-16
    expect(out).toContain('오늘 7/16(목)')
    expect(out).toContain('[완료] 일상 — 오늘 운동')
    expect(out).toContain('내일 7/17(금)')
    expect(out).toContain('저녁 8시 약속')
    expect(out).toContain('7/19(일)')
    expect(out).toContain('주말 정리')
    expect(out).not.toContain('한참 뒤 일') // 일주일 범위 밖
  })

  it('오늘·내일이 비면 "없음"이라고 명시한다 — AI가 멋대로 단정하지 않게', () => {
    const owner = seedOwner()
    localStorage.setItem(
      `goal-misc-todos-${owner}`,
      JSON.stringify([{ id: 'm1', label: '나중 일', done: false, tier: 'daily', periodKey: '2026-07-20' }]),
    )
    const out = describeGoalBoardForPrompt(NOW)
    expect(out).toContain('오늘 7/16(목): 등록된 할 일 없음')
    expect(out).toContain('내일 7/17(금): 등록된 할 일 없음')
  })

  it('마감이 지난 목표는 지난 일수로 표기한다', () => {
    seedPlan({ intake: { goal: 'g', deadline: '2026-07-10', successCriteria: '', progress: 'not_started' } })
    expect(describeGoalBoardForPrompt(NOW)).toContain('마감 6일 지남')
  })

  it('계획표가 없으면 빈 문자열 — 프롬프트에 섹션이 생기지 않는다', () => {
    expect(describeGoalBoardForPrompt(NOW)).toBe('')
  })
})

describe('역사 라인 — 시간이 만드는 해자', () => {
  it('이룬 목표·최근 7일 완료·마감 기록을 프롬프트에 싣는다', () => {
    const owner = seedOwner()
    const achievedPlan = {
      id: 'plan-a',
      profileId: owner,
      templateType: 'backplan',
      title: '한 달 운동 습관',
      intake: { goal: '운동', deadline: '2026-07-10', successCriteria: '', progress: 'not_started' },
      sections: [],
      createdAt: '2026-06-10T00:00:00.000Z',
      updatedAt: '2026-07-10T00:00:00.000Z',
      hierarchy: {
        horizon: 'day-only',
        rangeLabel: '6월',
        focus: '운동',
        startDate: '2026-06-10',
        deadline: '2026-07-10',
        months: [],
        weeks: [],
        days: [
          { id: 'd1', dateLabel: '6/10', dayOfWeek: '수', focus: '', items: [{ id: 't1', label: '운동 1회', done: true }] },
        ],
        currentWeekId: '',
      },
    }
    localStorage.setItem(`goal-plans-${owner}`, JSON.stringify([achievedPlan]))
    localStorage.setItem(
      `goal-misc-todos-${owner}`,
      JSON.stringify([
        { id: 'm1', label: '운동', done: true, tier: 'daily', periodKey: '2026-07-15' },
        { id: 'm2', label: '독서', done: true, tier: 'daily', periodKey: '2026-07-14' },
        { id: 'm3', label: '옛날 일', done: true, tier: 'daily', periodKey: '2026-07-01' }, // 7일 밖
      ]),
    )
    localStorage.setItem(
      `goal-day-close-${owner}`,
      JSON.stringify([
        { date: '2026-07-15', mood: '뿌듯해', note: '드디어 시작', done: 2, total: 2, message: 'm', closedAt: 1 },
        { date: '2026-07-14', mood: '덤덤해', done: 1, total: 2, message: 'm', closedAt: 1 },
      ]),
    )

    const out = describeGoalBoardForPrompt(NOW)
    expect(out).toContain('이미 함께 이뤄낸 목표: "한 달 운동 습관"')
    expect(out).toContain('최근 7일 실제 완료: 2개')
    expect(out).toContain('어제 하루 마감 기록: 뿌듯해 (2/2) — "드디어 시작"')
    expect(out).toContain('하루 마감 2일 연속')
  })
})

describe('todayMiscProgress — 오늘 할 일 진행', () => {
  it('오늘 것만 세고, 오늘 항목이 없으면 null', () => {
    const owner = seedOwner()
    localStorage.setItem(
      `goal-misc-todos-${owner}`,
      JSON.stringify([
        { id: '1', label: '운동', done: true, tier: 'daily', periodKey: '2026-07-16' },
        { id: '2', label: '책 읽기', done: false, tier: 'daily', periodKey: '2026-07-16' },
        { id: '3', label: '지난 일', done: false, tier: 'daily', periodKey: '2026-07-15' },
        { id: '4', label: '주간 일', done: false, tier: 'weekly', periodKey: '2026-07-13' },
      ]),
    )
    expect(todayMiscProgress(NOW)).toEqual({ done: 1, total: 2 })

    localStorage.setItem(`goal-misc-todos-${owner}`, JSON.stringify([]))
    expect(todayMiscProgress(NOW)).toBeNull()
  })
})

describe('buildScheduleAnswerFacts — 일정 질문 환각 방지', () => {
  const SUN = new Date('2026-07-19T12:00:00')

  it('오늘 질문엔 일간만 — 이번 주 목표·시간 추측 금지', () => {
    const owner = seedOwner()
    localStorage.setItem(
      `goal-misc-todos-${owner}`,
      JSON.stringify([{ id: 'm1', label: '풋살', done: false, tier: 'daily', periodKey: '2026-07-19' }]),
    )
    localStorage.setItem(
      `goal-plans-${owner}`,
      JSON.stringify([
        {
          id: 'plan-1',
          profileId: owner,
          templateType: 'backplan',
          title: '앱스토어에 어플 출시',
          intake: { goal: '앱', deadline: '2026-12-01', successCriteria: '', progress: 'not_started' },
          sections: [],
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:00.000Z',
          hierarchy: {
            horizon: 'week-month',
            rangeLabel: '7월',
            focus: '앱',
            startDate: '2026-07-01',
            deadline: '2026-07-31',
            months: [],
            weeks: [
              {
                id: 'w1',
                label: '3주차',
                dateLabel: '7/13-7/19',
                focus: '',
                items: [{ id: 'witem', label: '미래의 나 페르소나 구축', done: false }],
                days: [],
              },
            ],
            days: [],
            currentWeekId: 'w1',
          },
        },
      ]),
    )

    expect(scheduleQuestionScope('오늘 일정 뭐 적어놨어')).toBe('today')
    const facts = buildScheduleAnswerFacts('오늘 일정 뭐 적어놨어', SUN)
    expect(facts).toContain('풋살')
    expect(facts).toContain('시간 미기재')
    expect(facts).not.toContain('페르소나')
    expect(facts).not.toContain('앱스토어 릴리즈')
  })

  it('일정 질문이 아니면 null', () => {
    expect(asksScheduleQuestion('오늘 좀 힘들었어')).toBe(false)
    expect(buildScheduleAnswerFacts('오늘 좀 힘들었어', SUN)).toBeNull()
  })
})
