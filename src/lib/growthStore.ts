// 지난 기록(고민 / 작은 행동 / 미래의 나 메모) 정리 + 기억 관리.
//
// 저장 버튼은 채팅에서 걷어냈다 — 작은 행동은 이제 계획표로 이어지고, 고민 저장은
// 아무도 다시 열어보지 않는 서랍이었다. 그래서 **새로 쌓는 함수는 없다.**
// 다만 이미 남긴 기록은 지우지 않는다(신뢰 원칙) — 프로필의 "지난 기록"에서
// 보고 지울 수 있게, 읽기·완료·삭제만 남겼다.
//
// 전부 순수 함수 — 프로필을 받아 "새 프로필"을 반환한다. 저장/동기화는 호출부(persistSelf)가 담당.
import type { SelfProfile, SmallAction } from '../types/self'

const now = () => Date.now()

// ---------------------------------------------------------------------------
// 저장한 고민 (지난 기록)
// ---------------------------------------------------------------------------
export function removeSavedDilemma(p: SelfProfile, id: string): SelfProfile {
  return { ...p, savedDilemmas: (p.savedDilemmas ?? []).filter((d) => d.id !== id) }
}

// ---------------------------------------------------------------------------
// 작은 행동 (지난 기록)
// ---------------------------------------------------------------------------
export function toggleSmallAction(p: SelfProfile, id: string): SelfProfile {
  const next = (p.smallActions ?? []).map((a): SmallAction =>
    a.id === id ? { ...a, done: !a.done, doneAt: !a.done ? now() : undefined } : a,
  )
  return { ...p, smallActions: next }
}

export function removeSmallAction(p: SelfProfile, id: string): SelfProfile {
  return { ...p, smallActions: (p.smallActions ?? []).filter((a) => a.id !== id) }
}

// ---------------------------------------------------------------------------
// 미래의 나 메모 (지난 기록)
// ---------------------------------------------------------------------------
export function removeFutureSelfNote(p: SelfProfile, id: string): SelfProfile {
  return { ...p, futureSelfNotes: (p.futureSelfNotes ?? []).filter((n) => n.id !== id) }
}

// ---------------------------------------------------------------------------
// 기억(대화에서 관찰한 인사이트) 관리 — 삭제/초기화로 신뢰 확보
// ---------------------------------------------------------------------------
export function removeInsight(p: SelfProfile, id: string): SelfProfile {
  return { ...p, insights: (p.insights ?? []).filter((i) => i.id !== id) }
}

export function clearInsights(p: SelfProfile): SelfProfile {
  return { ...p, insights: [] }
}
