// ---------------------------------------------------------------------------
// 알림 2-b — "알림 예약표"를 만드는 순수 로직.
//
// 왜 이게 앱에 있나:
//   "오늘 이 시각의 할 일"을 찾는 건 aggregateForDate → resolveDateSlots 라는
//   복잡한 트리 탐색이다. 이걸 서버(Deno)에서 다시 짜면 앱과 어긋나서 엉뚱한 할 일에
//   알림이 가기 쉽다. 그래서 **이미 검증된 앱 로직으로** 앞으로 며칠치 예약을 평평하게
//   펼쳐 두고, 서버는 "지금 시각 == 예약 시각?"만 단순 비교하게 한다.
//
// 이 파일은 브라우저 API에 의존하지 않는다(순수 함수). 그래서 테스트도 쉽고,
// 동기화 경로에서 불러 `futureme_reminders` 테이블에 upsert하는 데 쓴다.
// ---------------------------------------------------------------------------

import { dailyItemsForDate } from './goalPlanBridge'
import type { GoalPlan } from '../types/goalPlan'
import type { MiscTodoItem } from './goalMiscTodos'

/** 시작 알림 / 끝 알림 */
export type ReminderKind = 'start' | 'end'

/** 서버가 그대로 매칭할 수 있는 평평한 예약 한 줄 */
export interface ReminderRow {
  /** 사용자 로컬 날짜 YYYY-MM-DD */
  fire_date: string
  /** 사용자 로컬 시각 HH:mm (24h) */
  fire_time: string
  kind: ReminderKind
  /** 할 일 식별자 — 중복 발송 방지 키의 일부 */
  item_id: string
  label: string
  goal_title: string
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/** "19:00" 같은 값만 통과. 공백·형식 오류·빈값은 버린다 (엉뚱한 시각 방지) */
export function normalizeTime(raw: string | undefined): string | null {
  const t = raw?.trim()
  if (!t || !HHMM.test(t)) return null
  return t
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 지금부터 `days`일치(오늘 포함) 예약표를 만든다.
 *
 * - 시간이 없는 할 일은 예약을 안 만든다 (§5 "시간 적은 할 일에만")
 * - 이미 지난 시각도 그대로 넣는다 — "지금 == 예약"만 서버가 보므로, 과거 예약은
 *   자연히 안 걸린다. 여기서 거르면 타임존 경계에서 실수하기 쉬워 오히려 위험하다
 * - 완료된 할 일도 예약은 만든다. "이미 했으면 안 보냄"은 서버가 발송 직전에 판단할 몫
 */
export function deriveReminders(
  plans: GoalPlan[],
  misc: MiscTodoItem[],
  from: Date,
  days = 2,
): ReminderRow[] {
  const rows: ReminderRow[] = []
  const seen = new Set<string>()

  for (let offset = 0; offset < days; offset += 1) {
    const day = new Date(from)
    day.setHours(12, 0, 0, 0)
    day.setDate(day.getDate() + offset)
    const fire_date = dateKey(day)

    for (const item of dailyItemsForDate(plans, misc, day)) {
      // 이 할 일 알림을 꺼뒀으면 예약을 안 만든다 (할 일별 on/off)
      if (item.notifyOff) continue
      const start = normalizeTime(item.timeStart)
      const end = normalizeTime(item.timeEnd)
      const base = { fire_date, item_id: item.id, label: item.label, goal_title: item.planTitle }

      for (const [kind, time] of [
        ['start', start],
        ['end', end],
      ] as const) {
        if (!time) continue
        // 같은 (날짜, 할 일, 종류)가 트리·투두 양쪽에 잡혀도 한 줄만
        const key = `${fire_date}|${item.id}|${kind}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push({ ...base, fire_time: time, kind })
      }
    }
  }

  return rows
}
