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
  it('목표·D-day·동기(본인 표현)를 요약한다', () => {
    seedPlan()
    const out = describeGoalBoardForPrompt(NOW)
    expect(out).toContain('포트폴리오 완성해서 이직하기')
    expect(out).toContain('D-91')
    expect(out).toContain('실력을 증명하고 싶어서')
    expect(out).toContain('흐지부지되는 내가 반복될 것 같아')
  })

  it('마감이 지난 목표는 지난 일수로 표기한다', () => {
    seedPlan({ intake: { goal: 'g', deadline: '2026-07-10', successCriteria: '', progress: 'not_started' } })
    expect(describeGoalBoardForPrompt(NOW)).toContain('마감 6일 지남')
  })

  it('계획표가 없으면 빈 문자열 — 프롬프트에 섹션이 생기지 않는다', () => {
    expect(describeGoalBoardForPrompt(NOW)).toBe('')
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
