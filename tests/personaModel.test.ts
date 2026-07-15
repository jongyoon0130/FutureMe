// 페르소나 모델 테스트 — 충실도 점수, 빈 곳 추천, 프롬프트 렌더링
import { describe, expect, it } from 'bun:test'
import { emptyProfile, type SelfProfile } from '../src/types/self'
import {
  applyPersonaAnswer,
  PERSONA_FIELDS,
  personaCompleteness,
  personaGaps,
  renderFutureSelfBlock,
} from '../src/lib/personaModel'

function richProfile(): SelfProfile {
  const p = emptyProfile()
  p.id = 'p1'
  p.name = '지웅'
  p.currentRole = 'IT 회사 2년차 백엔드'
  p.lifeContext = '출퇴근하고 저녁엔 사이드 프로젝트'
  p.styleSample = '아 오늘 진짜 녹초됨 ㅠㅠ 그래도 산책은 함'
  p.speechTone = '반말·편하게'
  p.future.identityLine = '내 속도로 성장하며 팀을 이끄는 사람'
  p.future.typicalDay = '7시 기상, 운동하고 9시 출근. 오후엔 집중 개발, 저녁엔 카페에서 책.'
  p.future.futureVoiceSample = '야, 조급해하지 마. 나 여기까지 왔잖아.'
  p.future.adviceLine = '지금 속도면 충분해.'
  p.future.income = '월세 걱정 없고 비상금 6개월치'
  return p
}

describe('personaCompleteness — 충실도', () => {
  it('빈 프로필은 0, 채울수록 올라간다', () => {
    const empty = personaCompleteness(emptyProfile())
    expect(empty.overall).toBe(0)

    const some = personaCompleteness(richProfile())
    expect(some.overall).toBeGreaterThan(0.3) // core 8개 전부 채움 → 가중치로 30% 이상
    expect(some.overall).toBeLessThan(1)
    expect(some.filled).toBeGreaterThan(5)
  })

  it('core 필드는 color 필드보다 점수에 더 크게 기여한다', () => {
    const base = emptyProfile()
    const withCore = applyPersonaAnswer(
      base,
      PERSONA_FIELDS.find((f) => f.key === 'identityLine')!,
      '한 문장 정체성',
    )
    const withColor = applyPersonaAnswer(
      base,
      PERSONA_FIELDS.find((f) => f.key === 'income')!,
      '돈 걱정 없음',
    )
    expect(personaCompleteness(withCore).overall).toBeGreaterThan(
      personaCompleteness(withColor).overall,
    )
  })
})

describe('personaGaps — 다음에 채울 질문', () => {
  it('빈 core 필드를 가장 먼저 추천한다', () => {
    const gaps = personaGaps(emptyProfile(), 3)
    expect(gaps).toHaveLength(3)
    expect(gaps.every((g) => g.tier === 'core')).toBe(true)
    expect(gaps.every((g) => typeof g.set === 'function')).toBe(true)
  })

  it('core가 다 차면 support를 추천한다', () => {
    const p = richProfile()
    const gaps = personaGaps(p, 2)
    expect(gaps.length).toBeGreaterThan(0)
    expect(gaps[0].tier).toBe('support')
  })
})

describe('applyPersonaAnswer — 답변 반영 + 말투 학습', () => {
  it('필드를 채우고 말투 샘플·규칙을 갱신한다', () => {
    const field = PERSONA_FIELDS.find((f) => f.key === 'styleSample')!
    const next = applyPersonaAnswer(emptyProfile(), field, '오늘 좀 힘들었는데 그래도 버텼다 ㅋㅋ')
    expect(next.styleSample).toContain('버텼다')
    expect(next.styleSamples.length).toBeGreaterThan(0)
    expect(next.styleRules).toBeDefined()
  })

  it('채팅에서 배운 말투 샘플은 지우지 않는다', () => {
    const p = richProfile()
    p.styleSamples = [{ register: 'casual', text: '채팅에서 배운 말', source: 'chat', at: 1 }]
    const field = PERSONA_FIELDS.find((f) => f.key === 'fear')!
    const next = applyPersonaAnswer(p, field, '실패해서 실망시키는 거')
    expect(next.styleSamples.some((s) => s.source === 'chat')).toBe(true)
    expect(next.styleSamples.some((s) => s.source === 'onboarding')).toBe(true)
  })
})

describe('renderFutureSelfBlock — 프롬프트 렌더링', () => {
  it('빈 필드는 줄을 만들지 않고, 채운 필드만 라벨과 함께 싣는다', () => {
    const block = renderFutureSelfBlock(richProfile())
    expect(block).toContain('내 속도로 성장하며')
    expect(block).toContain('경제·돈')
    expect(block).not.toContain('직업·일') // 안 채운 필드
  })

  it('lite 모드에서는 core만 실어 짧아진다', () => {
    const p = richProfile()
    const full = renderFutureSelfBlock(p, false)
    const lite = renderFutureSelfBlock(p, true)
    expect(lite.length).toBeLessThan(full.length)
    expect(lite).toContain('정체성')
    expect(lite).not.toContain('경제·돈') // income은 color
  })

  it('아무것도 없으면 지어내지 말라는 안내를 넣는다', () => {
    expect(renderFutureSelfBlock(emptyProfile())).toContain('아는 척 금지')
  })
})
