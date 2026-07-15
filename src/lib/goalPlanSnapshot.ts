import type { GoalPlan } from '../types/goalPlan'

const SNAPSHOT_KEY = 'futureme-goals-snapshot-v1'

export interface GoalPlanSnapshot {
  ownerId: string
  plans: GoalPlan[]
  savedAt: string
}

export function writeGoalPlanSnapshot(ownerId: string, plans: GoalPlan[]): void {
  if (!plans.length) return
  try {
    const snap: GoalPlanSnapshot = {
      ownerId,
      plans,
      savedAt: new Date().toISOString(),
    }
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap))
  } catch {
    /* quota — ignore */
  }
}

export function readGoalPlanSnapshot(): GoalPlanSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as GoalPlanSnapshot
    if (!snap?.ownerId || !Array.isArray(snap.plans) || !snap.plans.length) return null
    return snap
  } catch {
    return null
  }
}

/** 현재 저장소가 비었을 때 스냅샷에서 복구 */
export function restoreGoalPlansFromSnapshot(ownerId: string): GoalPlan[] | null {
  const snap = readGoalPlanSnapshot()
  if (!snap) return null
  if (snap.ownerId !== ownerId) return null
  return snap.plans
}

export function importGoalPlansSnapshot(snap: GoalPlanSnapshot): void {
  localStorage.setItem('goal-app-owner-id', snap.ownerId)
  localStorage.setItem(`goal-plans-${snap.ownerId}`, JSON.stringify(snap.plans))
  writeGoalPlanSnapshot(snap.ownerId, snap.plans)
}
