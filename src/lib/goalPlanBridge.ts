// ---------------------------------------------------------------------------
// 계획표(홈 목표 앱) → 미래의 나 대화 — 읽기 전용 다리.
//
// 홈 계획표는 자체 저장소(goal-plans-{ownerId})를 쓴다. 이 모듈은 그 데이터를
// "읽기만" 해서 미래의 나 프롬프트에 요약을 공급한다. 마이그레이션·저장 등
// 부작용이 있는 goalPlanStore를 거치지 않으므로, 프롬프트 조립 중에 계획표
// 데이터가 변형될 걱정이 없다. (쓰기 연동은 목표 앱 쪽에서 진행)
// ---------------------------------------------------------------------------
import type { GoalPlan } from '../types/goalPlan'

const OWNER_KEY = 'goal-app-owner-id'
const PLANS_PREFIX = 'goal-plans-'
const MISC_PREFIX = 'goal-misc-todos-'

type MiscTodoLite = { done?: boolean; tier?: string; periodKey?: string }

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

/** 홈 계획표의 목표들 (최근 수정 순). 계획표를 안 썼으면 빈 배열. */
export function readGoalPlansLite(): GoalPlan[] {
  try {
    const owner = localStorage.getItem(OWNER_KEY)
    if (!owner) return []
    const list = readJson<GoalPlan[]>(`${PLANS_PREFIX}${owner}`)
    if (!Array.isArray(list)) return []
    return [...list].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  } catch {
    return []
  }
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
    const owner = localStorage.getItem(OWNER_KEY)
    if (!owner) return null
    const items = readJson<MiscTodoLite[]>(`${MISC_PREFIX}${owner}`)
    if (!Array.isArray(items)) return null
    const key = todayPeriodKey(now)
    const today = items.filter((t) => t?.tier === 'daily' && t?.periodKey === key)
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

/**
 * 미래의 나 프롬프트용 계획표 요약 (최대 2개 목표).
 * 동기 답변은 사용자가 목표를 만들 때 직접 쓴 문장 — 미래의 나가 다그치는 대신
 * "네가 스스로 한 말"로 되비출 수 있는 가장 강한 재료다.
 */
export function describeGoalBoardForPrompt(now = new Date()): string {
  const lines: string[] = []

  for (const plan of readGoalPlansLite().slice(0, 2)) {
    if (!plan?.title?.trim()) continue
    const dday = plan.intake?.deadline ? daysUntilDeadline(plan.intake.deadline, now) : null
    const ddayLabel = dday == null ? '' : dday >= 0 ? ` (D-${dday})` : ` (마감 ${-dday}일 지남)`
    lines.push(`계획표 최종 목표: "${clip(plan.title, 50)}"${ddayLabel}`)
    const why = plan.motivation?.['why-truth']?.trim()
    if (why) lines.push(`· 시작한 진짜 이유(본인 표현): "${clip(why, 90)}"`)
    const feared = plan.motivation?.['failure-pattern']?.trim()
    if (feared) {
      lines.push(`· 흐지부지되면 반복될 모습(본인이 직접 쓴 말): "${clip(feared, 90)}"`)
    }
  }

  const misc = todayMiscProgress(now)
  if (misc) lines.push(`오늘 계획표 할 일: ${misc.done}/${misc.total} 완료`)

  return lines.join('\n')
}
