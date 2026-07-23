// ---------------------------------------------------------------------------
// 주 프로필 — "미래의 나는 한 명"이라는 전제를 코드 한 곳에 모은 것.
//
// 이 앱은 자문자답 앱(TalkBack)에서 갈라져 나오면서 채팅방을 여러 개 만들 수 있는
// 구조를 그대로 물려받았다. 그런데 Future Me의 "5년 뒤의 나"는 원래 한 명이고,
// 여러 개로 갈리면 기록도 갈린다 — 미래의 나가 근거로 삼을 증거가 반으로 준다
// (로드맵 원칙 2: 시간이 만드는 해자).
//
// 그래서 **새로 만들기는 첫 프로필 하나까지**로 좁히고, 채팅·홈·프로필 세 탭이
// 여기서 고른 같은 사람을 보게 한다. 이미 여러 개 만든 사람의 것은 지우지 않는다 —
// 목록에서 그대로 열 수 있고, 열면 그게 주 프로필이 된다.
// ---------------------------------------------------------------------------
import { loadProfileSummaries } from './storage'

const PRIMARY_KEY = 'futureme-primary-profile-id'

function readStored(): string | null {
  try {
    return localStorage.getItem(PRIMARY_KEY)
  } catch {
    return null
  }
}

/**
 * 지금의 "나" — 저장된 주 프로필이 아직 살아 있으면 그것,
 * 아니면 가장 최근에 쓴 프로필. 하나도 없으면 null(= 온보딩 대상).
 */
export function getPrimaryProfileId(): string | null {
  const summaries = loadProfileSummaries()
  if (!summaries.length) return null

  const stored = readStored()
  if (stored && summaries.some((s) => s.id === stored)) return stored

  // 저장된 게 없거나 지워졌으면 가장 최근 것으로 되돌아온다
  return summaries[0].id
}

/** 프로필을 열 때 호출 — 그 사람이 지금의 "나"가 된다 */
export function setPrimaryProfileId(id: string): void {
  try {
    localStorage.setItem(PRIMARY_KEY, id)
  } catch {
    /* 저장 못 해도 getPrimaryProfileId가 최근 것으로 되돌아온다 */
  }
}

export function clearPrimaryProfileId(): void {
  try {
    localStorage.removeItem(PRIMARY_KEY)
  } catch {
    /* ignore */
  }
}

/** 새 프로필을 만들 수 있는 상태인가 — 아직 하나도 없을 때만 */
export function canCreateProfile(profileCount: number): boolean {
  return profileCount === 0
}
