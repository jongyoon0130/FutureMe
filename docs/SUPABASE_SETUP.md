# Future Me — Supabase + Google 로그인 설정

클라우드 동기화와 Google 로그인을 쓰려면 **TalkBack과 별도** Supabase 프로젝트를 만들고 아래 순서대로 설정하세요.

## 1. Supabase 프로젝트 만들기

1. [supabase.com](https://supabase.com) → **New project** (예: `futureme`)
2. **SQL Editor** → `supabase/schema.sql` 내용 붙여넣고 **Run**
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
| Site URL | `https://YOUR-VERCEL-URL.vercel.app` (배포 후 실제 URL) |
| Redirect URLs | 배포 URL, `http://localhost:5173` |

예 (Vercel 기본 도메인):
- `https://futureme-beta.vercel.app`
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
| Google 로그인 | 프로필·채팅 클라우드 동기화 |
| Gemini API 키 | **기기 localStorage만** (TalkBack과 동일) |

## 6. TalkBack과 분리

- DB 테이블: `futureme_profiles`, `futureme_chats`, `futureme_settings`
- TalkBack(`talkback_*`)과 **데이터 섞이지 않음**
