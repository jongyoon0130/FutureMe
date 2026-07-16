import type { SelfProfile } from '../types/self'
import type {
  GoalHierarchy,
  GoalHorizon,
  GoalIntake,
  GoalPlan,
  PlanCheckItem,
  PlanDay,
  PlanMonthNode,
  PlanWeekHierarchy,
} from '../types/goalPlan'
import { GOAL_PLAN_TEMPLATE_VERSION } from '../types/goalPlan'
import {
  buildTimeline,
  fmtShort,
  isWithin,
  monthKey,
  monthLabelFromKey,
  parseIso,
  rangeLabel,
} from './goalCalendar'
import { detectHorizon, getHorizonMeta } from './goalHorizon'

function uid(): string {
  return crypto.randomUUID()
}

function checklist(labels: string[], checked = 0): PlanCheckItem[] {
  return labels.map((label, i) => ({ id: uid(), label, done: i < checked }))
}

function emptyChecklist(): PlanCheckItem[] {
  return checklist([''])
}

function mapTimelineToHierarchy(start: Date, end: Date, horizon: GoalHorizon): GoalHierarchy {
  const timeline = buildTimeline(start, end)
  const todayWeek = timeline.weeks.find((w) => w.days.some((d) => d.isToday))

  const weeks: PlanWeekHierarchy[] = timeline.weeks.map((tw) => ({
    id: uid(),
    globalIndex: tw.globalIndex,
    label: `W${tw.globalIndex}`,
    dateLabel: tw.dateLabel,
    focus: '',
    items: emptyChecklist(),
    monthKeys: tw.monthKeys,
    days: tw.days.map((td) => ({
      id: uid(),
      dateLabel: td.dateLabel,
      dayOfWeek: td.dayOfWeek,
      focus: td.isToday ? '오늘' : '',
      isToday: td.isToday,
      items: td.isToday ? emptyChecklist() : [],
    })),
  }))

  const months: PlanMonthNode[] = timeline.monthKeys.map((key) => ({
    id: uid(),
    key,
    label: monthLabelFromKey(key),
    focus: '',
    items: emptyChecklist(),
  }))

  const flatDays: PlanDay[] = timeline.flatDays.map((td) => ({
    id: uid(),
    dateLabel: td.dateLabel,
    dayOfWeek: td.dayOfWeek,
    focus: td.isToday ? '오늘' : '',
    isToday: td.isToday,
    items: td.isToday ? emptyChecklist() : [],
  }))

  return {
    horizon,
    rangeLabel: rangeLabel(start, end),
    focus: '',
    startDate: start.toISOString().slice(0, 10),
    deadline: end.toISOString().slice(0, 10),
    months: horizon === 'month-week-day' ? months : [],
    weeks: horizon === 'day-only' ? [] : weeks,
    days: horizon === 'day-only' ? flatDays : [],
    currentWeekId: todayWeek ? weeks.find((w) => w.globalIndex === todayWeek.globalIndex)?.id ?? weeks[0]?.id ?? '' : weeks[0]?.id ?? '',
  }
}

export function buildHierarchyFromIntake(intake: GoalIntake, profile?: SelfProfile): GoalHierarchy {
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  const end = parseIso(intake.deadline)
  const horizon = detectHorizon(intake.deadline, start)
  const h = mapTimelineToHierarchy(start, end, horizon)
  const focus = intake.successCriteria?.slice(0, 60) || intake.goal.slice(0, 60)
  h.focus = focus

  if (horizon === 'month-week-day' && h.months[0]) {
    h.months[0].focus = focus
  }

  void profile
  return h
}

function copyItems(items: PlanCheckItem[]): PlanCheckItem[] {
  return items.map((i) => ({ ...i }))
}

function dayMatchKey(d: Pick<PlanDay, 'dateLabel' | 'dayOfWeek'>): string {
  return `${d.dateLabel}|${d.dayOfWeek}`
}

function collectOldDays(h: GoalHierarchy): Map<string, PlanDay> {
  const map = new Map<string, PlanDay>()
  for (const w of h.weeks) {
    for (const d of w.days) map.set(dayMatchKey(d), d)
  }
  for (const d of h.days) map.set(dayMatchKey(d), d)
  return map
}

function mergeDayContent(newDay: PlanDay, old?: PlanDay): PlanDay {
  if (!old) return newDay
  const hasContent = old.items.some((i) => i.label.trim()) || old.focus.trim()
  if (!hasContent) return newDay
  return {
    ...newDay,
    focus: old.focus,
    items: copyItems(old.items.length ? old.items : newDay.items),
  }
}

