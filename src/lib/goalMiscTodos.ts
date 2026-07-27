import type { AggregatedItem } from './goalHierarchyEngine'
import { monthKey, startOfWeekMonday } from './goalCalendar'
import { isApplyingRemoteGoalData } from './goalDataSyncState'

export const MISC_PLAN_ID = '__misc__'
export const MISC_PLAN_TITLE = '일상'

const STORAGE_PREFIX = 'goal-misc-todos-'

export interface MiscTodoItem {
  id: string
  label: string
  done: boolean
  tier: 'daily' | 'weekly' | 'monthly'
  periodKey: string
  /** 일간 — 24h HH:mm */
  timeStart?: string
  timeEnd?: string
  /** 이 할 일 알림 끄기 (기본은 켜짐 = undefined) */
  notifyOff?: boolean
  /** 반복 일정에서 생긴 행이면 그 루틴 id (goalRoutines.ts) */
  routineId?: string
  /**
   * 이 항목을 마지막으로 고친 시각(ms). 기기 간 병합에서 **항목별 최신 우선**을 쓰기 위한 값.
   * 없으면(옛 데이터) 번들 단위 규칙으로 물러난다. 항목을 만들거나 고칠 때마다 갱신한다.
   */
  updatedAt?: number
  /**
   * 삭제 표식(툼스톤). 지운 시각(ms). 설정돼 있으면 이 항목은 **지워진 것**이라 화면에
   * 안 뜨지만, 배열에는 남아서 동기화로 다른 기기까지 삭제를 전파한다. 지운 뒤 다른 기기에서
   * 그 항목을 더 늦게 고쳤으면(updatedAt > deletedAt) 병합 때 되살아난다. 오래되면 정리한다.
   */
  deletedAt?: number
}

/** 툼스톤을 이 기간(ms)보다 오래 두지 않는다 — 그쯤이면 모든 기기가 삭제를 받아갔다고 본다 */
const TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60일

/** 항목을 삭제 표식(툼스톤)으로 바꾼다. 화면 표시는 label로 걸러지므로 label도 비운다 */
function toTombstone(it: MiscTodoItem): MiscTodoItem {
  const now = Date.now()
  return { id: it.id, label: '', done: it.done, tier: it.tier, periodKey: it.periodKey, deletedAt: now, updatedAt: now }
}

/** 오래된 툼스톤을 버린다 (저장 때마다 불러 배열이 무한정 자라지 않게) */
function pruneTombstones(items: MiscTodoItem[]): MiscTodoItem[] {
  const cutoff = Date.now() - TOMBSTONE_TTL_MS
  const pruned = items.filter((it) => !(it.deletedAt && it.deletedAt < cutoff))
  return pruned.length === items.length ? items : pruned
}

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`
}

function uid(): string {
  return crypto.randomUUID()
}

export function periodKeyForTier(tier: 'daily' | 'weekly' | 'monthly', date: Date): string {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  if (tier === 'daily') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  if (tier === 'weekly') {
    const mon = startOfWeekMonday(d)
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`
  }
  return monthKey(d)
}

