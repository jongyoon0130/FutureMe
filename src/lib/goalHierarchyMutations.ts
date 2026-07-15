import type { GoalHierarchy, GoalPlan, PlanCheckItem, PlanDay } from '../types/goalPlan'
import { getCurrentWeek, horizonShowsMonth, horizonShowsWeek, resolveDateSlots } from './goalHierarchyEngine'

function withHierarchy(plan: GoalPlan, fn: (h: GoalHierarchy) => GoalHierarchy): GoalPlan {
  if (!plan.hierarchy) return plan
  return { ...plan, hierarchy: fn(plan.hierarchy) }
}

function mapItems(items: PlanCheckItem[], itemId: string, fn: (it: PlanCheckItem) => PlanCheckItem): PlanCheckItem[] {
  return items.map((it) => (it.id === itemId ? fn(it) : it))
}

function newItem(label = ''): PlanCheckItem {
  return { id: crypto.randomUUID(), label, done: false }
}

export function addMonthItem(plan: GoalPlan, monthId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) => (m.id !== monthId ? m : { ...m, items: [...m.items, newItem('')] })),
  }))
}

export function setMonthItemLabel(plan: GoalPlan, monthId: string, itemId: string, label: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) =>
      m.id !== monthId ? m : { ...m, items: m.items.map((it) => (it.id === itemId ? { ...it, label } : it)) },
    ),
  }))
}

export function upsertMonthItemLabel(plan: GoalPlan, monthId: string, itemId: string, label: string): GoalPlan {
  const m = plan.hierarchy?.months.find((x) => x.id === monthId)
  if (!m) return plan
  if (itemId !== '__blank__' && m.items.some((it) => it.id === itemId)) return setMonthItemLabel(plan, monthId, itemId, label)
  if (!label.trim()) return plan
  const empty = m.items.find((it) => !it.label.trim())
  if (empty) return setMonthItemLabel(plan, monthId, empty.id, label)
  const added = addMonthItem(plan, monthId)
  const newId = added.hierarchy!.months.find((x) => x.id === monthId)!.items.at(-1)!.id
  return setMonthItemLabel(added, monthId, newId, label)
}

export function removeMonthItem(plan: GoalPlan, monthId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) => {
      if (m.id !== monthId) return m
      const next = m.items.filter((it) => it.id !== itemId)
      return { ...m, items: next.length ? next : [newItem('')] }
    }),
  }))
}

export function addWeekItem(plan: GoalPlan, weekId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, items: [...w.items, newItem('')] })),
  }))
}

export function setWeekItemLabel(plan: GoalPlan, weekId: string, itemId: string, label: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) =>
      w.id !== weekId ? w : { ...w, items: w.items.map((it) => (it.id === itemId ? { ...it, label } : it)) },
    ),
  }))
}

export function upsertWeekItemLabel(plan: GoalPlan, weekId: string, itemId: string, label: string): GoalPlan {
  const w = plan.hierarchy?.weeks.find((x) => x.id === weekId)
  if (!w) return plan
  if (itemId !== '__blank__' && w.items.some((it) => it.id === itemId)) return setWeekItemLabel(plan, weekId, itemId, label)
  if (!label.trim()) return plan
  const empty = w.items.find((it) => !it.label.trim())
  if (empty) return setWeekItemLabel(plan, weekId, empty.id, label)
  const added = addWeekItem(plan, weekId)
  const newId = added.hierarchy!.weeks.find((x) => x.id === weekId)!.items.at(-1)!.id
  return setWeekItemLabel(added, weekId, newId, label)
}

export function removeWeekItem(plan: GoalPlan, weekId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) => {
      if (w.id !== weekId) return w
      const next = w.items.filter((it) => it.id !== itemId)
      return { ...w, items: next.length ? next : [newItem('')] }
    }),
  }))
}

export function addDayItem(plan: GoalPlan, weekId: string | null, dayId: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    if (h.horizon === 'day-only') {
      return {
        ...h,
        days: h.days.map((d) => (d.id !== dayId ? d : { ...d, items: [...d.items, newItem('')] })),
      }
    }
    return {
      ...h,
      weeks: h.weeks.map((w) =>
        w.id !== weekId
          ? w
          : { ...w, days: w.days.map((d) => (d.id !== dayId ? d : { ...d, items: [...d.items, newItem('')] })) },
      ),
    }
  })
}

