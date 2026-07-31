// 클라우드 저장(push) 성공/실패 상태를 UI에 알리는 아주 작은 저장소.
// cloudSync의 쓰기 함수들이 성공/실패를 기록하고, App이 useSyncExternalStore로 구독한다.
//
// 두 가지 이유로 "실패 → 배너"를 곧이곧대로 하지 않는다:
//   1) 자동 재시도: 네트워크가 잠깐 끊긴 것뿐이면 스스로 다시 올려 자가복구한다.
//      (예전엔 재시도가 없어, 한 번 실패하면 사용자가 다음 편집을 할 때까지 배너가 박혀 있었다.)
//   2) 유예: 첫 실패는 아직 배너를 안 띄운다. 재시도까지 실패해야(=정말 안 되는 상태)
//      배너를 켠다. 일시적 깜빡임에 매번 겁주지 않기 위해서다.

let failing = false // UI에 보이는 상태 (유예를 통과한 진짜 실패)
let consecutiveFailures = 0
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryFn: (() => Promise<void>) | null = null
const listeners = new Set<() => void>()

// 백오프: 3s → 8s → 20s → 이후 60s 반복. 성공하면 초기화된다.
const RETRY_DELAYS = [3000, 8000, 20000, 60000]

function emit(): void {
  for (const listener of listeners) listener()
}

/** 실패 시 다시 시도할 push를 등록한다 (App이 시작 때 한 번 등록). */
export function registerCloudRetry(fn: () => Promise<void>): void {
  retryFn = fn
}

function scheduleRetry(): void {
  if (retryTimer || !retryFn) return
  const delay = RETRY_DELAYS[Math.min(consecutiveFailures - 1, RETRY_DELAYS.length - 1)]
  retryTimer = setTimeout(() => {
    retryTimer = null
    // 결과(성공/실패)는 push 함수 안의 noteCloudPush*가 기록한다.
    void retryFn?.().catch(() => {})
  }, delay)
}

export function noteCloudPushFailure(): void {
  consecutiveFailures += 1
  scheduleRetry()
  // 첫 실패는 자가복구를 믿고 조용히 넘긴다. 2회째부터 "진짜 안 됨"으로 보고 배너를 켠다.
  if (consecutiveFailures >= 2 && !failing) {
    failing = true
    emit()
  }
}

export function noteCloudPushSuccess(): void {
  consecutiveFailures = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  if (failing) {
    failing = false
    emit()
  }
}

export function isCloudPushFailing(): boolean {
  return failing
}

export function subscribeCloudPushStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// 테스트 전용: 모듈 상태를 초기화한다.
export function __resetCloudPushStatusForTest(): void {
  failing = false
  consecutiveFailures = 0
  if (retryTimer) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  retryFn = null
}
