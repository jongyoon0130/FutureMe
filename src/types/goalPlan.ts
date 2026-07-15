/** 목표 플래너 — 유형별 검증된 빈 템플릿 */

export const GOAL_PLAN_TEMPLATE_VERSION = 3

export type GoalTemplateType = 'backplan' | 'deliverable' | 'routine'

export const GOAL_TEMPLATE_LABELS: Record<GoalTemplateType, string> = {
  backplan: '역산 플래너',
  deliverable: '산출물형',
  routine: '루틴형',
}

export type GoalProgress =
  | 'not_started'
  | 'has_materials'
  | 'has_draft'
  | 'almost_done'

export const GOAL_PROGRESS_LABELS: Record<GoalProgress, string> = {
  not_started: '0% · 막 시작',
  has_materials: '자료·아이디어 있음',
  has_draft: '초안 있음',
  almost_done: '거의 완성',
}

export type DeliverableFormat = 'document' | 'slides' | 'code' | 'media' | 'other'

export const DELIVERABLE_FORMAT_LABELS: Record<DeliverableFormat, string> = {
  document: '문서·리포트',
  slides: '슬라이드·발표',
  code: '코드·앱·웹',
  media: '영상·디자인',
  other: '기타',
}

export type RoutineFrequency = 'daily_light' | 'daily_moderate' | 'few_times_week' | 'five_times_week' | 'weekly'

export const ROUTINE_FREQUENCY_LABELS: Record<RoutineFrequency, string> = {
  daily_light: '매일 · 10~15분',
  daily_moderate: '매일 · 30분+',
  few_times_week: '주 2~4회',
  five_times_week: '주 5회',
  weekly: '주 1회 집중',
}

export type RoutineHistory = 'first_time' | 'retry' | 'ongoing'

export const ROUTINE_HISTORY_LABELS: Record<RoutineHistory, string> = {
  first_time: '처음 시작',
  retry: '다시 시작',
  ongoing: '이미 하고 있음',
}

/** 대화로 수집한 목표 정보 */
export interface GoalIntake {
  goal: string
  deadline: string // ISO date YYYY-MM-DD
  successCriteria: string
  progress: GoalProgress
  /** 역산: 외부 변수 (심사, 팀, 자료 등) */
  blockers?: string
  /** 역산: 안 할 것 */
  scopeExclude?: string
  /** 산출물: 형태 */
  deliverableFormat?: DeliverableFormat
  /** 산출물: 피드백 받는 사람 */
  hasFeedback?: boolean
  /** 루틴: 빈도 (레거시) */
  routineFrequency?: RoutineFrequency
  /** 습관: 주당 목표 횟수 (1–7, 7=매일) */
  routineTimesPerWeek?: number
  /** 습관: 매일일 때 세션 길이 */
  routineSessionLength?: 'light' | 'moderate'
  /** 루틴: 경험 */
  routineHistory?: RoutineHistory
}

/** 목표 생성 시 답하는 동기·미래상·미달 질문 (question id → 답변) */
export type GoalMotivationAnswers = Partial<
  Record<'why-truth' | 'success-both' | 'failure-pattern', string>
>

export type PlanSectionKind = 'text' | 'checklist' | 'pair' | 'roadmap' | 'weeks' | 'pipeline'

export type PhaseStatus = 'done' | 'current' | 'upcoming'

export interface PlanCheckItem {
  id: string
  label: string
  done: boolean
  note?: string
}

export interface PlanPhase {
  id: string
  title: string
  status: PhaseStatus
  tasks: PlanCheckItem[]
}

export interface PlanWeek {
  id: string
  label: string
  dateLabel: string
  focus: string
  items: PlanCheckItem[]
}

/** v3 · 일간 체크리스트 */
export interface PlanDay {
  id: string
  dateLabel: string
  dayOfWeek: string
  focus: string
  isToday?: boolean
  items: PlanCheckItem[]
}

/** v3 · 주간 + 일간 (전체 목표 기준 W1, W2…) */
export interface PlanWeekHierarchy {
  id: string
  /** 전체 목표에서의 주차 (1부터) */
  globalIndex: number
  label: string
  dateLabel: string
  focus: string
  items: PlanCheckItem[]
  days: PlanDay[]
  /** 겹치는 달력 월 (YYYY-MM) — 여러 달에 동시 표시 */
  monthKeys: string[]
}

/** v3 · 월간 노드 */
export interface PlanMonthNode {
  id: string
  key: string
  label: string
  focus: string
  items: PlanCheckItem[]
}

/** v3 · 목표 기간에 따른 가지 깊이 */
export type GoalHorizon = 'day-only' | 'week-day' | 'month-week-day'

/** v3 · 통합 목표 트리 */
export interface GoalHierarchy {
  horizon: GoalHorizon
  rangeLabel: string
  focus: string
  startDate: string
  deadline: string
  months: PlanMonthNode[]
  weeks: PlanWeekHierarchy[]
  /** day-only 일 때만 사용 (또는 weeks[].days 대신) */
  days: PlanDay[]
  currentWeekId: string
}

/** @deprecated GoalHierarchy 사용 */
export type PlanMonth = GoalHierarchy

export interface PlanSection {
  id: string
  title: string
  kind: PlanSectionKind
  hint?: string
  /** text / pair */
  value?: string
  pairRight?: string
  pairLeftLabel?: string
  pairRightLabel?: string
  items?: PlanCheckItem[]
  phases?: PlanPhase[]
  weeks?: PlanWeek[]
  pipelineSteps?: string[]
  pipelineIndex?: number
}

export interface GoalPlan {
  id: string
  profileId: string
  templateType: GoalTemplateType
  intake: GoalIntake
  title: string
  sections: PlanSection[]
  /** 3 = v3 가지치기 hierarchy (최종→월→주→일) */
  templateVersion?: number
  /** v3 · 통합 체크리스트 트리 */
  hierarchy?: GoalHierarchy
  /** 동기·미래상·미달 — 미래의 나 대화용 */
  motivation?: GoalMotivationAnswers
  createdAt: string
  updatedAt: string
}

export function emptyGoalIntake(): GoalIntake {
  return {
    goal: '',
    deadline: '',
    successCriteria: '',
    progress: 'not_started',
  }
}