export function setDayItemLabel(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string, label: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    const mapDay = (d: PlanDay): PlanDay =>
      d.id !== dayId ? d : { ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, label } : it)) }
    if (h.horizon === 'day-only') return { ...h, days: h.days.map(mapDay) }
    return {
      ...h,
      weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, days: w.days.map(mapDay) })),
    }
  })
}

export function upsertDayItemLabel(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string, label: string): GoalPlan {
  const h = plan.hierarchy
  if (!h) return plan
  const day =
    h.horizon === 'day-only'
      ? h.days.find((d) => d.id === dayId)
      : h.weeks.find((w) => w.id === weekId)?.days.find((d) => d.id === dayId)
  if (!day) return plan
  if (itemId !== '__blank__' && day.items.some((it) => it.id === itemId)) return setDayItemLabel(plan, weekId, dayId, itemId, label)
  if (!label.trim()) return plan
  const empty = day.items.find((it) => !it.label.trim())
  if (empty) return setDayItemLabel(plan, weekId, dayId, empty.id, label)
  const added = addDayItem(plan, weekId, dayId)
  const ah = added.hierarchy!
  const newDay =
    ah.horizon === 'day-only'
      ? ah.days.find((d) => d.id === dayId)
      : ah.weeks.find((w) => w.id === weekId)?.days.find((d) => d.id === dayId)
  const newId = newDay?.items.at(-1)?.id
  if (!newId) return added
  return setDayItemLabel(added, weekId, dayId, newId, label)
}

export function removeDayItem(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    const trimDay = (d: PlanDay): PlanDay => {
      if (d.id !== dayId) return d
      const next = d.items.filter((it) => it.id !== itemId)
      return { ...d, items: next.length ? next : [newItem('')] }
    }
    if (h.horizon === 'day-only') return { ...h, days: h.days.map(trimDay) }
    return {
      ...h,
      weeks: h.weeks.map((w) => (w.id !== weekId ? w : { ...w, days: w.days.map(trimDay) })),
    }
  })
}

export function toggleMonthNodeItem(plan: GoalPlan, monthId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) =>
      m.id !== monthId ? m : { ...m, items: mapItems(m.items, itemId, (it) => ({ ...it, done: !it.done })) },
    ),
  }))
}

export function toggleWeekItemH(plan: GoalPlan, weekId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) =>
      w.id !== weekId ? w : { ...w, items: mapItems(w.items, itemId, (it) => ({ ...it, done: !it.done })) },
    ),
  }))
}

export function toggleDayItem(plan: GoalPlan, weekId: string | null, dayId: string, itemId: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    if (h.horizon === 'day-only') {
      return {
        ...h,
        days: h.days.map((d) =>
          d.id !== dayId ? d : { ...d, items: mapItems(d.items, itemId, (it) => ({ ...it, done: !it.done })) },
        ),
      }
    }
    return {
      ...h,
      weeks: h.weeks.map((w) =>
        w.id !== weekId
          ? w
          : {
              ...w,
              days: w.days.map((d) =>
                d.id !== dayId ? d : { ...d, items: mapItems(d.items, itemId, (it) => ({ ...it, done: !it.done })) },
              ),
            },
      ),
    }
  })
}

export function toggleAggregatedItem(
  plans: GoalPlan[],
  planId: string,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
): GoalPlan | null {
  const plan = plans.find((p) => p.id === planId)
  if (!plan?.hierarchy) return null
  const h = plan.hierarchy

  if (tier === 'monthly') {
    for (const m of h.months) {
      if (m.items.some((i) => i.id === itemId)) return toggleMonthNodeItem(plan, m.id, itemId)
    }
  }

  if (tier === 'weekly') {
    for (const w of h.weeks) {
      if (w.items.some((i) => i.id === itemId)) return toggleWeekItemH(plan, w.id, itemId)
    }
  }

  if (h.horizon === 'day-only') {
    for (const d of h.days) {
      if (d.items.some((i) => i.id === itemId)) return toggleDayItem(plan, null, d.id, itemId)
    }
  } else {
    for (const w of h.weeks) {
      for (const d of w.days) {
        if (d.items.some((i) => i.id === itemId)) return toggleDayItem(plan, w.id, d.id, itemId)
      }
    }
  }
  return null
}

