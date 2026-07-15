import { emptyProfile } from '../types/self'

const OWNER_KEY = 'goal-app-owner-id'

/** 목표 앱 전용 로컬 사용자 ID (Future Me 채팅 프로필과 분리) */
export function getGoalAppOwnerId(): string {
  try {
    const existing = localStorage.getItem(OWNER_KEY)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(OWNER_KEY, id)
    return id
  } catch {
    return 'goal-app-local'
  }
}

/** goal 엔진이 기대하는 최소 SelfProfile 스텁 */
export function getGoalAppProfile() {
  return { ...emptyProfile(), id: getGoalAppOwnerId(), name: '나' }
}
