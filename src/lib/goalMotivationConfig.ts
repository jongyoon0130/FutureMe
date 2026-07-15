/**
 * 목표 산정 — 동기·위로·쓴소리용 질문 (최종 3개)
 *
 * 입력 순서: 1 → 2 → 3
 */

export type GoalMotivationTone = 'motivate' | 'comfort' | 'tough_love' | 'vision' | 'stakes' | 'identity'

export type GoalMotivationCategory = 'why' | 'success' | 'failure'

export interface GoalMotivationQuestion {
  id: string
  category: GoalMotivationCategory
  tone: GoalMotivationTone
  prompt: string
  hint?: string
  required?: boolean
  futureSelfUse?: string
}

export const GOAL_MOTIVATION_CATEGORY_LABELS: Record<GoalMotivationCategory, string> = {
  why: '시작',
  success: '이룬 뒤',
  failure: '미달',
}

export const GOAL_MOTIVATION_TONE_LABELS: Record<GoalMotivationTone, string> = {
  motivate: '동기부여',
  comfort: '위로',
  tough_love: '쓴소리',
  vision: '미래상',
  stakes: '대가·리스크',
  identity: '정체성',
}

export const GOAL_MOTIVATION_QUESTIONS: GoalMotivationQuestion[] = [
  {
    id: 'why-truth',
    category: 'why',
    tone: 'motivate',
    prompt: '이 목표를 선택한 **진짜 이유**는 뭐야?',
    hint: '남한테 말하는 이유 말고, 속으로 꼭 하고 싶은 이유',
    required: true,
    futureSelfUse: '흔들릴 때 속동기 상기',
  },
  {
    id: 'success-both',
    category: 'success',
    tone: 'vision',
    prompt: '목표를 **이뤘을 때** — 그날의 **기분·상황**과, **나에게 남는 변화**는?',
    hint: '그날 밤 어떤 기분인지 + 그 후 습관·자신감·관계·실력 중 뭐가 달라졌는지',
    required: true,
    futureSelfUse: '동기·완주 직전 — 한 장면 + 지속 변화',
  },
  {
    id: 'failure-pattern',
    category: 'failure',
    tone: 'tough_love',
    prompt: '**열의가 식거나 반쯤만** 하다가, 결국 **원하는 결과를 못 얻으면** — 어떤 모습의 나가 반복될 것 같아?',
    hint: '완전히 그만둔 게 아니어도 돼 — 대충 넘기거나, 힘이 빠져 덜 한 것도 포함',
    required: true,
    futureSelfUse: '의지 저하·반만의 노력·결과 미달 — 반복 패턴 (쓴소리·현실 직시)',
  },
]

/** @deprecated GOAL_MOTIVATION_QUESTIONS 사용 */
export const GOAL_MOTIVATION_CORE_QUESTIONS = GOAL_MOTIVATION_QUESTIONS

export const GOAL_MOTIVATION_EXTENDED_QUESTIONS: GoalMotivationQuestion[] = []

export const GOAL_MOTIVATION_ALL_QUESTIONS = GOAL_MOTIVATION_QUESTIONS

export function motivationQuestionsByCategory(
  questions: GoalMotivationQuestion[] = GOAL_MOTIVATION_ALL_QUESTIONS,
): { category: GoalMotivationCategory; label: string; questions: GoalMotivationQuestion[] }[] {
  const order: GoalMotivationCategory[] = ['why', 'success', 'failure']
  return order
    .map((category) => ({
      category,
      label: GOAL_MOTIVATION_CATEGORY_LABELS[category],
      questions: questions.filter((q) => q.category === category),
    }))
    .filter((g) => g.questions.length > 0)
}
