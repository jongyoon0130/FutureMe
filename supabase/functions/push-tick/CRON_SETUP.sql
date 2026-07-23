-- ===========================================================================
-- 알림 2-b 켜기 — pg_cron이 매분 push-tick 함수를 부르게 한다.
--
-- ⚠️ 이걸 실행하면 그 순간부터 **실제로 알림이 자동 발송된다.**
--    시간 적힌 할 일이 있으면 그 시각에 폰이 울린다. 확인할 준비가 됐을 때만 켤 것.
--
-- 실행 전 준비:
--   1. push-tick 함수 배포됨 (Supabase → Edge Functions, verify_jwt는 OFF)
--   2. Edge Function Secrets에 CRON_SECRET 추가 (아무 긴 무작위 문자열)
--   3. VAPID_* 3개, SUPABASE_SERVICE_ROLE_KEY는 함수 런타임에 이미 주입됨
--   4. 예약표(futureme_reminders)에 행이 있어야 뭔가 발송된다
--      → 앱이 아직 예약을 안 채우면(동기화 배선 전) 수동 insert로 시험할 수 있다:
--
--        insert into futureme_reminders
--          (user_id, fire_date, fire_time, kind, item_id, label, updated_at)
--        values
--          ('<지웅 user_id>', current_date, '<5분 뒤 HH:mm>', 'start',
--           'manual-test', '테스트 알림', extract(epoch from now())*1000);
--
--      user_id는: select user_id from futureme_push_subscriptions limit 1;
-- ===========================================================================

-- 확장 켜기 (한 번만)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- <PROJECT_REF>와 <CRON_SECRET>을 실제 값으로 바꿀 것.
-- PROJECT_REF = dwawzmxungglfsluurjv (프로젝트 URL의 그 부분)
select cron.schedule(
  'futureme-push-tick',
  '* * * * *',  -- 매분
  $$
  select net.http_post(
    url     := 'https://dwawzmxungglfsluurjv.supabase.co/functions/v1/push-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- 끄기:   select cron.unschedule('futureme-push-tick');
-- 확인:   select * from cron.job;
-- 실행이력: select * from cron.job_run_details order by start_time desc limit 20;
