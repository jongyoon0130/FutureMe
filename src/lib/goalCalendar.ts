/** 달력 기반 월·주·일 슬롯 생성 */

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

export function parseIso(iso: string): Date {
  const d = new Date(`${iso}T12:00:00`)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

export function fmtShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabelFromKey(key: string): string {
  const [y, m] = key.split('-')
  return `${y}년 ${Number(m)}월`
}

export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  const day = x.getDay()
  x.setDate(x.getDate() - ((day + 6) % 7))
  return x
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

export function daysBetween(start: Date, end: Date): number {
  const s = new Date(start)
  s.setHours(12, 0, 0, 0)
  const e = new Date(end)
  e.setHours(12, 0, 0, 0)
  return Math.max(1, Math.ceil((e.getTime() - s.getTime()) / 86400000))
}

export function rangeLabel(start: Date, end: Date): string {
  return `${fmtShort(start)} – ${fmtShort(end)} · ${daysBetween(start, end)}일`
}

export function isWithin(a: Date, start: Date, end: Date): boolean {
  const t = a.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

/** 목표 기간에 걸친 달력 월 목록 */
export function calendarMonthsInRange(start: Date, end: Date): string[] {
  const keys: string[] = []
  let cur = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0)
  const last = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0)
  while (cur <= last) {
    keys.push(monthKey(cur))
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12, 0, 0)
  }
  return keys
}

/** 주 [ws, we] 가 해당 월(YYYY-MM)과 겹치는지 */
export function weekOverlapsMonth(weekStart: Date, weekEnd: Date, monthKeyStr: string): boolean {
  const [y, m] = monthKeyStr.split('-').map(Number)
  const monthStart = new Date(y, m - 1, 1, 12, 0, 0)
  const monthEnd = new Date(y, m, 0, 12, 0, 0)
  return weekStart <= monthEnd && weekEnd >= monthStart
}

export interface TimelineDay {
  date: Date
  dateLabel: string
  dayOfWeek: string
  isToday: boolean
}

export interface TimelineWeek {
  globalIndex: number
  weekStart: Date
  weekEnd: Date
  dateLabel: string
  monthKeys: string[]
  days: TimelineDay[]
}

export interface GoalTimeline {
  start: Date
  end: Date
  daysTotal: number
  monthKeys: string[]
  weeks: TimelineWeek[]
  flatDays: TimelineDay[]
}

export function buildTimeline(start: Date, end: Date): GoalTimeline {
  const s = new Date(start)
  s.setHours(12, 0, 0, 0)
  const e = new Date(end)
  e.setHours(12, 0, 0, 0)
  const today = new Date()
  today.setHours(12, 0, 0, 0)

  const flatDays: TimelineDay[] = []
  for (let d = new Date(s); d <= e; d = addDays(d, 1)) {
    flatDays.push({
      date: new Date(d),
      dateLabel: fmtShort(d),
      dayOfWeek: DOW[d.getDay()],
      isToday: d.getTime() === today.getTime(),
    })
  }

  const monthKeys = calendarMonthsInRange(s, e)
  const weeks: TimelineWeek[] = []
  let ws = startOfWeekMonday(s)
  let globalIndex = 0

  while (ws <= e) {
    const we = addDays(ws, 6)
    const daysInGoal: TimelineDay[] = []
    for (let i = 0; i < 7; i++) {
      const d = addDays(ws, i)
      if (isWithin(d, s, e)) {
        daysInGoal.push({
          date: d,
          dateLabel: fmtShort(d),
          dayOfWeek: DOW[d.getDay()],
          isToday: d.getTime() === today.getTime(),
        })
      }
    }
    if (daysInGoal.length > 0) {
      globalIndex += 1
      const clippedStart = daysInGoal[0].date
      const clippedEnd = daysInGoal[daysInGoal.length - 1].date
      weeks.push({
        globalIndex,
        weekStart: clippedStart,
        weekEnd: clippedEnd,
        dateLabel: `${fmtShort(clippedStart)} – ${fmtShort(clippedEnd)}`,
        monthKeys: monthKeys.filter((mk) => weekOverlapsMonth(ws, we, mk)),
        days: daysInGoal,
      })
    }
    ws = addDays(ws, 7)
  }

  return {
    start: s,
    end: e,
    daysTotal: flatDays.length,
    monthKeys,
    weeks,
    flatDays,
  }
}

/** 1.5주 = 10.5일 → 11일 미만이면 일 단위만 */
export const DAY_ONLY_MAX_DAYS = 10

export function usesWeekPlan(daysTotal: number): boolean {
  return daysTotal > DAY_ONLY_MAX_DAYS
}

export function usesMonthPlan(monthCount: number): boolean {
  return monthCount >= 2
}