/** 기간 변경 시 타임라인 재생성 + 기존 월·주·일 목표 최대한 유지 */
export function mergeHierarchyContent(old: GoalHierarchy, fresh: GoalHierarchy): GoalHierarchy {
  fresh.focus = old.focus || fresh.focus

  if (old.months.length) {
    fresh.months = fresh.months.map((m) => {
      const prev = old.months.find((x) => x.key === m.key)
      return prev ? { ...m, focus: prev.focus, items: copyItems(prev.items) } : m
    })
  }

  const oldDaysMap = collectOldDays(old)

  if (old.weeks.length) {
    fresh.weeks = fresh.weeks.map((w) => {
      const prev =
        old.weeks.find((x) => x.globalIndex === w.globalIndex) ?? old.weeks.find((x) => x.label === w.label)
      if (!prev) {
        return {
          ...w,
          days: w.days.map((d) => mergeDayContent(d, oldDaysMap.get(dayMatchKey(d)))),
        }
      }
      return {
        ...w,
        focus: prev.focus,
        items: copyItems(prev.items),
        days: w.days.map((d) => {
          const byKey = oldDaysMap.get(dayMatchKey(d))
          const byWeek = prev.days.find((pd) => dayMatchKey(pd) === dayMatchKey(d))
          return mergeDayContent(d, byKey ?? byWeek)
        }),
      }
    })
  }

  if (fresh.horizon === 'day-only' && old.days.length) {
    fresh.days = fresh.days.map((d) =>
      mergeDayContent(d, oldDaysMap.get(dayMatchKey(d)) ?? old.days.find((od) => dayMatchKey(od) === dayMatchKey(d))),
    )
  }

  const todayWeek = fresh.weeks.find((w) => w.days.some((d) => d.isToday))
  if (todayWeek) fresh.currentWeekId = todayWeek.id

  return fresh
}

export function rebuildPlanSchedule(
  plan: GoalPlan,
  { title, startDate, deadline }: { title: string; startDate: string; deadline: string },
): GoalPlan | { error: string } {
  const trimmed = title.trim()
  if (!trimmed) return { error: '목표 이름을 입력해 주세요' }

  const start = parseIso(startDate)
  start.setHours(12, 0, 0, 0)
  const end = parseIso(deadline)
  if (end.getTime() < start.getTime()) return { error: '마감일은 시작일 이후여야 해요' }

  const old = plan.hierarchy
  if (!old) return { error: '목표 구조를 찾을 수 없어요' }

  const horizon = detectHorizon(deadline, start)
  const fresh = mapTimelineToHierarchy(start, end, horizon)
  const hierarchy = mergeHierarchyContent({ ...old, focus: trimmed }, fresh)

  return {
    ...plan,
    title: trimmed,
    intake: { ...plan.intake, goal: trimmed, deadline },
    hierarchy,
    updatedAt: new Date().toISOString(),
  }
}

function legacyToHierarchy(plan: GoalPlan): GoalHierarchy {
  const old = plan.hierarchy as GoalHierarchy | undefined
  const start = old?.startDate ? parseIso(old.startDate) : new Date()
  start.setHours(12, 0, 0, 0)
  const end = parseIso(plan.intake.deadline || old?.deadline || '')
  const horizon = detectHorizon(plan.intake.deadline, start)
  const fresh = mapTimelineToHierarchy(start, end, horizon)
  if (!old) return fresh
  fresh.focus = old.focus || plan.title
  return mergeHierarchyContent(old, fresh)
}

export function migratePlanToHierarchy(plan: GoalPlan): GoalHierarchy {
  if (plan.hierarchy?.startDate && plan.hierarchy.months !== undefined) {
    return plan.hierarchy
  }
  if (plan.hierarchy) return legacyToHierarchy(plan)
  return buildHierarchyFromIntake(plan.intake)
}

export function ensureHierarchy(plan: GoalPlan, _profile?: SelfProfile): GoalPlan {
  if (plan.templateVersion === GOAL_PLAN_TEMPLATE_VERSION && plan.hierarchy?.startDate) return plan
  const hierarchy = migratePlanToHierarchy(plan)
  if (!hierarchy.focus) hierarchy.focus = plan.title
  return {
    ...plan,
    hierarchy,
    templateVersion: GOAL_PLAN_TEMPLATE_VERSION,
    updatedAt: new Date().toISOString(),
  }
}

export function resolveHorizon(h: GoalHierarchy): GoalHorizon {
  return h.horizon
}

