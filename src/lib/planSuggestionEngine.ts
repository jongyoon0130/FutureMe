import type { Goal, LifeDomain, SelfProfile, TaskPriority } from '../types/self'
import { resolveModel } from './selfEngine'

export type SuggestedMilestone = { title: string; targetDate?: string }
export type SuggestedTask = { title: string; scheduledFor?: string; estimatedMinutes?: number; priority: TaskPriority; milestoneTitle?: string; whyNow: string }
export type PlanSuggestion = { summary: string; assumptions: string[]; milestones: SuggestedMilestone[]; tasks: SuggestedTask[]; caution: string }

const priorities: TaskPriority[] = ['must', 'should', 'could']

function cleanJson(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
}

export function parsePlanSuggestion(raw: string): PlanSuggestion | null {
  try {
    const data = JSON.parse(cleanJson(raw)) as Partial<PlanSuggestion>
    if (!Array.isArray(data.tasks) || !Array.isArray(data.milestones)) return null
    const tasks = data.tasks
      .filter((x): x is SuggestedTask => !!x && typeof x.title === 'string' && x.title.trim().length > 0)
      .slice(0, 5)
      .map((x) => ({
        title: x.title.trim().slice(0, 100),
        scheduledFor: /^\d{4}-\d{2}-\d{2}$/.test(x.scheduledFor ?? '') ? x.scheduledFor : undefined,
        estimatedMinutes: typeof x.estimatedMinutes === 'number' && x.estimatedMinutes > 0 ? Math.min(Math.round(x.estimatedMinutes), 240) : undefined,
        priority: priorities.includes(x.priority) ? x.priority : 'should',
        milestoneTitle: typeof x.milestoneTitle === 'string' ? x.milestoneTitle.trim().slice(0, 80) : undefined,
        whyNow: typeof x.whyNow === 'string' ? x.whyNow.trim().slice(0, 140) : '',
      }))
    if (!tasks.length) return null
    return {
      summary: typeof data.summary === 'string' ? data.summary.trim().slice(0, 220) : '이번 주에는 시작할 수 있는 양으로만 잡아봤어.',
      assumptions: Array.isArray(data.assumptions) ? data.assumptions.filter((x): x is string => typeof x === 'string').slice(0, 3) : [],
      milestones: data.milestones
        .filter((x): x is SuggestedMilestone => !!x && typeof x.title === 'string' && x.title.trim().length > 0)
        .slice(0, 4)
        .map((x) => ({ title: x.title.trim().slice(0, 100), targetDate: /^\d{4}-\d{2}-\d{2}$/.test(x.targetDate ?? '') ? x.targetDate : undefined })),
      tasks,
      caution: typeof data.caution === 'string' ? data.caution.trim().slice(0, 180) : '',
    }
  } catch {
    return null
  }
}

export function buildFallbackPlanSuggestion(goal: Goal, today: string): PlanSuggestion {
  return {
    summary: `“${goal.title}”을 이번 주에 진짜 시작할 수 있게, 부담을 작게 나눴어.`,
    assumptions: ['이번 주에 30~60분짜리 집중 시간 2번을 낼 수 있다고 가정했어.'],
    milestones: [{ title: `${goal.title}의 기준과 첫 경로 정하기`, targetDate: goal.targetDate }],
    tasks: [
      { title: `${goal.title}을 위한 첫 자료·조건 3개 적기`, scheduledFor: today, estimatedMinutes: 25, priority: 'must', whyNow: '무엇부터 할지 흐리지 않게 만드는 첫 단계야.' },
      { title: `${goal.title}의 이번 주 한 걸음 끝내기`, estimatedMinutes: 45, priority: 'should', whyNow: '계획보다 실제 시도를 남기기 위해서야.' },
    ],
    caution: '지금은 양보다 지속이 중요해. 이번 주 작업은 3개를 넘기지 않아도 돼.',
  }
}

export async function suggestPlanWithGemini(profile: SelfProfile, goal: Goal, apiKey: string, today: string, model?: string): Promise<PlanSuggestion> {
  if (!apiKey.trim()) return buildFallbackPlanSuggestion(goal, today)
  const existing = (profile.planner?.tasks ?? []).filter((t) => t.goalId === goal.id && t.status === 'todo').slice(0, 8).map((t) => t.title)
  const prompt = `너는 개인 목표를 현실적인 이번 주 행동으로 바꾸는 계획 보조자다. 아래 목표를 보고 JSON만 출력하라.
사용자의 5년 뒤 정체성: ${profile.future.identityLine || '미입력'}
현재 상황: ${profile.currentRole || profile.lifeContext || '미입력'}
목표: ${goal.title}
왜 이루려는지: ${goal.purpose || '미입력'}
이룬 모습: ${goal.desiredOutcome || '미입력'}
미래의 나와 연결: ${goal.futureConnection || '미입력'}
오늘: ${today}, 목표일: ${goal.targetDate}
이미 남은 작업: ${existing.join(', ') || '없음'}

규칙:
- 마일스톤 0~3개, 이번 주 작업 1~5개. 사용자가 승인하기 전 초안이다.
- 한 작업은 15~120분, 구체적인 동사로 시작. 일정·사실을 지어내지 말 것.
- 계획이 부족한 정보에 기대면 assumptions에 적고, 질문이 필요하면 caution에 짧게 적을 것.
- 목표일 이후 날짜, 기존 작업과 똑같은 작업 금지.
- 아래 JSON 스키마 외 텍스트 금지.
{"summary":"","assumptions":[""],"milestones":[{"title":"","targetDate":"YYYY-MM-DD"}],"tasks":[{"title":"","scheduledFor":"YYYY-MM-DD","estimatedMinutes":30,"priority":"must|should|could","milestoneTitle":"","whyNow":""}],"caution":""}`

  const resolved = resolveModel(model)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolved)}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.35, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } } }),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  const parsed = parsePlanSuggestion(raw)
  if (!parsed) throw new Error('계획 제안을 읽지 못했어요.')
  return parsed
}

export const DOMAIN_LABELS: Record<LifeDomain, string> = { work: '일·커리어', money: '돈', relationship: '관계·연애', health: '건강', growth: '자기성장', meaning: '의미·방향' }
