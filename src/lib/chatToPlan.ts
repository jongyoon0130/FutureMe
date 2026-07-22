// ---------------------------------------------------------------------------
// 채팅 → 계획표: user가 **메시지를 골라** 계획표로 보낸다.
//
// 예전엔 "적어줘/넣어줘" 같은 단어를 앱이 감지했다. 그건 두 방향으로 틀렸다:
// 못 알아들으면 조용히 사라지고(부탁했는데 아무 일도 안 일어남), 잘 알아들을수록
// 미래의 나가 비서가 된다. 이제 감지는 없다 — 어떤 메시지든 꾹 눌러 고르면
// 그 문장이 그대로 확인 카드에 들어오고, 제목·날짜는 user가 고친다.
// ---------------------------------------------------------------------------

export type PendingTodo = { date: string; title: string }

const MAX_TITLE = 60

export function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 날짜 키를 n일 옮긴다 ("2026-07-22", 1 → "2026-07-23") */
export function shiftDateKey(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00`)
  if (Number.isNaN(d.getTime())) return key
  d.setDate(d.getDate() + n)
  return dateKeyOf(d)
}

/** 메시지 본문 → 할 일 제목 초안 (거칠어도 됨 — 카드에서 고친다) */
export function messageToTodoTitle(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TITLE)
}

/** 고른 메시지로 확인 카드 초안 만들기 — 날짜는 기본 오늘 */
export function todoDraftFromMessage(text: string, now = new Date()): PendingTodo | null {
  const title = messageToTodoTitle(text)
  if (!title) return null
  return { date: dateKeyOf(now), title }
}