export function horizonShowsMonth(h: GoalHierarchy): boolean {
  return h.horizon === 'month-week-day'
}

export function horizonShowsWeek(h: GoalHierarchy): boolean {
  return h.horizon !== 'day-only'
}

export function weeksForMonth(h: GoalHierarchy, monthKey: string): PlanWeekHierarchy[] {
  return h.weeks.filter((w) => w.monthKeys.includes(monthKey))
}

export function pctItems(items: PlanCheckItem[]): number {
  const valid = items.filter((i) => i.label.trim())
  if (!valid.length) return 0
  return Math.round((valid.filter((i) => i.done).length / valid.length) * 100)
}

export function countItems(items: PlanCheckItem[]): { done: number; total: number } {
  const valid = items.filter((i) => i.label.trim())
  return { done: valid.filter((i) => i.done).length, total: valid.length }
}

/** 체크리스트 첫 항목 = 해당 구간 대표 목표 */
export function tierHeadline(items: PlanCheckItem[], fallback: string): string {
  const first = items.find((i) => i.label.trim())
  return first?.label.trim() ?? fallback
}

export function filledItemCount(items: PlanCheckItem[]): number {
  return items.filter((i) => i.label.trim()).length
}

/** YYYY-MM → "7" (월간 아이콘용) */
export function monthIconFromKey(key: string): string {
  const m = Number(key.split('-')[1])
  return Number.isNaN(m) ? '·' : String(m)
}

/** 브랜치 카드 부제: 목표 미리보기 */
export function itemsPreview(items: PlanCheckItem[]): string {
  const filled = items.filter((i) => i.label.trim())
  if (!filled.length) return '목표 미입력'
  if (filled.length === 1) return filled[0].label
  return `${filled[0].label} 외 ${filled.length - 1}개`
}

function focusFromLines(lines: string[], fallback = ''): string {
  return lines.find((s) => s.trim())?.trim() ?? fallback
}

const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'] as const

/**
 * '오늘' 판정은 항상 실시간으로 한다.
 * 저장된 day.isToday는 목표를 만든 날 기준으로 박제돼서, 날짜가 바뀌어도
 * 옛날 날짜에 "오늘" 배지가 남는 버그가 있었다.
 */
export function isDayToday(day: Pick<PlanDay, 'dateLabel' | 'dayOfWeek'>, now = new Date()): boolean {
  return day.dateLabel === fmtShort(now) && day.dayOfWeek === DOW_KR[now.getDay()]
}

export function getCurrentWeek(h: GoalHierarchy): PlanWeekHierarchy | undefined {
  return (
    h.weeks.find((w) => w.days.some((d) => isDayToday(d))) ??
    h.weeks.find((w) => w.id === h.currentWeekId) ??
    h.weeks[0]
  )
}

export function getTodayDay(h: GoalHierarchy): PlanDay | undefined {
  if (h.horizon === 'day-only') return h.days.find((d) => isDayToday(d)) ?? h.days[0]
  for (const w of h.weeks) {
    const t = w.days.find((d) => isDayToday(d))
    if (t) return t
  }
  return getCurrentWeek(h)?.days[0]
}

export interface AggregatedItem extends PlanCheckItem {
  planId: string
  planTitle: string
  tier: 'daily' | 'weekly' | 'monthly'
}

