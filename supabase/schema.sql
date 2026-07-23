-- Future Me cloud sync schema (Supabase SQL Editor에서 실행)

create table if not exists public.futureme_profiles (
  id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  profile_data jsonb not null,
  preview text not null default '',
  updated_at bigint not null,
  primary key (user_id, id)
);

create table if not exists public.futureme_chats (
  profile_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb,
  updated_at bigint not null,
  primary key (user_id, profile_id)
);

create table if not exists public.futureme_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gemini_model text,
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.futureme_profiles enable row level security;
alter table public.futureme_chats enable row level security;
alter table public.futureme_settings enable row level security;

create policy "profiles own" on public.futureme_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "chats own" on public.futureme_chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "settings own" on public.futureme_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists futureme_profiles_user_updated on public.futureme_profiles (user_id, updated_at desc);

-- 홈 목표·할 일 (goal-plans, misc todos, 반복 일정)
create table if not exists public.futureme_goal_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  owner_id text not null,
  plans jsonb not null default '[]'::jsonb,
  misc_todos jsonb not null default '[]'::jsonb,
  routines jsonb not null default '[]'::jsonb,
  updated_at bigint not null
);

-- 이미 테이블을 만든 프로젝트용 (반복 일정 추가분)
alter table public.futureme_goal_data
  add column if not exists routines jsonb not null default '[]'::jsonb;

alter table public.futureme_goal_data enable row level security;

create policy "goal data own" on public.futureme_goal_data
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 알림 단계 1-b — 푸시 구독(기기별 "배송 주소")
--
-- 브라우저가 발급한 구독 하나가 기기 하나다. endpoint가 그 주소이자 고유값이라
-- 기본키로 쓴다. 같은 기기에서 다시 발급받으면 같은 endpoint로 덮어써진다.
--
-- timezone을 같이 저장하는 이유: 할 일의 `timeStart`("19:00")에는 타임존이 없다.
-- 서버는 "지금 이 사람에게 19:00인가"를 알아야 하므로 기기 타임존이 필요하다.
-- ---------------------------------------------------------------------------
create table if not exists public.futureme_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 브라우저가 준 구독 전체 (keys.p256dh / keys.auth 포함) — 발송 때 그대로 필요하다
  subscription jsonb not null,
  -- 예: 'Asia/Seoul'. 해외 나가면 바뀌므로 앱 열 때마다 갱신한다
  timezone text not null default 'Asia/Seoul',
  -- 기기별 끄기 스위치 (§5 "끄기 쉬워야 한다")
  enabled boolean not null default true,
  user_agent text,
  created_at bigint not null,
  updated_at bigint not null
);

alter table public.futureme_push_subscriptions enable row level security;

-- 재실행해도 안전하게 (create policy는 중복 실행 시 에러가 난다)
drop policy if exists "push subscriptions own" on public.futureme_push_subscriptions;
create policy "push subscriptions own" on public.futureme_push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2단계 크론이 "켜져 있는 구독"만 사용자별로 훑는다
create index if not exists futureme_push_subscriptions_user
  on public.futureme_push_subscriptions (user_id) where enabled;

-- ---------------------------------------------------------------------------
-- 알림 단계 2-b — 알림 예약표 + 보낸 기록
--
-- 왜 예약표(futureme_reminders)를 따로 두나:
--   "오늘 이 시각의 할 일"을 찾는 로직(aggregateForDate)은 복잡하다. 서버에서 다시
--   짜면 앱과 어긋난다. 그래서 앱이 검증된 로직으로 앞으로 며칠치를 **평평하게 펼쳐**
--   여기 저장하고, 크론은 "지금 시각(사용자 타임존) == fire_time?"만 단순 비교한다.
--   (앱 쪽 생성 로직: src/lib/notifyReminders.ts)
-- ---------------------------------------------------------------------------
create table if not exists public.futureme_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  fire_date date not null,          -- 사용자 로컬 날짜
  fire_time text not null,          -- 사용자 로컬 HH:mm
  kind text not null check (kind in ('start', 'end')),
  item_id text not null,
  label text not null,
  goal_title text not null default '',
  updated_at bigint not null,
  primary key (user_id, fire_date, item_id, kind)
);

alter table public.futureme_reminders enable row level security;

drop policy if exists "reminders own" on public.futureme_reminders;
create policy "reminders own" on public.futureme_reminders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 크론이 "이 시각에 울릴 예약"을 빠르게 찾도록
create index if not exists futureme_reminders_fire
  on public.futureme_reminders (fire_date, fire_time);

-- 보낸 기록 — 크론이 매분 돌기 때문에 같은 알림을 두 번 쏘지 않게 한다.
-- insert가 성공할 때만 발송하면, 크론이 겹쳐 돌거나 재시도해도 한 번만 간다 (§4-5).
create table if not exists public.futureme_push_sent (
  user_id uuid not null references auth.users (id) on delete cascade,
  fire_date date not null,
  item_id text not null,
  kind text not null,
  sent_at bigint not null,
  primary key (user_id, fire_date, item_id, kind)
);

alter table public.futureme_push_sent enable row level security;

-- 사용자는 자기 기록만 본다. 실제 쓰기는 크론(서버 권한)이 한다
drop policy if exists "push sent own" on public.futureme_push_sent;
create policy "push sent own" on public.futureme_push_sent
  for select using (auth.uid() = user_id);
