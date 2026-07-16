// 하루 마감 테스트 — 기록 저장, 연속일 계산, 미래의 나 마감 메시지
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
  buildClosingMessage,
  dayCloseStreak,
  dayKey,
  getDayClose,
  groupGoalHighlights,
  loadDayCloses,
  readChatPersonaLite,
  removeDayClose,
  saveDayClose,
  type DayCloseRecord,
} from '../src/lib/dayClose'

const OWNER = 'owner-1'

function record(date: string, extra: Partial<DayCloseRecord> = {}): DayCloseRecord {
  return { date, mood: '뿌듯해', done: 1, total: 2, message: 'm', closedAt: 1, ...extra }
}

beforeEach(() => localStorage.clear())

describe('saveDayClose — 하루 한 장', () => {
  it('같은 날짜는 덮어쓰고, 최신 날짜 순으로 정렬한다', () => {
    saveDayClose(OWNER, record('2026-07-14'))
    saveDayClose(OWNER, record('2026-07-15'))
    saveDayClose(OWNER, record('2026-07-15', { mood: '지쳤어' }))

    const all = loadDayCloses(OWNER)
    expect(all).toHaveLength(2)
    expect(all[0].date).toBe('2026-07-15')
    expect(all[0].mood).toBe('지쳤어')
    expect(getDayClose(OWNER, '2026-07-14')?.mood).toBe('뿌듯해')
  })
})

describe('dayCloseStreak — 돌아오는 리듬', () => {
  it('오늘 포함 연속일을 센다', () => {
    const today = new Date('2026-07-16T21:00:00')
    saveDayClose(OWNER, record('2026-07-16'))
    saveDayClose(OWNER, record('2026-07-15'))
    saveDayClose(OWNER, record('2026-07-13')) // 14일 빠짐 — 여기서 끊김
    expect(dayCloseStreak(loadDayCloses(OWNER), today)).toBe(2)
  })

  it('오늘 아직 안 닫았으면 어제부터 센다', () => {
    const today = new Date('2026-07-16T21:00:00')
    saveDayClose(OWNER, record('2026-07-15'))
    saveDayClose(OWNER, record('2026-07-14'))
    expect(dayCloseStreak(loadDayCloses(OWNER), today)).toBe(2)
  })

  it('기록이 없으면 0', () => {
    expect(dayCloseStreak([], new Date())).toBe(0)
  })
})

describe('buildClosingMessage — 미래의 나 마감 인사', () => {
  it('전부 해낸 날은 개수를 근거로 알아봐준다 (어느 변주든)', () => {
    const msg = buildClosingMessage({ done: 3, total: 3, mood: '뿌듯해', date: '2026-07-17' })
    expect(msg).toContain('3개')
  })

  it('하나도 못 한 날은 다그치지 않고, 내가 쓴 편지·미달 패턴으로 일으킨다', () => {
    const msg = buildClosingMessage({
      done: 0,
      total: 2,
      mood: '아쉬워',
      adviceLine: '너무 완벽하려 하지 마. 지금 속도면 충분해.',
      fearedPattern: '시작만 하고 흐지부지되는 나',
      date: '2026-07-17',
    })
    expect(msg).toContain('나도 그런 날')
    expect(msg).toContain('흐지부지되는 나')
    expect(msg).toContain('지금 속도면 충분해')
    expect(msg).not.toContain('반성') // 죄책감 유발 금지
  })

  it('일부만 한 날은 남은 걸 내일과 나눈다', () => {
    const msg = buildClosingMessage({ done: 1, total: 3, mood: '덤덤해', date: '2026-07-17' })
    expect(msg).toContain('1개')
    expect(msg).toContain('내일')
  })

  it('계획이 없던 날도 끊긴 게 아니다', () => {
    const msg = buildClosingMessage({ done: 0, total: 0, mood: '덤덤해', date: '2026-07-17' })
    expect(msg).toContain('계획')
  })

  it('3일 이상 연속이면 리듬을 짚어준다', () => {
    const msg = buildClosingMessage({ done: 2, total: 2, mood: '뿌듯해', streak: 4, date: '2026-07-17' })
    expect(msg).toContain('4일째')
  })

  it('같은 날은 같은 문장 — 다시 열어도 인사가 바뀌지 않는다', () => {
    const ctx = { done: 2, total: 3, mood: '덤덤해', date: '2026-07-18' } as const
    expect(buildClosingMessage(ctx)).toBe(buildClosingMessage(ctx))
  })

  it('목표로 간 걸음은 일상과 구분해서 콕 집어준다', () => {
    const msg = buildClosingMessage({
      done: 2,
      total: 2,
      mood: '뿌듯해',
      date: '2026-07-17',
      goalHighlights: [{ title: '앱스토어 출시', done: 1, total: 1 }],
    })
    expect(msg).toContain('"앱스토어 출시" 쪽으로 오늘 1걸음')
  })

  it('일상만 챙긴 날엔 목표를 다그치지 않고 내일로 잇는다', () => {
    const msg = buildClosingMessage({
      done: 1,
      total: 2,
      mood: '덤덤해',
      date: '2026-07-17',
      goalHighlights: [{ title: '앱스토어 출시', done: 0, total: 1 }],
    })
    expect(msg).toContain('"앱스토어 출시"은 오늘 쉬었네')
    expect(msg).toContain('일상을 챙긴 것도 진짜 일이야')
  })
})

describe('groupGoalHighlights — 목표별 묶기', () => {
  it('같은 목표의 항목을 묶고 완료 많은 순으로 정렬한다', () => {
    const groups = groupGoalHighlights([
      { title: 'A', done: false },
      { title: 'B', done: true },
      { title: 'A', done: true },
      { title: 'B', done: true },
    ])
    expect(groups[0]).toEqual({ title: 'B', done: 2, total: 2 })
    expect(groups[1]).toEqual({ title: 'A', done: 1, total: 2 })
  })
})

describe('readChatPersonaLite — 채팅 페르소나 살짝 읽기', () => {
  it('첫 프로필의 이름·편지를 읽고, 없으면 빈 객체', () => {
    expect(readChatPersonaLite()).toEqual({})
    localStorage.setItem('futureme-profiles-index', JSON.stringify([{ id: 'p1' }]))
    localStorage.setItem(
      'futureme-profile-p1',
      JSON.stringify({ name: '지웅', future: { adviceLine: '지금 속도면 충분해' } }),
    )
    expect(readChatPersonaLite()).toEqual({ name: '지웅', adviceLine: '지금 속도면 충분해' })
  })
})

describe('dayKey', () => {
  it('YYYY-MM-DD 형식', () => {
    expect(dayKey(new Date('2026-07-16T09:00:00'))).toBe('2026-07-16')
  })
})

describe('removeDayClose — 기록 지우기', () => {
  it('해당 날짜만 지운다', () => {
    saveDayClose(OWNER, record('2026-07-15'))
    saveDayClose(OWNER, record('2026-07-16'))
    const left = removeDayClose(OWNER, '2026-07-16')
    expect(left.map((r) => r.date)).toEqual(['2026-07-15'])
    expect(getDayClose(OWNER, '2026-07-16')).toBeNull()
  })
})