export function aggregateHome(plans: GoalPlan[]): {
  daily: AggregatedItem[]
  weekly: AggregatedItem[]
  monthly: AggregatedItem[]
} {
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  return aggregateForDate(plans, now)
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'] as const

function normalizeDate(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x
}

function matchesDay(day: PlanDay, date: Date): boolean {
  return day.dateLabel === fmtShort(date) && day.dayOfWeek === DOW[date.getDay()]
}

export interface DateSlots {
  inRange: boolean
  monthId: string | null
  weekId: string | null
  dayId: string | null
  dayWeekId: string | null
  weekLabel: string | null
  monthLabel: string | null
}

export function resolveDateSlots(h: GoalHierarchy, date: Date): DateSlots {
  const d = normalizeDate(date)
  const start = parseIso(h.startDate)
  const end = parseIso(h.deadline)
  const empty: DateSlots = {
    inRange: false,
    monthId: null,
    weekId: null,
    dayId: null,
    dayWeekId: null,
    weekLabel: null,
    monthLabel: null,
  }
  if (!isWithin(d, start, end)) return empty

  let monthId: string | null = null
  let monthLabel: string | null = null
  if (horizonShowsMonth(h)) {
    const m = h.months.find((x) => x.key === monthKey(d))
    monthId = m?.id ?? null
    monthLabel = m?.label ?? monthLabelFromKey(monthKey(d))
  }

  let weekId: string | null = null
  let dayId: string | null = null
  let dayWeekId: string | null = null
  let weekLabel: string | null = null

  if (h.horizon === 'day-only') {
    const day = h.days.find((x) => matchesDay(x, d))
    if (day) dayId = day.id
  } else {
    for (const w of h.weeks) {
      const day = w.days.find((x) => matchesDay(x, d))
      if (day) {
        dayId = day.id
        dayWeekId = w.id
        weekId = w.id
        weekLabel = `${w.label} · ${w.dateLabel}`
        break
      }
    }
  }

  return { inRange: true, monthId, weekId, dayId, dayWeekId, weekLabel, monthLabel }
}

export function plansForDate(plans: GoalPlan[], date: Date): { plan: GoalPlan; slots: DateSlots }[] {
  return plans
    .filter((p) => p.hierarchy)
    .map((p) => ({ plan: p, slots: resolveDateSlots(p.hierarchy!, date) }))
    .filter((x) => x.slots.inRange)
}

export function aggregateForDate(plans: GoalPlan[], date: Date): {
  daily: AggregatedItem[]
  weekly: AggregatedItem[]
  monthly: AggregatedItem[]
} {
  const daily: AggregatedItem[] = []
  const weekly: AggregatedItem[] = []
  const monthly: AggregatedItem[] = []
  const d = normalizeDate(date)

  for (const plan of plans) {
    if (!plan.hierarchy) continue
    const slots = resolveDateSlots(plan.hierarchy, d)
    if (!slots.inRange) continue
    const h = plan.hierarchy

    if (slots.monthId) {
      const m = h.months.find((x) => x.id === slots.monthId)
      m?.items.forEach((it) => {
        if (it.label.trim()) monthly.push({ ...it, planId: plan.id, planTitle: plan.title, tier: 'monthly' })
      })
    }

    if (slots.weekId) {
      const w = h.weeks.find((x) => x.id === slots.weekId)
      w?.items.forEach((it) => {
        if (it.label.trim()) weekly.push({ ...it, planId: plan.id, planTitle: plan.title, tier: 'weekly' })
      })
    }

    if (slots.dayId) {
      const day =
        h.horizon === 'day-only'
          ? h.days.find((x) => x.id === slots.dayId)
          : h.weeks.find((w) => w.id === slots.dayWeekId)?.days.find((x) => x.id === slots.dayId)
      day?.items.forEach((it) => {
        if (it.label.trim()) daily.push({ ...it, planId: plan.id, planTitle: plan.title, tier: 'daily' })
      })
    }
  }

  return { daily, weekly, monthly }
}

/** 달력 배터리용 — 해당 날짜 일간 할 일 완료율 */
export function dailyCompletionStats(
  plans: GoalPlan[],
  date: Date,
): { done: number; total: number; pct: number; inRange: boolean } {
  const { daily } = aggregateForDate(plans, date)
  const items = daily.filter((it) => it.label.trim())
  const inRange = plans.some((p) => p.hierarchy && resolveDateSlots(p.hierarchy, date).inRange)
  if (!items.length) return { done: 0, total: 0, pct: 0, inRange }
  const done = items.filter((it) => it.done).length
  return { done, total: items.length, pct: Math.round((done / items.length) * 100), inRange }
}

export function hierarchyProgress(plan: GoalPlan): number {
  if (!plan.hierarchy) return 0
  const all: PlanCheckItem[] = []
  const collect = (items: PlanCheckItem[]) => {
    for (const it of items) {
      if (it.label.trim()) all.push(it)
    }
  }
  const h = plan.hierarchy
  h.months.forEach((m) => collect(m.items))
  h.weeks.forEach((w) => {
    collect(w.items)
    w.days.forEach((d) => collect(d.items))
  })
  h.days.forEach((d) => collect(d.items))
  if (!all.length) return 0
  return Math.round((all.filter((i) => i.done).length / all.length) * 100)
}

export function formatDday(deadline: string, from = new Date()): string {
  const end = parseIso(deadline)
  if (Number.isNaN(end.getTime())) return ''
  const start = new Date(from)
  start.setHours(12, 0, 0, 0)
  end.setHours(12, 0, 0, 0)
  const diff = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  if (diff < 0) return `D+${Math.abs(diff)}`
  if (diff === 0) return 'D-Day'
  return `D-${diff}`
}

export function planSummaryFromHierarchy(plan: GoalPlan): string {
  const h = plan.hierarchy
  const deadline = h?.deadline ?? plan.intake.deadline
  const dday = formatDday(deadline)
  if (!h) return dday
  const week = getCurrentWeek(h)?.globalIndex
  return week ? `${dday} · W${week}` : dday
}

export function buildHierarchyFromWizard(data: {
  deadline: string
  startDate?: string
  horizon: GoalHorizon
  focus: string
  months: { key: string; focus?: string; items: string[] }[]
  weeks: { globalIndex: number; focus?: string; items: string[]; days: { focus?: string; items: string[]; isToday?: boolean }[] }[]
  days: { focus?: string; items: string[]; isToday?: boolean }[]
}): GoalHierarchy {
  const start = data.startDate ? parseIso(data.startDate) : new Date()
  start.setHours(12, 0, 0, 0)
  const end = parseIso(data.deadline)
  const base = mapTimelineToHierarchy(start, end, data.horizon)
  base.focus = data.focus

  base.months = base.months.map((m) => {
    const w = data.months.find((x) => x.key === m.key)
    const labels = (w?.items ?? []).filter(Boolean)
    const items = labels.length ? checklist(labels) : emptyChecklist()
    return w ? { ...m, focus: focusFromLines(w.items, m.label), items } : m
  })

  base.weeks = base.weeks.map((w) => {
    const wd = data.weeks.find((x) => x.globalIndex === w.globalIndex)
    if (!wd) return w
    const weekLabels = wd.items.filter(Boolean)
    const weekItems = weekLabels.length ? checklist(weekLabels) : emptyChecklist()
    return {
      ...w,
      focus: focusFromLines(wd.items, w.label),
      items: weekItems,
      days: w.days.map((d, di) => {
        const dd = wd.days[di]
        if (!dd) return d
        const dayLabels = dd.items.filter(Boolean)
        const dayItems = dayLabels.length ? checklist(dayLabels) : dd.isToday || d.isToday ? emptyChecklist() : []
        return {
          ...d,
          focus: focusFromLines(dd.items, d.dateLabel),
          isToday: dd.isToday ?? d.isToday,
          items: dayItems,
        }
      }),
    }
  })

  if (data.horizon === 'day-only') {
    base.days = base.days.map((d, i) => {
      const dd = data.days[i]
      if (!dd) return d
      const dayLabels = dd.items.filter(Boolean)
      const dayItems = dayLabels.length ? checklist(dayLabels) : dd.isToday || d.isToday ? emptyChecklist() : []
      return {
        ...d,
        focus: focusFromLines(dd.items, d.dateLabel),
        isToday: dd.isToday ?? d.isToday,
        items: dayItems,
      }
    })
  }

  const todayWeek = base.weeks.find((w) => w.days.some((d) => d.isToday))
  if (todayWeek) base.currentWeekId = todayWeek.id

  return base
}

/** 마법사 — 최종 목표·마감만 정하고 월/주/일은 홈에서 + 로 채울 때 */
export function buildEmptyHierarchy(deadline: string, focus: string, startDate?: string): GoalHierarchy {
  const draft = defaultWizardDraft(deadline)
  return buildHierarchyFromWizard({
    deadline,
    startDate,
    horizon: draft.meta.horizon,
    focus,
    months: draft.months.map((m) => ({ key: m.key, items: [] })),
    weeks: draft.weeks.map((w) => ({
      globalIndex: w.globalIndex,
      items: [],
      days: w.days.map((d) => ({ items: [], isToday: d.isToday })),
    })),
    days: draft.days.map((d) => ({ items: [], isToday: d.isToday })),
  })
}

export function defaultWizardDraft(deadline: string) {
  const start = new Date()
  start.setHours(12, 0, 0, 0)
  const meta = getHorizonMeta(deadline, start)
  const h = mapTimelineToHierarchy(start, parseIso(deadline), meta.horizon)

  return {
    meta,
    months: h.months.map((m) => ({ key: m.key, label: m.label, items: [''] })),
    weeks: h.weeks.map((w) => ({
      globalIndex: w.globalIndex,
      label: w.label,
      dateLabel: w.dateLabel,
      items: [''],
      days: w.days.map((d) => ({
        dateLabel: d.dateLabel,
        dayOfWeek: d.dayOfWeek,
        items: d.isToday ? [''] : [],
        isToday: !!d.isToday,
      })),
    })),
    days: h.days.map((d) => ({
      dateLabel: d.dateLabel,
      dayOfWeek: d.dayOfWeek,
      items: d.isToday ? [''] : [],
      isToday: !!d.isToday,
    })),
  }
}
