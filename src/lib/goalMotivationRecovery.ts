import type { GoalMotivationAnswers, GoalPlan } from '../types/goalPlan'
import { isRoutinePlan, migrateRoutineIntake } from './goalRoutineEngine'

const PLAN_KEY_PREFIXES = ['goal-plans-', 'futureme-goal-plans-'] as const

function parsePlans(raw: string | null): GoalPlan[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw) as GoalPlan[]
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

export function mergeMotivationAnswers(
  a?: GoalMotivationAnswers,
  b?: GoalMotivationAnswers,
): GoalMotivationAnswers | undefined {
  const why = a?.['why-truth']?.trim() || b?.['why-truth']?.trim()
  const success = a?.['success-both']?.trim() || b?.['success-both']?.trim()
  const failure = a?.['failure-pattern']?.trim() || b?.['failure-pattern']?.trim()
  if (!why && !success && !failure) return undefined
  return {
    ...(why ? { 'why-truth': why } : {}),
    ...(success ? { 'success-both': success } : {}),
    ...(failure ? { 'failure-pattern': failure } : {}),
  }
}

function motivationScore(m?: GoalMotivationAnswers): number {
  if (!m) return 0
  return ['why-truth', 'success-both', 'failure-pattern'].filter((k) =>
    m[k as keyof GoalMotivationAnswers]?.trim(),
  ).length
}

function collectTitleArchive(): Map<string, GoalMotivationAnswers> {
  const byTitle = new Map<string, GoalMotivationAnswers>()
  if (typeof localStorage === 'undefined') return byTitle

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !PLAN_KEY_PREFIXES.some((p) => storageKey.startsWith(p))) continue
    for (const plan of parsePlans(localStorage.getItem(storageKey))) {
      const title = plan.title?.trim()
      if (!title || motivationScore(plan.motivation) === 0) continue
      byTitle.set(title, mergeMotivationAnswers(byTitle.get(title), plan.motivation)!)
    }
  }
  return byTitle
}

/** localStorage 전체에서 plan id 기준으로 motivation 답변 수집 */
export function collectMotivationArchive(): Map<string, GoalMotivationAnswers> {
  const byId = new Map<string, GoalMotivationAnswers>()
  if (typeof localStorage === 'undefined') return byId

  for (let i = 0; i < localStorage.length; i++) {
    const storageKey = localStorage.key(i)
    if (!storageKey || !PLAN_KEY_PREFIXES.some((p) => storageKey.startsWith(p))) continue
    for (const plan of parsePlans(localStorage.getItem(storageKey))) {
      if (motivationScore(plan.motivation) === 0) continue
      byId.set(plan.id, mergeMotivationAnswers(byId.get(plan.id), plan.motivation)!)
    }
  }
  return byId
}

export function recoverPlanMotivation(
  plan: GoalPlan,
  archive: Map<string, GoalMotivationAnswers>,
  titleArchive: Map<string, GoalMotivationAnswers>,
): GoalPlan {
  const fromId = archive.get(plan.id)
  const fromTitle = plan.title?.trim() ? titleArchive.get(plan.title.trim()) : undefined
  const merged = mergeMotivationAnswers(mergeMotivationAnswers(plan.motivation, fromId), fromTitle)
  if (!merged || motivationScore(merged) <= motivationScore(plan.motivation)) return plan
  return { ...plan, motivation: merged }
}

export function recoverPlansMotivation(plans: GoalPlan[]): { plans: GoalPlan[]; changed: boolean } {
  const archive = collectMotivationArchive()
  const titleArchive = collectTitleArchive()
  let changed = false
  const next = plans.map((p) => {
    let recovered = recoverPlanMotivation(p, archive, titleArchive)
    if (recovered !== p) changed = true

    if (isRoutinePlan(recovered) && !recovered.intake.routineTimesPerWeek) {
      const migrated = migrateRoutineIntake(recovered.intake, recovered.title)
      if (migrated !== recovered.intake) {
        recovered = { ...recovered, intake: migrated }
        changed = true
      }
    }
    return recovered
  })
  return { plans: next, changed }
}

export function hasMotivationAnswers(m?: GoalMotivationAnswers): boolean {
  return motivationScore(m) > 0
}
