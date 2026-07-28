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

/** 구 저장소 → 현재 owner 키로 병합 */
function mergeExternalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  const storageKey = key(profileId)
  const current = parsePlansRaw(localStorage.getItem(storageKey))
  const external = scanExternalPlanSources(storageKey)

  if (!external.length && !current.length) {
    const fromSnapshot = restoreGoalPlansFromSnapshot(profileId)
    if (fromSnapshot?.length) {
      saveAll(profileId, migrateList(fromSnapshot, profileId, profile))
      return loadGoalPlans(profileId, profile)
    }
    return []
  }

  const byId = new Map<string, GoalPlan>()
  for (const plan of external) byId.set(plan.id, { ...plan, profileId })
  for (const plan of current) {
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

  if (
    merged.length !== current.length ||
    external.length > 0 ||
    recovered.changed ||
    hydrated.changed ||
    deduped.changed ||
    needsPersistMigration(current, merged)
  ) {
    saveAll(profileId, merged)
  }

  return merged
}

export function loadGoalPlans(profileId: string, profile?: SelfProfile): GoalPlan[] {
  try {
    return mergeExternalPlans(profileId, profile)
  } catch {
    return []
  }
}

export function saveGoalPlan(plan: GoalPlan): void {
  const list = loadGoalPlans(plan.profileId).filter((p) => p.id !== plan.id)
  list.unshift({ ...plan, updatedAt: new Date().toISOString() })
  saveAll(plan.profileId, list)
}

export function deleteGoalPlan(profileId: string, planId: string): void {
  const list = loadGoalPlans(profileId).filter((p) => p.id !== planId)
  saveAll(profileId, list)
}

export function touchGoalPlan(_profileId: string, plan: GoalPlan): GoalPlan {
  const next = { ...plan, updatedAt: new Date().toISOString() }
  saveGoalPlan(next)
  return next
}
