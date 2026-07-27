// ---------------------------------------------------------------------------
// 계획표(홈 목표 앱) → 미래의 나 대화 — 읽기 전용 다리.
//
// 홈 계획표는 자체 저장소(goal-plans-{ownerId})를 쓴다. 이 모듈은 그 데이터를
// "읽기만" 해서 미래의 나 프롬프트에 요약을 공급한다. 마이그레이션·저장 등
// 부작용이 있는 goalPlanStore를 거치지 않으므로, 프롬프트 조립 중에 계획표
// 데이터가 변형될 걱정이 없다. (쓰기 연동은 목표 앱 쪽에서 진행)
// ---------------------------------------------------------------------------
import type { GoalMotivationAnswers, GoalPlan } from '../types/goalPlan'
import { aggregateForDate, type AggregatedItem } from './goalHierarchyEngine'
import {
  MISC_PLAN_ID,
  MISC_PLAN_TITLE,
  periodKeyForTier,
  type MiscTodoItem,
} from './goalMiscTodos'
import { dayCloseStreak, dayKey, loadDayCloses } from './dayClose'
import { formatTaskTimeRange } from './goalTaskTime'

const OWNER_KEY = 'goal-app-owner-id'
const PLANS_PREFIX = 'goal-plans-'
const MISC_PREFIX = 'goal-misc-todos-'
const MAX_PLANS = 8
const MAX_TASKS_PER_TIER = 12

