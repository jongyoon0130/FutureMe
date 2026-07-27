// ---------------------------------------------------------------------------
// 목표 데이터 실시간 동기화.
//
// 다른 기기가 futureme_goal_data를 바꾸면 Supabase가 이 기기로 변경을 밀어준다.
// 폴링 주기가 없다 — 바뀌는 순간 온다. 앱을 켜둔 채 가만히 둬도 반영된다.
//
// ⚠️ Supabase 대시보드에서 이 테이블의 Realtime을 켜둬야 이벤트가 온다
//    (Database → Publications → supabase_realtime 에 futureme_goal_data 추가).
//    안 켜져 있어도 앱은 멀쩡하다 — 그냥 실시간 대신 "열 때 당김"으로만 동작한다.
//
// 백그라운드 동안엔 소켓이 잠들 수 있으므로, 돌아올 때의 캐치업 당김
// (pullRemoteGoalDataOnce)과 함께 써야 빈틈이 없다.
// ---------------------------------------------------------------------------

import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { applyRemoteGoalRow } from './goalDataSync'
import type { RemoteGoalDataRow } from './cloudSync'

let channel: RealtimeChannel | null = null
let subscribedUserId: string | null = null

/** 이 사용자의 목표 데이터 변경 구독을 시작한다 (이미 같은 사용자로 구독 중이면 그대로 둔다) */
export function startGoalDataRealtime(userId: string): void {
  if (!supabase) return
  if (channel && subscribedUserId === userId) return
  stopGoalDataRealtime()
  subscribedUserId = userId

  channel = supabase
    .channel(`goal-data-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'futureme_goal_data', filter: `user_id=eq.${userId}` },
      (payload) => {
        // 구독 필터가 이미 이 사용자 행으로 좁혀져 있다. INSERT/UPDATE의 new 행만 반영한다
        // (DELETE는 new가 비어 있어 걸러진다).
        const row = payload.new as Partial<RemoteGoalDataRow> | undefined
        if (row && (Array.isArray(row.plans) || Array.isArray(row.misc_todos))) {
          applyRemoteGoalRow(row as RemoteGoalDataRow)
        }
      },
    )
    .subscribe()
}

/** 구독 해지 (로그아웃·사용자 변경 시) */
export function stopGoalDataRealtime(): void {
  if (channel && supabase) supabase.removeChannel(channel)
  channel = null
  subscribedUserId = null
}
