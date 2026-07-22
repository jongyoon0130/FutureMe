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
