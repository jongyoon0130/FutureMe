import type { GoalPlan, PlanCheckItem, PlanSection } from '../types/goalPlan'

function mapSections(plan: GoalPlan, fn: (s: PlanSection) => PlanSection): GoalPlan {
  return { ...plan, sections: plan.sections.map(fn) }
}

export function toggleCheckItem(plan: GoalPlan, sectionId: string, itemId: string): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || !s.items) return s
    return {
      ...s,
      items: s.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)),
    }
  })
}

export function updateCheckLabel(plan: GoalPlan, sectionId: string, itemId: string, label: string): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || !s.items) return s
    return { ...s, items: s.items.map((it) => (it.id === itemId ? { ...it, label } : it)) }
  })
}

export function addCheckItem(plan: GoalPlan, sectionId: string): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || s.kind !== 'checklist') return s
    const item: PlanCheckItem = { id: crypto.randomUUID(), label: '', done: false }
    return { ...s, items: [...(s.items ?? []), item] }
  })
}

export function patchSection(plan: GoalPlan, sectionId: string, patch: Partial<PlanSection>): GoalPlan {
  return mapSections(plan, (s) => (s.id === sectionId ? { ...s, ...patch } : s))
}

export function toggleRoadmapTask(plan: GoalPlan, sectionId: string, phaseId: string, taskId: string): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || s.kind !== 'roadmap' || !s.phases) return s
    return {
      ...s,
      phases: s.phases.map((ph) =>
        ph.id !== phaseId
          ? ph
          : {
              ...ph,
              tasks: ph.tasks.map((t) => (t.id === taskId ? { ...t, done: !t.done } : t)),
            },
      ),
    }
  })
}

export function updateRoadmapTaskLabel(
  plan: GoalPlan,
  sectionId: string,
  phaseId: string,
  taskId: string,
  label: string,
): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || s.kind !== 'roadmap' || !s.phases) return s
    return {
      ...s,
      phases: s.phases.map((ph) =>
        ph.id !== phaseId
          ? ph
          : { ...ph, tasks: ph.tasks.map((t) => (t.id === taskId ? { ...t, label } : t)) },
      ),
    }
  })
}

export function toggleWeekItem(plan: GoalPlan, sectionId: string, weekId: string, itemId: string): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || s.kind !== 'weeks' || !s.weeks) return s
    return {
      ...s,
      weeks: s.weeks.map((w) =>
        w.id !== weekId
          ? w
          : { ...w, items: w.items.map((it) => (it.id === itemId ? { ...it, done: !it.done } : it)) },
      ),
    }
  })
}

export function updateWeekFocus(plan: GoalPlan, sectionId: string, weekId: string, focus: string): GoalPlan {
  return mapSections(plan, (s) => {
    if (s.id !== sectionId || s.kind !== 'weeks' || !s.weeks) return s
    return { ...s, weeks: s.weeks.map((w) => (w.id === weekId ? { ...w, focus } : w)) }
  })
}

export function countCheckable(plan: GoalPlan): { done: number; total: number } {
  let done = 0
  let total = 0
  const countItems = (items: PlanCheckItem[]) => {
    for (const it of items) {
      if (!it.label.trim()) continue
      total += 1
      if (it.done) done += 1
    }
  }
  for (const s of plan.sections) {
    if (s.items) countItems(s.items)
    if (s.phases) for (const ph of s.phases) countItems(ph.tasks)
    if (s.weeks) for (const w of s.weeks) countItems(w.items)
  }
  return { done, total }
}

export function currentPhaseLabel(plan: GoalPlan): string {
  for (const s of plan.sections) {
    if (s.kind !== 'roadmap' || !s.phases) continue
    const current = s.phases.find((p) => p.status === 'current')
    if (current) return current.title
    const next = s.phases.find((p) => p.status === 'upcoming')
    if (next) return next.title
  }
  return '진행 중'
}
