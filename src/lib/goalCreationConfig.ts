import type { GoalTemplateType } from '../types/goalPlan'

/** 사용자가 고르는 목표 종류 (위저드 1단계) */
export type GoalCreationMode = 'habit' | 'project'

export const GOAL_CREATION_MODES: {
  id: GoalCreationMode
  icon: string
  title: string
  desc: string
  placeholder: string
}[] = [
  {
    id: 'habit',
    icon: '🔄',
    title: '습관',
    desc: '매일·매주 반복해서 지키는 목표',
    placeholder: '예: 운동, 영어 공부, 독서',
  },
  {
    id: 'project',
    icon: '🎯',
    title: '프로젝트',
    desc: '마감까지 끝내는 목표',
    placeholder: '예: 앱스토어 출시, 포트폴리오 완성',
  },
]

export function creationModeToTemplate(mode: GoalCreationMode): GoalTemplateType {
  return mode === 'habit' ? 'routine' : 'backplan'
}

export const ROUTINE_WEEKLY_QUICK = [1, 2, 3, 4, 5, 6, 7] as const

export const ROUTINE_SESSION_LABELS = {
  light: '가볍게 · 10~15분',
  moderate: '30분 이상',
} as const
