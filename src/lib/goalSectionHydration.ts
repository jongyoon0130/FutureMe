import type { GoalPlan, PlanCheckItem, PlanSection } from '../types/goalPlan'
import { getCurrentWeek } from './goalHierarchyEngine'

function isTemplateDayLabel(label: string): boolean {
  return /^[월화수목금토일]\s*—\s*$/.test(label.trim()) || /^\d+회차\s*—?\s*$/.test(label.trim())
}

function copyItemLabels(source: PlanCheckItem[], target: PlanCheckItem[]): PlanCheckItem[] {
  return target.map((item, i) => {
    const from = source[i]
    if (!from?.label.trim()) return item
    if (item.label.trim()) return item
    return { ...item, label: from.label, done: item.done || from.done }
  })
}

function findSection(plan: GoalPlan, title: string): PlanSection | undefined {
  return plan.sections.find((s) => s.title === title)
}

function hasEmptyTierItems(items: PlanCheckItem[]): boolean {
  return !items.some((it) => it.label.trim() && !isTemplateDayLabel(it.label))
}

function stripTemplateItems(items: PlanCheckItem[]): PlanCheckItem[] {
  return items.filter((it) => !isTemplateDayLabel(it.label))
}

/** sections에만 남아 있는 체크리스트를 hierarchy 빈 칸으로 복사 */
export function hydrateHierarchyFromSections(plan: GoalPlan): GoalPlan {
  const h = plan.hierarchy
  if (!h) return plan

  let changed = false
  const next = structuredClone(h) as typeof h

  const weekActions = findSection(plan, '이번 주 행동')?.items
  const todayTodos = findSection(plan, '오늘 할 일')?.items

  const currentWeek = getCurrentWeek(next)
  if (currentWeek && plan.templateType !== 'routine') {
    if (weekActions?.length && hasEmptyTierItems(currentWeek.items)) {
      currentWeek.items = copyItemLabels(weekActions, currentWeek.items)
      changed = true
    }

    const todayDay = currentWeek.days.find((d) => d.isToday) ?? currentWeek.days[0]
    if (todayDay) {
      const daySource = todayTodos
      if (daySource?.length && hasEmptyTierItems(todayDay.items)) {
        todayDay.items = todayDay.items.length
          ? copyItemLabels(daySource, todayDay.items)
          : daySource.map((s) => ({ id: s.id, label: s.label, done: s.done }))
        changed = true
      }
    }
  }

  if (plan.templateType === 'routine') {
    for (const week of next.weeks) {
      for (const day of week.days) {
        const cleaned = stripTemplateItems(day.items)
        if (cleaned.length !== day.items.length) {
          day.items = cleaned
          changed = true
        }
      }
    }
  }

  if (!changed) return plan
  return { ...plan, hierarchy: next }
}

export function hydratePlansFromSections(plans: GoalPlan[]): { plans: GoalPlan[]; changed: boolean } {
  let changed = false
  const next = plans.map((p) => {
    const hydrated = hydrateHierarchyFromSections(p)
    if (hydrated !== p) changed = true
    return hydrated
  })
  return { plans: next, changed }
}
