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

// 실시간 반영에서 "내가 방금 올린 변경이 되돌아오는 것(에코)"을 걸러내기 위한 표식.
// **시계값(updatedAt)에 안 기댄다** — 기기 시계가 어긋나면 남의 변경을 에코로 오인해
// 놓치거나, 내 것을 남의 것으로 오인해 무한 반영될 수 있다(지난 회귀의 교훈).
// 대신 내용을 직렬화해 "지금 클라우드에 있다고 아는 내용"과 같으면 건너뛴다.
let knownCloudContent = ''

function serializeGoalData(b: GoalDataBundle): string {
  return JSON.stringify([b.plans, b.miscTodos, b.routines])
}

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

/**
 * 올리기 전 병합 — **이 기기의 편집은 무조건 지키고, 다른 기기가 새로 추가한 것만 흡수한다.**
 *
 * 왜 타임스탬프 최신 우선(mergeGoalDataBundles)을 안 쓰나:
 *   그건 번들 단위 updatedAt으로 승자를 정하는데, 폰↔맥 시계가 조금만 어긋나도
 *   방금 이 기기에서 넣은 편집(예: 할 일 시간)이 "원격이 더 최신"으로 판정돼 덮어써진다.
 *   실제로 폰에서 시간을 넣으면 바로 사라지는 버그가 이거였다.
 *
 * 그래서 푸시 경로에서는 **같은 id는 항상 로컬(이 기기)** 을 쓰고, **로컬에 없는 원격 id만**
 * 덧붙인다. 이러면:
 *   - 이 기기의 방금 편집은 절대 안 잃는다 (같은 id는 로컬 승).
 *   - 다른 기기가 새로 추가한 할 일은 안 지운다 (원격-only는 흡수) → 예약도 안 사라진다.
 * 같은 id의 "다른 기기 최신 편집"은 그 기기가 자기 화면 기준으로 다시 올리며 수렴한다.
 */
export function absorbRemoteOnly<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const localIds = new Set(local.map((x) => x.id))
  const extra = remote.filter((x) => !localIds.has(x.id))
  return extra.length ? [...local, ...extra] : local // 덧붙일 게 없으면 원본 그대로(참조 유지)
}

export async function pushLocalGoalData(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const local = loadLocalGoalDataBundle()

  let bundle = local
  const userId = getActiveSyncUser()
  if (userId) {
    try {
      const remoteRow = await fetchRemoteGoalData(userId)
      if (remoteRow) {
        const remote = remoteRowToBundle(remoteRow)
        const plans = absorbRemoteOnly(local.plans, remote.plans)
        const miscTodos = absorbRemoteOnly(local.miscTodos, remote.miscTodos)
        const routines = absorbRemoteOnly(local.routines, remote.routines)
        // 흡수한 게 있을 때만 로컬에 반영(불필요한 리렌더·깜빡임 방지)
        if (plans !== local.plans || miscTodos !== local.miscTodos || routines !== local.routines) {
          bundle = { ...local, plans, miscTodos, routines }
          applyLocalGoalDataBundle(bundle)
        }
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
  // 방금 올린 내용을 "클라우드에 있다고 아는 내용"으로 기록 → 이 변경이 실시간으로
  // 되돌아와도 에코로 걸러진다.
  knownCloudContent = serializeGoalData(bundle)
  // 2-b: 할 일을 올린 김에 알림 예약표도 최신화한다 (실패해도 저장은 성공한 채로)
  await syncRemindersToCloud(bundle.plans, bundle.miscTodos)
}

/**
 * 원격 목표 데이터 한 줄을 이 기기에 반영한다 (실시간 이벤트·캐치업 당김 공용).
 *
 * - 에코 방지: 내용이 "지금 클라우드에 있다고 아는 것"과 같으면 아무것도 안 한다.
 * - 반영: 원격을 로컬과 병합해 로컬에만 있는 항목은 지키면서 다른 기기 변경을 흡수한다.
 *   (이 기기가 방금 편집 중이 아니면 원격이 이기므로 다른 기기 편집이 바로 보인다.)
 */
export function applyRemoteGoalRow(row: RemoteGoalDataRow): void {
  const remote = remoteRowToBundle(row)
  const remoteContent = serializeGoalData(remote)
  if (remoteContent === knownCloudContent) return // 내가 올린 에코 or 이미 반영됨

  const local = loadLocalGoalDataBundle()
  const merged = mergeGoalDataBundles(local, remote)
  knownCloudContent = remoteContent // 이 원격 상태는 봤다고 기록 (반복 이벤트 무시)

  // 병합 결과가 로컬과 같으면 굳이 다시 쓰지 않는다 (깜빡임·불필요 이벤트 방지)
  if (serializeGoalData(merged) === serializeGoalData(local)) return
  applyLocalGoalDataBundle(merged)
}

/**
 * 원격을 한 번 당겨 반영한다. 앱이 (백그라운드에서) 돌아왔을 때 놓친 변경을 따라잡는 용도.
 * 실시간 구독이 끊겼던 구간을 메운다. 실패해도 조용히 넘어간다.
 */
export async function pullRemoteGoalDataOnce(): Promise<void> {
  if (!isCloudSyncAvailable()) return
  const userId = getActiveSyncUser()
  if (!userId) return
  try {
    const row = await fetchRemoteGoalData(userId)
    if (row) applyRemoteGoalRow(row)
  } catch {
    // 조회 실패는 무시 — 다음 기회에 다시 당긴다
  }
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
