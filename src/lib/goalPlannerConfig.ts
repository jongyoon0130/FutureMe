import type { GoalTemplateType } from '../types/goalPlan'

export type GoalIntakeStep =
  | { kind: 'goal'; lines: string[] }
  | { kind: 'deadline'; lines: string[] }
  | { kind: 'success'; lines: string[] }
  | { kind: 'progress'; lines: string[] }
  | { kind: 'blockers'; lines: string[] }
  | { kind: 'scope-exclude'; lines: string[]; optional?: boolean }
  | { kind: 'deliverable-format'; lines: string[] }
  | { kind: 'feedback'; lines: string[] }
  | { kind: 'routine-frequency'; lines: string[] }
  | { kind: 'routine-history'; lines: string[] }

export const GOAL_INTAKE_CORE_STEPS: GoalIntakeStep[] = [
  {
    kind: 'goal',
    lines: ['이번에 **집중할 목표**가 뭐야?', '한 문장으로 편하게 — 예: 앱스토어 출시, 포트폴리오 완성, 매일 운동'],
  },
  {
    kind: 'deadline',
    lines: ['**언제까지** 끝내고 싶어?', '마감이 없으면 대략적인 목표 시점을 골라줘.'],
  },
  {
    kind: 'success',
    lines: [
      '**완료 기준**이 뭐야?',
      '“끝났다”고 판단할 조건 — 예: 심사 통과·출시, 제출 완료, 4주 연속 실행',
    ],
  },
  {
    kind: 'progress',
    lines: ['**지금 진행**은 어디쯤이야?'],
  },
]

export const GOAL_INTAKE_CONDITIONAL: Record<GoalTemplateType, GoalIntakeStep[]> = {
  backplan: [
    {
      kind: 'blockers',
      lines: [
        '**누가·뭐가** 일정을 막을 수 있어?',
        '심사, 팀, 자료 부족, 병행 업무 등 — 플래너에 버퍼·리스크 섹션을 맞춰줄게.',
      ],
    },
    {
      kind: 'scope-exclude',
      lines: ['이번 목표에서 **안 할 것**이 있어? (선택)', '범위를 줄이면 플래너가 더 현실적으로 잡혀.'],
      optional: true,
    },
  ],
  deliverable: [
    {
      kind: 'deliverable-format',
      lines: ['만들 **결과물 형태**가 뭐야?'],
    },
    {
      kind: 'feedback',
      lines: ['**피드백** 받는 사람이 있어?', '있으면 리뷰·수정 사이클 섹션을 넣을게.'],
    },
  ],
  routine: [
    {
      kind: 'routine-frequency',
      lines: ['**얼마나 자주**, 하루에 **얼마나** 할 수 있어?'],
    },
    {
      kind: 'routine-history',
      lines: ['이 목표, **전에 해본 적** 있어?'],
    },
  ],
}

export function buildIntakeFlow(templateType: GoalTemplateType): GoalIntakeStep[] {
  return [...GOAL_INTAKE_CORE_STEPS, ...GOAL_INTAKE_CONDITIONAL[templateType]]
}
