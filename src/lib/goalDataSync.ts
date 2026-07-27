import type { GoalPlan } from '../types/goalPlan'
import { getGoalAppOwnerId } from './goalAppOwner'
import {
  fetchRemoteGoalData,
  getActiveSyncUser,
  isCloudSyncAvailable,
  pushGoalDataToCloud,
  type RemoteGoalDataRow,
} from './cloudSync'
import { loadGoalPlans } from './goalPlanStore'
import { writeGoalPlanSnapshot } from './goalPlanSnapshot'
import { loadMiscTodos, type MiscTodoItem } from './goalMiscTodos'
import { loadRoutines, type MiscRoutine } from './goalRoutines'
import { isApplyingRemoteGoalData, setApplyingRemoteGoalData } from './goalDataSyncState'
import { syncRemindersToCloud } from './reminderSync'

const REVISION_KEY = 'futureme-goal-data-revision'
export const GOAL_DATA_SYNC_EVENT = 'futureme-goal-data-synced'

export type GoalDataBundle = {
  ownerId: string
  plans: GoalPlan[]
  miscTodos: MiscTodoItem[]
  routines: MiscRoutine[]
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
    routines: loadRoutines(ownerId),
    updatedAt: getGoalDataRevision(),
  }
}

export function hasLocalGoalData(): boolean {
  const bundle = loadLocalGoalDataBundle()
  return bundle.plans.length > 0 || bundle.miscTodos.length > 0 || bundle.routines.length > 0
}

function plansKey(ownerId: string): string {
  return `goal-plans-${ownerId}`
}

function miscKey(ownerId: string): string {
  return `goal-misc-todos-${ownerId}`
}

function routinesKey(ownerId: string): string {
  return `goal-misc-routines-${ownerId}`
}

export function applyLocalGoalDataBundle(bundle: GoalDataBundle): void {
  setApplyingRemoteGoalData(true)
  try {
    localStorage.setItem('goal-app-owner-id', bundle.ownerId)
    localStorage.setItem(plansKey(bundle.ownerId), JSON.stringify(bundle.plans))
    localStorage.setItem(miscKey(bundle.ownerId), JSON.stringify(bundle.miscTodos))
    localStorage.setItem(routinesKey(bundle.ownerId), JSON.stringify(bundle.routines))
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

/** 루틴도 id 기준 병합 — 최근에 바뀐 쪽을 우선한다 (할 일과 같은 규칙) */
function mergeRoutines(
  local: MiscRoutine[],
  remote: MiscRoutine[],
  localRev: number,
  remoteRev: number,
): MiscRoutine[] {
  const preferLocal = localRev >= remoteRev
  const byId = new Map<string, MiscRoutine>()
  for (const r of remote) byId.set(r.id, r)
  for (const r of local) {
    const existing = byId.get(r.id)
    if (!existing || preferLocal) byId.set(r.id, r)
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
    routines: mergeRoutines(local.routines, remote.routines, local.updatedAt, remote.updatedAt),
    updatedAt,
  }
}

export function remoteRowToBundle(row: RemoteGoalDataRow): GoalDataBundle {
  return {
    ownerId: row.owner_id,
    plans: Array.isArray(row.plans) ? (row.plans as GoalPlan[]) : [],
    miscTodos: Array.isArray(row.misc_todos) ? (row.misc_todos as MiscTodoItem[]) : [],
    routines: Array.isArray(row.routines) ? (row.routines as MiscRoutine[]) : [],
    updatedAt: row.updated_at,
  }
}

export async function pushLocalGoalData(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const local = loadLocalGoalDataBundle()

  // **올리기 전에 원격과 병합한다.** 안 그러면 이 경로가 원격을 통째로 덮어써서,
  // 다른 기기가 먼저 올린 할 일이 사라지고 그 할 일에 걸린 알림 예약도 같이 지워진다
  // (폰+맥을 같이 쓰면 알림이 조용히 안 오게 되는 원인). 병합은 id 기준 + 최신 우선이라
  // 이 기기의 방금 편집은 지키면서 다른 기기 것만 흡수한다.
  let bundle = local
  const userId = getActiveSyncUser()
  if (userId) {
    try {
      const remoteRow = await fetchRemoteGoalData(userId)
      if (remoteRow) {
        const merged = mergeGoalDataBundles(local, remoteRowToBundle(remoteRow))
        applyLocalGoalDataBundle(merged) // 다른 기기 변경을 이 기기 화면에도 반영
        bundle = merged
      }
    } catch {
      // 원격 조회 실패는 무시하고 로컬로 올린다 — 저장이 막히는 것보단 낫다
    }
  }

  const updatedAt = markGoalDataRevision()
  await pushGoalDataToCloud({
    ownerId: bundle.ownerId,
    plans: bundle.plans,
    miscTodos: bundle.miscTodos,
    routines: bundle.routines,
    updatedAt,
  })
  // 2-b: 할 일을 올린 김에 알림 예약표도 최신화한다 (실패해도 저장은 성공한 채로)
  await syncRemindersToCloud(bundle.plans, bundle.miscTodos)
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
    const remote = remoteRowToBundle(remoteRow)
    applyLocalGoalDataBundle(remote)
    // 새 기기에서 로그인만 해도 오늘 예약이 서버에 서게 (편집을 기다리지 않고)
    await syncRemindersToCloud(remote.plans, remote.miscTodos)
    return 'downloaded'
  }

  if (localHas && remoteHas) {
    const remote = remoteRowToBundle(remoteRow)
    if (local.updatedAt > remote.updatedAt) {
      await pushLocalGoalData() // 예약표 갱신 포함
      return 'merged'
    }
    const merged = mergeGoalDataBundles(local, remote)
    applyLocalGoalDataBundle(merged)
    await pushGoalDataToCloud({
      ownerId: merged.ownerId,
      plans: merged.plans,
      miscTodos: merged.miscTodos,
      routines: merged.routines,
      updatedAt: merged.updatedAt,
    })
    await syncRemindersToCloud(merged.plans, merged.miscTodos)
    return 'merged'
  }

  return 'empty'
}
