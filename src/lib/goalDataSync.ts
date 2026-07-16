import type { GoalPlan } from '../types/goalPlan'
import { getGoalAppOwnerId } from './goalAppOwner'
import {
  fetchRemoteGoalData,
  isCloudSyncAvailable,
  pushGoalDataToCloud,
  type RemoteGoalDataRow,
} from './cloudSync'
import { loadGoalPlans } from './goalPlanStore'
import { writeGoalPlanSnapshot } from './goalPlanSnapshot'
import { loadMiscTodos, type MiscTodoItem } from './goalMiscTodos'
import { isApplyingRemoteGoalData, setApplyingRemoteGoalData } from './goalDataSyncState'

const REVISION_KEY = 'futureme-goal-data-revision'
export const GOAL_DATA_SYNC_EVENT = 'futureme-goal-data-synced'

export type GoalDataBundle = {
  ownerId: string
  plans: GoalPlan[]
  miscTodos: MiscTodoItem[]
  updatedAt: number
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

export function getGoalDataRevision(): number {
  try {
    return Number(localStorage.getItem(REVISION_KEY) || 0)
  } catch {
    return 0
  }
}

export function markGoalDataRevision(ts = Date.now()): number {
  try {
    localStorage.setItem(REVISION_KEY, String(ts))
  } catch {
    /* ignore */
  }
  return ts
}

export function loadLocalGoalDataBundle(): GoalDataBundle {
  const ownerId = getGoalAppOwnerId()
  return {
    ownerId,
    plans: loadGoalPlans(ownerId),
    miscTodos: loadMiscTodos(ownerId),
    updatedAt: getGoalDataRevision(),
  }
}

export function hasLocalGoalData(): boolean {
  const bundle = loadLocalGoalDataBundle()
  return bundle.plans.length > 0 || bundle.miscTodos.length > 0
}

function plansKey(ownerId: string): string {
  return `goal-plans-${ownerId}`
}

function miscKey(ownerId: string): string {
  return `goal-misc-todos-${ownerId}`
}

export function applyLocalGoalDataBundle(bundle: GoalDataBundle): void {
  setApplyingRemoteGoalData(true)
  try {
    localStorage.setItem('goal-app-owner-id', bundle.ownerId)
    localStorage.setItem(plansKey(bundle.ownerId), JSON.stringify(bundle.plans))
    localStorage.setItem(miscKey(bundle.ownerId), JSON.stringify(bundle.miscTodos))
    writeGoalPlanSnapshot(bundle.ownerId, bundle.plans)
    markGoalDataRevision(bundle.updatedAt)
  } finally {
    setApplyingRemoteGoalData(false)
  }
  window.dispatchEvent(new CustomEvent(GOAL_DATA_SYNC_EVENT))
}

function mergePlans(local: GoalPlan[], remote: GoalPlan[]): GoalPlan[] {
  const byId = new Map<string, GoalPlan>()
  for (const plan of remote) byId.set(plan.id, plan)
  for (const plan of local) {
    const existing = byId.get(plan.id)
    if (!existing || plan.updatedAt.localeCompare(existing.updatedAt) >= 0) {
      byId.set(plan.id, plan)
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function mergeMiscTodos(
  local: MiscTodoItem[],
  remote: MiscTodoItem[],
  localRev: number,
  remoteRev: number,
): MiscTodoItem[] {
  const preferLocal = localRev >= remoteRev
  const byId = new Map<string, MiscTodoItem>()
  for (const item of remote) byId.set(item.id, item)
  for (const item of local) {
    const existing = byId.get(item.id)
    if (!existing || preferLocal) byId.set(item.id, item)
  }
  return [...byId.values()]
}

export function mergeGoalDataBundles(local: GoalDataBundle, remote: GoalDataBundle): GoalDataBundle {
  const ownerId = remote.updatedAt >= local.updatedAt ? remote.ownerId : local.ownerId
  const updatedAt = Math.max(local.updatedAt, remote.updatedAt, Date.now())
  return {
    ownerId,
    plans: mergePlans(local.plans, remote.plans),
    miscTodos: mergeMiscTodos(local.miscTodos, remote.miscTodos, local.updatedAt, remote.updatedAt),
    updatedAt,
  }
}

export function remoteRowToBundle(row: RemoteGoalDataRow): GoalDataBundle {
  return {
    ownerId: row.owner_id,
    plans: Array.isArray(row.plans) ? (row.plans as GoalPlan[]) : [],
    miscTodos: Array.isArray(row.misc_todos) ? (row.misc_todos as MiscTodoItem[]) : [],
    updatedAt: row.updated_at,
  }
}

export async function pushLocalGoalData(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const bundle = loadLocalGoalDataBundle()
  const updatedAt = markGoalDataRevision()
  await pushGoalDataToCloud({
    ownerId: bundle.ownerId,
    plans: bundle.plans,
    miscTodos: bundle.miscTodos,
    updatedAt,
  })
}

export function scheduleGoalDataSync(): void {
  if (isApplyingRemoteGoalData() || !isCloudSyncAvailable()) return
  markGoalDataRevision()
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushLocalGoalData().catch(() => {})
  }, 800)
}

export async function syncGoalDataOnLogin(userId: string): Promise<'uploaded' | 'downloaded' | 'merged' | 'empty'> {
  const local = loadLocalGoalDataBundle()
  const remoteRow = await fetchRemoteGoalData(userId)
  const localHas = hasLocalGoalData()
  const remoteHas = remoteRow != null

  if (localHas && !remoteHas) {
    await pushLocalGoalData()
    return 'uploaded'
  }

  if (!localHas && remoteHas) {
    applyLocalGoalDataBundle(remoteRowToBundle(remoteRow))
    return 'downloaded'
  }

  if (localHas && remoteHas) {
    const remote = remoteRowToBundle(remoteRow)
    if (remote.updatedAt > local.updatedAt) {
      const merged = mergeGoalDataBundles(local, remote)
      applyLocalGoalDataBundle(merged)
      await pushGoalDataToCloud({
        ownerId: merged.ownerId,
        plans: merged.plans,
        miscTodos: merged.miscTodos,
        updatedAt: merged.updatedAt,
      })
      return 'merged'
    }
    if (local.updatedAt > remote.updatedAt) {
      await pushLocalGoalData()
      return 'merged'
    }
    const merged = mergeGoalDataBundles(local, remote)
    applyLocalGoalDataBundle(merged)
    await pushGoalDataToCloud({
      ownerId: merged.ownerId,
      plans: merged.plans,
      miscTodos: merged.miscTodos,
      updatedAt: merged.updatedAt,
    })
    return 'merged'
  }

  return 'empty'
}
