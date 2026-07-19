import type { GoalPlan } from '../types/goalPlan'
import type { AggregatedItem, DateSlots } from './goalHierarchyEngine'
import { horizonShowsMonth, horizonShowsWeek } from './goalHierarchyEngine'
import {
  insertTierGoalAtDate,
  removeAggregatedItem,
} from './goalHierarchyMutations'
import {
  MISC_PLAN_ID,
  MISC_PLAN_TITLE,
  insertMiscTodo,
  removeMiscTodo,
  type MiscTodoItem,
} from './goalMiscTodos'

export function homeCategoryOptionsForTier(
  goalOptions: { plan: GoalPlan; slots: DateSlots }[],
  tier: 'daily' | 'weekly' | 'monthly',
): { id: string; label: string }[] {
  const eligible = goalOptions.filter(({ plan, slots }) => {
    const h = plan.hierarchy
    if (!h) return false
    if (tier === 'daily') return !!slots.dayId
    if (tier === 'weekly') return !!slots.weekId && horizonShowsWeek(h)
    return !!slots.monthId && horizonShowsMonth(h)
  })

  return [
    { id: MISC_PLAN_ID, label: MISC_PLAN_TITLE },
    ...eligible.map(({ plan }) => ({ id: plan.id, label: plan.title })),
  ]
}

export function moveHomeAggregatedItem(args: {
  plans: GoalPlan[]
  miscTodos: MiscTodoItem[]
  profileId: string
  item: AggregatedItem
  tier: 'daily' | 'weekly' | 'monthly'
  date: Date
  targetPlanId: string
}): { plans: GoalPlan[]; miscTodos: MiscTodoItem[] } | null {
  const { plans, miscTodos, profileId, item, tier, date, targetPlanId } = args
  if (targetPlanId === item.planId) return null

  const label = item.label.trim()
  if (!label) return null

  const done = item.done
  let nextPlans = plans
  let nextMisc = miscTodos

  if (item.planId === MISC_PLAN_ID) {
    nextMisc = removeMiscTodo(profileId, miscTodos, item.id)
  } else {
    const removed = removeAggregatedItem(plans, item.planId, item.id, tier)
    if (!removed) return null
    nextPlans = plans.map((p) => (p.id === removed.id ? removed : p))
  }

  if (targetPlanId === MISC_PLAN_ID) {
    nextMisc = insertMiscTodo(profileId, nextMisc, tier, date, label, done)
    return { plans: nextPlans, miscTodos: nextMisc }
  }

  const plan = nextPlans.find((p) => p.id === targetPlanId)
  if (!plan) return null
  const inserted = insertTierGoalAtDate(plan, date, tier, label, done)
  if (!inserted) return null
  nextPlans = nextPlans.map((p) => (p.id === inserted.id ? inserted : p))
  return { plans: nextPlans, miscTodos: nextMisc }
}
