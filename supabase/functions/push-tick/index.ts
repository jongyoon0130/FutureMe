// ---------------------------------------------------------------------------
// 알림 2-b — 시계. pg_cron이 매분 이 함수를 부른다.
//
// 하는 일:
//   1. 켜져 있는 구독마다 그 기기 타임존으로 "지금 몇 시(HH:mm), 며칠(YYYY-MM-DD)"인지 구한다
//   2. 그 사용자의 예약표(futureme_reminders)에서 지금 시각과 일치하는 걸 찾는다
//   3. 아직 안 보낸 것만(futureme_push_sent insert 성공) 발송한다 → 중복 방지(§4-5)
//
// **이 함수는 크론(서버)만 불러야 한다.** 사용자 JWT가 없으므로 service_role로 전체를
// 훑는다. 아무나 못 부르게 CRON_SECRET 헤더를 확인한다 (verify_jwt는 꺼서 배포).
//
// ⚠️ 미검증: 로컬에 deno가 없어 실행 확인을 못 했다. 처음 켤 때 함수 Logs를 볼 것.
// ---------------------------------------------------------------------------

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

/** 어떤 타임존에서 지금의 로컬 날짜/시각을 HH:mm, YYYY-MM-DD로 */
function localNow(tz: string): { date: string; time: string } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
    let hour = get('hour')
    if (hour === '24') hour = '00' // 일부 런타임이 자정을 24로 준다
    const date = `${get('year')}-${get('month')}-${get('day')}`
    const time = `${hour}:${get('minute')}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
    return { date, time }
  } catch {
    return null // 타임존 문자열이 이상하면 이 기기는 건너뛴다
  }
}

Deno.serve(async (req) => {
  // --- 크론만 부를 수 있게 ---
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })
  }

  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:jiwoongjang83@gmail.com'
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!publicKey || !privateKey || !url || !serviceKey) {
    console.error('[push-tick] 환경변수 부족 (VAPID_* / SUPABASE_URL / SERVICE_ROLE_KEY)')
    return new Response(JSON.stringify({ error: 'env_missing' }), { status: 500 })
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  // service_role — 전체 사용자를 훑어야 하므로 RLS를 넘는다
  const db = createClient(url, serviceKey)

  const { data: subs, error: subsErr } = await db
    .from('futureme_push_subscriptions')
    .select('endpoint, user_id, subscription, timezone')
    .eq('enabled', true)

  if (subsErr) {
    console.error('[push-tick] 구독 조회 실패', subsErr.message)
    return new Response(JSON.stringify({ error: 'query_failed' }), { status: 500 })
  }
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ ok: true, sent: 0 }))

  let sent = 0

  for (const sub of subs) {
    const now = localNow(sub.timezone as string)
    if (!now) continue

    // 이 사용자의 "지금 이 분"에 울릴 예약
    const { data: due, error: dueErr } = await db
      .from('futureme_reminders')
      .select('item_id, kind, label, goal_title')
      .eq('user_id', sub.user_id)
      .eq('fire_date', now.date)
      .eq('fire_time', now.time)

    if (dueErr) {
      console.error(`[push-tick] 예약 조회 실패 user=${sub.user_id}`, dueErr.message)
      continue
    }
    if (!due || due.length === 0) continue

    for (const r of due) {
      // 중복 방지: 보낸 기록을 먼저 넣어보고, 성공(=처음)일 때만 발송한다.
      // 크론이 겹쳐 돌거나 재시도해도 유니크 키 충돌로 한 번만 통과한다.
      //
      // **키에 endpoint(기기)가 들어가야 한다.** 이게 빠지면 이 루프가 기기별로 도는데
      // 첫 기기가 (사용자,날짜,할일,종류)로 기록을 남기는 순간, 같은 사용자의 다른 기기가
      // 같은 키로 충돌해 건너뛰어진다 → 다기기 사용자에게 한 대만 알림이 간다.
      const { error: sentErr } = await db.from('futureme_push_sent').insert({
        user_id: sub.user_id,
        endpoint: sub.endpoint,
        fire_date: now.date,
        item_id: r.item_id,
        kind: r.kind,
        sent_at: Date.now(),
      })
      if (sentErr) continue // 이 기기엔 이미 보냈음(중복) 또는 오류 → 건너뜀

      // **메시지는 title에 넣는다.** 아이폰은 title은 확실히 띄우지만 body는 payload가
      // event.data로 안 오면 통째로 사라진다(제목만, 본문 빈칸). 실제 문구를 title에 두면
      // 그 경우에도 내용이 보이고, title이 'Future Me'로 안 떨어지니 도달 여부 진단도 된다.
      const goal = (r.goal_title ?? '').trim()
      const payload = JSON.stringify({
        title:
          r.kind === 'start'
            ? `이제 시작할 시간이야 — ${r.label}`
            : `${r.label}, 잘 끝났어? 기록해두자`,
        body: goal, // 어느 목표의 할 일인지 (렌더되면 둘째 줄로, 안 되면 생략)
        url: '/',
        tag: `futureme-${r.item_id}-${r.kind}`,
      })

      try {
        await webpush.sendNotification(sub.subscription as webpush.PushSubscription, payload, {
          TTL: 300,
        })
        sent += 1
        console.log(`[push-tick] 보냄 ${r.kind} "${r.label}" → ${sub.user_id}`)
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        console.error(`[push-tick] 발송 실패(${status ?? '?'}) ${r.item_id}/${r.kind}`, String(e))
        // 죽은 주소면 그 기기 구독만 삭제. 보낸 기록도 그 기기 것만 지워서, 주소를
        // 다시 받으면 재발송되게 (다른 기기 기록은 건드리지 않는다 — endpoint로 특정)
        if (status === 404 || status === 410) {
          await db.from('futureme_push_subscriptions').delete().eq('endpoint', sub.endpoint)
          await db
            .from('futureme_push_sent')
            .delete()
            .eq('endpoint', sub.endpoint)
            .eq('fire_date', now.date)
            .eq('item_id', r.item_id)
            .eq('kind', r.kind)
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
