import type { GoalPlan } from '../types/goalPlan'
import { GOAL_PLAN_TEMPLATE_VERSION } from '../types/goalPlan'
import type { SelfProfile } from '../types/self'
import { mergeMotivationAnswers, recoverPlansMotivation } from './goalMotivationRecovery'
import { dedupePlansHierarchyItemIds, hydratePlansFromSections } from './goalSectionHydration'
import { restoreGoalPlansFromSnapshot, writeGoalPlanSnapshot } from './goalPlanSnapshot'
import { migrateGoalPlan } from './goalTemplateEngine'
import { isApplyingRemoteGoalData } from './goalDataSyncState'

const CURRENT_PREFIX = 'goal-plans-'
/** 채팅 앱 시절 저장 키 */
const LEGACY_PREFIX = 'futureme-goal-plans-'

const key = (profileId: string) => `${CURRENT_PREFIX}${profileId}`

/** 툼스톤을 이 기간(ms)보다 오래 두지 않는다 — 그쯤이면 모든 기기가 삭제를 받아갔다 (miscTodo와 동일) */
const PLAN_TOMBSTONE_TTL_MS = 60 * 24 * 60 * 60 * 1000 // 60일

function prunePlanTombstones(tombs: GoalPlan[]): GoalPlan[] {
  const cutoff = Date.now() - PLAN_TOMBSTONE_TTL_MS
  return tombs.filter((p) => !(p.deletedAt && p.deletedAt < cutoff))
}

function parsePlansRaw(raw: string | null): GoalPlan[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as GoalPlan[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** 채팅 앱 프로필 ID — futureme-goal-plans-{id} 키 복구용 */
function chatProfileIds(): string[] {
  try {
    const raw = localStorage.getItem('futureme-profiles-index')
    if (!raw) return []
    const list = JSON.parse(raw) as { id?: string }[]
    if (!Array.isArray(list)) return []
    return list.map((p) => p.id).filter((id): id is string => !!id)
  } catch {
    return []
  }
}

/** 다른 localStorage 키에 남아 있는 목표 수집 (구 채팅 프로필·이전 owner ID 등) */
function scanExternalPlanSources(excludeKey: string): GoalPlan[] {
  const found: GoalPlan[] = []
  const seen = new Set<string>()

  const keysToTry = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey) continue
    const fromLegacy = storageKey.startsWith(LEGACY_PREFIX)
    const fromOtherOwner = storageKey.startsWith(CURRENT_PREFIX) && storageKey !== excludeKey
    if (fromLegacy || fromOtherOwner) keysToTry.add(storageKey)
  }
  for (const profileId of chatProfileIds()) {
    keysToTry.add(`${LEGACY_PREFIX}${profileId}`)
  }

  for (const storageKey of keysToTry) {
    for (const plan of parsePlansRaw(localStorage.getItem(storageKey))) {
      if (!plan?.id || seen.has(plan.id)) continue
      seen.add(plan.id)
      found.push(plan)
    }
  }

  return found
}

function migrateList(list: GoalPlan[], profileId: string, profile?: SelfProfile): GoalPlan[] {
  return list.map((p) => migrateGoalPlan({ ...p, profileId }, profile))
}

function needsPersistMigration(before: GoalPlan[], after: GoalPlan[]): boolean {
  return before.some((p, i) => {
    const m = after[i]
    return (
      p.templateVersion !== GOAL_PLAN_TEMPLATE_VERSION ||
      !p.hierarchy ||
      m.hierarchy !== p.hierarchy
    )
  })
}

function saveAll(profileId: string, plans: GoalPlan[]): void {
  localStorage.setItem(key(profileId), JSON.stringify(plans))
  writeGoalPlanSnapshot(profileId, plans)
  if (!isApplyingRemoteGoalData()) {
    void import('./goalDataSync').then(({ scheduleGoalDataSync }) => scheduleGoalDataSync())
  }
}

/**
 * 구 저장소 → 현재 owner 키로 병합. 삭제 표식(툼스톤)은 무거운 처리(마이그레이션·
 * 하이드레이션·중복정리)에서 격리해 그대로 보존하고, 결과 뒤에 다시 붙인다.
 * 반환값은 **툼스톤 포함**(저장·동기화용) — 화면용 loadGoalPlans가 걸러낸다.
 */
function mergeExternalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  const storageKey = key(profileId)
  const stored = parsePlansRaw(localStorage.getItem(storageKey))
  const liveStored = stored.filter((p) => !p.deletedAt)
  const rawTombstones = stored.filter((p) => p.deletedAt)
  const tombstones = prunePlanTombstones(rawTombstones)
  const tombstonesPruned = tombstones.length !== rawTombstones.length
  const tombIds = new Set(tombstones.map((t) => t.id))

  // 지운 목표가 다른 localStorage 키(구 채팅 프로필 등)에 아직 살아 있어도 되살리지 않는다
  const external = scanExternalPlanSources(storageKey).filter((p) => !p.deletedAt && !tombIds.has(p.id))

  if (!external.length && !liveStored.length) {
    if (tombstones.length) {
      // 살아 있는 목표는 없고 툼스톤만 있음 — 스냅샷 복구를 하면 지운 게 되살아난다. 하지 않는다.
      if (tombstonesPruned) saveAll(profileId, tombstones)
      return tombstones
    }
    const fromSnapshot = restoreGoalPlansFromSnapshot(profileId)
    if (fromSnapshot?.length) {
      saveAll(profileId, migrateList(fromSnapshot, profileId, profile))
      return loadGoalPlansForSync(profileId, profile)
    }
    return []
  }

  const byId = new Map<string, GoalPlan>()
  for (const plan of external) byId.set(plan.id, { ...plan, profileId })
  for (const plan of liveStored) {
    const existing = byId.get(plan.id)
    byId.set(plan.id, {
      ...plan,
      motivation: mergeMotivationAnswers(existing?.motivation, plan.motivation),
    })
  }

  let merged = migrateList([...byId.values()], profileId, profile).sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )

  const recovered = recoverPlansMotivation(merged)
  merged = recovered.plans

  const hydrated = hydratePlansFromSections(merged)
  merged = hydrated.plans

  const deduped = dedupePlansHierarchyItemIds(merged)
  merged = deduped.plans

  const result = [...merged, ...tombstones]

  if (
    merged.length !== liveStored.length ||
    external.length > 0 ||
    recovered.changed ||
    hydrated.changed ||
    deduped.changed ||
    tombstonesPruned ||
    needsPersistMigration(liveStored, merged)
  ) {
    saveAll(profileId, result)
  }

  return result
}

/** 화면용 — 지워진 목표(툼스톤)는 뺀다 */
export function loadGoalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  try {
    return mergeExternalPlans(profileId, profile).filter((p) => !p.deletedAt)
  } catch {
    return []
  }
}

/** 저장·동기화용 — 툼스톤까지 포함한 실제 저장 상태 (삭제 전파에 필요) */
export function loadGoalPlansForSync(profileId: string, profile?: SelfProfile): GoalPlan[] {
  try {
    return mergeExternalPlans(profileId, profile)
  } catch {
    return []
  }
}

export function saveGoalPlan(plan: GoalPlan): void {
  // 툼스톤을 보존해야 삭제 전파가 이 저장에 덮이지 않는다 (id가 다르므로 filter를 통과).
  // 같은 id를 다시 저장하면 그 툼스톤은 filter로 빠지고 살아 있는 목표로 되살아난다.
  const list = loadGoalPlansForSync(plan.profileId).filter((p) => p.id !== plan.id)
  list.unshift({ ...plan, updatedAt: new Date().toISOString() })
  saveAll(plan.profileId, list)
}

export function deleteGoalPlan(profileId: string, planId: string): void {
  // 배열에서 빼지 않고 툼스톤으로 바꾼다 — 안 그러면 "지웠다"는 사실이 동기화로 안 가서,
  // 다른 기기(또는 원격)에 아직 살아 있는 목표가 병합 때 되살아난다.
  const stored = parsePlansRaw(localStorage.getItem(key(profileId)))
  const now = Date.now()
  let found = false
  const next = stored.map((p) => {
    if (p.id === planId && !p.deletedAt) {
      found = true
      return { ...p, deletedAt: now, updatedAt: new Date(now).toISOString() }
    }
    return p
  })
  if (!found) return
  saveAll(profileId, next)
}

export function touchGoalPlan(_profileId: string, plan: GoalPlan): GoalPlan {
  const next = { ...plan, updatedAt: new Date().toISOString() }
  saveGoalPlan(next)
  return next
}