export function loadMiscTodos(profileId: string): MiscTodoItem[] {
  try {
    const raw = localStorage.getItem(storageKey(profileId))
    if (!raw) return []
    const list = JSON.parse(raw) as MiscTodoItem[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function saveMiscTodos(profileId: string, items: MiscTodoItem[]): void {
  localStorage.setItem(storageKey(profileId), JSON.stringify(pruneTombstones(items)))
  if (!isApplyingRemoteGoalData()) {
    void import('./goalDataSync').then(({ scheduleGoalDataSync }) => scheduleGoalDataSync())
  }
}

export function addMiscTodo(
  profileId: string,
  items: MiscTodoItem[],
  tier: 'daily' | 'weekly' | 'monthly',
  date: Date,
  label: string,
): MiscTodoItem[] {
  return insertMiscTodo(profileId, items, tier, date, label, false)
}

export function insertMiscTodo(
  profileId: string,
  items: MiscTodoItem[],
  tier: 'daily' | 'weekly' | 'monthly',
  date: Date,
  label: string,
  done = false,
  timeStart?: string,
  timeEnd?: string,
  extra?: { routineId?: string },
): MiscTodoItem[] {
  const trimmed = label.trim()
  if (!trimmed) return items
  const row: MiscTodoItem = {
    id: uid(),
    label: trimmed,
    done,
    tier,
    periodKey: periodKeyForTier(tier, date),
    updatedAt: Date.now(),
  }
  if (timeStart?.trim()) row.timeStart = timeStart.trim()
  if (timeEnd?.trim()) row.timeEnd = timeEnd.trim()
  if (extra?.routineId) row.routineId = extra.routineId
  const next = [...items, row]
  saveMiscTodos(profileId, next)
  return next
}

export function toggleMiscTodo(profileId: string, items: MiscTodoItem[], itemId: string): MiscTodoItem[] {
  const next = items.map((it) => (it.id === itemId ? { ...it, done: !it.done, updatedAt: Date.now() } : it))
  saveMiscTodos(profileId, next)
  return next
}

export function removeMiscTodo(profileId: string, items: MiscTodoItem[], itemId: string): MiscTodoItem[] {
  // 배열에서 빼지 않고 툼스톤으로 바꾼다 — 이걸 안 하면 "지웠다"는 사실이 동기화로 안 가서
  // 다른 기기에 아직 있는 항목이 되살아난다.
  const next = items.map((it) => (it.id === itemId && !it.deletedAt ? toTombstone(it) : it))
  saveMiscTodos(profileId, next)
  return next
}

export function removeMiscTodos(
  profileId: string,
  items: MiscTodoItem[],
  itemIds: readonly string[],
): MiscTodoItem[] {
  const drop = new Set(itemIds)
  if (!drop.size) return items
  const next = items.map((it) => (drop.has(it.id) && !it.deletedAt ? toTombstone(it) : it))
  saveMiscTodos(profileId, next)
  return next
}

export function updateMiscTodoLabel(
  profileId: string,
  items: MiscTodoItem[],
  itemId: string,
  label: string,
): MiscTodoItem[] {
  const next = items.map((it) => (it.id === itemId ? { ...it, label, updatedAt: Date.now() } : it))
  saveMiscTodos(profileId, next)
  return next
}

export function updateMiscTodoTime(
  profileId: string,
  items: MiscTodoItem[],
  itemId: string,
  timeStart?: string,
  timeEnd?: string,
  notifyOff?: boolean,
): MiscTodoItem[] {
  const next = items.map((it) => {
    if (it.id !== itemId) return it
    const merged: MiscTodoItem = { ...it }
    if (timeStart?.trim()) merged.timeStart = timeStart.trim()
    else delete merged.timeStart
    if (timeEnd?.trim()) merged.timeEnd = timeEnd.trim()
    else delete merged.timeEnd
    if (notifyOff) merged.notifyOff = true
    else delete merged.notifyOff
    merged.updatedAt = Date.now()
    return merged
  })
  saveMiscTodos(profileId, next)
  return next
}

function toAggregated(items: MiscTodoItem[]): AggregatedItem[] {
  return items
    .filter((it) => it.label.trim())
    .map((it) => ({
    id: it.id,
    label: it.label,
    done: it.done,
    planId: MISC_PLAN_ID,
    planTitle: MISC_PLAN_TITLE,
    tier: it.tier,
    timeStart: it.timeStart,
    timeEnd: it.timeEnd,
    notifyOff: it.notifyOff,
    ...(it.routineId ? { routineId: it.routineId } : {}),
  }))
}

export function miscAggregatedForDate(
  items: MiscTodoItem[],
  date: Date,
): { daily: AggregatedItem[]; weekly: AggregatedItem[]; monthly: AggregatedItem[] } {
  const dailyKey = periodKeyForTier('daily', date)
  const weeklyKey = periodKeyForTier('weekly', date)
  const monthlyKey = periodKeyForTier('monthly', date)

  return {
    daily: toAggregated(items.filter((it) => it.tier === 'daily' && it.periodKey === dailyKey)),
    weekly: toAggregated(items.filter((it) => it.tier === 'weekly' && it.periodKey === weeklyKey)),
    monthly: toAggregated(items.filter((it) => it.tier === 'monthly' && it.periodKey === monthlyKey)),
  }
}

export function miscDailyStats(items: MiscTodoItem[], date: Date): { done: number; total: number } {
  const dailyKey = periodKeyForTier('daily', date)
  const dayItems = items.filter((it) => it.tier === 'daily' && it.periodKey === dailyKey && it.label.trim())
  return {
    total: dayItems.length,
    done: dayItems.filter((it) => it.done).length,
  }
}
