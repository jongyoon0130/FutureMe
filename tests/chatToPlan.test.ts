// 채팅 메시지 → 계획표 확인 카드 초안
// 감지(파싱)를 없앤 자리 — 이제 user가 고른 문장이 그대로 초안이 된다.
import { describe, expect, it } from 'bun:test'
import { dateKeyOf, messageToTodoTitle, shiftDateKey, todoDraftFromMessage } from '../src/lib/chatToPlan'

const NOW = new Date('2026-07-22T21:10:00') // 수요일

describe('messageToTodoTitle', () => {
  it('줄바꿈·연속 공백을 한 칸으로 눌러 한 줄 제목으로 만든다', () => {
    expect(messageToTodoTitle('내일 아침에\n\n  이력서   첫 줄만 고치기')).toBe(
      '내일 아침에 이력서 첫 줄만 고치기',
    )
  })

  it('긴 메시지는 60자에서 자른다 (카드에서 고칠 수 있으니 잘려도 됨)', () => {
    const long = '가'.repeat(200)
    expect(messageToTodoTitle(long)).toHaveLength(60)
  })

  it('공백뿐인 메시지는 빈 문자열', () => {
    expect(messageToTodoTitle('   \n  ')).toBe('')
  })
})

describe('todoDraftFromMessage', () => {
  it('고른 메시지를 제목으로, 날짜는 기본 오늘', () => {
    expect(todoDraftFromMessage('풋살 오후 1시', NOW)).toEqual({
      date: '2026-07-22',
      title: '풋살 오후 1시',
    })
  })

  it('빈 메시지면 카드를 띄우지 않는다', () => {
    expect(todoDraftFromMessage('  ', NOW)).toBeNull()
  })
})

describe('shiftDateKey', () => {
  it('내일·모레로 옮긴다', () => {
    expect(shiftDateKey('2026-07-22', 1)).toBe('2026-07-23')
    expect(shiftDateKey('2026-07-22', 2)).toBe('2026-07-24')
  })

  it('월말을 넘어가도 맞다', () => {
    expect(shiftDateKey('2026-07-31', 1)).toBe('2026-08-01')
  })

  it('망가진 값은 그대로 돌려준다', () => {
    expect(shiftDateKey('아무말', 1)).toBe('아무말')
  })
})

describe('dateKeyOf', () => {
  it('로컬 날짜를 YYYY-MM-DD로 (UTC 변환으로 하루 밀리지 않게)', () => {
    expect(dateKeyOf(new Date('2026-07-22T23:50:00'))).toBe('2026-07-22')
    expect(dateKeyOf(new Date('2026-01-05T00:10:00'))).toBe('2026-01-05')
  })
})
