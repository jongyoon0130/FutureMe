// 앱이 유저 문장에서 일정 추가를 파싱 — 모델이 지시문을 안 내보내도 카드가 뜨게
import { describe, expect, it } from 'bun:test'
import { parseScheduleRequest } from '../src/lib/chatScheduleParse'
import { stripDateLabelPrefix } from '../src/lib/selfEngine'

const NOW = new Date('2026-07-20T18:48:00') // 월요일

describe('parseScheduleRequest', () => {
  it('명시적 추가 요청 + 내일 → 다음날 날짜, 활동 제목', () => {
    const r = parseScheduleRequest('내일 아침 9시에 축구 일정 있어. 적어줄래?', NOW)
    expect(r?.date).toBe('2026-07-21')
    expect(r?.title).toContain('축구')
    expect(r?.title).not.toContain('적어')
    expect(r?.title).not.toContain('내일')
  })

  it('오늘/모레도 잡는다', () => {
    expect(parseScheduleRequest('오늘 회의 있는데 넣어줘', NOW)?.date).toBe('2026-07-20')
    expect(parseScheduleRequest('모레 병원 예약 추가해줘', NOW)?.date).toBe('2026-07-22')
  })

  it('요일 표현 → 다가오는 그 요일', () => {
    // 2026-07-20 월요일 → 다가오는 토요일 = 07-25
    expect(parseScheduleRequest('토요일에 풋살 적어놔줘', NOW)?.date).toBe('2026-07-25')
  })

  it('N월 M일 명시', () => {
    expect(parseScheduleRequest('7월 30일 발표 등록해줘', NOW)?.date).toBe('2026-07-30')
  })

  it('날짜 못 잡으면 오늘로', () => {
    expect(parseScheduleRequest('장보기 적어줘', NOW)?.date).toBe('2026-07-20')
  })

  it('추가 요청이 아니면 null — 일반 대화는 안 건드림', () => {
    expect(parseScheduleRequest('내일 축구 있어', NOW)).toBeNull()
    expect(parseScheduleRequest('오늘 일정 뭐 있지?', NOW)).toBeNull()
    expect(parseScheduleRequest('요즘 좀 지쳐', NOW)).toBeNull()
  })

  it('제목이 비면 null', () => {
    expect(parseScheduleRequest('적어줘', NOW)).toBeNull()
  })
})

describe('stripDateLabelPrefix', () => {
  it('날짜 라벨을 지운다', () => {
    expect(stripDateLabelPrefix('[7/21 (화)] 오늘 축구 있잖아')).toBe('오늘 축구 있잖아')
    expect(stripDateLabelPrefix('7/21(화) 축구 있어')).toBe('축구 있어')
  })
  it('시각 라벨도 지운다 (16:48] …)', () => {
    expect(stripDateLabelPrefix('16:48] 내일 오후 2시 안암 출근 적어둘게')).toBe('내일 오후 2시 안암 출근 적어둘게')
    expect(stripDateLabelPrefix('16:58] 확인했어. 내일 2시 전까지 여유 있겠네')).toBe('확인했어. 내일 2시 전까지 여유 있겠네')
  })
  it('혼합형 [7/21(화) 16:48] 도 지운다', () => {
    expect(stripDateLabelPrefix('[7/21(화) 16:48] 축구 있어')).toBe('축구 있어')
  })
  it('라벨이 없으면 그대로 — 답변 속 시각은 안 건드림', () => {
    expect(stripDateLabelPrefix('오늘 축구 있어')).toBe('오늘 축구 있어')
    expect(stripDateLabelPrefix('내일 오후 2시에 축구야')).toBe('내일 오후 2시에 축구야')
  })
})
