// 자기이해 → 용기 → 실행: 저장한 고민 / 작은 행동 / 미래의 나 메모 + 기억 관리.
// 전부 순수 함수 — 프로필을 받아 "새 프로필"을 반환한다. 저장/동기화는 호출부(persistSelf)가 담당.
import type { SelfProfile, SavedDilemma, SmallAction, FutureSelfNote } from '../types/self'

const now = () => Date.now()

// ---------------------------------------------------------------------------
// 저장한 고민
// ---------------------------------------------------------------------------
export function addSavedDilemma(p: SelfProfile, text: string): SelfProfile {
  const t = text.trim()
  if (!t) return p
  const item: SavedDilemma = { id: crypto.randomUUID(), text: t, createdAt: now(), status: 'open' }
  return { ...p, savedDilemmas: [item, ...(p.savedDilemmas ?? [])] }
}

export function resolveSavedDilemma(p: SelfProfile, id: string, note: string): SelfProfile {
  const next = (p.savedDilemmas ?? []).map((d): SavedDilemma =>
    d.id === id
      ? { ...d, status: 'resolved', resolvedNote: note.trim() || undefined, resolvedAt: now() }
      : d,
  )
  return { ...p, savedDilemmas: next }
}

export function removeSavedDilemma(p: SelfProfile, id: string): SelfProfile {
  return { ...p, savedDilemmas: (p.savedDilemmas ?? []).filter((d) => d.id !== id) }
}

// ---------------------------------------------------------------------------
// 작은 행동
// ---------------------------------------------------------------------------
export function addSmallAction(p: SelfProfile, text: string, fromDilemmaId?: string): SelfProfile {
  const t = text.trim()
  if (!t) return p
  const item: SmallAction = {
    id: crypto.randomUUID(),
    text: t,
    createdAt: now(),
    done: false,
    fromDilemmaId,
  }
  return { ...p, smallActions: [item, ...(p.smallActions ?? [])] }
}

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
// 미래의 나 메모
// ---------------------------------------------------------------------------
export function addFutureSelfNote(p: SelfProfile, text: string, sourceMessageId?: string): SelfProfile {
  const t = text.trim()
  if (!t) return p
  const item: FutureSelfNote = { id: crypto.randomUUID(), text: t, createdAt: now(), sourceMessageId }
  return { ...p, futureSelfNotes: [item, ...(p.futureSelfNotes ?? [])] }
}

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
