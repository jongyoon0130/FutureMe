// 클라우드 저장(push) 성공/실패 상태를 UI에 알리는 아주 작은 저장소.
// cloudSync의 쓰기 함수들이 성공/실패를 기록하고, App이 useSyncExternalStore로 구독한다.

let failing = false
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function noteCloudPushFailure(): void {
  if (failing) return
  failing = true
  emit()
}

export function noteCloudPushSuccess(): void {
  if (!failing) return
  failing = false
  emit()
}

export function isCloudPushFailing(): boolean {
  return failing
}

export function subscribeCloudPushStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
