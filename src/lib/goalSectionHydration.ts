import type { GoalPlan, PlanCheckItem, PlanSection } from '../types/goalPlan'
import { getCurrentWeek, isDayToday } from './goalHierarchyEngine'

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

    const todayDay = currentWeek.days.find((d) => isDayToday(d)) ?? currentWeek.days[0]
    if (todayDay) {
      const daySource = todayTodos
      if (daySource?.length && hasEmptyTierItems(todayDay.items)) {
        todayDay.items = todayDay.items.length
          ? copyItemLabels(daySource, todayDay.items)
          : // **날마다 새 id를 부여한다.** 섹션 항목 id를 그대로 쓰면, 이 하이드레이션이
            // "오늘"에 해당하는 날마다 돌면서 같은 id를 여러 날에 박아버린다 → 홈 체크가
            // 그 id의 첫 항목(앞 주)을 토글하는 버그가 생긴다. 각 날은 자기만의 항목을 갖는다.
            daySource.map((s) => ({ id: crypto.randomUUID(), label: s.label, done: s.done }))
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
