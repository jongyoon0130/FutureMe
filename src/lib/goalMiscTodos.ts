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
  localStorage.setItem(storageKey(profileId), JSON.stringify(items))
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
): MiscTodoItem[] {
  const trimmed = label.trim()
  if (!trimmed) return items
  const row: MiscTodoItem = {
    id: uid(),
    label: trimmed,
    done,
    tier,
    periodKey: periodKeyForTier(tier, date),
  }
  if (timeStart?.trim()) row.timeStart = timeStart.trim()
  if (timeEnd?.trim()) row.timeEnd = timeEnd.trim()
  const next = [...items, row]
  saveMiscTodos(profileId, next)
  return next
}

export function toggleMiscTodo(profileId: string, items: MiscTodoItem[], itemId: string): MiscTodoItem[] {
  const next = items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it))
  saveMiscTodos(profileId, next)
  return next
}

export function removeMiscTodo(profileId: string, items: MiscTodoItem[], itemId: string): MiscTodoItem[] {
  const next = items.filter((it) => it.id !== itemId)
  saveMiscTodos(profileId, next)
  return next
}

export function updateMiscTodoLabel(
  profileId: string,
  items: MiscTodoItem[],
  itemId: string,
  label: string,
): MiscTodoItem[] {
  const next = items.map((it) => (it.id === itemId ? { ...it, label } : it))
  saveMiscTodos(profileId, next)
  return next
}

export function updateMiscTodoTime(
  profileId: string,
  items: MiscTodoItem[],
  itemId: string,
  timeStart?: string,
  timeEnd?: string,
): MiscTodoItem[] {
  const next = items.map((it) => {
    if (it.id !== itemId) return it
    const merged: MiscTodoItem = { ...it }
    if (timeStart?.trim()) merged.timeStart = timeStart.trim()
    else delete merged.timeStart
    if (timeEnd?.trim()) merged.timeEnd = timeEnd.trim()
    else delete merged.timeEnd
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
