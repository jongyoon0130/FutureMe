const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const
const WEEKDAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'] as const

/** Gemini API 턴 앞에 붙이는 짧은 시각 — [7/9 (수) 22:10] */
export function formatApiTurnTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `[${d.getMonth() + 1}/${d.getDate()} (${WEEKDAYS_SHORT[d.getDay()]}) ${h}:${min}]`
}

/** API용 시각 접두어 — 모델이 답변에 복사한 경우 제거 */
const API_TURN_TIMESTAMP_PREFIX =
  /^\[\d{1,2}\/\d{1,2} \([월화수목금토일]\) \d{2}:\d{2}\]\s*/

export function stripApiTurnTimestampPrefix(text: string): string {
  let t = text
  while (API_TURN_TIMESTAMP_PREFIX.test(t)) {
    t = t.replace(API_TURN_TIMESTAMP_PREFIX, '')
  }
  return t
}

/** 말풍선 본문에서 API 시각 접두어 제거 (문단마다 붙은 경우 포함) */
export function stripApiTurnTimestampFromContent(content: string): string {
  const parts = content.split(/\n\s*\n/)
  if (parts.length <= 1) return stripApiTurnTimestampPrefix(content.trim())
  return parts.map((p) => stripApiTurnTimestampPrefix(p.trim())).filter(Boolean).join('\n\n')
}

/** 채팅방 목록 미리보기 — API 시각 접두어·속마음 태그 제거 */
export function formatListPreview(content: string, maxLen = 80): string {
  let t = stripApiTurnTimestampFromContent(content)
  t = t.replace(/^\[나의\s*속마음\]\s*/g, '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen - 1)}…`
}

/** 시스템 프롬프트용 현재 시각 (기기 로컬 타임존) */
export function nowContextKo(): string {
  const d = new Date()
  const h = d.getHours()
  const min = d.getMinutes().toString().padStart(2, '0')
  const hour12 = h % 12 || 12
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]} ${h < 12 ? '오전' : '오후'} ${hour12}:${min}`
}

export function formatChatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAYS[d.getDay()]}`
}

/** 카카오톡 스타일 — 오전 9:05 / 오후 1:40 */
export function formatChatTime(ts: number): string {
  const d = new Date(ts)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const hour12 = h % 12 || 12
  return `${h < 12 ? '오전' : '오후'} ${hour12}:${m}`
}

export function isSameChatDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

/** 빈 줄(\n\n) 기준으로 말풍선 분리 — 단일 줄바꿈은 한 버블 안에서 유지 */
export function splitMessageParagraphs(content: string): string[] {
  const parts = content
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)
  const single = content.trim()
  return parts.length ? parts : single ? [single] : ['']
}

export type ChatDisplayItem =
  | { kind: 'date'; ts: number; label: string }
  | {
      kind: 'group'
      msgId: string
      role: 'user' | 'self'
      segments: string[]
      timestamp: number
    }

export function buildChatDisplayItems(messages: ChatMessageLike[]): ChatDisplayItem[] {
  const items: ChatDisplayItem[] = []
  let prevTs: number | null = null

  for (const msg of messages) {
    if (prevTs === null || !isSameChatDay(prevTs, msg.timestamp)) {
      items.push({ kind: 'date', ts: msg.timestamp, label: formatChatDate(msg.timestamp) })
    }
    items.push({
      kind: 'group',
      msgId: msg.id,
      role: msg.role,
      segments: splitMessageParagraphs(stripApiTurnTimestampFromContent(msg.content)),
      timestamp: msg.timestamp,
    })
    prevTs = msg.timestamp
  }

  return items
}

interface ChatMessageLike {
  id: string
  role: 'user' | 'self'
  content: string
  timestamp: number
}

export function themBubbleRadius(index: number, total: number): string {
  if (total <= 1) return 'chat-bubble-them'
  if (index === 0) return 'chat-bubble-them chat-bubble-them-group-first'
  if (index === total - 1) return 'chat-bubble-them chat-bubble-them-group-last'
  return 'chat-bubble-them chat-bubble-them-group-mid'
}

export function meBubbleRadius(index: number, total: number): string {
  if (total <= 1) return 'chat-bubble-me'
  if (index === 0) return 'chat-bubble-me chat-bubble-me-group-first'
  if (index === total - 1) return 'chat-bubble-me chat-bubble-me-group-last'
  return 'chat-bubble-me chat-bubble-me-group-mid'
}
