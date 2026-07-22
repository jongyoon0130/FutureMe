// ---------------------------------------------------------------------------
// 반복 일정(루틴) — "매주 화·목 운동"을 한 번만 등록하면 그 날마다 할 일이 생긴다.
//
// 설계 선택 두 가지:
// 1) **가상 항목이 아니라 진짜 할 일 행을 만든다.** 체크·수정·삭제·동기화·하루 마감·
//    미래의 나 맥락이 전부 기존 MiscTodoItem 경로를 그대로 탄다. 루틴이라고 특별
//    취급하는 곳이 없어야 나중에 안 깨진다.
// 2) **앞으로 2주치만, 지난 날은 만들지 않는다.** 며칠 앱을 안 열었다고 못 지킨
//    할 일이 무더기로 쌓여 있으면 그건 채찍이 된다 (미래상의 압박 조심).
// ---------------------------------------------------------------------------
import { insertMiscTodo, periodKeyForTier, type MiscTodoItem } from './goalMiscTodos'
import { isApplyingRemoteGoalData } from './goalDataSyncState'

export interface MiscRoutine {
  id: string
  label: string
  /** 반복 요일 (0=일 … 6=토) */
  days: number[]
  /** 이 날부터 반복 */
  startKey: string
  /** "이 날만 건너뛰기"로 지운 날들 */
  skips: string[]
  /** 반복을 끝낸 날 — 이 날짜까지만 만든다 */
  endedKey?: string
}

export const ROUTINE_DAYS_AHEAD = 14
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const
export const EVERYDAY: number[] = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS_ONLY: number[] = [1, 2, 3, 4, 5]

const STORAGE_PREFIX = 'goal-misc-routines-'

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`
}

export function loadRoutines(profileId: string): MiscRoutine[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    if (!raw) return []
    const list = JSON.parse(raw) as MiscRoutine[]
    return Array.isArray(list) ? list.map(normalizeRoutine) : []
  } catch {
    return []
  }
}

export function saveRoutines(profileId: string, routines: MiscRoutine[]): void {
  localStorage.setItem(storageKey(profileId), JSON.stringify(routines))
  if (!isApplyingRemoteGoalData()) {
    void import('./goalDataSync').then(({ scheduleGoalDataSync }) => scheduleGoalDataSync())
  }
}

function normalizeRoutine(r: MiscRoutine): MiscRoutine {
  return {
    ...r,
    days: Array.isArray(r.days) ? [...new Set(r.days)].filter((d) => d >= 0 && d <= 6).sort() : [],
    skips: Array.isArray(r.skips) ? r.skips : [],
  }
}

/** 요일 목록을 사람 말로 — "매일", "평일", "화·목" */
export function describeRoutineDays(days: number[]): string {
  const set = [...new Set(days)].sort()
  if (set.length === 7) return '매일'
  if (set.length === 5 && WEEKDAYS_ONLY.every((d) => set.includes(d))) return '평일'
  if (!set.length) return ''
  return set.map((d) => WEEKDAY_LABELS[d]).join('·')
}

function weekdayOfKey(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getDay()
}

function shiftKey(dateKey: string, n: number): string {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + n)
  return periodKeyForTier('daily', d)
}

export function routineOccursOn(r: MiscRoutine, dateKey: string): boolean {
  if (!r.days.length) return false
  if (dateKey < r.startKey) return false
  if (r.endedKey && dateKey > r.endedKey) return false
  if (r.skips.includes(dateKey)) return false
  return r.days.includes(weekdayOfKey(dateKey))
}

/** 아직 만들지 않은 반복 일정 (오늘부터 daysAhead일) — 순수 함수, 테스트용 */
export function pendingRoutineOccurrences(
  routines: MiscRoutine[],
  items: MiscTodoItem[],
  today: Date,
  daysAhead = ROUTINE_DAYS_AHEAD,
): { routine: MiscRoutine; dateKey: string }[] {
  const made = new Set(
    items.filter((it) => it.routineId).map((it) => `${it.routineId}|${it.periodKey}`),
  )
  const todayKey = periodKeyForTier('daily', today)
  const out: { routine: MiscRoutine; dateKey: string }[] = []

  for (let i = 0; i <= daysAhead; i++) {
    const dateKey = shiftKey(todayKey, i)
    for (const r of routines) {
      if (!routineOccursOn(r, dateKey)) continue
      if (made.has(`${r.id}|${dateKey}`)) continue
      out.push({ routine: r, dateKey })
    }
  }
  return out
}

/** 앞으로 2주치 반복 일정을 실제 할 일로 만들어 둔다 (이미 있으면 그대로) */
export function materializeRoutines(
  profileId: string,
  items: MiscTodoItem[],
  routines: MiscRoutine[],
  today = new Date(),
): MiscTodoItem[] {
  const pending = pendingRoutineOccurrences(routines, items, today)
  if (!pending.length) return items

  let next = items
  for (const { routine, dateKey } of pending) {
    next = insertMiscTodo(
      profileId,
      next,
      'daily',
      new Date(`${dateKey}T12:00:00`),
      routine.label,
      false,
      // 반복 일정에 시간을 붙이는 UI는 아직 없다 — 만든 뒤 각 날짜에서 시간을 정하면 된다
      undefined,
      undefined,
      { routineId: routine.id },
    )
  }
  return next
}

export function addRoutine(
  profileId: string,
  routines: MiscRoutine[],
  label: string,
  days: number[],
  startDate: Date,
): { routines: MiscRoutine[]; routine: MiscRoutine } | null {
  const trimmed = label.trim()
  const uniqueDays = [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort()
  if (!trimmed || !uniqueDays.length) return null
  const routine: MiscRoutine = {
    id: crypto.randomUUID(),
    label: trimmed,
    days: uniqueDays,
    startKey: periodKeyForTier('daily', startDate),
    skips: [],
  }
  const next = [...routines, routine]
  saveRoutines(profileId, next)
  return { routines: next, routine }
}

/** 이 날 하루만 빼기 — 반복 자체는 그대로 */
export function skipRoutineOn(
  profileId: string,
  routines: MiscRoutine[],
  routineId: string,
  dateKey: string,
): MiscRoutine[] {
  const next = routines.map((r) =>
    r.id === routineId && !r.skips.includes(dateKey) ? { ...r, skips: [...r.skips, dateKey] } : r,
  )
  saveRoutines(profileId, next)
  return next
}

/**
 * 반복 끝내기 — fromKey(보통 오늘)부터는 더 안 만든다.
 * 이미 지나간 날의 기록은 남긴다. 걸어온 길을 지우지 않기 위해서.
 */
export function endRoutine(
  profileId: string,
  routines: MiscRoutine[],
  routineId: string,
  fromDate = new Date(),
): MiscRoutine[] {
  const fromKey = periodKeyForTier('daily', fromDate)
  const next = routines.map((r) =>
    r.id === routineId ? { ...r, endedKey: shiftKey(fromKey, -1) } : r,
  )
  saveRoutines(profileId, next)
  return next
}

/** 반복 끝낼 때 지울 미래의 할 일 (오늘 포함, 아직 안 한 것만) */
export function futureRoutineItemIds(
  items: MiscTodoItem[],
  routineId: string,
  fromDate = new Date(),
): string[] {
  const fromKey = periodKeyForTier('daily', fromDate)
  return items
    .filter((it) => it.routineId === routineId && !it.done && it.periodKey >= fromKey)
    .map((it) => it.id)
}
