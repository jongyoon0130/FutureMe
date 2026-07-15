import type { SelfProfile } from '../types/self'
import type {
  GoalIntake,
  GoalPlan,
  GoalProgress,
  GoalTemplateType,
  PhaseStatus,
  PlanCheckItem,
  PlanPhase,
  PlanSection,
  PlanWeek,
} from '../types/goalPlan'
import { GOAL_PLAN_TEMPLATE_VERSION, GOAL_TEMPLATE_LABELS } from '../types/goalPlan'
import { buildHierarchyFromIntake, ensureHierarchy, hierarchyProgress, planSummaryFromHierarchy } from './goalHierarchyEngine'

const ROUTINE_KO =
  /매일|습관|루틴|운동|스트레칭|명상|독서|영어|공부 습관|기상|수면|다이어트|금연|금주/i
const DELIVERABLE_KO =
  /보고서|문서|리포트|포트폴리오|슬라이드|발표자료|논문|에세이|기획서|원고|디자인 시안|영상 편집/i
const BACKPLAN_KO =
  /출시|배포|심사|앱스토어|스토어|제출|시험|면접|합격|런칭|오픈|데모데이|투자|IR|채용|이직|합격/i
const APP_DOMAIN_KO = /앱|ios|android|앱스토어|testflight|심사|배포|출시|스토어/i
const JOB_DOMAIN_KO = /취업|이직|면접|포트폴리오|지원|채용/i
const STUDY_DOMAIN_KO = /시험|자격증|수능|토익|공부|학위|논문/i

function uid(): string {
  return crypto.randomUUID()
}

function checklist(labels: string[], checked = 0): PlanCheckItem[] {
  return labels.map((label, i) => ({ id: uid(), label, done: i < checked }))
}

function textSection(title: string, value = '', hint?: string): PlanSection {
  return { id: uid(), title, kind: 'text', value, hint }
}

function pairSection(
  title: string,
  leftLabel: string,
  rightLabel: string,
  left = '',
  right = '',
  hint?: string,
): PlanSection {
  return {
    id: uid(),
    title,
    kind: 'pair',
    pairLeftLabel: leftLabel,
    pairRightLabel: rightLabel,
    value: left,
    pairRight: right,
    hint,
  }
}

function checkSection(title: string, labels: string[], hint?: string, checked = 0): PlanSection {
  return { id: uid(), title, kind: 'checklist', items: checklist(labels, checked), hint }
}

function parseDeadline(deadline: string): Date {
  const d = new Date(`${deadline}T12:00:00`)
  return Number.isNaN(d.getTime()) ? new Date() : d
}

function weeksUntil(deadline: string): number {
  const end = parseDeadline(deadline)
  const diff = end.getTime() - Date.now()
  const weeks = Math.ceil(diff / (7 * 24 * 60 * 60 * 1000))
  return Math.min(12, Math.max(2, weeks))
}

