// ---------------------------------------------------------------------------
// 알림 2-b 배선 — 할 일을 클라우드에 올릴 때, 알림 예약표도 같이 최신화한다.
//
// deriveReminders(순수 로직)가 앞으로 며칠치 예약을 만들면, 그걸 서버의
// futureme_reminders 테이블에 반영한다. 크론(push-tick)은 이 표만 보고 발송한다.
//
// "관리 창(오늘부터 며칠)"만 다룬다: 그 창의 예약을 통째로 지우고 새로 넣는다.
// 그래야 할 일을 지우거나 시간을 바꿔도 예약이 따라온다(유령 예약이 안 남는다).
// 이미 지난 예약은 건드리지 않는다 — 보낸 기록(push_sent)이 중복을 막으니 안전하다.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { getActiveSyncUser } from './cloudSync'
import { deriveReminders } from './notifyReminders'
import type { GoalPlan } from '../types/goalPlan'
import type { MiscTodoItem } from './goalMiscTodos'

/** 예약표가 내다보는 날 수 (오늘 포함). 크론이 매분 도니 이틀이면 넉넉하다 */
const HORIZON_DAYS = 2

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 예약표 갱신. 로그인·클라우드가 있을 때만 동작하고, 실패해도 던지지 않는다
 * (알림 예약이 안 돼도 할 일 저장 자체는 멀쩡해야 한다).
 */
export async function syncRemindersToCloud(
  plans: GoalPlan[],
  misc: MiscTodoItem[],
  now = new Date(),
): Promise<void> {
  const userId = getActiveSyncUser()
  if (!supabase || !userId) return

  const rows = deriveReminders(plans, misc, now, HORIZON_DAYS)
  const today = localDateKey(now)
  const updatedAt = Date.now()

  try {
    // 관리 창(오늘 이후) 예약을 비우고 새로 넣는다 = 편집·삭제까지 반영
    const del = await supabase
      .from('futureme_reminders')
      .delete()
      .eq('user_id', userId)
      .gte('fire_date', today)
    if (del.error) {
      console.info('[reminderSync] 예약 비우기 실패', del.error.message)
      return
    }

    if (rows.length === 0) return

    const ins = await supabase.from('futureme_reminders').insert(
      rows.map((r) => ({
        user_id: userId,
        fire_date: r.fire_date,
        fire_time: r.fire_time,
        kind: r.kind,
        item_id: r.item_id,
        label: r.label,
        goal_title: r.goal_title,
        updated_at: updatedAt,
      })),
    )
    if (ins.error) console.info('[reminderSync] 예약 넣기 실패', ins.error.message)
  } catch (e) {
    console.info('[reminderSync] 예약 갱신 중 오류', e)
  }
}
