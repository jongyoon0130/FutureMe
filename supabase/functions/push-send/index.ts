// ---------------------------------------------------------------------------
// 알림 2-a — 서버가 실제로 웹 푸시를 한 발 쏜다.
//
// 여기서 확인하려는 것은 딱 하나다: **앱이 꺼져 있어도 알림이 오는가.**
// 단계 0에서 "앱을 열어둔 동안에만 뜬다"를 확인했으니, 그 벽을 넘는지를 본다.
// 시계(크론)·중복 방지·할 일 연동은 없다 — 그건 2-b다.
//
// 왜 응답을 먼저 주고 나중에 보내나:
//   버튼을 누른 뒤 **앱을 꺼야** 제대로 된 시험이 된다. 그런데 앱을 끄면 fetch가
//   끊기고, 그때 요청 처리도 같이 죽으면 알림이 안 간다. 그래서 즉시 202를 돌려주고
//   `EdgeRuntime.waitUntil()` 안에서 기다렸다 보낸다. 클라이언트가 끊겨도 살아남는다.
//
// 권한: Edge Function 기본값(verify_jwt)으로 로그인한 사용자만 부를 수 있고,
// 구독은 **그 사용자의 JWT로** 읽는다. RLS가 남의 기기로는 못 보내게 막아준다.
// (service_role을 안 쓰는 이유 — 안 써도 되면 안 쓰는 게 낫다)
// ---------------------------------------------------------------------------

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_DELAY_SECONDS = 120
const DEFAULT_DELAY_SECONDS = 20

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 브라우저에 노출돼도 되는 공개 키를 찾는다.
 *
 * `SUPABASE_ANON_KEY`는 대시보드에서 **DEPRECATED**로 표시된다. 아직은 주입되지만
 * 언젠가 사라지면 함수가 통째로 죽는다. 그래서 새 이름(`SUPABASE_PUBLISHABLE_KEYS`)도
 * 함께 본다. 이쪽은 JSON인데 모양이 확정적이지 않아서 몇 가지 형태를 다 받아준다.
 */
function readPublicKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY')?.trim()
  if (legacy) return legacy

  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')?.trim()
  if (!raw) return null

  // 그냥 키 문자열로 들어오는 경우
  if (raw.startsWith('sb_publishable_')) return raw

  try {
    const parsed = JSON.parse(raw)
    const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed, ...Object.values(parsed)]
    for (const item of candidates) {
      if (typeof item === 'string' && item.startsWith('sb_publishable_')) return item
      if (item && typeof item === 'object') {
        for (const v of Object.values(item as Record<string, unknown>)) {
          if (typeof v === 'string' && v.startsWith('sb_publishable_')) return v
        }
      }
    }
    console.error('[push-send] PUBLISHABLE_KEYS 모양을 못 알아봄:', raw.slice(0, 80))
  } catch {
    console.error('[push-send] PUBLISHABLE_KEYS가 JSON이 아님:', raw.slice(0, 80))
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  // --- VAPID 설정 (Supabase 비밀값) ---
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:jiwoongjang83@gmail.com'
  if (!publicKey || !privateKey) {
    console.error('[push-send] VAPID 비밀값이 없다 — VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY')
    return json({ error: 'vapid_not_configured' }, 500)
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  // --- 부른 사람이 누구인지 (JWT 그대로 써서 RLS가 걸리게 한다) ---
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'not_authenticated' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const publicKey_ = readPublicKey()
  if (!supabaseUrl || !publicKey_) {
    console.error('[push-send] SUPABASE_URL 또는 공개 키를 못 찾음')
    return json({ error: 'supabase_env_missing' }, 500)
  }

  const supabase = createClient(supabaseUrl, publicKey_, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userError } = await supabase.auth.getUser()
  const user = userData?.user
  if (userError || !user) return json({ error: 'not_authenticated' }, 401)

  // --- 얼마나 기다렸다 보낼까 ---
  let delaySeconds = DEFAULT_DELAY_SECONDS
  try {
    const body = await req.json()
    if (typeof body?.delaySeconds === 'number') {
      delaySeconds = Math.min(Math.max(Math.floor(body.delaySeconds), 0), MAX_DELAY_SECONDS)
    }
  } catch {
    /* 본문이 없으면 기본값 */
  }

  // --- 이 사용자의 켜져 있는 기기들 (RLS로 자기 것만 보인다) ---
  const { data: subs, error: subsError } = await supabase
    .from('futureme_push_subscriptions')
    .select('endpoint, subscription')
    .eq('enabled', true)

  if (subsError) {
    console.error('[push-send] 구독 조회 실패', subsError.message)
    return json({ error: 'query_failed', detail: subsError.message }, 500)
  }
  if (!subs || subs.length === 0) return json({ error: 'no_subscriptions' }, 404)

  // title에 메시지를 실어 아이폰 body-빈칸 문제를 피한다(§push-tick과 동일 이유).
  const payload = JSON.stringify({
    title: '서버 알림 테스트 — 앱이 꺼져 있어도 도착했어',
    body: '이 둘째 줄이 보이면 본문 전달까지 정상이야.',
    url: '/',
    tag: 'futureme-server-test',
  })

  // --- 응답은 지금 주고, 발송은 뒤에서 (앱을 꺼야 시험이 되니까) ---
  const send = async () => {
    if (delaySeconds > 0) await sleep(delaySeconds * 1000)

    for (const row of subs) {
      const endpoint = row.endpoint as string
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload, {
          TTL: 60,
        })
        console.log(`[push-send] 보냄 ${new URL(endpoint).host} …${endpoint.slice(-12)}`)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        console.error(`[push-send] 실패(${status ?? '?'}) …${endpoint.slice(-12)}`, String(e))

        // 404/410 = 이 주소는 죽었다. 남겨두면 계속 실패하므로 지운다
        if (status === 404 || status === 410) {
          await supabase.from('futureme_push_subscriptions').delete().eq('endpoint', endpoint)
          console.log(`[push-send] 죽은 주소 삭제 …${endpoint.slice(-12)}`)
        }
      }
    }
  }

  // @ts-expect-error EdgeRuntime은 Supabase 런타임 전역이라 타입 정의가 없다
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(send())
  else void send()

  return json({ ok: true, devices: subs.length, delaySeconds }, 202)
})
