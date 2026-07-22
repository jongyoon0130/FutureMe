# Future Me — Supabase + Google 로그인 설정

클라우드 동기화와 Google 로그인을 쓰려면 **TalkBack과 별도** Supabase 프로젝트를 만들고 아래 순서대로 설정하세요.

## 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **New project** (예: `futureme`)
2. **SQL Editor** → `supabase/schema.sql` 내용 붙여넣고 **Run**
   - 이미 프로젝트가 있으면, 파일 맨 아래 `futureme_goal_data` 블록만 추가 실행해도 됩니다.
   - **2026-07-22 추가:** 반복 일정용 `routines` 컬럼. 이미 테이블을 만들었다면 아래 한 줄만 더 실행하세요.
     안 해도 앱은 돌아갑니다 — 반복 일정만 이 기기에 남고 클라우드로 안 넘어갑니다.

     ```sql
     alter table public.futureme_goal_data
       add column if not exists routines jsonb not null default '[]'::jsonb;
     ```
3. **Project Settings → API** 에서 복사:
   - Project URL → `VITE_SUPABASE_URL`
   - anon public key → `VITE_SUPABASE_ANON_KEY`

## 2. Google OAuth (Supabase)

1. Supabase **Authentication → Providers → Google** 활성화
2. [Google Cloud Console](https://console.cloud.google.com/) → OAuth 클라이언트 ID (웹) 생성
3. **Authorized redirect URIs**:
   ```
   https://YOUR_PROJECT.supabase.co/auth/v1/callback
   ```
4. Client ID / Secret → Supabase Google provider 입력

## 3. Redirect URL (Supabase Auth)

**Authentication → URL Configuration**

| 항목 | 값 |
|------|-----|
| Site URL | `https://futureme-beta.vercel.app` |
| Redirect URLs | 아래 3개 모두 추가 |

예 (현재 Future Me 프로덕션):
- `https://futureme-beta.vercel.app`
- `https://futureme-beta-jongyoon2580-9297s-projects.vercel.app`
- `http://localhost:5173`

## 4. 환경 변수

### 로컬

```bash
cp .env.example .env
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 입력
bun install
bun run dev
```

### Vercel

Project → **Settings → Environment Variables**

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

저장 후 **Redeploy**.

## 5. 동작

| 상황 | 동작 |
|------|------|
| env 없음 | 로그인 없이 로컬 전용 |
| Google 로그인 | 프로필·채팅·홈 목표·할 일 클라우드 동기화 |
| Gemini API 키 | **기기 localStorage만** (TalkBack과 동일) |

## 6. TalkBack과 분리

- DB 테이블: `futureme_profiles`, `futureme_chats`, `futureme_settings`, `futureme_goal_data`
- TalkBack(`talkback_*`)과 **데이터 섞이지 않음**
