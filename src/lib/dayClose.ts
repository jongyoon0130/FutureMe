// ---------------------------------------------------------------------------
// 하루 마감 — 오늘의 실행(배터리)과 기분을 한 번에 닫는 의식.
//
// "계획을 다 지키는 날보다 다시 돌아오는 날이 더 중요하다"를 기능으로 만든 것.
// 저녁에 오늘의 완료/미완료를 보고, 감정 한 칩 + 한 줄을 남기면 미래의 나가
// 마감 인사를 건넨다. 못 한 날에는 사용자가 온보딩·목표 생성 때 직접 쓴
// 문장(편지·미달 패턴)을 근거로 다그치지 않고 다시 일으킨다.
//
// 기록은 목표 앱 소유자(goal-app-owner-id) 기준 localStorage에 쌓이고,
// goalPlanBridge를 통해 미래의 나 대화 프롬프트에도 공급된다.
// ---------------------------------------------------------------------------

export interface DayCloseRecord {
  /** YYYY-MM-DD */
  date: string
  mood: string
  note?: string
  done: number
  total: number
  /** 저장 시점에 생성된 미래의 나 마감 메시지 (다시 열어도 같은 문장) */
  message: string
  closedAt: number
}

export const DAY_CLOSE_MOODS = ['뿌듯해', '안도돼', '아쉬워', '지쳤어'] as const

const KEY_PREFIX = 'goal-day-close-'
/** 오래된 기록 보관 상한 — 최근 1년 치면 충분 */
const MAX_RECORDS = 366

function storageKey(ownerId: string): string {
  return `${KEY_PREFIX}${ownerId}`
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function loadDayCloses(ownerId: string): DayCloseRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(ownerId))
    if (!raw) return []
    const list = JSON.parse(raw) as DayCloseRecord[]
    if (!Array.isArray(list)) return []
    return [...list].sort((a, b) => b.date.localeCompare(a.date))
  } catch {
    return []
  }
}

export function getDayClose(ownerId: string, date: string): DayCloseRecord | null {
  return loadDayCloses(ownerId).find((r) => r.date === date) ?? null
}

export function saveDayClose(ownerId: string, record: DayCloseRecord): DayCloseRecord[] {
  const next = [record, ...loadDayCloses(ownerId).filter((r) => r.date !== record.date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_RECORDS)
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(next))
  } catch {
    /* ignore quota */
  }
  return next
}

/** 마감 기록 삭제 — 내 기록은 내 마음대로 고치고 지울 수 있어야 한다 */
export function removeDayClose(ownerId: string, date: string): DayCloseRecord[] {
  const next = loadDayCloses(ownerId).filter((r) => r.date !== date)
  try {
    localStorage.setItem(storageKey(ownerId), JSON.stringify(next))
  } catch {
    /* ignore */
  }
  return next
}

