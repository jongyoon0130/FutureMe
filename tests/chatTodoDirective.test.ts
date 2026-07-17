// 채팅 → 계획표 일정 추가 지시문 파서
// 모델이 뱉는 값이라 신뢰할 수 없다: 화면에 새어나오면 안 되고, 이상한 값은 버려야 한다.
import { describe, expect, it } from 'bun:test'
import { extractTodoDirective } from '../src/lib/selfEngine'

const NOW = new Date('2026-07-17T16:36:00') // 금요일

describe('extractTodoDirective', () => {
  it('지시문을 떼어내고 본문만 남긴다', () => {
    const raw =
      '알았어, 내일 오후 1시부터 3시 풋살이지. 이거 맞으면 넣을게.\n[[TODO {"date":"2026-07-18","title":"풋살 (오후 1-3시)"}]]'
    const { text, todo } = extractTodoDirective(raw, NOW)

    expect(text).toBe('알았어, 내일 오후 1시부터 3시 풋살이지. 이거 맞으면 넣을게.')
    expect(text).not.toContain('TODO') // 사용자 화면에 절대 새어나오면 안 됨
    expect(todo).toEqual({ date: '2026-07-18', title: '풋살 (오후 1-3시)' })
  })

  it('지시문이 없으면 본문 그대로, todo는 null', () => {
    const { text, todo } = extractTodoDirective('그냥 평범한 답변이야.', NOW)
    expect(text).toBe('그냥 평범한 답변이야.')
    expect(todo).toBeNull()
  })

  it('깨진 JSON은 버리되 본문은 살린다', () => {
    const { text, todo } = extractTodoDirective('응 알았어.\n[[TODO {깨진}]]', NOW)
    expect(text).toBe('응 알았어.')
    expect(todo).toBeNull()
  })

  it('날짜 형식이 틀리거나 제목이 비면 버린다', () => {
    expect(extractTodoDirective('ㅇㅋ [[TODO {"date":"내일","title":"풋살"}]]', NOW).todo).toBeNull()
    expect(extractTodoDirective('ㅇㅋ [[TODO {"date":"2026-07-18","title":"  "}]]', NOW).todo).toBeNull()
    expect(extractTodoDirective('ㅇㅋ [[TODO {"title":"풋살"}]]', NOW).todo).toBeNull()
  })

  it('상식 밖 날짜(과거·먼 미래)는 버린다 — 모델이 날짜를 헛짚은 것', () => {
    expect(extractTodoDirective('ㅇㅋ [[TODO {"date":"2020-01-01","title":"풋살"}]]', NOW).todo).toBeNull()
    expect(extractTodoDirective('ㅇㅋ [[TODO {"date":"2027-12-31","title":"풋살"}]]', NOW).todo).toBeNull()
    // 어제~60일 뒤는 허용 (오늘 늦은 밤 "어제 거 적어줘" 같은 경우)
    expect(extractTodoDirective('ㅇㅋ [[TODO {"date":"2026-07-16","title":"풋살"}]]', NOW).todo).not.toBeNull()
    expect(extractTodoDirective('ㅇㅋ [[TODO {"date":"2026-09-10","title":"풋살"}]]', NOW).todo).not.toBeNull()
  })

  it('제목이 너무 길면 잘라서 저장한다', () => {
    const long = '가'.repeat(200)
    const todo = extractTodoDirective(`ㅇㅋ [[TODO {"date":"2026-07-18","title":"${long}"}]]`, NOW).todo
    expect(todo?.title.length).toBe(60)
  })

  it('공백이 들어간 형태도 인식한다', () => {
    const todo = extractTodoDirective('ㅇㅋ [[ TODO  {"date":"2026-07-18","title":"풋살"} ]]', NOW).todo
    expect(todo).toEqual({ date: '2026-07-18', title: '풋살' })
  })
})