export function removeAggregatedItem(
  plans: GoalPlan[],
  planId: string,
  itemId: string,
  tier: 'daily' | 'weekly' | 'monthly',
): GoalPlan | null {
  const plan = plans.find((p) => p.id === planId)
  if (!plan?.hierarchy) return null
  const h = plan.hierarchy

  if (tier === 'monthly') {
    for (const m of h.months) {
      if (m.items.some((i) => i.id === itemId)) return removeMonthItem(plan, m.id, itemId)
    }
  }

  if (tier === 'weekly') {
    for (const w of h.weeks) {
      if (w.items.some((i) => i.id === itemId)) return removeWeekItem(plan, w.id, itemId)
    }
  }

  if (tier === 'daily') {
    if (h.horizon === 'day-only') {
      for (const d of h.days) {
        if (d.items.some((i) => i.id === itemId)) return removeDayItem(plan, null, d.id, itemId)
      }
    } else {
      for (const w of h.weeks) {
        for (const d of w.days) {
          if (d.items.some((i) => i.id === itemId)) return removeDayItem(plan, w.id, d.id, itemId)
        }
      }
    }
  }
  return null
}

/** @deprecated */
export function toggleMonthItem(plan: GoalPlan, itemId: string): GoalPlan {
  const m = plan.hierarchy?.months[0]
  if (!m) return plan
  return toggleMonthNodeItem(plan, m.id, itemId)
}

export function updateMonthNodeFocus(plan: GoalPlan, monthId: string, focus: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    months: h.months.map((m) => (m.id === monthId ? { ...m, focus } : m)),
  }))
}

export function updateWeekFocusH(plan: GoalPlan, weekId: string, focus: string): GoalPlan {
  return withHierarchy(plan, (h) => ({
    ...h,
    weeks: h.weeks.map((w) => (w.id === weekId ? { ...w, focus } : w)),
  }))
}

export function updateDayFocus(plan: GoalPlan, weekId: string | null, dayId: string, focus: string): GoalPlan {
  return withHierarchy(plan, (h) => {
    if (h.horizon === 'day-only') {
      return { ...h, days: h.days.map((d) => (d.id === dayId ? { ...d, focus } : d)) }
    }
    return {
      ...h,
      weeks: h.weeks.map((w) =>
        w.id !== weekId ? w : { ...w, days: w.days.map((d) => (d.id === dayId ? { ...d, focus } : d)) },
      ),
    }
  })
}

export function findWeekForItem(plan: GoalPlan, itemId: string) {
  return plan.hierarchy?.weeks.find((w) => w.items.some((i) => i.id === itemId) || w.days.some((d) => d.items.some((i) => i.id === itemId)))
}

/** 홈 달력에서 선택한 날짜·구간에 목표 한 줄 추가 → 드릴다운에도 반영 */
export function addTierGoalAtDate(
  plan: GoalPlan,
  date: Date,
  tier: 'daily' | 'weekly' | 'monthly',
  label: string,
): GoalPlan | null {
  if (!plan.hierarchy || !label.trim()) return null
  const slots = resolveDateSlots(plan.hierarchy, date)
  if (!slots.inRange) return null

  if (tier === 'monthly' && slots.monthId) {
    return upsertMonthItemLabel(plan, slots.monthId, '__blank__', label.trim())
  }
  if (tier === 'weekly' && slots.weekId) {
    return upsertWeekItemLabel(plan, slots.weekId, '__blank__', label.trim())
  }
  if (tier === 'daily' && slots.dayId) {
    return upsertDayItemLabel(plan, slots.dayWeekId, slots.dayId, '__blank__', label.trim())
  }
  return null
}

export { getCurrentWeek, horizonShowsMonth, horizonShowsWeek }