/** 오늘(또는 어제)까지 며칠 연속으로 마감했는지 — "돌아온 날"의 증거 */
export function dayCloseStreak(records: DayCloseRecord[], today = new Date()): number {
  const dates = new Set(records.map((r) => r.date))
  let streak = 0
  const cursor = new Date(today)
  // 오늘 아직 안 닫았으면 어제부터 센다
  if (!dates.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (dates.has(dayKey(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// ---------------------------------------------------------------------------
// 채팅 페르소나 살짝 읽기 (읽기 전용 — storage.ts를 통째로 끌지 않는다)
// ---------------------------------------------------------------------------

export function readChatPersonaLite(): { name?: string; adviceLine?: string } {
  try {
    const raw = localStorage.getItem('futureme-profiles-index')
    if (!raw) return {}
    const index = JSON.parse(raw) as { id: string }[]
    if (!Array.isArray(index) || !index.length) return {}
    const profileRaw = localStorage.getItem(`futureme-profile-${index[0].id}`)
    if (!profileRaw) return {}
    const profile = JSON.parse(profileRaw) as {
      name?: string
      future?: { adviceLine?: string }
    }
    return { name: profile.name, adviceLine: profile.future?.adviceLine?.trim() || undefined }
  } catch {
    return {}
  }
}

// ---------------------------------------------------------------------------
// 마감 메시지 — 미래의 나 톤 (API 키 없이도 동작하는 결정적 템플릿)
// 같은 날엔 같은 문장, 날마다 다른 변주 — 반복돼도 물리지 않게.
// ---------------------------------------------------------------------------

/** 목표별 오늘 진행 — 일상과 구분해서 언급하기 위한 재료 */
export interface GoalHighlight {
  title: string
  done: number
  total: number
}

export function groupGoalHighlights(
  items: { title: string; done: boolean }[],
): GoalHighlight[] {
  const map = new Map<string, GoalHighlight>()
  for (const it of items) {
    const g = map.get(it.title) ?? { title: it.title, done: 0, total: 0 }
    g.total += 1
    if (it.done) g.done += 1
    map.set(it.title, g)
  }
  return [...map.values()].sort((a, b) => b.done - a.done)
}

export interface ClosingContext {
  done: number
  total: number
  mood: string
  /** 사용자가 온보딩에서 쓴 "미래의 나 → 지금의 나" 편지 */
  adviceLine?: string
  /** 목표 생성 때 쓴 "흐지부지되면 반복될 모습" (본인 표현) */
  fearedPattern?: string
  streak?: number
  /** 목표에 연결된 오늘 항목 진행 — "일상"과 구분해 콕 집어 언급 */
  goalHighlights?: GoalHighlight[]
  /** 변주 시드 (YYYY-MM-DD) — 같은 날은 같은 문장, 날이 바뀌면 다른 문장 */
  date?: string
}

/** 날짜 문자열로 변주를 고른다 — 랜덤이 아니라서 다시 열어도 같은 문장 */
function pickVariant<T>(variants: T[], seed: string): T {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 100003
  return variants[h % variants.length]
}

export function buildClosingMessage(ctx: ClosingContext): string {
  const { done, total, mood, adviceLine, fearedPattern, streak = 0, goalHighlights = [] } = ctx
  const seed = ctx.date ?? dayKey()
  const lines: string[] = []

  if (total === 0) {
    lines.push(
      pickVariant(
        [
          '오늘은 계획이 없던 날이네. 그런 날도 있어야 오래 가.',
          '계획 없이 흘러간 날도 하루는 하루야. 억지로 채우지 않은 것도 선택이고.',
        ],
        seed,
      ),
    )
    lines.push('내일 아침의 나를 위해, 작은 거 하나만 미리 적어두는 건 어때.')
  } else if (done >= total) {
    lines.push(
      pickVariant(
        [
          `오늘 ${total}개 전부 해냈네. 이런 날들이 쌓여서 지금의 내가 됐어.`,
          `오늘 ${total}개, 전부 끝. 이런 날의 나를 나는 제일 좋아했어.`,
          `${total}개 전부 체크된 날. 별거 아닌 것 같지? 나는 이런 날들 덕에 여기 있어.`,
        ],
        seed,
      ),
    )
    if (mood === '지쳤어') lines.push('지친 채로도 다 해낸 날은 오래 기억에 남아. 오늘은 일찍 쉬자.')
    else lines.push(pickVariant(['이 기분, 잊지 말라고 기록해두는 거야.', '이 기분이 내일 아침의 연료가 돼.'], seed))
  } else if (done === 0) {
    if (mood === '지쳤어') lines.push('하나도 못 한 날. 근데 지금 지쳤다고 말할 수 있는 것도 힘이야.')
    else {
      lines.push(
        pickVariant(
          [
            '오늘은 하나도 못 했네. 나도 그런 날 많았어 — 진짜야.',
            '멈춘 날이 아니라 쉬어간 날로 치자. 나도 그런 날 지나서 여기 있어.',
          ],
          seed,
        ),
      )
    }
    lines.push('기록하러 돌아온 것부터가, 끊긴 게 아니라는 증거고.')
    if (fearedPattern) {
      lines.push(`네가 무서워했던 건 "${clip(fearedPattern, 40)}"였잖아. 하루 쉰 거랑 그건 달라.`)
    }
    if (adviceLine) lines.push(`네가 나한테 남겨둔 말, 오늘 돌려줄게 — "${clip(adviceLine, 60)}"`)
  } else {
    lines.push(
      pickVariant(
        [
          `${total}개 중 ${done}개. 오늘 몫은 한 거야. 남은 건 지우지 말고, 내일의 나랑 나눠 들자.`,
          `오늘 ${done}개면 됐어. 남은 ${total - done}개는 내일의 나한테 미리 말해둘게.`,
        ],
        seed,
      ),
    )
    if (mood === '아쉬워') lines.push('아쉬움이 남는 건 그만큼 진심이라는 뜻이라, 나는 좋게 봐.')
  }

  // 목표와 일상을 구분해서, 목표로 간 걸음은 따로 알아봐준다
  const advanced = goalHighlights.find((g) => g.done > 0)
  const stalledGoal = goalHighlights.find((g) => g.total > 0 && g.done === 0)
  if (advanced) {
    lines.push(`특히 "${clip(advanced.title, 24)}" 쪽으로 오늘 ${advanced.done}걸음 갔어. 그게 우리 방향이야.`)
  } else if (stalledGoal && done > 0) {
    lines.push(`"${clip(stalledGoal.title, 24)}"은 오늘 쉬었네. 일상을 챙긴 것도 진짜 일이야 — 내일 한 걸음이면 돼.`)
  }

  if (streak >= 3) lines.push(`벌써 ${streak}일째 하루를 닫고 있어. 이 리듬이 진짜 재산이야.`)

  return lines.join(' ')
}

function clip(v: string, max: number): string {
  const t = v.trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}
