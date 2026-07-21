// ---------------------------------------------------------------------------
// 채팅 → 계획표: 앱이 직접 유저 문장에서 일정 추가 요청을 파싱한다.
//
// 모델이 숨은 지시문([[TODO]])을 안 내보내면 카드가 안 떴다 — 모델 의존은
// 불안정하다. 그래서 user가 명시적으로 "적어줘/넣어줘"라고 하면, 모델 출력과
// 무관하게 앱이 날짜·제목을 뽑아 확인 카드를 띄운다. (제목은 카드에서 수정 가능)
// ---------------------------------------------------------------------------

export type ParsedSchedule = { date: string; title: string }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** "적어줘 / 넣어줘 / 추가해줘 / 등록해줘 ..." — 명시적 추가 의도 */
const ADD_TRIGGER =
  /(적어|써|기록|넣어|추가|등록)\s*(줘|줄래|주라|둬|놔|둘래|주면|줄\s*수|해\s*줘|해\s*줄래|놓을래|놔줘|놔줄래)/

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** now 이후(오늘 포함) 가장 가까운 해당 요일 */
function upcomingWeekday(now: Date, target: number): Date {
  const diff = (target - now.getDay() + 7) % 7
  return addDays(now, diff)
}

function parseDate(msg: string, now: Date): Date | null {
  if (/모레/.test(msg)) return addDays(now, 2)
  if (/내일|낼/.test(msg)) return addDays(now, 1)
  if (/오늘/.test(msg)) return now

  let m = msg.match(/다음\s*주\s*([월화수목금토일])요일/)
  if (m) return addDays(upcomingWeekday(now, WEEKDAYS.indexOf(m[1])), 7)

  m = msg.match(/(?:이번\s*주\s*)?([월화수목금토일])요일/)
  if (m) return upcomingWeekday(now, WEEKDAYS.indexOf(m[1]))

  m = msg.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)
  if (m) {
    const d = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]), 12, 0, 0, 0)
    // 이미 지난 날짜면 내년으로
    if (d.getTime() < now.getTime() - 86400000) d.setFullYear(d.getFullYear() + 1)
    return d
  }
  return null
}

/** 요청·날짜 표현을 걷어내고 "무엇을" 만 남긴다 (거칠어도 카드에서 수정 가능) */
function extractTitle(msg: string): string {
  let t = msg
    // 요청 구절부터 끝까지 제거: "…에 적어줄래?" "추가해줘" 등
    .replace(
      /(그거|그것|이거|이걸|이것)?\s*(좀)?\s*(일정에|캘린더에|계획에|계획표에|할\s*일에)?\s*(적어|써|기록|넣어|추가|등록)\s*(줘|줄래|주라|둬|놔|둘래|주면|줄\s*수\s*있(어|나|을까)?|해\s*줘|해\s*줄래|놓을래|놔줘|놔줄래)[^]*$/,
      '',
    )
    // 날짜·상대 표현 제거
    .replace(/다음\s*주\s*[월화수목금토일]요일|이번\s*주\s*[월화수목금토일]요일|[월화수목금토일]요일/g, '')
    .replace(/오늘|내일|낼|모레|\d{1,2}\s*월\s*\d{1,2}\s*일/g, '')
    // 흔한 군더더기
    .replace(/^\s*(나|내가|저는|나는)\s+/, '')
    .replace(/\s*(일정|약속|스케줄)\s*(이|가)?\s*(있어|있는데|잡혀\s*있어|있음|이야)?[.!?]*\s*$/, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,·-]+|[\s,·-]+$/g, '')
    .trim()
  // "9시에" 끝의 조사 정리
  t = t.replace(/에\s*$/, '').trim()
  return t
}

/**
 * user 메시지에서 "일정 추가" 요청을 감지해 {date, title} 반환.
 * 명시적 추가 요청이 없거나 제목이 너무 짧으면 null.
 */
export function parseScheduleRequest(userMessage: string, now = new Date()): ParsedSchedule | null {
  if (!userMessage || !ADD_TRIGGER.test(userMessage)) return null
  const title = extractTitle(userMessage)
  if (title.length < 2) return null
  const date = parseDate(userMessage, now) ?? now // 날짜 못 잡으면 오늘
  return { date: dateKey(date), title: title.slice(0, 60) }
}