function formatWeekDate(weekIndex: number, start: Date): string {
  const d = new Date(start)
  d.setDate(d.getDate() + weekIndex * 7)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function detectDomain(goal: string, criteria: string): 'app' | 'job' | 'study' | 'generic' {
  const t = `${goal} ${criteria}`
  if (APP_DOMAIN_KO.test(t)) return 'app'
  if (JOB_DOMAIN_KO.test(t)) return 'job'
  if (STUDY_DOMAIN_KO.test(t)) return 'study'
  return 'generic'
}

function hasExternalReview(goal: string, criteria: string, blockers?: string): boolean {
  const t = `${goal} ${criteria} ${blockers ?? ''}`
  return /심사|제출|승인|검토|피드백|합격|통과|리뷰|출시|배포/i.test(t)
}

function itemsPerWeek(profile?: SelfProfile): number {
  let n = 3
  const c = profile?.bigFive?.conscientiousness ?? 4
  if (c >= 5) n += 1
  const busy = /바쁘|퇴근|야근|병행|풀타임|직장/i.test(profile?.lifeContext ?? '')
  if (busy) n -= 1
  return Math.max(2, Math.min(3, n))
}

function progressSkipPhases(progress: GoalProgress): number {
  switch (progress) {
    case 'almost_done':
      return 3
    case 'has_draft':
      return 2
    case 'has_materials':
      return 1
    default:
      return 0
  }
}

function pipelineIndex(progress: GoalProgress): number {
  switch (progress) {
    case 'almost_done':
      return 3
    case 'has_draft':
      return 2
    case 'has_materials':
      return 1
    default:
      return 0
  }
}

/** 핵심 4문항 기준 유형 분류 */
export function classifyGoalTemplate(intake: Pick<GoalIntake, 'goal' | 'deadline' | 'successCriteria'>): GoalTemplateType {
  const t = `${intake.goal} ${intake.successCriteria}`
  if (ROUTINE_KO.test(t) && !BACKPLAN_KO.test(t) && !DELIVERABLE_KO.test(t)) return 'routine'
  if (DELIVERABLE_KO.test(t) && !BACKPLAN_KO.test(t)) return 'deliverable'
  if (BACKPLAN_KO.test(t) || intake.deadline) return 'backplan'
  return 'routine'
}

function backplanPhaseDefs(domain: ReturnType<typeof detectDomain>, externalReview: boolean): { title: string; tasks: string[] }[] {
  if (domain === 'app') {
    return [
      { title: '배포 루틴 세팅', tasks: ['배포·빌드 루틴 세팅', '개발 환경·버전 관리 정리', 'TestFlight / 내부 테스트 준비'] },
      { title: '핵심 기능 완성', tasks: ['핵심 플로우 E2E 완성', '크래시·치명 버그 제거', '온보딩·첫 사용 점검'] },
      { title: '스토어 메타', tasks: ['스크린샷·아이콘·설명', '프라이버시 정책', '심사 가이드 체크'] },
      {
        title: '제출·출시',
        tasks: externalReview
          ? ['빌드 제출', '리젝 대응 버퍼', '출시·모니터링']
          : ['최종 QA', '제출·공개', '출시 후 피드백'],
      },
    ]
  }
  if (domain === 'job') {
    return [
      { title: '지원 전략', tasks: ['타깃 회사·포지션 정리', '이력서·포트폴리오 골격'] },
      { title: '성과 정리', tasks: ['핵심 프로젝트 STAR 정리', '포트폴리오 1차 완성'] },
      { title: '맞춤 지원', tasks: ['자소서·지원서 맞춤', '모의 면접·피드백'] },
      { title: '면접·오퍼', tasks: ['지원·면접 일정', '팔로업·연봉 협상'] },
    ]
  }
  if (domain === 'study') {
    return [
      { title: '범위·일정', tasks: ['출제 범위·일정 확정', '교재·기출 정리'] },
      { title: '핵심·약점', tasks: ['단원별 약점 맵', '문제풀이 루틴'] },
      { title: '모의·오답', tasks: ['모의고사·오답 정리', '취약 파트 집중'] },
      { title: '최종', tasks: ['최종 점검', '시험·제출'] },
    ]
  }
  return [
    { title: '요구·범위', tasks: ['요구사항·범위 확정', '도구·리소스 준비'] },
    { title: '프로토타입', tasks: ['초안·프로토타입', '1차 검증'] },
    { title: '완성·QA', tasks: ['완성·정리', '제출 전 QA'] },
    {
      title: '공개',
      tasks: externalReview ? ['제출·심사/검토', '피드백 반영'] : ['배포·공유', '완료 확인'],
    },
  ]
}

function buildRoadmapPhases(defs: { title: string; tasks: string[] }[], skip: number, perWeek: number): PlanPhase[] {
  return defs.map((def, i) => {
    let status: PhaseStatus = 'upcoming'
    if (i < skip) status = 'done'
    else if (i === skip) status = 'current'
    return {
      id: uid(),
      title: def.title,
      status,
      tasks: checklist(def.tasks.slice(0, perWeek)),
    }
  })
}

function weekFocusForIndex(phaseTitles: string[], weekIndex: number, weekCount: number): string {
  const phaseIdx = Math.min(Math.floor((weekIndex / weekCount) * phaseTitles.length), phaseTitles.length - 1)
  return `${phaseTitles[phaseIdx]} 집중`
}

function buildWeeks(
  weekCount: number,
  perWeek: number,
  phaseTitles: string[],
  start: Date,
): PlanWeek[] {
  return Array.from({ length: weekCount }, (_, i) => ({
    id: uid(),
    label: `W${i + 1}`,
    dateLabel: formatWeekDate(i, start),
    focus: weekFocusForIndex(phaseTitles, i, weekCount),
    items: checklist(Array.from({ length: perWeek }, (_, j) => (j === 0 ? '핵심 1' : ''))),
  }))
}

function buildBackplanSections(intake: GoalIntake, profile?: SelfProfile): PlanSection[] {
  const domain = detectDomain(intake.goal, intake.successCriteria)
  const external = hasExternalReview(intake.goal, intake.successCriteria, intake.blockers)
  const defs = backplanPhaseDefs(domain, external)
  const skip = progressSkipPhases(intake.progress)
  const weekCount = weeksUntil(intake.deadline)
  const perWeek = itemsPerWeek(profile)
  const phaseTitles = defs.map((d) => d.title)

  const bufferText = external
    ? `심사·리젝 대응 버퍼 3~5일 · 마감 ${intake.deadline} 기준 제출 목표를 앞당기기`
    : `마감 ${intake.deadline} 전 2~3일 버퍼 · 신규 작업 동결`

  return [
    checkSection(
      '성공 기준',
      [
        intake.successCriteria || '완료됐다고 말할 수 있는 기준',
        ...(external ? ['외부 심사·승인 통과'] : []),
        '완료 일자 확인',
      ].filter(Boolean),
      '체크하면 진행률에 반영돼요',
    ),
    pairSection('범위', 'Will do', 'Won\'t do', '', intake.scopeExclude ?? '', '팽창 방지 — 안 할 것도 명시'),
    {
      id: uid(),
      title: '로드맵',
      kind: 'roadmap',
      hint: 'Linear 스타일 · 지금 Phase부터',
      phases: buildRoadmapPhases(defs, skip, perWeek),
    },
    {
      id: uid(),
      title: `주간 타임라인 · ${weekCount}주`,
      kind: 'weeks',
      hint: `마감 ${intake.deadline} 역산 · 주차를 눌러 포커스 확인`,
      weeks: buildWeeks(weekCount, perWeek, phaseTitles, new Date()),
    },
    checkSection('오늘 할 일', ['', '', ''], 'Things 3 · 우선순위 3개만'),
    textSection('버퍼', bufferText, '일부러 비워 둔 여유'),
    checkSection(
      '리스크 & 대응',
      [
        intake.blockers?.trim() ? intake.blockers.trim() : '가장 큰 변수',
        '플랜 B',
        external ? '심사·리젝 대응 시나리오' : '일정 지연 시 우선순위',
      ],
      '미리 적어두면 당황이 줄어요',
    ),
  ]
}

function buildDeliverableSections(intake: GoalIntake): PlanSection[] {
  const formatLabel =
    intake.deliverableFormat === 'document'
      ? '문서·리포트'
      : intake.deliverableFormat === 'slides'
        ? '슬라이드·발표'
        : intake.deliverableFormat === 'code'
          ? '코드·앱·웹'
          : intake.deliverableFormat === 'media'
            ? '영상·디자인'
            : '결과물'

  const sections: PlanSection[] = [
    textSection('결과물 형태', formatLabel),
    {
      id: uid(),
      title: '제작 파이프라인',
      kind: 'pipeline',
      hint: '목차 → 초안 → 리뷰 → 최종',
      pipelineSteps: ['목차', '초안', '리뷰', '최종'],
      pipelineIndex: pipelineIndex(intake.progress),
    },
    checkSection(
      '성공 기준',
      [intake.successCriteria || '완료 기준', '제출·공유 완료', '최종본 확정'],
    ),
    checkSection('목차', ['', '', '', ''], '섹션 제목만 먼저 — 아웃라인'),
    checkSection('초안', ['자료 수집', '1차 초안 완성', '스스로 1회 검토']),
    checkSection(
      '리뷰',
      intake.hasFeedback
        ? ['피드백 받기', '수정 반영', '2차 검토']
        : ['셀프 리뷰', '수정 반영', '최종 톤·형식 점검'],
    ),
    checkSection('최종', ['최종본 저장', '제출·공유', '완료 체크']),
    textSection('참고자료·링크', '', 'URL, 파일, 레퍼런스'),
  ]

  if (intake.hasFeedback) {
    sections.push(
      checkSection('피드백 로그', ['검토자 / 날짜 / 반영 — ', '', ''], '누가 · 언제 · 뭘 바꿨는지'),
    )
  }

  return sections
}

function buildRoutineSections(intake: GoalIntake): PlanSection[] {
  return [
    textSection(
      'Outcome',
      intake.goal,
      intake.routineHistory === 'retry' ? '다시 시작 — 완벽보다 연속' : '달성하고 싶은 결과',
    ),
    checkSection('이번 주 행동', ['', '', ''], '구체 행동 3개'),
    pairSection('습관 앵커', 'Morning', 'Fallback', '', '', '기존 루틴에 붙이기'),
    textSection('주간 회고', '', '잘 된 점 / 막힌 점 / 다음 주 조정'),
  ]
}

export function buildGoalPlan(
  profileId: string,
  intake: GoalIntake,
  profile?: SelfProfile,
  forcedTemplateType?: GoalTemplateType,
): GoalPlan {
  const templateType = forcedTemplateType ?? classifyGoalTemplate(intake)
  const now = new Date().toISOString()

  let sections: PlanSection[]
  switch (templateType) {
    case 'deliverable':
      sections = buildDeliverableSections(intake)
      break
    case 'routine':
      sections = buildRoutineSections(intake)
      break
    default:
      sections = buildBackplanSections(intake, profile)
  }

  const hierarchy = buildHierarchyFromIntake(intake, profile)

  return {
    id: uid(),
    profileId,
    templateType,
    intake,
    title: intake.goal.trim().slice(0, 60) || '새 목표',
    sections,
    hierarchy,
    templateVersion: GOAL_PLAN_TEMPLATE_VERSION,
    createdAt: now,
    updatedAt: now,
  }
}

/** 구버전 플랜 → v3 hierarchy 포함 구조로 마이그레이션 */
export function migrateGoalPlan(plan: GoalPlan, profile?: SelfProfile): GoalPlan {
  return ensureHierarchy(plan, profile)
}

export function planSummaryLine(plan: GoalPlan): string {
  if (plan.hierarchy) return planSummaryFromHierarchy(plan)
  return `${GOAL_TEMPLATE_LABELS[plan.templateType]} · ${plan.intake.deadline}`
}

export function planProgress(plan: GoalPlan): number {
  if (plan.hierarchy) return hierarchyProgress(plan)
  let total = 0
  let done = 0
  const count = (items: PlanCheckItem[]) => {
    for (const it of items) {
      if (!it.label.trim()) continue
      total += 1
      if (it.done) done += 1
    }
  }
  for (const s of plan.sections) {
    if (s.items) count(s.items)
    if (s.phases) for (const ph of s.phases) count(ph.tasks)
    if (s.weeks) for (const w of s.weeks) count(w.items)
  }
  if (total === 0) return 0
  return Math.round((done / total) * 100)
}
