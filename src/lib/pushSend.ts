// ---------------------------------------------------------------------------
// 알림 2-a — "서버에서 보내줘"를 요청하는 쪽 (앱).
//
// 실제 발송은 Supabase Edge Function(`push-send`)이 한다. 앱은 부탁만 하고 끝이다.
// 그래서 **부탁한 직후 앱을 꺼도 알림이 온다** — 그게 이 단계에서 확인하려는 것이다.
// ---------------------------------------------------------------------------

import { supabase } from './supabase'
import { getActiveSyncUser } from './cloudSync'

/** 앱을 끄고 기다릴 시간. 너무 짧으면 끄기 전에 와버려서 시험이 안 된다 */
export const SERVER_TEST_DELAY_SECONDS = 20

export type PushSendResult =
  | { ok: true; devices: number; delaySeconds: number }
  | {
      ok: false
      reason: 'no_cloud' | 'not_logged_in' | 'no_subscriptions' | 'vapid_not_configured' | 'failed'
      detail?: string
    }

/** Edge Function이 돌려준 오류 문자열을 우리 쪽 이유로 옮긴다 */
export function toSendFailure(raw: string | undefined): PushSendResult {
  const text = raw ?? ''
  if (text.includes('no_subscriptions')) return { ok: false, reason: 'no_subscriptions' }
  if (text.includes('vapid_not_configured')) return { ok: false, reason: 'vapid_not_configured' }
  if (text.includes('not_authenticated')) return { ok: false, reason: 'not_logged_in' }
  return { ok: false, reason: 'failed', detail: text || undefined }
}

/** 결과를 사람 말 한 줄로 */
export function describePushSendResult(result: PushSendResult): string {
  if (result.ok) {
    const 기기 = result.devices > 1 ? `기기 ${result.devices}대에` : ''
    return `서버가 ${result.delaySeconds}초 뒤에 ${기기} 보낼 거야.\n지금 앱을 완전히 꺼줘 — 꺼진 채로 오는지가 이번 시험이야.`
  }
  switch (result.reason) {
    case 'no_cloud':
      return '클라우드가 꺼져 있어서 서버에 부탁할 수 없어.'
    case 'not_logged_in':
      return '로그인해야 서버가 보내줄 수 있어.'
    case 'no_subscriptions':
      return '서버에 저장된 주소가 없어 — 먼저 "푸시 주소 발급"을 눌러줘.'
    case 'vapid_not_configured':
      return '서버에 VAPID 비밀키가 아직 설정 안 됐어 (Supabase 비밀값).'
    default:
      return `서버에 부탁하지 못했어${result.detail ? ` (${result.detail})` : ''}`
  }
}

/** 서버에게 "이 사용자의 기기들로 알림 한 발 보내줘"라고 부탁한다 */
export async function requestServerPush(
  delaySeconds = SERVER_TEST_DELAY_SECONDS,
): Promise<PushSendResult> {
  if (!supabase) return { ok: false, reason: 'no_cloud' }
  if (!getActiveSyncUser()) return { ok: false, reason: 'not_logged_in' }

  const { data, error } = await supabase.functions.invoke('push-send', {
    body: { delaySeconds },
  })

  if (error) {
    // invoke는 본문을 함께 주기도 한다 — 이유를 최대한 살려서 옮긴다
    const detail =
      (data as { error?: string } | null)?.error ??
      (await readErrorBody(error)) ??
      error.message
    return toSendFailure(detail)
  }

  const body = data as { ok?: boolean; devices?: number; delaySeconds?: number; error?: string }
  if (!body?.ok) return toSendFailure(body?.error)
  return { ok: true, devices: body.devices ?? 0, delaySeconds: body.delaySeconds ?? delaySeconds }
}

/** FunctionsHttpError는 본문에 진짜 이유가 들어 있다 */
async function readErrorBody(error: unknown): Promise<string | undefined> {
  const res = (error as { context?: Response })?.context
  if (!res || typeof res.text !== 'function') return undefined
  try {
    return await res.text()
  } catch {
    return undefined
  }
}
