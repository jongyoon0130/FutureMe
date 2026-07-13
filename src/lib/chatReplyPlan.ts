import type { ChatMessage } from '../types/self'
import { isSyntheticErrorReply, type ApiDialogueMessage } from './selfEngine'

/** user 메시지 바로 다음에 실제(비에러) self 답이 있으면 answered */
export function isUserMessageAnswered(messages: ChatMessage[], userIdx: number): boolean {
  for (let j = userIdx + 1; j < messages.length; j++) {
    if (messages[j].role === 'user') return false
    if (messages[j].role === 'self' && !isSyntheticErrorReply(messages[j].content)) return true
  }
  return false
}

export function getUnansweredUserMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages.filter((m, i) => m.role === 'user' && !isUserMessageAnswered(messages, i))
}

function findLastAnsweredAssistantIndex(messages: ChatMessage[], beforeIndex: number): number {
  for (let i = beforeIndex - 1; i >= 0; i--) {
    if (messages[i].role === 'self' && !isSyntheticErrorReply(messages[i].content)) return i
  }
  return -1
}

function previewText(text: string, max = 40): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export type ReplyPlan = {
  contextMessages: ApiDialogueMessage[]
  focusContent: string
  focusTimestamp?: number
  focusMessageId: string
  skippedUserMessages: ChatMessage[]
  focusInstruction: string
}

/**
 * API에 실릴 대화 구성.
 * - 기본: 마지막 user만 focus, 그 사이 503으로 쌓인 user 말은 API·답변 대상에서 제외
 * - 재시도: focusMessageId의 user 한 줄만 답
 */
export function buildReplyPlan(messages: ChatMessage[], focusMessageId?: string): ReplyPlan | null {
  const focusIdx =
    focusMessageId != null
      ? messages.findIndex((m) => m.id === focusMessageId && m.role === 'user')
      : (() => {
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') return i
          }
          return -1
        })()

  if (focusIdx < 0 || messages[focusIdx].role !== 'user') return null

  const focusMessage = messages[focusIdx]
  const lastAnsweredIdx = findLastAnsweredAssistantIndex(messages, focusIdx)

  const contextSlice = messages.slice(0, lastAnsweredIdx + 1)
  const contextMessages = contextSlice
    .map((m) => ({
      role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
      timestamp: m.timestamp,
    }))
    .filter((m) => m.role === 'user' || !isSyntheticErrorReply(m.content))

  const skippedUserMessages: ChatMessage[] = []
  for (let i = lastAnsweredIdx + 1; i < focusIdx; i++) {
    if (messages[i].role === 'user') skippedUserMessages.push(messages[i])
  }

  const focusContent = focusMessage.content
  let focusInstruction = ''

  if (skippedUserMessages.length > 0) {
    const skippedPreview = skippedUserMessages.map((m) => `"${previewText(m.content, 36)}"`).join(', ')
    focusInstruction = `\n## 이번 턴 (우선순위)\n- **지금 답할 것: 마지막 user 한 줄만** — "${previewText(focusContent, 60)}"\n- 아래는 API 실패로 답 못 받은 말 — **지금 건너뛸 것**: ${skippedPreview}\n- 건너뛴 말 내용으로 답하지 말 것. 마지막 한 줄의 의도·톤에만 맞춰 답할 것.`
  } else if (focusMessageId != null) {
    focusInstruction = `\n## 이번 턴 (재시도)\n- **지금 답할 user 메시지**: "${previewText(focusContent, 80)}"\n- 그 이후 user 말은 아직 답하지 않음 — 참고만, 섞어 답하지 말 것.`
  }

  return {
    contextMessages,
    focusContent,
    focusTimestamp: focusMessage.timestamp,
    focusMessageId: focusMessage.id,
    skippedUserMessages,
    focusInstruction,
  }
}

/** 재시도 성공 시 user 바로 뒤 에러 말풍선 제거 후 self 답 삽입 */
export function insertReplyAfterUser(
  messages: ChatMessage[],
  userId: string,
  selfMsg: ChatMessage,
): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === userId)
  if (idx < 0) return [...messages, selfMsg]
  const next = [...messages]
  let insertAt = idx + 1
  while (
    insertAt < next.length &&
    next[insertAt].role === 'self' &&
    isSyntheticErrorReply(next[insertAt].content)
  ) {
    next.splice(insertAt, 1)
  }
  next.splice(insertAt, 0, selfMsg)
  return next
}