const MOTIVATION_LABELS: Record<keyof GoalMotivationAnswers, string> = {
  'why-truth': '시작한 진짜 이유',
  'success-both': '이뤘을 때 기분·변화',
  'failure-pattern': '미달·반쯤만 할 때 반복될 모습',
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function readOwnerId(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

/** 홈 계획표의 목표들 (최근 수정 순). 계획표를 안 썼으면 빈 배열. */
export function readGoalPlansLite(): GoalPlan[] {
  try {
    const owner = readOwnerId()
    if (!owner) return []
    const list = readJson<GoalPlan[]>(`${PLANS_PREFIX}${owner}`)
    if (!Array.isArray(list)) return []
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  } catch {
    return []
  }
}

function readMiscTodosLite(owner: string): MiscTodoItem[] {
  const list = readJson<MiscTodoItem[]>(`${MISC_PREFIX}${owner}`)
  if (!Array.isArray(list)) return []
  return list.filter((it) => it.label.trim())
}

export function daysUntilDeadline(deadline: string, now = new Date()): number | null {
  const d = new Date(`${deadline}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  const base = new Date(now)
  base.setHours(12, 0, 0, 0)
  return Math.round((d.getTime() - base.getTime()) / 86400000)
}

function todayPeriodKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 홈 '오늘 할 일'(일상 투두) 진행 — 없으면 null */
export function todayMiscProgress(now = new Date()): { done: number; total: number } | null {
  try {
    const owner = readOwnerId()
    if (!owner) return null
    const key = todayPeriodKey(now)
    const today = readMiscTodosLite(owner).filter((t) => t.tier === 'daily' && t.periodKey === key)
    if (!today.length) return null
    return { done: today.filter((t) => t.done).length, total: today.length }
  } catch {
    return null
  }
}

const clip = (v: string, max: number): string => {
  const t = v.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

// ---------------------------------------------------------------------------
// 역사 — "시간이 만드는 해자". 오늘의 스냅샷 위에, 실제로 걸어온 기록을 얹는다.
// 범용 챗봇은 흉내 낼 수 없는, 증거를 가진 격려의 재료.
// ---------------------------------------------------------------------------

/** 목표 트리(월·주·일)의 체크 진행 — 이룬 목표 판정용 */
export function planProgress(plan: GoalPlan): { done: number; total: number } {
  let done = 0
  let total = 0
  const count = (items?: { done: boolean }[]) => {
    for (const it of items ?? []) {
      total += 1
      if (it.done) done += 1
    }
  }
  const h = plan.hierarchy
  if (h) {
    for (const m of h.months ?? []) count(m.items)
    for (const w of h.weeks ?? []) {
      count(w.items)
      for (const d of w.days ?? []) count(d.items)
    }
    for (const d of h.days ?? []) count(d.items)
  }
  return { done, total }
}

/** 체크가 하나 이상 있고 전부 완료된 목표 — "이미 함께 이뤄낸" 것 */
export function achievedPlans(plans: GoalPlan[]): GoalPlan[] {
  return plans.filter((p) => {
    const { done, total } = planProgress(p)
    return total > 0 && done === total
  })
}

/** 아직 다 이루지 않은 목표 + D-day — "지금 향하는 것" */
export function activeGoalsLite(now = new Date()): { title: string; dday: number | null }[] {
  return readGoalPlansLite()
    .filter((p) => {
      const { done, total } = planProgress(p)
      return !(total > 0 && done === total)
    })
    .map((p) => ({
      title: p.title,
      dday: p.intake?.deadline ? daysUntilDeadline(p.intake.deadline, now) : null,
    }))
}

/** 전체 완료 개수 — 목표 트리 체크 + 일상 할 일. "시간의 해자"를 숫자로. */
export function totalDoneCount(): number {
  let n = 0
  const owner = readOwnerId()
  if (owner) n += readMiscTodosLite(owner).filter((t) => t.done).length
  for (const p of readGoalPlansLite()) n += planProgress(p).done
  return n
}

/** 최근 N일 동안 실제 완료한 홈 '오늘 할 일' 개수 (periodKey가 날짜라 정확) */
export function recentMiscDoneCount(days = 7, now = new Date()): number {
  try {
    const owner = readOwnerId()
    if (!owner) return 0
    const since = new Date(now)
    since.setDate(since.getDate() - (days - 1))
    const sinceKey = todayPeriodKey(since)
    return readMiscTodosLite(owner).filter(
      (t) => t.tier === 'daily' && t.done && (t.periodKey ?? '') >= sinceKey,
    ).length
  } catch {
    return 0
  }
}

function historyLines(now: Date): string[] {
  const lines: string[] = []

  for (const p of achievedPlans(readGoalPlansLite()).slice(0, 2)) {
    lines.push(`이미 함께 이뤄낸 목표: "${clip(p.title, 40)}" — 숙제가 아니라 같이 이룬 기억으로 회상 가능`)
  }

  const recentDone = recentMiscDoneCount(7, now)
  if (recentDone > 0) lines.push(`최근 7일 실제 완료: ${recentDone}개 — 격려는 이 숫자처럼 증거로 할 것`)

  const owner = readOwnerId()
  if (owner) {
    const closes = loadDayCloses(owner)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    const yRec = closes.find((r) => r.date === dayKey(yesterday))
    if (yRec) {
      lines.push(
        `어제 하루 마감 기록: ${yRec.mood} (${yRec.done}/${yRec.total})${yRec.note ? ` — "${clip(yRec.note, 60)}"` : ''}`,
      )
    }
    const streak = dayCloseStreak(closes, now)
    if (streak >= 2) lines.push(`하루 마감 ${streak}일 연속 — 완료 수보다 이 "돌아오는 리듬"을 알아봐줄 것`)
  }

  return lines
}

function miscAggregatedLite(items: MiscTodoItem[], date: Date): {
  daily: AggregatedItem[]
  weekly: AggregatedItem[]
  monthly: AggregatedItem[]
} {
  const dailyKey = periodKeyForTier('daily', date)
  const weeklyKey = periodKeyForTier('weekly', date)
  const monthlyKey = periodKeyForTier('monthly', date)

  const toAgg = (filtered: MiscTodoItem[], tier: AggregatedItem['tier']): AggregatedItem[] =>
    filtered.map((it) => ({
      id: it.id,
      label: it.label,
      done: it.done,
      planId: MISC_PLAN_ID,
      planTitle: MISC_PLAN_TITLE,
      tier,
      timeStart: it.timeStart,
      timeEnd: it.timeEnd,
      notifyOff: it.notifyOff,
    }))

  return {
    daily: toAgg(items.filter((it) => it.tier === 'daily' && it.periodKey === dailyKey), 'daily'),
    weekly: toAgg(items.filter((it) => it.tier === 'weekly' && it.periodKey === weeklyKey), 'weekly'),
    monthly: toAgg(items.filter((it) => it.tier === 'monthly' && it.periodKey === monthlyKey), 'monthly'),
  }
}

function describeMotivation(plan: GoalPlan): string[] {
  const lines: string[] = []
  for (const [id, label] of Object.entries(MOTIVATION_LABELS) as [keyof GoalMotivationAnswers, string][]) {
    const ans = plan.motivation?.[id]?.trim()
    if (ans) lines.push(`  · ${label}(본인 표현): "${clip(ans, 100)}"`)
  }
  return lines
}

function formatTaskLine(item: AggregatedItem): string {
  const status = item.done ? '[완료]' : '[ ]'
  const goal = clip(item.planTitle, 24)
  const time = formatTaskTimeRange(item.timeStart, item.timeEnd)
  const timePart = time ? ` · ${time}` : ''
  return `  - ${status} ${goal} — ${clip(item.label, 60)}${timePart}`
}

function formatTaskTier(title: string, items: AggregatedItem[]): string[] {
  if (!items.length) return []
  const lines = [`${title} (${items.filter((i) => i.done).length}/${items.length})`]
  const visible = items.slice(0, MAX_TASKS_PER_TIER)
  for (const item of visible) lines.push(formatTaskLine(item))
  if (items.length > MAX_TASKS_PER_TIER) {
    lines.push(`  - …외 ${items.length - MAX_TASKS_PER_TIER}개`)
  }
  return lines
}

/** 프롬프트에 싣는 앞날 범위 — "내일 뭐 있지?"에 답하려면 오늘만으론 부족하다 */
const UPCOMING_DAYS = 7
const DOW_KR = ['일', '월', '화', '수', '목', '금', '토'] as const

function noonMs(d: Date): number {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  return x.getTime()
}

function relativeDayLabel(d: Date, now: Date): string {
  const diff = Math.round((noonMs(d) - noonMs(now)) / 86400000)
  const base = `${d.getMonth() + 1}/${d.getDate()}(${DOW_KR[d.getDay()]})`
  if (diff === 0) return `오늘 ${base}`
  if (diff === 1) return `내일 ${base}`
  if (diff === 2) return `모레 ${base}`
  return base
}

/** 특정 날짜의 일간 항목 (목표 트리 + 일상 투두) */
export function dailyItemsForDate(plans: GoalPlan[], misc: MiscTodoItem[], date: Date): AggregatedItem[] {
  return [...aggregateForDate(plans, date).daily, ...miscAggregatedLite(misc, date).daily]
}

const GROUNDING_PREAMBLE = [
  '## 알고 있는 것 (유일한 사실 근거 — 이 밖은 모름)',
  '- **시간·장소·날짜·할 일명·이유**는 아래에 **글자 그대로** 있을 때만 말할 것.',
  '- 일간 할 일 줄 끝의 **`HH:MM ~ HH:MM`**(또는 `HH:MM ~`, `~ HH:MM`)은 사용자가 지정한 **예정 시간**이다.',
  '- 대화 맥락·추측·그럴듯한 보완·이전 턴 네 말은 **사실 근거가 아님**. 틀렸으면 인정하고 아래만 다시.',
  '- "이번 주/달 목표"와 "오늘 일간 할 일"은 **다름** — 섞지 말 것.',
].join('\n')

/** 프롬프트·검증용 — 홈에 등록된 모든 텍스트 */
export function collectKnownFactCorpus(now = new Date()): string {
  const plans = readGoalPlansLite()
  const owner = readOwnerId()
  const misc = owner ? readMiscTodosLite(owner) : []
  const parts: string[] = []

  for (const plan of plans) {
    if (plan.title?.trim()) parts.push(plan.title)
    for (const ans of Object.values(plan.motivation ?? {})) {
      if (typeof ans === 'string' && ans.trim()) parts.push(ans)
    }
    const h = plan.hierarchy
    if (h) {
      for (const m of h.months ?? []) for (const it of m.items ?? []) if (it.label?.trim()) parts.push(it.label)
      for (const w of h.weeks ?? []) {
        for (const it of w.items ?? []) if (it.label?.trim()) parts.push(it.label)
        for (const d of w.days ?? []) for (const it of d.items ?? []) if (it.label?.trim()) parts.push(it.label)
      }
      for (const d of h.days ?? []) for (const it of d.items ?? []) if (it.label?.trim()) parts.push(it.label)
    }
  }

  for (let i = 0; i <= UPCOMING_DAYS; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    for (const it of dailyItemsForDate(plans, misc, d)) {
      parts.push(it.label, it.planTitle)
      const time = formatTaskTimeRange(it.timeStart, it.timeEnd)
      if (time) {
        parts.push(time)
        if (it.timeStart?.trim()) parts.push(it.timeStart.trim())
        if (it.timeEnd?.trim()) parts.push(it.timeEnd.trim())
      }
    }
  }

  const board = aggregateHomeBoard(now)
  for (const tier of [board.weekly, board.monthly]) {
    for (const it of tier) parts.push(it.label, it.planTitle)
  }

  return parts.join(' ')
}

const TIME_IN_TEXT =
  /\d{1,2}\s*:\s*\d{2}|\d{1,2}\s*시(?:\s*~\s*\d{1,2}\s*시)?|오후\s*\d{1,2}|오전\s*\d{1,2}|\b(?:am|pm)\b/i

/**
 * 모델 답변에 데이터에 없는 시간 등이 섞였는지.
 * allow = user가 방금 한 말(+추가 요청 제목) — 유저 본인이 말한 시간은 지어낸 게 아니다.
 */
export function auditReplyAgainstKnownFacts(
  text: string,
  now = new Date(),
  allow = '',
): { ok: boolean; reason?: 'invented_time' } {
  const corpus = `${collectKnownFactCorpus(now)} ${allow}`
  if (!corpus.trim() || !text.trim()) return { ok: true }
  if (TIME_IN_TEXT.test(text) && !TIME_IN_TEXT.test(corpus)) {
    return { ok: false, reason: 'invented_time' }
  }
  return { ok: true }
}

// 전역 매칭용 (지우개) — audit 판정용 TIME_IN_TEXT와 같은 패턴
const TIME_IN_TEXT_G = new RegExp(TIME_IN_TEXT.source, 'gi')

/**
 * 최후의 안전망 — 재시도까지 했는데도 모델이 없는 시간을 고집하면,
 * 앱이 직접 시간 표현을 지워서 거짓이 유저에게 닿지 않게 한다.
 * (데이터에 시간이 있거나, user가 방금 그 시간을 말했으면 건드리지 않는다)
 */
export function stripInventedTimes(text: string, now = new Date(), allow = ''): string {
  const corpus = `${collectKnownFactCorpus(now)} ${allow}`
  if (TIME_IN_TEXT.test(corpus)) return text // 진짜 시간이 있으면 그대로
  return text
    .replace(/(오전|오후)\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?(?:\s*(?:부터|~|-)\s*(?:오전|오후)?\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?)?(?:\s*까지)?/g, '그 시간')
    .replace(TIME_IN_TEXT_G, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,?!])/g, '$1')
    .trim()
}

/**
 * 매 턴 주입 — keyword 없이 항상 "알고 있는 것"만 사실로 쓰게 한다.
 * lite면 오늘 일간만 (토큰 절약), 아니면 전체 계획표.
 */
export function describeKnownFactsBlock(now = new Date(), compact = false): string {
  const plans = readGoalPlansLite()
  const owner = readOwnerId()
  const misc = owner ? readMiscTodosLite(owner) : []
  const board = aggregateHomeBoard(now)
  const hasPlans = plans.some((p) => p.title?.trim())
  const hasTasks = board.daily.length + board.weekly.length + board.monthly.length > 0 || misc.length > 0

  if (!hasPlans && !hasTasks) return ''

  if (compact) {
    // lite 모드라도 오늘~모레는 싣는다 — "내일 뭐 있지?"에 답할 수 있게.
    // (오늘·내일은 비어도 "없음"을 명시해 모델이 멋대로 단정하지 않게)
    const lines: string[] = []
    for (let i = 0; i <= 2; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() + i)
      const items = dailyItemsForDate(plans, misc, d)
      if (items.length) lines.push(...formatTaskTier(relativeDayLabel(d, now), items))
      else if (i <= 1) lines.push(`${relativeDayLabel(d, now)}: 등록된 일간 할 일 없음`)
    }
    return [GROUNDING_PREAMBLE, ...lines].join('\n')
  }

  return [GROUNDING_PREAMBLE, describeGoalBoardBody(now)].filter(Boolean).join('\n')
}

/** @deprecated buildScheduleAnswerFacts — keyword 트리거 대신 describeKnownFactsBlock 사용 */
export function buildScheduleAnswerFacts(userMessage: string, now = new Date()): string | null {
  void userMessage
  return describeKnownFactsBlock(now, false) || null
}

/**
 * 오늘부터 며칠 앞까지의 일정.
 * 오늘·내일은 비어 있어도 "없음"이라고 명시한다 — 데이터가 없으면 AI가
 * 마음대로 "없네"라고 단정해버리기 때문에, 없다는 사실 자체를 알려줘야 한다.
 */
function upcomingDayLines(plans: GoalPlan[], misc: MiscTodoItem[], now: Date): string[] {
  const lines: string[] = []
  for (let i = 0; i <= UPCOMING_DAYS; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    const items = dailyItemsForDate(plans, misc, d)
    if (!items.length) {
      if (i <= 1) lines.push(`${relativeDayLabel(d, now)}: 등록된 할 일 없음`)
      continue
    }
    lines.push(...formatTaskTier(relativeDayLabel(d, now), items))
  }
  return lines
}

function aggregateHomeBoard(now: Date): {
  daily: AggregatedItem[]
  weekly: AggregatedItem[]
  monthly: AggregatedItem[]
} {
  const plans = readGoalPlansLite()
  const goalAgg = aggregateForDate(plans, now)
  const owner = readOwnerId()
  const miscAgg = owner ? miscAggregatedLite(readMiscTodosLite(owner), now) : { daily: [], weekly: [], monthly: [] }

  return {
    daily: [...goalAgg.daily, ...miscAgg.daily],
    weekly: [...goalAgg.weekly, ...miscAgg.weekly],
    monthly: [...goalAgg.monthly, ...miscAgg.monthly],
  }
}

/**
 * 미래의 나 프롬프트용 홈 계획표 전체 요약.
 * 최종 목표·동기 3문항 + 오늘부터 일주일 일정(날짜별, 항목별 완료 여부) + 주/월 목표.
 */
export function describeGoalBoardForPrompt(now = new Date()): string {
  const body = describeGoalBoardBody(now)
  return body ? [GROUNDING_PREAMBLE, body].join('\n') : ''
}

function describeGoalBoardBody(now: Date): string {
  const plans = readGoalPlansLite()
  const owner = readOwnerId()
  const misc = owner ? readMiscTodosLite(owner) : []
  const board = aggregateHomeBoard(now)
  const dayLines = upcomingDayLines(plans, misc, now)
  const hasPlans = plans.some((p) => p.title?.trim())
  const hasTasks = board.weekly.length + board.monthly.length > 0 || misc.length > 0

  if (!hasPlans && !hasTasks) return ''

  const lines: string[] = []
  const dateLabel = `${now.getMonth() + 1}월 ${now.getDate()}일(${DOW_KR[now.getDay()]})`
  lines.push(`홈 계획표 (${dateLabel} 기준)`)

  for (const plan of plans.slice(0, MAX_PLANS)) {
    if (!plan?.title?.trim()) continue
    const dday = plan.intake?.deadline ? daysUntilDeadline(plan.intake.deadline, now) : null
    const ddayLabel = dday == null ? '' : dday >= 0 ? ` (D-${dday})` : ` (마감 ${-dday}일 지남)`
    lines.push(`최종 목표: "${clip(plan.title, 50)}"${ddayLabel}`)
    lines.push(...describeMotivation(plan))
  }

  if (plans.length > MAX_PLANS) {
    lines.push(`…외 최종 목표 ${plans.length - MAX_PLANS}개`)
  }

  lines.push(...dayLines)
  lines.push(...formatTaskTier('이번 주 목표', board.weekly))
  lines.push(...formatTaskTier('이번 달 목표', board.monthly))

  lines.push(...historyLines(now))

  return lines.join('\n')
}
