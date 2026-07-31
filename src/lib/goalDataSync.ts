import type { GoalPlan } from '../types/goalPlan'
import { getGoalAppOwnerId } from './goalAppOwner'
import {
  fetchRemoteGoalData,
  getActiveSyncUser,
  isCloudSyncAvailable,
  pushGoalDataToCloud,
  type RemoteGoalDataRow,
} from './cloudSync'
import { loadGoalPlansForSync } from './goalPlanStore'
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
    plans: loadGoalPlansForSync(ownerId),
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

/**
 * 목표의 "시각"(ms). 삭제(툼스톤)면 deletedAt, 아니면 updatedAt(ISO→ms). 더 나중이 이긴다:
 *   - 삭제가 더 나중 → 툼스톤이 이김(계속 지워진 채, 다른 기기에도 삭제 전파)
 *   - 편집이 더 나중 → 살아 있는 목표가 이김(삭제 뒤 다시 만들었으면 되살아난다)
 */
function planTime(p: GoalPlan): number {
  if (p.deletedAt != null) return p.deletedAt
  const t = Date.parse(p.updatedAt)
  return Number.isNaN(t) ? 0 : t
}

function mergePlans(local: GoalPlan[], remote: GoalPlan[]): GoalPlan[] {
  const byId = new Map<string, GoalPlan>()
  for (const plan of remote) byId.set(plan.id, plan)
  for (const plan of local) {
    const existing = byId.get(plan.id)
    if (!existing || planTime(plan) >= planTime(existing)) {
      byId.set(plan.id, plan)
    }
  }
  return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

/**
 * 같은 id의 두 항목 중 최신을 고른다.
 *
 * "시각"은 삭제(툼스톤)면 deletedAt, 아니면 updatedAt으로 본다. 더 나중이 이긴다:
 *   - 삭제가 더 나중  → 툼스톤이 이김(계속 지워진 채, 다른 기기에도 삭제 전파).
 *   - 편집이 더 나중  → 살아 있는 항목이 이김(삭제 뒤 다시 고쳤으면 되살아난다).
 * 둘 다 시각이 없으면(옛 데이터) 번들 단위 규칙(preferLocal)으로 물러난다.
 */
function itemTime(it: MiscTodoItem): number | undefined {
  return it.deletedAt ?? it.updatedAt
}

function pickNewerTodo(local: MiscTodoItem, remote: MiscTodoItem, preferLocal: boolean): MiscTodoItem {
  const lt = itemTime(local)
  const rt = itemTime(remote)
  if (lt != null && rt != null) return lt >= rt ? local : remote
  if (lt != null) return local
  if (rt != null) return remote
  return preferLocal ? local : remote
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
    byId.set(item.id, existing ? pickNewerTodo(item, existing, preferLocal) : item)
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

  // 올리기 전에 원격과 병합한다. 병합은 **항목별 최신 우선**(mergeMiscTodos가 항목 updatedAt을
  // 본다)이라, 이 기기의 방금 편집은 지키면서 다른 기기가 고친 항목도 흡수한다.
  // (예전엔 여기서 "같은 id는 무조건 로컬"로 했다가, 다른 기기의 체크·시간 편집을 덮어썼다.)
  let bundle = local
  const userId = getActiveSyncUser()
  if (userId) {
    try {
      const remoteRow = await fetchRemoteGoalData(userId)
      if (remoteRow) {
        const merged = mergeGoalDataBundles(local, remoteRowToBundle(remoteRow))
        // 병합 결과가 로컬과 다를 때만 화면에 반영(불필요한 리렌더·깜빡임 방지)
        if (serializeGoalData(merged) !== serializeGoalData(local)) applyLocalGoalDataBundle(merged)
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
