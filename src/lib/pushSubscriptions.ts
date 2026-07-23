// ---------------------------------------------------------------------------
// 알림 단계 1-b — 발급받은 "배송 주소"를 서버에 적어두기.
//
// 1-a에서 브라우저가 준 구독은 **이 기기 안에만** 있다. 서버가 모르면 시간 맞춰
// 쏠 수가 없으므로, 로그인한 사용자의 구독을 Supabase에 저장한다.
// (테이블: supabase/schema.sql 의 futureme_push_subscriptions)
//
// 여기서도 알림을 "보내지는" 않는다. 그건 2단계(pg_cron + Edge Function)다.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { getActiveSyncUser } from './cloudSync'

const TABLE = 'futureme_push_subscriptions'

/** 서버가 발송할 때 필요한 최소 정보 — endpoint와 암호화 키 두 개 */
export interface PushSubscriptionRecord {
  endpoint: string
  /** 브라우저가 준 구독 원본 (keys.p256dh / keys.auth 포함) */
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }
  timezone: string
  user_agent: string | null
}

export type PushRecordResult =
  | { ok: true; record: PushSubscriptionRecord }
  | { ok: false; reason: 'no_endpoint' | 'no_keys' }

/**
 * 브라우저 구독(JSON)을 저장할 형태로 바꾼다.
 *
 * `keys`가 없으면 **서버가 알림 내용을 암호화할 수 없어서 발송이 통째로 실패한다.**
 * 그걸 저장 시점에 걸러내지 않으면 2단계에서 "왜 안 오지"로 돌아오게 된다.
 */
export function toPushRecord(
  raw: unknown,
  timezone: string,
  userAgent: string | null,
): PushRecordResult {
  const sub = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : ''
  if (!endpoint) return { ok: false, reason: 'no_endpoint' }

  const p256dh = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : ''
  const auth = typeof sub?.keys?.auth === 'string' ? sub.keys.auth : ''
  if (!p256dh || !auth) return { ok: false, reason: 'no_keys' }

  return {
    ok: true,
    record: {
      endpoint,
      subscription: { endpoint, keys: { p256dh, auth } },
      timezone,
      user_agent: userAgent,
    },
  }
}

/**
 * 기기 타임존. 해외에 나가면 바뀌므로 저장할 때마다 새로 읽는다.
 * 못 읽는 환경이면 서울로 둔다 — 안 쓰는 것보다 낫고, 다음 저장 때 고쳐진다.
 */
export function readDeviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'
  } catch {
    return 'Asia/Seoul'
  }
}

export type PushSaveResult =
  | { ok: true; endpoint: string }
  | { ok: false; reason: 'not_logged_in' | 'no_cloud' | 'bad_subscription' | 'failed'; detail?: string }

/** 저장 결과를 사람 말 한 줄로 */
export function describePushSaveResult(result: PushSaveResult): string {
  if (result.ok) return '서버에 주소를 저장했어. 이제 서버가 이 기기를 알아.'
  switch (result.reason) {
    case 'not_logged_in':
      return '로그인해야 서버에 저장할 수 있어 — 알림은 로그인이 필요한 기능이야.'
    case 'no_cloud':
      return '클라우드가 꺼져 있어서 저장을 건너뛰었어.'
    case 'bad_subscription':
      return '주소에 암호화 키가 없어. 주소를 버리고 다시 발급받아줘.'
    default:
      return `저장에 실패했어${result.detail ? ` (${result.detail})` : ''}`
  }
}

/** 발급받은 구독을 서버에 저장(있으면 갱신). endpoint가 같으면 덮어쓴다 */
export async function savePushSubscription(sub: PushSubscription): Promise<PushSaveResult> {
  if (!supabase) return { ok: false, reason: 'no_cloud' }
  const userId = getActiveSyncUser()
  if (!userId) return { ok: false, reason: 'not_logged_in' }

  const parsed = toPushRecord(
    sub.toJSON(),
    readDeviceTimezone(),
    typeof navigator !== 'undefined' ? navigator.userAgent : null,
  )
  if (!parsed.ok) return { ok: false, reason: 'bad_subscription' }

  const now = Date.now()
  const { error } = await supabase.from(TABLE).upsert(
    {
      ...parsed.record,
      user_id: userId,
      enabled: true,
      created_at: now,
      updated_at: now,
    },
    { onConflict: 'endpoint' },
  )

  if (error) return { ok: false, reason: 'failed', detail: error.message }
  return { ok: true, endpoint: parsed.record.endpoint }
}

/** 주소를 버릴 때 서버에서도 지운다 (안 지우면 서버가 죽은 주소로 계속 쏜다) */
export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  if (!supabase || !getActiveSyncUser()) return false
  const { error } = await supabase.from(TABLE).delete().eq('endpoint', endpoint)
  return !error
}

/** 이 기기의 주소가 서버에 저장돼 있나 (화면에 상태를 보여주려고) */
export async function isPushSubscriptionSaved(endpoint: string): Promise<boolean> {
  if (!supabase || !getActiveSyncUser()) return false
  const { data, error } = await supabase.from(TABLE).select('endpoint').eq('endpoint', endpoint).maybeSingle()
  return !error && data !== null
}
