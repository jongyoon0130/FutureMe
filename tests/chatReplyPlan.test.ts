// 채팅 응답 계획(chatReplyPlan) 테스트
// 이 로직이 틀리면 AI가 엉뚱한 메시지에 답하거나, 에러 말풍선이 대화 맥락에 섞여 들어간다.
import { describe, expect, it } from 'bun:test'
import type { ChatMessage } from '../src/types/self'
import {
  buildReplyPlan,
  getUnansweredUserMessages,
  insertReplyAfterUser,
} from '../src/lib/chatReplyPlan'

let seq = 0
function msg(role: 'user' | 'self', content: string): ChatMessage {
  seq += 1
  return { id: `m${seq}`, role, content, timestamp: 1_700_000_000_000 + seq * 1000 }
}

// isSyntheticErrorReply가 에러로 인식하는 형식: 괄호로 감싸고 API/503 등의 키워드 포함
const ERROR_BUBBLE = '(잠깐 — Gemini API가 503으로 응답했어. 다시 시도해줘.)'

describe('buildReplyPlan', () => {
  it('마지막 user 메시지를 focus로 잡는다', () => {
    const u1 = msg('user', '오늘 좀 힘들었어')
    const a1 = msg('self', '무슨 일 있었어?')
    const u2 = msg('user', '회의에서 발표를 망쳤어')

    const plan = buildReplyPlan([u1, a1, u2])

    expect(plan).not.toBeNull()
    expect(plan!.focusMessageId).toBe(u2.id)
    expect(plan!.focusContent).toBe(u2.content)
    expect(plan!.skippedUserMessages).toHaveLength(0)
    // 맥락은 마지막으로 정상 답변이 있었던 지점까지만 실린다
    expect(plan!.contextMessages.map((m) => m.content)).toEqual([u1.content, a1.content])
  })

  it('API 실패로 답 못 받은 중간 user 메시지는 건너뛴다', () => {
    const u1 = msg('user', '요즘 고민이 많아')
    const a1 = msg('self', '어떤 고민이야?')
    const u2 = msg('user', '이직할까 말까')
    const err = msg('self', ERROR_BUBBLE)
    const u3 = msg('user', '아 몰라 그냥 저녁 뭐 먹지')

    const plan = buildReplyPlan([u1, a1, u2, err, u3])

    expect(plan!.focusMessageId).toBe(u3.id)
    expect(plan!.skippedUserMessages.map((m) => m.id)).toEqual([u2.id])
    // 에러 말풍선은 API에 실리는 맥락에서 제외된다
    expect(plan!.contextMessages.some((m) => m.content === ERROR_BUBBLE)).toBe(false)
    // 건너뛴 메시지가 있으면 프롬프트에 지시가 추가된다
    expect(plan!.focusInstruction).toContain('건너')
  })

  it('focusMessageId를 주면 그 메시지만 재시도 대상으로 잡는다', () => {
    const u1 = msg('user', '안녕')
    const a1 = msg('self', '어 왔네')
    const u2 = msg('user', '나 요즘 운동 시작했다?')
    const err = msg('self', ERROR_BUBBLE)

    const plan = buildReplyPlan([u1, a1, u2, err], u2.id)

    expect(plan!.focusMessageId).toBe(u2.id)
    expect(plan!.focusInstruction).toContain('재시도')
  })

  it('user 메시지가 하나도 없으면 null을 돌려준다', () => {
    expect(buildReplyPlan([msg('self', '먼저 인사')])).toBeNull()
    expect(buildReplyPlan([])).toBeNull()
  })
})

describe('insertReplyAfterUser', () => {
  it('재시도 성공 시 에러 말풍선을 지우고 그 자리에 답을 넣는다', () => {
    const u1 = msg('user', '질문이야')
    const err = msg('self', ERROR_BUBBLE)
    const u2 = msg('user', '다음 말')
    const reply = msg('self', '이제 답할게')

    const next = insertReplyAfterUser([u1, err, u2], u1.id, reply)

    expect(next.map((m) => m.id)).toEqual([u1.id, reply.id, u2.id])
  })

  it('대상 user를 못 찾으면 맨 뒤에 붙인다', () => {
    const u1 = msg('user', '질문')
    const reply = msg('self', '답')
    const next = insertReplyAfterUser([u1], 'no-such-id', reply)
    expect(next.map((m) => m.id)).toEqual([u1.id, reply.id])
  })
})

describe('getUnansweredUserMessages', () => {
  it('정상 답변을 받은 메시지는 제외하고, 에러만 받은 메시지는 포함한다', () => {
    const u1 = msg('user', '답 받은 말')
    const a1 = msg('self', '정상 답변')
    const u2 = msg('user', '에러만 받은 말')
    const err = msg('self', ERROR_BUBBLE)

    const unanswered = getUnansweredUserMessages([u1, a1, u2, err])

    expect(unanswered.map((m) => m.id)).toEqual([u2.id])
  })
})
