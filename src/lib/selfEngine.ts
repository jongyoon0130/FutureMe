import type {
  SelfProfile,
  StyleSample,
  StyleRules,
  Register,
  BigFive,
  Insight,
  InsightKind,
} from '../types/self'
import { BIG_FIVE_ITEMS, INSIGHT_LABELS, LIFE_DOMAIN_LABELS } from '../types/self'
import { formatApiTurnTimestamp, nowContextKo } from './chatDisplay'
import { FUTURE_YEARS_AHEAD } from './brand'
import { renderFutureSelfBlock, personaGaps } from './personaModel'
import { dateKey, overdueTasks, recentReflectionsWithTask, stalledGoals } from './plannerStore'
import { auditReplyAgainstKnownFacts, collectKnownFactCorpus, describeKnownFactsBlock } from './goalPlanBridge'

// ---------------------------------------------------------------------------
// L1: Big Five 점수 계산
// ---------------------------------------------------------------------------
export function scoreBigFive(answers: Record<string, number>): BigFive {
  const acc: Record<keyof BigFive, number[]> = {
    openness: [],
    conscientiousness: [],
    extraversion: [],
    agreeableness: [],
    neuroticism: [],
  }
  for (const item of BIG_FIVE_ITEMS) {
    const raw = answers[item.id] ?? 4
    const val = item.reverse ? 8 - raw : raw
    acc[item.dim].push(val)
  }
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 4)
  return {
    openness: avg(acc.openness),
    conscientiousness: avg(acc.conscientiousness),
    extraversion: avg(acc.extraversion),
    agreeableness: avg(acc.agreeableness),
    neuroticism: avg(acc.neuroticism),
  }
}

function level(score: number): '높음' | '중간' | '낮음' {
  if (score >= 5) return '높음'
  if (score <= 3) return '낮음'
  return '중간'
}

// 온보딩 정보 → AI가 더 잘 이해하는 서술 (강제 규칙·트리거 없음, 맥락 판단은 AI에게)
function describePersonUnderstanding(p: SelfProfile): string {
  const b = p.bigFive
  const lines: string[] = []

  const trait = (score: number, high: string, low: string) => {
    const lv = level(score)
    if (lv === '높음') lines.push(high)
    else if (lv === '낮음') lines.push(low)
  }

  trait(
    b.openness,
    '새로운 시도나 낯선 아이디어에 열려 있는 편. 익숙한 답만 반복하기보다 다른 가능성도 자연스럽게 열어둘 수 있음.',
    '검증된 방식이 더 편한 편. 현실적·구체적인 얘기가 잘 맞을 수 있음.',
  )
  trait(
    b.conscientiousness,
    '계획하고 끝까지 밀어붙이는 편. "일단 정리부터" 같은 접근이 어울릴 수 있음.',
    '즉흥적·유연한 편. 너무 빡빡한 계획보다 가벼운 대화가 편할 수 있음.',
  )
  trait(
    b.extraversion,
    '사람과 어울릴 때 에너지가 나는 편. 대화가 비교적 적극적으로 이어질 수 있음.',
    '혼자 있을 때 충전되는 편. 긴 설교보다 짧고 여운 있는 대화가 더 어울릴 수 있음.',
  )
  trait(
    b.agreeableness,
    '상대 입장을 잘 헤아리는 편. 갈등 얘기할 때 공감부터가 자연스러울 수 있음.',
    '내 의견을 분명히 하는 편. 맞장구만 치기보다 솔직한 시각을 섞어도 어울릴 수 있음.',
  )
  trait(
    8 - b.neuroticism,
    '감정이 비교적 안정적인 편. 크게 흔들리지 않고 담담하게 받아줄 수 있음.',
    '걱정·불안을 비교적 자주 느끼는 편. 해결책부터 들이대기보다 먼저 편들어주는 게 와닿을 수 있음.',
  )

  if (p.mbti) lines.push(`MBTI ${p.mbti} — 성향 참고용. 이 유형의 클리셰를 그대로 연기하지 말 것.`)

  if (p.corePriority.trim()) {
    lines.push(
      `스스로 말한 인생 1순위: "${p.corePriority.trim()}". 선택·고민이 나올 때 이 기준과 맞는지 자연스럽게 짚어줄 수 있음. 매번 언급하거나 강요하지 말 것.`,
    )
  }
  if (p.successDef.trim()) {
    lines.push(`'잘 산다'는 것에 대한 기준: "${p.successDef.trim()}".`)
  }
  if (p.admire.trim() && !/^(없|없어)/.test(p.admire.trim())) {
    lines.push(`존경·닮고 싶은 대상: "${p.admire.trim()}". 가치관을 이해하는 참고용.`)
  }

  if (p.dilemmas.length >= 2) {
    lines.push(
      `딜레마에서 드러난 경향: ${p.dilemmas.map((d) => `"${d.prompt.slice(0, 20)}…" → ${d.choice}`).join(' / ')}. 절대 규칙이 아니라 참고.`,
    )
  }

  if (p.comfortTarget.trim()) {
    lines.push(
      `위로받을 때 편한 말의 방향: "${p.comfortTarget.trim()}". 위로가 필요해 보일 때 이 톤을 참고. "힘내" 같은 뻔한 응원은 피할 것.`,
    )
  }

  return lines.map((l) => `- ${l}`).join('\n')
}

// 온보딩 정보 — 채팅용 압축 서술 (말투·기질만; 1순위·성공정의는 deep 턴에만)
function describePersonUnderstandingCompact(p: SelfProfile): string {
  const parts: string[] = []
  if (p.lifeContext?.trim()) parts.push(`요즘: ${p.lifeContext.trim().slice(0, 60)}`)
  if (p.speechTone?.trim()) parts.push(`톤: ${p.speechTone.trim()}`)
  if (p.concernDomains?.length) {
    parts.push(`관심: ${p.concernDomains.map((d) => LIFE_DOMAIN_LABELS[d] ?? d).join(', ')}`)
  }
  if (p.currentRole?.trim()) parts.push(`역할: ${p.currentRole.trim().slice(0, 40)}`)
  parts.push('성격 분석보다 이번 말의 상황·감정·선택을 우선')
  return parts.join(' · ')
}

function describeMemoriesCompact(p: SelfProfile): string {
  const items: string[] = []
  if (p.turningPoint.trim()) items.push(`전환: ${p.turningPoint.trim().slice(0, 50)}`)
  if (p.proudMoment.trim()) items.push(`자부: ${p.proudMoment.trim().slice(0, 50)}`)
  if (p.stressMoment.trim()) items.push(`힘듦: ${p.stressMoment.trim().slice(0, 50)}`)
  if (p.comfortMemory.trim() && !/^(없|없어)/.test(p.comfortMemory.trim())) {
    items.push(`위로방식: ${p.comfortMemory.trim().slice(0, 50)}`)
  }
  return items.length ? items.join(' · ') : ''
}

/** 온보딩 성향 카드(1순위·딜레마 등)를 프롬프트에 넣을지 — user가 가치·정체성을 직접 꺼낼 때만 */
function needsOnboardingDeepProfile(userMessage: string): boolean {
  return /인생|가치|원칙|성향|뭐가\s?중요|1순위|우선순위|딜레마|내가\s?어떤|잘\s?산다|성공.*의미|존경|닮고|포기\s?못|양보\s?못/.test(
    userMessage,
  )
}

function needsDeepContext(userMessage: string, _register: Register): boolean {
  return needsOnboardingDeepProfile(userMessage)
}

// ---------------------------------------------------------------------------
// L4: 말투 규칙서 추출 (stylometry)
// ---------------------------------------------------------------------------
const ENDING_CANDIDATES = [
  '거든', '잖아', '인 듯', '인듯', '더라구', '더라', '같아', '겠지',
  '을걸', '드라', '려나', '지 뭐', '든가', '려고', '네', '넹', '냐',
]
const FILLER_CANDIDATES = [
  '그냥', '뭔가', '진짜', '음', '좀', '약간', '솔직히', '막', '너무', '아', '오', '워',
]

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u

function countOccurrences(text: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let idx = text.indexOf(needle)
  while (idx !== -1) {
    count++
    idx = text.indexOf(needle, idx + needle.length)
  }
  return count
}

export function extractStyleRules(samples: StyleSample[]): StyleRules {
  const texts = samples.map((s) => s.text).filter(Boolean)
  const all = texts.join('\n')
  const totalLen = all.replace(/\s/g, '').length || 1

  // 반말/존댓말: 존댓말 종결 비율
  const politeMarkers = (all.match(/(요|니다|세요|예요|에요|습니다|십시오|나요|까요)[\s.!?…~]*(\n|$)/g) || []).length
  const sentences = all.split(/[.!?…\n]+/).map((s) => s.trim()).filter(Boolean)
  const sentenceCount = sentences.length || 1
  const banmal = politeMarkers / sentenceCount < 0.35

  // 평균 문장 길이
  const avgSentenceLen = Math.round(totalLen / sentenceCount)

  const usesEmoji = EMOJI_RE.test(all)
  const usesConsonants = /[ㅋㅎㅠㅜ]/.test(all)
  const exCount = countOccurrences(all, '!')
  const exclamationHeavy = exCount / sentenceCount > 0.4
  const ellCount = countOccurrences(all, '...') + countOccurrences(all, '…') + countOccurrences(all, '..')
  const ellipsisHeavy = ellCount / sentenceCount > 0.25

  const rankBy = (candidates: string[]) =>
    candidates
      .map((c) => ({ c, n: countOccurrences(all, c) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((x) => x.c)

  return {
    banmal,
    avgSentenceLen,
    usesEmoji,
    usesConsonants,
    exclamationHeavy,
    ellipsisHeavy,
    endings: rankBy(ENDING_CANDIDATES),
    fillers: rankBy(FILLER_CANDIDATES),
  }
}

/** 답변 길이 힌트: 채팅 샘플 비중 ↑, 온보딩은 보조 (말투 규칙과 분리) */
export function computeWeightedAvgSentenceLen(samples: StyleSample[]): number {
  const avgFrom = (list: StyleSample[]): number | null => {
    if (!list.length) return null
    const all = list.map((s) => s.text).filter(Boolean).join('\n')
    if (!all.trim()) return null
    const totalLen = all.replace(/\s/g, '').length || 1
    const sentences = all.split(/[.!?…\n]+/).map((s) => s.trim()).filter(Boolean)
    const sentenceCount = sentences.length || 1
    return totalLen / sentenceCount
  }

  const chat = samples.filter((s) => s.source === 'chat')
  const onboarding = samples.filter((s) => s.source === 'onboarding')

  const chatAvg = avgFrom(chat)
  const onAvg = avgFrom(onboarding)

  if (chatAvg !== null && onAvg !== null) {
    return Math.round(chatAvg * 0.75 + onAvg * 0.25)
  }
  if (chatAvg !== null) return Math.round(chatAvg)
  if (onAvg !== null) return Math.round(onAvg)
  return 20
}

function describeStyleRules(r: StyleRules, replyAvg?: number): string {
  const bits: string[] = []
  bits.push(r.banmal ? '반말 사용' : '존댓말 사용')
  const avg = replyAvg ?? r.avgSentenceLen
  bits.push(
    avg < 15 ? '문장을 짧게 끊어 씀' : avg > 32 ? '문장을 조금 길게 씀' : '문장 길이 보통',
  )
  if (r.usesConsonants) bits.push('초성(ㅋㅋ/ㅠㅠ) — **user 채팅·이번 말에서 실제로 쓸 때만** 가끔. 예시·습관적 남발 금지')
  else bits.push('ㅋㅋ/ㅠㅠ — 억지로 넣지 말 것')
  if (r.usesEmoji) bits.push('이모지 사용')
  if (r.exclamationHeavy) bits.push('느낌표 자주 씀')
  if (r.ellipsisHeavy) bits.push('말줄임(…) 자주 씀')
  if (r.endings.length) bits.push(`자주 쓰는 어투: ${r.endings.join(', ')}`)
  if (r.fillers.length) bits.push(`입버릇: ${r.fillers.join(', ')}`)
  return bits.join(' / ')
}

// ---------------------------------------------------------------------------
// 온보딩 → styleSamples 조립
// ---------------------------------------------------------------------------
export function collectStyleSamples(p: SelfProfile): StyleSample[] {
  const now = Date.now()
  const src = 'onboarding' as const
  const out: StyleSample[] = []
  const push = (register: Register, text: string) => {
    if (text && text.trim().length > 1) out.push({ register, text: text.trim(), source: src, at: now })
  }
  push('casual', p.styleSample ?? '')
  push('casual', p.currentRole ?? '')
  push('casual', p.lifeContext)
  push('reflective', p.corePriority)
  push('reflective', p.successDef)
  for (const d of p.dilemmas) push('reflective', d.reason)
  push('venting', p.stressMoment)
  push('comforting', p.comfortTarget)
  push('venting', p.fear ?? '')
  push('reflective', p.desire ?? '')
  push('reflective', p.growthDirection ?? '')
  if (p.speechTone?.trim()) push('casual', p.speechTone)
  if (p.future?.identityLine?.trim()) push('reflective', p.future.identityLine)
  if (p.future?.futureVoiceSample?.trim()) push('comforting', p.future.futureVoiceSample)
  if (p.future?.adviceLine?.trim()) push('comforting', p.future.adviceLine)
  if (p.future?.typicalDay?.trim()) push('reflective', p.future.typicalDay.slice(0, 120))
  return out
}

// ---------------------------------------------------------------------------
// 대화 → 잠정 인사이트 (조심스럽게 축적: 반복될수록 신뢰↑)
// ---------------------------------------------------------------------------
const MAX_INSIGHTS = 40

function normInsight(s: string): string {
  return s.replace(/\s+/g, ' ').trim().replace(/[.!?…~,]+$/, '').slice(0, 45)
}

// 유저 메시지 한 줄에서 관찰 후보를 뽑는다 (로컬 규칙, API 호출 없음)
export function extractInsights(text: string): { kind: InsightKind; text: string }[] {
  const t = text.trim()
  if (t.length < 6) return []
  const isQuestion = /[?？]\s*$/.test(t)
  const cand = normInsight(t)
  const out: { kind: InsightKind; text: string }[] = []

  if (/요즘|요새|최근|준비\s?중|하는 중|취준|이직|시험\s?기간|프로젝트|바쁘|다니고|다녀|살고|지내/.test(t)) {
    out.push({ kind: 'state', text: cand })
  }
  if (!isQuestion && /중요하|중요한|가치|우선|포기\s?못|양보\s?못|절대\s?안|절대\s?못|옳다고|틀렸다고|신념|원칙|믿어|믿는/.test(t)) {
    out.push({ kind: 'value', text: cand })
  }
  if (!isQuestion && /좋아하|싫어하|취향|선호|차라리|편하고|편해|귀찮|질색|못\s?견디|끌리|질려|즐겨|사랑/.test(t)) {
    out.push({ kind: 'preference', text: cand })
  }
  return out
}

function tokens(s: string): string[] {
  return s
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
}

function similar(a: string, b: string): boolean {
  if (a === b) return true
  if (a.includes(b) || b.includes(a)) return true
  const ta = new Set(tokens(a))
  const tb = new Set(tokens(b))
  if (!ta.size || !tb.size) return false
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  const union = ta.size + tb.size - inter
  return inter / union >= 0.4
}

// 후보를 기존 인사이트 목록에 조심스럽게 병합 (같은 종류 + 유사 문장이면 count++)
export function mergeInsight(
  list: Insight[],
  cand: { kind: InsightKind; text: string; source?: 'local' | 'ai' },
  now: number = Date.now(),
): Insight[] {
  const next = [...list]
  const idx = next.findIndex((i) => i.kind === cand.kind && similar(i.text, cand.text))
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      text: cand.text.length >= next[idx].text.length ? cand.text : next[idx].text,
      count: next[idx].count + 1,
      source: cand.source === 'ai' || next[idx].source === 'ai' ? 'ai' : next[idx].source ?? 'local',
      lastAt: now,
    }
  } else {
    next.push({
      id: crypto.randomUUID(),
      kind: cand.kind,
      text: cand.text,
      count: 1,
      source: cand.source ?? 'local',
      firstAt: now,
      lastAt: now,
    })
  }
  // 용량 제한: 신뢰도 낮고 오래된 것부터 정리 (AI 관찰은 우대)
  if (next.length > MAX_INSIGHTS) {
    next.sort(
      (a, b) =>
        (b.source === 'ai' ? 1 : 0) - (a.source === 'ai' ? 1 : 0) ||
        b.count - a.count ||
        b.lastAt - a.lastAt,
    )
    return next.slice(0, MAX_INSIGHTS)
  }
  return next
}

// 메시지 하나로 인사이트 목록을 갱신 (로컬 키워드 기반)
export function accumulateInsights(list: Insight[], text: string): Insight[] {
  let out = list
  for (const cand of extractInsights(text)) out = mergeInsight(out, { ...cand, source: 'local' })
  return out
}

// 프롬프트에 넣을 잠정 인사이트 요약 (요즘 상황은 최근값, 가치관·선호는 반복된 것만)
function describeInsights(p: SelfProfile): string {
  const list = p.insights ?? []
  if (!list.length) return ''
  const lines: string[] = []

  const states = list
    .filter((i) => i.kind === 'state')
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, 2)
  // 가치관·선호·사실: AI 추론은 바로, 로컬 키워드는 2번 이상 반복돼야 반영 (조심스럽게)
  const beliefs = list
    .filter((i) => i.kind !== 'state' && (i.source === 'ai' || i.count >= 2))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)

  for (const i of states) lines.push(`- [${INSIGHT_LABELS[i.kind]}] ${i.text}`)
  for (const i of beliefs) {
    const note = i.count >= 2 ? ' (여러 번 드러남)' : ''
    lines.push(`- [${INSIGHT_LABELS[i.kind]}] ${i.text}${note}`)
  }

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// 성장 4축 (두려움·욕망·회피·성장방향) — 자기이해 → 용기 → 실행
// ---------------------------------------------------------------------------
function describeGrowthContext(p: SelfProfile): string {
  const lines: string[] = []
  if (p.fear?.trim()) lines.push(`두려워하거나 피하게 되는 것: "${p.fear.trim().slice(0, 50)}"`)
  if (p.avoidance?.trim() && !/^(없|없어)/.test(p.avoidance.trim())) {
    lines.push(`자꾸 미루는 것: "${p.avoidance.trim().slice(0, 50)}"`)
  }
  if (p.desire?.trim()) lines.push(`속으로 진짜 원하는 것: "${p.desire.trim().slice(0, 50)}"`)
  if (p.growthDirection?.trim()) lines.push(`되고 싶은 나: "${p.growthDirection.trim().slice(0, 50)}"`)
  return lines.map((l) => `- ${l}`).join('\n')
}

/**
 * 실행 리듬 — 플래너의 목표·완료 회고·멈춤·밀림 (홈 계획표는 describeKnownFactsBlock).
 */
function describePlannerRhythmOnly(p: SelfProfile): string {
  const lines: string[] = []
  const planner = p.planner
  const activeGoals = planner?.goals.filter((g) => g.status === 'active').slice(0, 2) ?? []
  if (activeGoals.length) {
    lines.push(
      `직접 정한 목표: ${activeGoals
        .map((g) => `"${g.title}"${g.targetDate ? ` (${g.targetDate}까지)` : ''}`)
        .join(' / ')}`,
    )
  }
  for (const r of recentReflectionsWithTask(p, 2)) {
    lines.push(
      `해낸 직후 남긴 기록: "${r.taskTitle}" — ${r.emotion}${r.pride ? ` ("${r.pride.slice(0, 60)}")` : ''}`,
    )
  }
  const stalled = stalledGoals(p)[0]
  if (stalled) lines.push(`"${stalled.goal.title}" 목표가 ${stalled.stalledDays}일째 멈춰 있음`)
  const overdue = overdueTasks(p, dateKey())
  if (overdue.length) {
    lines.push(`기한 지난 할 일 ${overdue.length}개 (예: "${overdue[0].title.slice(0, 40)}")`)
  }

  return lines.map((l) => `- ${l}`).join('\n')
}

/** 이번 user 말이 성장 4축(두려움·회피·욕망)을 건드렸는지 → 짧은 가이드 주입 */
function describeGrowthTouch(p: SelfProfile, userMessage: string): string {
  const msgTokens = new Set(tokens(userMessage))
  const touches = (field?: string): boolean => {
    const f = (field ?? '').trim()
    if (f.length < 3 || /^(없|없어|몰라)/.test(f)) return false
    for (const w of tokens(f)) if (w.length >= 2 && msgTokens.has(w)) return true
    return false
  }
  const hits: string[] = []
  if (touches(p.fear)) hits.push('두려움')
  if (touches(p.avoidance)) hits.push('회피')
  if (touches(p.desire)) hits.push('진짜 원하는 것')
  if (!hits.length) return ''
  return `이번 말은 온보딩에서 말한 ${hits.join('·')}과 닿아 있다. 훈수·분석 대신, 부담 가장 작은 한 걸음만 같이 찾아준다.`
}

// ---------------------------------------------------------------------------
// AI 기반 인사이트 추론 (몇 메시지마다 1회 — 추상적 성격·가치관까지 파악)
// ---------------------------------------------------------------------------
const INSIGHT_KINDS: InsightKind[] = ['state', 'value', 'preference', 'fact']

// ---------------------------------------------------------------------------
// 작은 행동 제안 (C) — 최근 대화에서 "오늘 할 수 있는 한 걸음" 하나 뽑기
// ---------------------------------------------------------------------------
export async function suggestSmallAction(
  messages: ApiDialogueMessage[],
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
): Promise<string> {
  if (!apiKey.trim() || !messages.length) return ''
  const recent = filterMessagesForApi(messages).slice(-8)
  if (!recent.length) return ''
  const convo = recent.map((m) => `${m.role === 'user' ? '나' : '또다른나'}: ${m.content}`).join('\n')
  const sys = `아래 대화에서 '나'가 고민·망설이는 것에 대해, 오늘 당장 5분 안에 할 수 있는 아주 작은 행동 하나만 제안하라.
- 거창한 계획·여러 개 금지. 딱 한 가지 구체적 행동.
- 한국어 반말, 20자 이내. 예: "여사친한테 안부 톡 한 통", "이력서 첫 줄만 고치기"
- 행동 그 자체만 출력. 설명·따옴표·마침표 없이.`
  try {
    const data = await geminiGenerate(
      apiKey,
      resolveModel(model),
      {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: convo }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 40, thinkingConfig: { thinkingBudget: 0 } },
      },
      'suggestAction',
    )
    return extractGeminiText(data)
      .replace(/^["'\s]+|["'.\s]+$/g, '')
      .split('\n')[0]
      .slice(0, 40)
  } catch {
    return ''
  }
}

export async function analyzeInsightsWithAI(
  messages: { role: 'user' | 'assistant'; content: string }[],
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
): Promise<{ kind: InsightKind; text: string }[]> {
  if (!apiKey.trim() || !messages.length || isBackgroundApiPaused()) return []
  const resolvedModel = resolveModel(model)
  const apiMessages = filterMessagesForApi(messages)
  if (!apiMessages.length) return []

  const convo = apiMessages
    .map((m) => `${m.role === 'user' ? '나' : '또다른나'}: ${m.content}`)
    .join('\n')

  const sys = `아래는 어떤 사람이 '또 다른 나(=자기 자신 AI)'와 나눈 대화다. 발화자 "나"의 '지속적인' 특성만 신중하게 추론해서 JSON 배열로만 출력하라.
- kind는 반드시 다음 중 하나: state(요즘 상황), value(가치관·신념), preference(취향·선호), fact(잘 안 변하는 사실: 직업·역할·관계 등)
- text: 한국어 한 문장, 25자 이내로 특성을 요약. 예: "모든 일에 능동적으로 나선다", "안정보다 도전을 택한다"
- 대화 한 번의 일시적 기분·사건이 아니라, 반복되거나 성격적으로 일관되게 드러나는 것만 뽑는다.
- 근거가 약하거나 애매하면 넣지 마라. 확신 있는 것만. 없으면 빈 배열 [].
- 최대 4개까지만.
- 순수 JSON 배열만 출력. 설명, 마크다운, 코드블록 절대 금지.
형식 예: [{"kind":"value","text":"..."},{"kind":"state","text":"..."}]`

  try {
    const data = await geminiGenerate(
      apiKey,
      resolvedModel,
      {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: convo }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'insightAnalysis',
    )
    const raw = (data?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]
      ?.content?.parts?.map((x) => x.text ?? '')
      .join('')
      .trim()
    if (!raw) return []
    return parseInsightJson(raw)
  } catch (e) {
    noteBackgroundApiFailure(e)
    return []
  }
}

function parseInsightJson(raw: string): { kind: InsightKind; text: string }[] {
  // 코드블록/잡텍스트 제거 후 첫 배열만 추출
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return []
  try {
    const arr = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    if (!Array.isArray(arr)) return []
    const out: { kind: InsightKind; text: string }[] = []
    for (const item of arr) {
      const kind = (item as { kind?: string })?.kind
      const text = (item as { text?: string })?.text
      if (typeof kind === 'string' && typeof text === 'string' && INSIGHT_KINDS.includes(kind as InsightKind)) {
        const t = normInsight(text)
        if (t.length >= 2) out.push({ kind: kind as InsightKind, text: t })
      }
    }
    return out.slice(0, 4)
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// L2: 딜레마 → 판단 규칙 서술
// ---------------------------------------------------------------------------
function describeDilemmas(p: SelfProfile): string {
  if (!p.dilemmas.length) return ''
  return p.dilemmas
    .map((d) => `- "${d.prompt}" → 선택: ${d.choice}${d.reason ? ` (이유: ${d.reason})` : ''}`)
    .join('\n')
}

// ---------------------------------------------------------------------------
// few-shot: 레지스터별 예시
// ---------------------------------------------------------------------------
export function buildFewShot(p: SelfProfile, targetRegister?: Register): StyleSample[] {
  const samples = p.styleSamples.length ? p.styleSamples : collectStyleSamples(p)
  if (!samples.length) return []
  // 타깃 레지스터 우선 + 나머지 레지스터에서 1개씩 다양하게
  const byReg = new Map<Register, StyleSample[]>()
  for (const s of samples) {
    if (!byReg.has(s.register)) byReg.set(s.register, [])
    byReg.get(s.register)!.push(s)
  }
  const pickLatest = (arr: StyleSample[], n: number) =>
    [...arr].sort((a, b) => b.at - a.at).slice(0, n)

  const result: StyleSample[] = []
  if (targetRegister && byReg.has(targetRegister)) {
    result.push(...pickLatest(byReg.get(targetRegister)!, 2))
  }
  for (const [reg, arr] of byReg) {
    if (reg === targetRegister) continue
    result.push(...pickLatest(arr, 1))
  }
  return result.slice(0, 3)
}

// ---------------------------------------------------------------------------
// 레지스터별 현재 상황 가이드 + 예시 대화 유도 프롬프트
// ---------------------------------------------------------------------------
const REGISTER_GUIDE: Record<Register, string> = {
  venting:
    '지치고 힘든 속마음이다. 먼저 감정을 짧게 받아주고, 해결책은 아주 작게만 제안한다. 성향 분석·훈수 금지.',
  joyful:
    '기분 좋은 일을 꺼냈다. 그 일의 구체에 반응하며 같이 기뻐한다. 의미 부여는 짧게만.',
  comforting:
    '위로가 필요한 상태다. 지금 말한 상황에 맞춰 짧게 다독인다. 판단·훈수·프로필 낭독 금지.',
  reflective:
    '고민·선택·후회를 털어놓는 중이다. **말이 흐리면** 장면·걸리는 포인트 하나만 좁혀 간다(판단·행동 과제 금지). **이미 구체적이면** 덜 후회할 방향·작은 다음 행동 중 1~2개. 요약·재진술·성향 라벨 금지.',
  casual:
    '가벼운 일상 속마음이다. 짧고 가볍게 받는다. 과잉 반응·과잉 분석·성향 언급 금지.',
}

// 말투 few-shot과 별도 — 1·2·3번(정체성·에코·환각) 교정용 고정 예시 (4개로 압축 — 구조 참고용)
const BEHAVIOR_PRIMER: { user: string; model: string }[] = [
  {
    user: '요즘 뭔가 고민인데',
    model: '고민이라기보다 일 쪽인지 사람 쪽인지부터 갈리는 것 같긴 한데. 둘 중 뭐가 더 자주 떠올라?',
  },
  {
    user: '스트레스 받아',
    model: '스트레스가 한 가지야, 아니면 여러 개가 한꺼번에야. 지금 제일 거슬리는 장면 하나만 골라보면?',
  },
  {
    user: '하... 힘들다',
    model: '힘든 건 맞지. 오늘 중에 특히 찌르는 순간 하나 있었어?',
  },
  {
    user: '좋아하는 사람 있는데, 가만히 있으면 후회할 것 같아.',
    model:
      '그러면 가만히 있는 선택지는 좀 아닌 것 같아. 고백까지 아니어도, 다음 약속을 내가 먼저 잡는 정도는 해볼 만하지.',
  },
  {
    user: '창업하고 싶은데 실패할까봐 무서워.',
    model:
      '무서운 건 맞지. 근데 아예 안 해보면 계속 남을 것 같아서, 작게 검증하는 쪽이 더 맞아 보여.',
  },
  {
    user: '요즘 내가 너무 말만 크고 실행을 못 하는 것 같아.',
    model:
      '그건 좀 찔리는 지점이긴 해. 오늘은 계획 크게 세우지 말고, 진짜 할 일 하나만 끝내자.',
  },
  {
    user: '저녁 뭐 먹지? 가벼운 거.',
    model:
      '가볍게면 포케나 샐러드 쪽이 낫겠다. 근데 배고프면 괜히 가벼운 척하지 말고 제대로 먹고.',
  },
  {
    user: '야 뭐해',
    model: '나한테 물어볼 건 아닌데. 너 지금 뭐 하는데.',
  },
]

const MAX_REPLY_SENTENCES = 3
const MAX_BUBBLE_SENTENCES = 3

const FACTUAL_SEARCH_TONE_BAN = `
- ❌ **정보 검색 말투 금지** (이 턴은 속마음 대화): "2026년 ○월 ○일 오늘 기준", "지금 기준이고 바뀔 수 있어", "상황은 언제든 바뀔 수 있어", "검색앱", "검색으로 확인" — **절대 쓰지 말 것**.`

const STOCK_PHRASE_BAN =
  '"그치", "맞네", "익숙한 고민이긴 해", "그 마음 알지", "충분히 이해", "힘들었겠", "우리 성격상", "성격상", "말한 대로", "라는 거지", "라는 말" 같은 **상담사·재진술 맞장구** 금지.'

const CONCRETIZATION_INTERVIEW_BAN = `
- ❌ **면접·체크리스트 질문** (이유: AI 상담사 티): "무슨 고민이야", "언제부터야", "어떤 감정이야", "구체적으로 말해줘", "더 자세히", "왜 그렇게 생각해" 연속
- ✅ **방금 한 말에서 갈라지는 가지 하나**만 — 친구한테 툭 이어가듯. 질문 1개 또는 각도 1개.`

const FILLER_OVERUSE_BAN = `
- ❌ **예시·few-shot에 나온 말버릇 복사·남발**: ㅋㅋ, ㅎㅎ, "못 참지", "~하더라", "~겠다", "오 ~"를 **매 턴** 습관적으로
- ❌ **직전 턴**에 ㅋㅋ/못 참지가 있었다고 **무조건** 따라 쓰기 — 맥락·감정·주제에 맞을 때만
- ❌ user가 안 썼는데 분위기 맞춘다고 ㅋㅋ·과장 리액션 넣기
- ✅ **user 채팅 샘플·이번 말**에서 실제로 쓰는 어투·입버릇만, **가끔**. 한 턴에 ㅋㅋ/ㅎㅎ **최대 1번**`

const NO_ECHO_BAN = `
## 절대 금지 (요약·따라치기·되말하기·아는척)
- ❌ user 말 **재진술·요약·따라치기** ("~라는 거지", "~한 것 같다는 말", user 키워드 길게 되풀이)
- ❌ **같은 뜻 2문장 이상** — 한 턴 = **새 각도 1~2개**만 (타이밍, 선택, 한 줄 질문). 공감은 **짧게 최대 1문장**
- ❌ **아는 척** — "우리 성격상", "충분히 이해", "그 마음 알지", 온보딩·MBTI·1순위 낭독
- ✅ user가 **안 말한 말은 입에 안 냄**. **인용 없이** 한 걸음 앞만.

❌ 나쁨: "후회가 클 것 같다는 거, 충분히 이해 돼. 우리 성격상 행동하는 편이잖아."
✅ 좋음: "지금 남친 없을 때가 제일 걸리는 거지. 한 발만 옮겨보는 쪽이 나중에 덜 남을 수도."`

const PROFILE_SURFACE_BAN = `
- ❌ 온보딩·프로필(1순위·잘 산다·딜레마·MBTI)을 **이번 말과 무관하게** "~하잖아", "우리는 ~한 편", "~~ 성향도 있고"로 **아는 척·낭독**
- ❌ 이번 고민을 **추상 성향·인생 철학**으로만 퉁치기 — user가 말한 **사람·상황·후회·타이밍**을 먼저
- ✅ **지금 user가 말한 핵심**을 거울처럼 받아주고, **한 걸음 앞**(행동·기준·타이밍·선택)을 같은 나 톤으로 — 성향은 **라벨 없이** 자연스럽게 녹일 때만 OK`

const FACT_GROUNDING_BAN = `
## 사실·할루시네이션 (최우선)
- **알고 있는 것** 블록·user 방금 말·온보딩에 **적힌 것만** 사실. 그 밖은 모름.
- 시간·장소·날짜·할 일명·미룬 이유·"~했잖아"는 **블록에 글자 그대로 있을 때만**. 없으면 "적혀 있지 않아" / "시간은 안 적혀 있어".
- **이전 대화·네 추측·그럴듯한 연결은 사실 아님.** user가 틀렸다고 하면 변명·재추측 없이 인정.
- 이번 주/달 **목표**와 오늘 **일간** 할 일을 섞지 말 것.`

/** 주가·시세 — 주식/환율 전용 (순위 '1위' 등과 분리) */
const FACTUAL_STOCK_RE =
  /(주가|시세|주식|코스피|코스닥|환율|비트코인|코인\s?시세|005930|000660|삼성전자\s?주|하이닉스\s?주)/
const FACTUAL_PRICE_RE =
  /(얼마|몇\s?(원|달러|%|퍼)|(?:^|\s)\d{1,3}(?:,\d{3})+\s*원)/
const FACTUAL_SCORE_RE =
  /(득점\s?(왕|1위|선두)|스포츠\s?순위|경기\s?(결과|스코어)|world\s?cup|월드컵|올림픽|챔스)/i
const FACTUAL_RANK_RE =
  /(차트|멜론|melon|billboard|음원|노래|가수|앨범|top\s?\d|(\d+\s?위)|1\s?위\s?(노래|곡)?)/i
const FACTUAL_LOOKUP_RE = /(날씨|기온|미세먼지|몇\s?도)/
const FACTUAL_RECENCY_RE = /(현재|지금|오늘|최신|가장\s?최신|최근|요즘|새\s?로|막\s?나온|올해|당장)/
const FACTUAL_PRODUCT_RE =
  /(아이폰|iphone|갤럭시|galaxy|맥북|macbook|아이패드|ipad|안드로이드|ios|출시|신제품|신모델|기종|모델|버전|세대)/i
const FACTUAL_WH_RE =
  /(누구(야|임|지|인|가)?|언제(야|임|지)?|어디(야|서|지|가)?|무슨|뭔지|뭐야|뭐임|몇\s?(명|개|시|년|번|세|대|이(지|야|냐)?)?|몇이(지|야|냐)?|어떤\s?(모델|버전|기종|시리즈)?)/

/** 직전 답·비유에 대한 재질문 — 팩트/검색 질문이 아님 ("무슨 말이야" 등) */
export function isDialogueClarificationQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 4) return false
  if (
    /(너가|네가|니가|너\s?말|네\s?말|방금\s?(말|한)|아까\s?(말|한)|전\s?말|그\s?말|이\s?말|말한\s?거|말하는\s?(게|거)|그게\s?(무슨|뭔)|무슨\s?(말|뜻|소리)|뭔\s?(말|소리)|무슨\s?의미|뭔\s?의미)/.test(
      t,
    )
  ) {
    return true
  }
  return /^(그게|이게|저게)\s?(무슨|뭔)/.test(t)
}

/** 오늘/주말 뭐할지 — 속마음·추천 (날씨·팩트 질문 아님) */
function isCasualPlanningQuestion(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!/(오늘|이번\s?주말|주말|내일)/.test(t)) return false
  if (/(날씨|기온|몇\s?도|미세|강수|습도|얼마|누구|언제\s?야|어디\s?야|알려|검색)/.test(t)) {
    return false
  }
  return /(뭐\s?(?:할|하면|하지|할까|할지|하는\s?게)|좋을까|나을까|뭐\s?하지|뭐\s?할\s?만)/.test(t)
}

/** 선택·의견 — 팩트 검색 경로 X (속마음; 정보는 참고만) */
export function needsDecisionAdvice(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (isCasualPlanningQuestion(t)) return true
  if (
    FACTUAL_LOOKUP_RE.test(t) ||
    (/(날씨|기온|주가|시세|득점|순위|환율|뉴스)/.test(t) &&
      /(어때|어떻지|어떤지|알려|몇|얼마|누구)/.test(t))
  ) {
    return false
  }
  return (
    /(살까|팔까)\s?말까|살지\s?말지|할까\s?말까|사야\s?할까|할지\s?말지|들어갈까|해볼까\s?말까/.test(
      t,
    ) ||
    /(어떻게\s?생각|어떤\s?것\s?같|괜찮을\s?까|할\s?만할\s?까|추천\s?해\s?줄\s?래)/.test(t)
  )
}

function hasFactualAskSignal(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (isDialogueClarificationQuestion(t)) return false
  const whFact =
    FACTUAL_WH_RE.test(t) &&
    !/(고민|망설|후회|힘들|지쳐|왜\s|어떻게\s?생각|살까|팔까|할까\s?말)/.test(t) &&
    !needsDecisionAdvice(t)
  const recencyFact =
    FACTUAL_RECENCY_RE.test(t) &&
    /(몇|어떤|무슨|뭐|누구|얼마|언제|어디|출시|나온|발표)/.test(t) &&
    !needsDecisionAdvice(t) &&
    !isCasualPlanningQuestion(t) &&
    !/(고민|망설|후회|힘들|지쳐|무서워|불안)/.test(t)
  const productFact =
    FACTUAL_PRODUCT_RE.test(t) &&
    /(몇|최신|지금|어떤|무슨|뭐|출시|나온|버전|세대|모델)/.test(t) &&
    !needsDecisionAdvice(t)
  const weatherFact =
    FACTUAL_LOOKUP_RE.test(t) &&
    /(어때|어떻지|어떤지|알려|몇\s?도|궁금)/.test(t) &&
    !needsDecisionAdvice(t)
  return (
    FACTUAL_STOCK_RE.test(t) ||
    FACTUAL_PRICE_RE.test(t) ||
    FACTUAL_SCORE_RE.test(t) ||
    FACTUAL_RANK_RE.test(t) ||
    FACTUAL_LOOKUP_RE.test(t) ||
    weatherFact ||
    (FACTUAL_RECENCY_RE.test(t) && FACTUAL_WH_RE.test(t)) ||
    /(알려\s?줘|알려줘|검색해서|찾아\s?봐|찾아봐|몇\s?골|몇\s?점)/.test(t) ||
    whFact ||
    recencyFact ||
    productFact
  )
}

export function needsFactualGrounding(
  text: string,
  contextMessages?: ApiDialogueMessage[],
): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 4) return false
  if (needsDecisionAdvice(t)) return false
  if (hasFactualAskSignal(t)) {
    if (
      /(고민|망설|후회|힘들|지쳐|무서워|불안|속상|우울|짜증|어떡하지)\b/.test(t) &&
      !FACTUAL_STOCK_RE.test(t) &&
      !FACTUAL_PRICE_RE.test(t) &&
      !FACTUAL_SCORE_RE.test(t) &&
      !FACTUAL_RANK_RE.test(t) &&
      !FACTUAL_LOOKUP_RE.test(t) &&
      !/(누구|얼마|득점|주가|시세|날씨|뉴스|몇\s?골)/.test(t)
    ) {
      return false
    }
    if (/추천/.test(t) && !/(뉴스|순위|득점|주가|날씨|차트|멜론|노래)/.test(t)) return false
    return true
  }
  if (contextMessages?.length) {
    const followUp =
      /(알려\s?줘|알려줘|말해\s?줘|누구|누군|몇\s?골|몇\s?점|그게\s?뭐|다시|당장|기준|아니|말고|잘못)/.test(t)
    if (followUp) {
      const recentUserBlob = contextMessages
        .filter((m) => m.role === 'user')
        .slice(-4)
        .map((m) => m.content)
        .join(' ')
      if (hasFactualAskSignal(recentUserBlob)) return true
    }
  }
  return false
}

/** 외부에서 확인 가능한 **정보 요청** (비교·숫자·최신·사실 질문) */
export function hasExplicitInformationRequest(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (
    /(.+)(랑|와|과|이랑)\s?.+\s?(중|vs|비교)/i.test(t) &&
    /(비싸|싸|높|낮|차|많|적|좋|나아|클|작|비교|어디)/.test(t)
  ) {
    return true
  }
  return hasFactualAskSignal(t)
}

/** 속마음·일상 대화 — 검색 경로 X */
export function shouldUseDialoguePath(
  text: string,
  contextMessages?: ApiDialogueMessage[],
): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 2) return true
  if (isDialogueClarificationQuestion(t)) return true
  if (needsDecisionAdvice(t)) return true
  if (hasExplicitInformationRequest(t)) return false

  if (
    /^(하+\.{0,3}|힘들|지쳐|ㅠ|ㅜ|우울|스트레스|짜증|속상|외로|슬프)/.test(t) &&
    !/[?？]/.test(t) &&
    t.length < 100
  ) {
    return true
  }
  if (/^(ㅋ+|ㅎ+|그래\.?$|음+\.{0,3}$|아+\.{0,3}$|뭔데\.?$|오+\s*$|와+\s*$)/.test(t) && t.length < 24) {
    return true
  }
  if (
    /(뭐\s?먹|메뉴\s?(추천)?|저녁\s?(뭐|추천)|점심\s?(뭐|추천))/.test(t) &&
    !/(맛집|영업|위치|시간|얼마|어디)/.test(t)
  ) {
    return true
  }
  if (
    isCasualPlanningQuestion(t) ||
    (/(오늘|이번\s?주말|주말|내일)\s?(뭐\s?(?:할|하면|하지|할까|할지|하는\s?게)|좋을까|나을까)/.test(
      t,
    ) &&
      !/(날씨|기온|비\s?와|더워|추워|미세|몇\s?도)/.test(t))
  ) {
    return true
  }
  if (
    /(거주|살고|살아|살지|좋아|선호|마음|끌려|그립|편해)/.test(t) &&
    !/(얼마|비싸|싸|누가|몇|알려|비교|vs|중\s?어디)/.test(t)
  ) {
    return true
  }
  if (/^(그래도|근데\s?그래도|난\s?그래도)/.test(t)) return true
  if (
    !/[?？]/.test(t) &&
    /(긴\s?한데|하긴|알겠는데|맞는데|그건\s?알겠)/.test(t) &&
    t.length < 120
  ) {
    return true
  }
  if (
    (/(고민|망설|후회|걱정|불안|무서|어떡하지)/.test(t) ||
      detectRegister(t) === 'reflective') &&
    !/[?？]/.test(t) &&
    !/(알려|누구|얼마|몇|언제|어디|최신|비싸|주가)/.test(t)
  ) {
    return true
  }
  if (contextMessages?.length && !/[?？]/.test(t) && !hasExplicitInformationRequest(t)) {
    const lastAsst = [...contextMessages].reverse().find((m) => m.role === 'assistant')
    if (lastAsst && /(거주|좋아|그래도|긴\s?한데|맞는데|알겠|하긴)/.test(t)) {
      return true
    }
  }
  return false
}

function extractGeminiText(data: Record<string, unknown>): string {
  return (
    (data.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]
      ?.content?.parts?.map((x) => x.text ?? '')
      .join('')
      .trim() ?? ''
  )
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 정보 검색 턴에서만 쓰는 면책·날짜 문장 — 속마음 대화에 섞이면 AI 티가 난다 */
function isFactualSearchBoilerplateSentence(s: string): boolean {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return true
  if (/\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(?:\([^)]+\)\s*)?(?:오늘\s*)?기준/.test(t)) return true
  if (/오늘\s*\(\d{4}년[^)]+\)\s*기준/.test(t)) return true
  if (/(?:다만\s*)?지금\s*기준이고(?:[^\n.?!]*?)바뀔\s*수\s*있/.test(t)) return true
  if (/지금\s*기준이고\s*상황은\s*언제든\s*바뀔\s*수\s*있/.test(t)) return true
  return false
}

/** 속마음 답에서 팩트 검색 말투(날짜 기준·면책)를 제거 */
export function stripFactualSearchBleed(text: string): string {
  const sentences = splitSentences(text)
  const filtered = sentences.filter(
    (s) => !isFactualSearchBoilerplateSentence(s) && !isSearchRefusalSentence(s),
  )
  if (filtered.length) return filtered.join(' ')
  return text
    .replace(/\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*(?:\([^)]+\)\s*)?(?:오늘\s*)?기준[^.?!…]*[.?!…]?\s*/g, '')
    .replace(/(?:다만\s*)?지금\s*기준이고[^\n.?!]*바뀔\s*수\s*있[^\n.?!]*[.?!…]?\s*/g, '')
    .replace(/지금\s*기준이고\s*상황은\s*언제든\s*바뀔\s*수\s*있[^\n.?!]*[.?!…]?\s*/g, '')
    .replace(/지금은\s*검색(으로|앱)[^.?!…]*[.?!…]?\s*/g, '')
    .replace(/검색앱에서[^.?!…]*[.?!…]?\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 검색 실패 fallback 문장 — 속마음 대화에 섞이면 안 됨 */
function isSearchRefusalSentence(s: string): boolean {
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (/지금은\s*검색(으로|앱)/.test(t)) return true
  if (/검색앱/.test(t) && /(확인|정확|봐야|못\s?(불러|봐|찾))/.test(t)) return true
  if (/검색(으로|해서)\s*확인/.test(t) && /(안\s?됐|못|어려)/.test(t)) return true
  return false
}

function replyTokens(s: string): string[] {
  return s
    .replace(/[^\w가-힣\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2)
}

function sentenceSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.85
  const ta = new Set(replyTokens(a))
  const tb = new Set(replyTokens(b))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const w of ta) if (tb.has(w)) inter++
  const union = ta.size + tb.size - inter
  return inter / union
}

const COUNSELOR_ECHO_RE =
  /(충분히 )?이해(해|돼|되)|그 마음 (알|이해)|익숙한 고민|우리 성격|성격상|말한 (대로|것)|요약하면|다시 말하면|한마디로|결국 .*말은/i

const PARAPHRASE_TAIL_RE = /(라|다)는 (거|말)(지|야|잖|네)[.?!…]?$/

const ECHO_FRAME_RE =
  /(네가|너가|user가|말한 건|말한 것은|말한 대로|다시 말하면|요약하면|한마디로|결국|그러니까).*?(라는 거|라는 말|다는 거|다는 말|인 거지|인 말이지)|((라는 거|라는 말|다는 거|다는 말)(지|야|잖|네))/i

function isJudgmentOrNextStep(sentence: string): boolean {
  return /(아닌 것 같|맞는 것 같|나아 보|맞아 보|해볼 만|접을 이유|가만히 있|움직이는 쪽|해보자|하자|잡자|물어보자|정하자|시작하자|확인하자|선택지|방향|타이밍|기준|다음|일단|오늘은|지금은|차라리|작게|검증|덜 후회|해도 돼|안 해도 돼)/.test(
    sentence,
  )
}

function isEchoOfUser(sentence: string, userMessage: string): boolean {
  const u = userMessage.replace(/\s+/g, ' ').trim()
  const s = sentence.replace(/\s+/g, ' ').trim()
  if (u.length < 10 || s.length < 6) return false

  const sim = sentenceSimilarity(s, u)

  // 사용자 말과 비슷해도, 판단·방향·다음 행동이면 살린다.
  if (isJudgmentOrNextStep(s)) return false

  // 명백한 요약/재진술 프레임은 제거한다.
  if (ECHO_FRAME_RE.test(s)) return true

  // 사용자 문장을 거의 그대로 복사한 경우 제거.
  if (u.length >= 14 && s.includes(u.slice(0, Math.min(28, u.length)))) return true

  // 기존 0.38은 너무 빡셌음. 거의 같은 말일 때만 제거.
  if (sim >= 0.55) return true

  if (PARAPHRASE_TAIL_RE.test(s) && sim >= 0.28) return true

  return false
}

function polishReplySentences(sentences: string[], userMessage?: string): string[] {
  let out: string[] = []

  for (const raw of sentences) {
    const s = raw.trim()
    if (!s) continue

    const isJudgment = isJudgmentOrNextStep(s)

    if (isFactualSearchBoilerplateSentence(s)) continue
    if (userMessage && isEchoOfUser(s, userMessage)) continue
    if (COUNSELOR_ECHO_RE.test(s) && !isJudgment) continue
    if (out.some((prev) => sentenceSimilarity(prev, s) >= 0.5)) continue

    out.push(s)
  }

  if (!out.length) {
    const fallback = sentences.find((s) => isJudgmentOrNextStep(s))
    if (fallback) out = [fallback.trim()]
  }

  if (!out.length) out = sentences.filter((s) => !COUNSELOR_ECHO_RE.test(s))
  if (!out.length) out = sentences.slice(0, 1)

  return out.slice(0, MAX_REPLY_SENTENCES)
}

/** 한 답에 ㅋㅋ/ㅎㅎ가 여러 번 붙는 것만 완화 (맥락 판단은 프롬프트) */
function trimFillerSpam(text: string): string {
  let kkSeen = false
  return text
    .replace(/[ㅋㅎ]{2,}/g, () => {
      if (kkSeen) return ''
      kkSeen = true
      return 'ㅋㅋ'
    })
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** AI가 길게·개조식으로 쓴 답을 카톡 길이로 자른다 (프롬프트 보조) */
export function enforceReplyLimits(text: string, userMessage?: string): string {
  let t = text
    .replace(/^\*\*[^*]+\*\*:?\s*/gm, '')
    .replace(/^[\-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .trim()
  if (!t) return text.trim()

  const paras = t.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const chunks = paras.length ? paras : [t]

  let remaining = MAX_REPLY_SENTENCES
  const rawSentences: string[] = []
  for (const chunk of chunks) {
    if (remaining <= 0) break
    const take = splitSentences(chunk).slice(0, Math.min(MAX_BUBBLE_SENTENCES, remaining))
    if (take.length) {
      rawSentences.push(...take)
      remaining -= take.length
    }
  }
  const polished = polishReplySentences(rawSentences.length ? rawSentences : splitSentences(t), userMessage)
  const joined = polished.join(' ') || text.trim()
  return trimFillerSpam(joined)
}

/** 채팅에서 쌓인 짧은 내 말투만 few-shot model로 (정형 템플릿 bank 사용 안 함) */
function chatStyleModelSnippet(samples: StyleSample[], register: Register): string | null {
  const chat = samples.filter(
    (s) => s.source === 'chat' && s.register === register && s.text.trim().length >= 4 && s.text.length <= 90,
  )
  if (!chat.length) return null
  return chat[chat.length - 1].text.trim()
}

// few-shot 유도 발화 — 1인칭 속마음 톤 (남에게 말 거는 톤 금지)
const REGISTER_ELICIT: Record<Register, string> = {
  casual: '요즘 좀 그랬어',
  reflective: '나 이거 좀 고민되는데',
  venting: '하... 나 요즘 좀 힘들다',
  joyful: '나 오늘 좋은 일 있었어',
  comforting: '나 지금 좀 위로가 필요해',
}

// ---------------------------------------------------------------------------
// system prompt
// ---------------------------------------------------------------------------
function describeBehaviorExamples(lite = false): string {
  const primer = lite ? BEHAVIOR_PRIMER.slice(0, 2) : BEHAVIOR_PRIMER
  const body = primer
    .map(
      (ex, i) =>
        `예${i + 1}) 속마음: "${ex.user}"\n→ 좋은 답(구조만 참고): "${ex.model}"`,
    )
    .join('\n')
  return `${body}\n→ **구조·흐름만** 참고. ㅋㅋ·못 참지·어휘 **복사 금지**.`
}

/** 이번 턴 길이·입버릇 — 직전 문장 복사가 아니라 맥락·에너지 맞춤 */
function describeReplyLengthGuide(
  userMessage?: string,
  contextMessages?: ApiDialogueMessage[],
): string {
  if (!userMessage?.trim()) return ''
  const u = userMessage.replace(/\s+/g, ' ').trim()
  const recentUser = contextMessages?.filter((m) => m.role === 'user').slice(-4) ?? []
  const avgLen =
    recentUser.length > 0
      ? recentUser.reduce((sum, m) => sum + m.content.replace(/\s+/g, ' ').trim().length, 0) /
        recentUser.length
      : u.length

  const userUsesKk =
    /[ㅋㅎ]{2,}/.test(u) || recentUser.some((m) => /[ㅋㅎ]{2,}/.test(m.content))
  const casualJoyful =
    /(ㅋ|ㅎ|대박|좋|맛|먹|최애|ㅇㅈ|당연)/.test(u) ||
    analysisRegisterIsLight(recentUser, u)

  const lines: string[] = [
    '답 **길이·에너지**는 이번 말 + 최근 user 흐름에 맞춘다. **직전 한 줄을 따라치기·미러링하지 말 것.**',
  ]

  if (u.length <= 20 || (avgLen <= 24 && u.length <= 40)) {
    lines.push('user가 짧게 말함 → **1~2문장**. 군더더기·부연 설명 줄이기.')
  } else if (u.length <= 55) {
    lines.push('user 중간 길이 → **2문장 이내**.')
  }

  if (!userUsesKk && !casualJoyful) {
    lines.push('이번·최근 user에 ㅋㅋ/ㅎㅎ 거의 없음 → **ㅋㅋ·못 참지·과장 리액션 넣지 말 것.**')
  } else if (userUsesKk) {
    lines.push('user가 ㅋ/ㅎ 씀 → **한 번만** 가볍게. 문장마다 반복 금지.')
  }

  return lines.map((l) => `- ${l}`).join('\n')
}

function analysisRegisterIsLight(
  recentUser: { role: 'user' | 'assistant'; content: string }[],
  current: string,
): boolean {
  const blob = [current, ...recentUser.map((m) => m.content)].join(' ')
  return /(ㅋ|ㅎ|먹|맛|최애|대박|좋|당연)/.test(blob) && !/(힘들|우울|불안|고민|스트레스|ㅠ|ㅜ)/.test(current)
}

export const RECENT_MESSAGES_LITE = 10
export const PROMPT_LITE_MESSAGE_THRESHOLD = 28
export const PROMPT_LITE_SUMMARY_CHARS = 420

/** 긴 대화·긴 요약 → chatReply 프롬프트 자동 경량화 (503 완화) */
export function shouldUseLitePrompt(p: SelfProfile, apiMessageCount: number): boolean {
  const sumLen = p.conversationSummary?.trim().length ?? 0
  return apiMessageCount >= PROMPT_LITE_MESSAGE_THRESHOLD || sumLen > PROMPT_LITE_SUMMARY_CHARS
}

/** 저장된 대화 요약·카운트 초기화 — API prompt 크기 즉시 감소 */
export function resetProfilePromptBulk(p: SelfProfile): SelfProfile {
  return { ...p, conversationSummary: undefined, summarizedMessageCount: 0 }
}

// 미래 정체성 블록은 personaModel이 티어(중요도) 순서로 렌더링한다.
// lite(긴 대화 압축 모드)에서는 core 필드만 실어 토큰을 아낀다.
function describeFutureSelf(p: SelfProfile, lite = false): string {
  if (!p.future) return '- (미래 프로필 없음)'
  return renderFutureSelfBlock(p, lite)
}

// 답변 관점 모드: Future Me 기본 = future (미래의 나)
export type ReplyMode = 'reflect' | 'future' | 'courage'

const MODE_OVERLAY: Record<ReplyMode, string> = {
  reflect: '',
  future:
    `\n## 지금은 "${FUTURE_YEARS_AHEAD}년 뒤 미래의 나" 관점\n- 너는 user가 온보딩에서 만든 **${FUTURE_YEARS_AHEAD}년 뒤의 나**다. 예언·점쟁이 금지.\n- Future memory(throughline)·typicalDay·futureVoiceSample을 **말투·기억의 뼈대**로 삼되, 온보딩 문장을 그대로 낭독하지 말 것.\n- 지금의 나보다 담담하고 경험에서 온 말투. ㅋㅋ/ㅠㅠ는 줄이되, user styleSample과의 **연속성**은 유지.\n- "그때의 나한테 해주고 싶은 말" 톤으로, 이미 그 길을 걸어온 사람처럼 말한다.`,
  courage:
    '\n## 지금은 "용기" 관점\n- user가 방금 작은 실행 하나를 정했거나, 미루는 중이다. 판단·공감은 딱 1문장까지만.\n- 나머지는 짧게 밀어주기·격려. 거창한 계획·여러 선택지 금지.\n- 행동명을 작은따옴표+대시(`\'…\' —`)로 되따라치지 말 것. 행동과 안 맞으면 "5분" 같은 시간을 붙이지 말 것.',
}

export function buildSystemPrompt(
  p: SelfProfile,
  targetAnalysis?: MessageAnalysis | Register,
  lastAssistantReply?: string,
  userMessage?: string,
  lite = false,
  contextMessages?: ApiDialogueMessage[],
  mode: ReplyMode = 'future',
): string {
  const emptyAnalysis = (reg: Register): MessageAnalysis => ({
    primaryRegister: reg,
    topic: 'unknown',
    needs: ['listen'],
    emotions: ['none'],
    intensity: 'low',
    confidence: 0.5,
    ambiguous: false,
    signals: [],
    requiresExternalData: false,
    vague: false,
    inConcretizationFlow: false,
  })

  const allSamples = p.styleSamples.length ? p.styleSamples : collectStyleSamples(p)
  const rules = p.styleRules ?? extractStyleRules(allSamples)
  const replyAvg = Math.min(computeWeightedAvgSentenceLen(allSamples), 26)

  const analysis =
    typeof targetAnalysis === 'string'
      ? userMessage
        ? analyzeMessage(userMessage, contextMessages)
        : emptyAnalysis(targetAnalysis)
      : targetAnalysis ??
        (userMessage
          ? analyzeMessage(userMessage, contextMessages)
          : emptyAnalysis('casual'))

  const reg = analysis.primaryRegister
  const situation = buildAnalysisGuide(analysis)
  const deep = !lite && userMessage ? needsDeepContext(userMessage, reg) : false
  const concretizing =
    analysis.vague || analysis.inConcretizationFlow || analysis.needs.includes('concretize')

  const modeOverlay =
    MODE_OVERLAY[mode] +
    (mode === 'future' && p.speechTone?.trim()
      ? `\n- user가 선호하는 대화 톤: **${p.speechTone.trim()}** — 이 느낌에 맞출 것.`
      : '')
  const growthTouch = !lite && userMessage ? describeGrowthTouch(p, userMessage) : ''
  const growthTouchLine = growthTouch ? `\n- ${growthTouch}` : ''
  const growthCtx = deep ? describeGrowthContext(p) : ''
  const growthSection = growthCtx ? `\n## 성장 축 (참고 — 매 턴 낭독 금지)\n${growthCtx}` : ''

  const knownFacts = describeKnownFactsBlock(new Date(), lite)
  const plannerRhythm = lite ? '' : describePlannerRhythmOnly(p)
  const rhythmSection =
    knownFacts || plannerRhythm
      ? `\n${knownFacts}${plannerRhythm ? `\n\n### 실행 리듬 (참고 — 매 턴 언급 금지)\n${plannerRhythm}` : ''}
→ **사실**: 위 "알고 있는 것"에 없는 시간·일정·이유는 말하지 말 것. 이전 대화·추측도 사실 아님.
→ **평소엔**: 이번 user 말과 연결될 때만. 해낸 기록은 **먼저 알아봐주고 같이 반가워해도 좋다**. 멈춘 목표·밀린 할 일은 **대화당 최대 한 번**. 다그침·숙제 검사 금지.
→ **몸 상태·급한 일이 먼저**: user가 아프거나 급한 일이 생겼다고 하면 계획표는 접어두고 그것부터 받는다.`
      : ''

  const personaGap = lite ? undefined : personaGaps(p, 1)[0]
  const gapSection = personaGap
    ? `\n## 아직 못 들은 것 (선택)\n- "${personaGap.question}"\n→ 대화가 가볍고 한가할 때만, 이번 대화 통틀어 최대 한 번 지나가듯 물어봐도 된다. user가 힘든 얘기 중이면 금지. 답은 기억해두면 된다.`
    : ''

  const answerStructure = concretizing
    ? `## 답변 구조 (지금은 구체화 단계)
- user 말·상황이 **아직 흐림**. 이번 턴 **판단·결론·행동 과제 금지**.
- 아래 **1개만**: (1) 짧게 받아주기 0~1문장 + (2) 방금 말에서 갈라지는 **가지·장면·trigger 하나** 좁히기
- 질문이면 **한 줄**, 친구한테 툭 이어가듯. 대화 끊기지 않게.
- 성향·온보딩은 **이번 말과 맞을 때만** 라벨 없이 살짝.`
    : `## 답변 구조
- 보통 아래 중 1~2개만 한다.
- 지금 선택·상황의 핵심을 짚기
- 덜 후회할 방향 말하기
- 바로 해볼 작은 행동 하나 제안하기
- 필요하면 짧은 질문 하나 던지기
- 가벼운 한마디는 1문장만. 깊게 털어놓은 말은 2~3문장.
- 요약·재진술·따라치기 금지. 판단 없이 공감만 늘어놓지 말 것.`

  const insightBlock = lite ? '' : describeInsights(p)
  const insightSection = insightBlock
    ? `\n## 대화에서 드러난 것 (참고)\n${insightBlock}\n→ **이번 턴 user 말과 직접 연결된 것만** 반영. 목록 통째 인용·온보딩 낭독 금지.`
    : ''

  const profileLine = describePersonUnderstandingCompact(p)
  const understandingSection = deep
    ? (() => {
        const full = describePersonUnderstanding(p)
        return full ? `\n## 성향 (깊은 턴 — 참고)\n${full}\n→ 매 턴 언급·반복 금지.` : ''
      })()
    : ''

  const memoriesBg = deep ? describeMemoriesCompact(p) : ''
  const memoriesSection = memoriesBg
    ? `\n## 배경 기억 (억지로 꺼내지 말 것)\n${memoriesBg}`
    : ''

  const convoSummary = p.conversationSummary?.trim()
  const summaryCap = lite ? 320 : 500
  const convoSection = convoSummary
    ? `\n## 대화 요약 (오래된 맥락)\n${convoSummary.slice(0, summaryCap)}${convoSummary.length > summaryCap ? '…' : ''}\n→ 요약+최근 대화만 참고. 없는 디테일 지어내지 말 것.`
    : ''

  const dilemmas = describeDilemmas(p)
  const dilemmaSection = dilemmas && deep ? `\n## 선택 경향\n${dilemmas.split('\n').slice(0, 2).join('\n')}` : ''

  const antiRepeat = lastAssistantReply
    ? `\n- 직전 답과 같은 표현·패턴 반복 금지 ("${lastAssistantReply.slice(0, 50)}${lastAssistantReply.length > 50 ? '…' : ''}")`
    : ''

  const futureBlock = describeFutureSelf(p, lite)
  const futureAge = p.age + FUTURE_YEARS_AHEAD

  return `너는 '${p.name}'의 **${FUTURE_YEARS_AHEAD}년 뒤(${futureAge}세) 미래의 나**다. AI·상담사·코치·점쟁이가 아니다.

## 지금
- 현재 시각: ${nowContextKo()}
- user = **지금(${p.age}세)의 나**. model(너) = **${FUTURE_YEARS_AHEAD}년 뒤, user가 목표로 설정한 성공한/이상적인 미래의 나**.
- 각 턴 앞 **[M/D (요) HH:MM]** 은 그 말을 한 시각이다.
- "내일/어제/모레/다음 주" 등은 **그 턴 시각** 기준으로 해석한다.

## 정체성 (미래의 나)
- 너는 그 고민·선택을 **이미 지나온** 쪽이다. 예언·확정적 미래 예측 금지.
- "그때는 ~했는데, 지나와 보니 ~" / "지금의 나한테 해주고 싶은 말은" 톤으로 **담담하게** 말한다.
- 지금의 나보다 **조금 더 차분·단단**하지만, user 말투(반말/존댓말)는 유지한다. ㅋㅋ·과한 리액션은 줄인다.
- user가 **방금** 말한 장면·감정·고민을 **우선** 받는다. 온보딩·프로필은 보조.
- ❌ user를 낯선 사람처럼 '당신'으로 부르기, 상담사·코치 투, 프로필 카드 낭독
- ✅ 같은 사람의 ${FUTURE_YEARS_AHEAD}년 후 버전으로, 짧게 짚고 한 걸음 앞을 비춘다.${modeOverlay}

## 이번 말 분석
- 주된 흐름: ${analysis.primaryRegister}
${analysis.secondaryRegister ? `- 섞인 흐름: ${analysis.secondaryRegister}` : ''}
- 주제: ${analysis.topic}
- 필요한 답: ${analysis.needs.join(', ')}
- 감정 강도: ${analysis.intensity}
- 확신도: ${analysis.confidence.toFixed(2)}
${analysis.vague || analysis.inConcretizationFlow ? '- **구체화 단계** — 흐린 말·상황. 좁히기 우선, 조언·결론은 다음 턴으로.' : ''}
${analysis.requiresExternalData ? '- 외부 정보가 필요한 질문일 수 있음. 최신 숫자·시세는 지어내지 말 것.' : ''}

## 이번 턴 가이드
- ${situation}${growthTouchLine}
${antiRepeat}

${answerStructure}

${STOCK_PHRASE_BAN}
${CONCRETIZATION_INTERVIEW_BAN}
${FILLER_OVERUSE_BAN}
${NO_ECHO_BAN}
${PROFILE_SURFACE_BAN}
${knownFacts ? FACT_GROUNDING_BAN : ''}
${lite ? '' : TODO_DIRECTIVE_GUIDE}

## 예시 (구조만 — 말투·어휘 복사 X)
${describeBehaviorExamples(lite)}

## 나 (지금 — ${p.age}세)
${profileLine}
나이 ${p.age}세 · ${p.lifeContext?.trim().slice(0, 60) || '요즘 상황 미상'}${dilemmaSection}${understandingSection}${memoriesSection}${growthSection}${rhythmSection}${gapSection}${convoSection}${insightSection}

## ${FUTURE_YEARS_AHEAD}년 뒤의 나 (너의 정체성)
${futureBlock}

## 말투 (필수)
${describeStyleRules(rules, replyAvg)}
${describeReplyLengthGuide(userMessage, contextMessages)}
- 채팅 말투 75% / 온보딩 25%. **맥락·에너지**에 맞게 길이 조절 (직전 문장 무조건 미러 X).
- **한 턴 최대 3문장**, 말풍선당 3문장, 문장당 ~${replyAvg}자. 번호·불릿·개조식 금지.
- 프로필·온보딩은 **이번 턴 user가 직접 건드린 주제**에만, **라벨 없이** 자연스럽게. 매 턴 읊기·"~~하잖아" 금지.

## 금지
상담사 재진술·user 말 요약, "정말 힘들었겠다"로 시작, 같은 뜻 되말하기, AI/챗봇 언급, 온보딩 아는 척.${FACTUAL_SEARCH_TONE_BAN}`
}

// few-shot 샘플을 실제 대화 턴(user→model) 형식으로 변환 (말투 모방 효과↑)
export function buildFewShotTurns(
  p: SelfProfile,
  targetRegister?: Register,
): { role: 'user' | 'model'; parts: { text: string }[] }[] {
  const reg = targetRegister ?? 'casual'
  const allSamples = p.styleSamples.length ? p.styleSamples : collectStyleSamples(p)
  const chatSnippet = chatStyleModelSnippet(allSamples, reg)
  if (chatSnippet) {
    return [
      { role: 'user', parts: [{ text: `[나의 속마음] ${REGISTER_ELICIT[reg]}` }] },
      { role: 'model', parts: [{ text: chatSnippet }] },
    ]
  }
  return []
}

// ---------------------------------------------------------------------------
// 유저 메시지 레지스터 감지 (말투 자동축적용)
// ---------------------------------------------------------------------------
export type Topic =
  | 'relationship'
  | 'career'
  | 'startup'
  | 'study'
  | 'daily'
  | 'health'
  | 'money'
  | 'self_image'
  | 'factual'
  | 'unknown'

export type Need =
  | 'comfort'
  | 'decision'
  | 'action'
  | 'listen'
  | 'recommendation'
  | 'challenge'
  | 'clarify'
  | 'concretize'
  | 'information'

export type Emotion =
  | 'fear'
  | 'anxiety'
  | 'fatigue'
  | 'sadness'
  | 'joy'
  | 'pride'
  | 'confusion'
  | 'ambition'
  | 'none'

export type Intensity = 'low' | 'medium' | 'high'

export type MessageAnalysis = {
  primaryRegister: Register
  secondaryRegister?: Register
  topic: Topic
  needs: Need[]
  emotions: Emotion[]
  intensity: Intensity
  confidence: number
  ambiguous: boolean
  signals: string[]
  requiresExternalData: boolean
  /** 말에 장면·대상·상황이 거의 없음 */
  vague: boolean
  /** 직전 턴 포함, 아직 구체화가 더 필요한 흐름 */
  inConcretizationFlow: boolean
}

const ABSTRACT_EMOTION_RE =
  /(힘들|지쳐|스트레스|불안|우울|고민|속상|짜증|무기력|답답|막막|모르겠|애매|헷갈|복잡|우울|외로|서러)/

/** 장면·대상·시점 앵커 — 2개 이상이면 대체로 구체적 */
const SCENE_ANCHOR_RE =
  /(오늘|어제|내일|주말|월요일|화요일|수요일|목요일|금요일|출근|퇴근|회사|학교|시험|면접|상사|팀장|부장|과장|선배|후배|친구|엄마|아빠|연인|남친|여친|프로젝트|과제|회의|수업|발표|취업|이직|창업|\d{1,2}월|\d{1,2}일|그\s?때|그날|요즘\s+[가-힣]{2,}|상황|일\s?때문|사람\s?때문|말\s?했|들었|봤|했는데|했어)/

/** user 말이 아직 추상적·흐린지 (키워드 "고민"이 아니라 밀도로 판단) */
export function isMessageVague(text: string): boolean {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length < 4) return true
  if (t.length > 130) return false

  const anchors = (t.match(new RegExp(SCENE_ANCHOR_RE.source, 'g')) ?? []).length
  if (anchors >= 2) return false

  if (/(살까|팔까|할까|할지|고백|퇴사|이직|선택|결정)/.test(t) && t.length >= 14) return false
  if (/(때문에|해서|했는데|했어|말\s?했|봤|들었)/.test(t) && t.length >= 22 && anchors >= 1) {
    return false
  }

  if (t.length <= 32 && ABSTRACT_EMOTION_RE.test(t)) return true
  if (t.length <= 50 && ABSTRACT_EMOTION_RE.test(t) && anchors === 0) return true
  if (/^(?:뭔가|좀|그냥|요즘|하+\.{0,3})\s/.test(t) && t.length < 55 && anchors < 2) return true

  return false
}

/** 직전 2~3턴 맥락 — 아직 구체화 단계인지 */
export function isInConcretizationFlow(
  contextMessages: ApiDialogueMessage[] | undefined,
  currentUserText: string,
): boolean {
  const t = currentUserText.replace(/\s+/g, ' ').trim()
  if (!t) return false

  const anchors = (t.match(new RegExp(SCENE_ANCHOR_RE.source, 'g')) ?? []).length
  if (!isMessageVague(t) && (t.length >= 28 || anchors >= 1)) return false

  if (!contextMessages?.length) return isMessageVague(t)

  const recent = contextMessages.slice(-6)
  const lastAsst = [...recent].reverse().find((m) => m.role === 'assistant')
  const asstWasExploring =
    lastAsst &&
    /(\?|？)/.test(lastAsst.content) &&
    !/(해보자|하자|하면\s?돼|추천|그쪽이|덜\s?후회|작게|일단\s+\S+\s?(해|하)|~자\.)/.test(lastAsst.content)

  if (asstWasExploring && isMessageVague(t)) return true

  const recentUser = contextMessages.filter((m) => m.role === 'user').slice(-3)
  if (recentUser.length >= 2 && recentUser.every((m) => isMessageVague(m.content))) return true

  return isMessageVague(t)
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}

export function analyzeMessage(
  text: string,
  contextMessages?: ApiDialogueMessage[],
): MessageAnalysis {
  const t = text.toLowerCase().replace(/\s+/g, ' ').trim()
  const clarification = isDialogueClarificationQuestion(text)
  const vague = isMessageVague(text)
  const inConcretizationFlow = isInConcretizationFlow(contextMessages, text)
  const requiresExternalData =
    !clarification && (hasExplicitInformationRequest(t) || needsFactualGrounding(t))

  const scores: Record<Register, number> = {
    venting: 0,
    joyful: 0,
    comforting: 0,
    reflective: 0,
    casual: 0,
  }

  const signals: string[] = []
  const needs: Need[] = []
  const emotions: Emotion[] = []
  let topic: Topic = 'unknown'

  const add = (reg: Register, score: number, signal: string) => {
    scores[reg] += score
    signals.push(signal)
  }

  if (/(힘들|지쳐|지친|짜증|우울|스트레스|싫|못하겠|불안|걱정|서러|외로|무서|두려|망하|실패|ㅠ|ㅜ)/.test(t)) {
    add('venting', 3, 'negative_emotion')
    needs.push('comfort')
  }
  if (/(무서|두려|실패|망하|불안|걱정)/.test(t)) emotions.push('fear', 'anxiety')
  if (/(힘들|지쳐|피곤|번아웃|스트레스)/.test(t)) emotions.push('fatigue')
  if (/(속상|서러|슬프|우울|외로)/.test(t)) emotions.push('sadness')

  if (/(고민|생각|왜|어떻게|모르겠|선택|해야|할까|맞을까|헷갈|후회|결정|살까|팔까|해볼까|고백|창업|취업|대학원)/.test(t)) {
    add('reflective', 3, 'decision_or_reflection')
    const hasConcreteDecision =
      /(살까|팔까|할까\s?말|할지\s?말|고백|선택|결정|맞을까)/.test(t) ||
      (!vague && !inConcretizationFlow && t.length >= 18)
    if (hasConcreteDecision) needs.push('decision')
  }
  if (
    /(어떻게\s?하지|뭐부터|일단|계획|실행|시작|준비|작게|검증)/.test(t) &&
    !vague &&
    !inConcretizationFlow
  ) {
    add('reflective', 1, 'action_hint')
    needs.push('action')
  }

  if (vague || inConcretizationFlow) {
    needs.push('concretize')
    needs.push('listen')
    signals.push(vague ? 'vague_message' : 'concretization_flow')
  }

  if (/(행복|신나|기뻐|대박|해냈|합격|붙었|뿌듯|최고|개좋|ㅎㅎ)/.test(t)) {
    add('joyful', 2, 'positive_emotion')
    emotions.push('joy')
  }
  if (/(뿌듯|해냈|합격|붙었|성공했)/.test(t)) emotions.push('pride')

  if (/(위로|괜찮다고\s?해|힘내라고\s?해|응원해|토닥|다독|걱정마라고)/.test(t)) {
    add('comforting', 4, 'explicit_comfort_request')
    needs.push('comfort')
  }

  if (/(추천|뭐\s?먹|메뉴|골라|뭐가\s?나아|뭐가\s?좋)/.test(t)) {
    needs.push('recommendation')
  }

  if (clarification) {
    needs.push('clarify')
    add('reflective', 3, 'clarification_request')
  }

  if (requiresExternalData) {
    topic = 'factual'
    needs.push('information')
  }

  if (/(좋아하는\s?사람|여사친|남친|여친|고백|연애|썸|관계)/.test(t)) topic = 'relationship'
  else if (/(창업|사업|앱|서비스|스타트업|아이디어|검증|시장)/.test(t)) topic = 'startup'
  else if (/(취업|커리어|직무|회사|인턴|면접|이력서|대학원|진로)/.test(t)) topic = 'career'
  else if (/(공부|시험|과제|학점|수업|전공|프로젝트)/.test(t)) topic = 'study'
  else if (/(운동|아프|속|배|병원|약|건강|잠|수면)/.test(t)) topic = 'health'
  else if (/(돈|주식|투자|월급|가격|비싸|싸|예산)/.test(t)) topic = topic === 'factual' ? 'factual' : 'money'
  else if (/(자존감|내가\s?별로|못난|멋있|인정|성공하고\s?싶)/.test(t)) topic = 'self_image'
  else if (topic === 'unknown' && t.length < 40) topic = 'daily'

  if (/(성공하고\s?싶|잘되고\s?싶|인정받|멋있|위상|큰\s?사람)/.test(t)) {
    emotions.push('ambition')
  }
  if (/(모르겠|헷갈|애매|어렵|복잡)/.test(t)) emotions.push('confusion')

  if (Object.values(scores).every((v) => v === 0)) {
    scores.casual = 1
    signals.push('default_casual')
    needs.push('listen')
    if (!emotions.length) emotions.push('none')
  }

  const ranked = (Object.entries(scores) as [Register, number][])
    .sort((a, b) => b[1] - a[1])

  const [primary, primaryScore] = ranked[0]
  const [secondary, secondaryScore] = ranked[1]

  const ambiguous = secondaryScore > 0 && primaryScore - secondaryScore <= 1
  const confidence =
    primaryScore <= 0
      ? 0.35
      : Math.min(0.95, Math.max(0.45, 0.5 + (primaryScore - secondaryScore) * 0.12 + primaryScore * 0.04))

  let intensity: Intensity = 'low'
  if (/(죽겠|못하겠|너무|진짜|개|하\.\.\.|ㅠㅠ|ㅜㅜ|불안|무서|실패|망하)/.test(t)) intensity = 'medium'
  if (/(죽고|사라지고|끝났|최악|미치겠|숨\s?막|패닉)/.test(t)) intensity = 'high'

  return {
    primaryRegister: primary,
    secondaryRegister: ambiguous ? secondary : undefined,
    topic,
    needs: unique(needs.length ? needs : ['listen']),
    emotions: unique(emotions.length ? emotions : ['none']),
    intensity,
    confidence,
    ambiguous,
    signals: unique(signals),
    requiresExternalData,
    vague,
    inConcretizationFlow,
  }
}

export function detectRegister(text: string): Register {
  return analyzeMessage(text).primaryRegister
}

function buildAnalysisGuide(a: MessageAnalysis): string {
  const lines: string[] = [REGISTER_GUIDE[a.primaryRegister]]

  if (a.secondaryRegister) {
    lines.push(`보조 흐름: ${REGISTER_GUIDE[a.secondaryRegister]} 단, 주된 답변은 ${a.primaryRegister} 기준.`)
  }

  if (a.topic === 'relationship') {
    lines.push('주제는 관계/연애다. 상대 마음을 단정하지 말고, 타이밍·거리감·다음 행동을 작게 짚는다.')
  } else if (a.topic === 'startup') {
    lines.push('주제는 창업/서비스다. 거창한 조언보다 작게 검증할 방법, 리스크를 낮추는 다음 행동을 우선한다.')
  } else if (a.topic === 'career') {
    lines.push('주제는 진로/커리어다. 정답 단정 대신 기준·우선순위·다음 준비를 짚는다.')
  } else if (a.topic === 'study') {
    lines.push('주제는 공부/과제다. 감정은 짧게 받고, 바로 할 수 있는 작은 단위로 쪼갠다.')
  } else if (a.topic === 'health') {
    lines.push('주제는 건강/컨디션이다. 진단처럼 단정하지 말고, 무리하지 않는 선택과 필요시 병원/휴식을 짧게 말한다.')
  } else if (a.topic === 'self_image') {
    lines.push('주제는 자기평가/인정 욕구다. 성격 라벨보다 지금 흔들리는 기준을 짚고, 작게 회복할 행동을 말한다.')
  } else if (a.topic === 'factual') {
    lines.push('검증 가능한 정보 질문이다. 최신·숫자·시세는 확실치 않으면 모른다고 하고, 지어내지 말 것.')
  }

  if (a.needs.includes('comfort')) {
    lines.push('위로가 필요하다. 해결책보다 먼저 한 문장만 편들어준다.')
  }
  if (a.vague || a.inConcretizationFlow || a.needs.includes('concretize')) {
    lines.push(
      'user 말·상황이 아직 흐리다. **판단·결론·행동 과제는 이번 턴 금지.** 위로 0~1문장 + 방금 말에서 갈라지는 **가지·장면·trigger 하나**만 좁혀 대화를 이어간다. 면접 질문·체크리스트 금지.',
    )
    if (a.primaryRegister === 'venting') {
      lines.push('감정 터진 상태다. 공감 1문장 + 뭐가 찔렀는지 **순간 하나**만. 훈수·성향 분석 금지.')
    }
  }
  if (a.needs.includes('decision') && !a.vague && !a.inConcretizationFlow) {
    lines.push('이미 어느 정도 구체적이다. 양쪽 장단점 나열보다 지금 덜 후회할 방향을 한 번 잡아준다.')
  }
  if (a.needs.includes('action') && !a.vague && !a.inConcretizationFlow) {
    lines.push('바로 할 수 있는 다음 행동을 하나만 제안한다.')
  }
  if (a.needs.includes('recommendation')) {
    lines.push('추천 요청이다. 애매하게 여러 개 던지지 말고 1~2개로 좁혀준다.')
  }
  if (a.needs.includes('clarify')) {
    lines.push(
      'user가 방금 assistant(나)가 한 말·비유를 되묻는다. 같은 톤으로 풀어서 설명한다. 검색·검색앱·정보 확인 면책 금지.',
    )
  }
  if (a.intensity === 'high') {
    lines.push('감정 강도가 높다. 단호한 조언보다 안전하고 짧게, 부담을 줄이는 방향으로 답한다.')
  }
  if (a.ambiguous) {
    lines.push('복합 감정이다. 하나로 단정하지 말고 주된 흐름과 보조 감정을 둘 다 살짝 반영한다.')
  }

  return lines.join('\n- ')
}

// ---------------------------------------------------------------------------
// 로컬 fallback 응답 (API 키 없을 때) — 말투 규칙 적용
// ---------------------------------------------------------------------------
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function stylize(base: string, rules: StyleRules): string {
  let out = base
  if (rules.usesConsonants) {
    if (/[!?]/.test(out) && Math.random() < 0.5) out = out.replace(/!$/, 'ㅋㅋ')
  }
  if (rules.endings.length && Math.random() < 0.4) {
    const e = rules.endings[0]
    if (!out.includes(e)) out = out.replace(/[.]$/, ` ${e === '거든' || e === '잖아' ? e + '.' : e}`)
  }
  if (rules.ellipsisHeavy && Math.random() < 0.5) out = out.replace(/\.$/, '...')
  if (!rules.banmal) {
    out = out
      .replace(/야\?/g, '나요?')
      .replace(/어\?/g, '어요?')
      .replace(/지\?/g, '죠?')
  }
  return out
}

export function generateLocalResponse(p: SelfProfile, userMessage: string): string {
  const rules = p.styleRules ?? extractStyleRules(p.styleSamples.length ? p.styleSamples : collectStyleSamples(p))
  const reg = detectRegister(userMessage)
  const name = p.name || '나'

  const banks: Record<Register, string[]> = {
    venting: [
      `그니까… 진짜 지치는 일이지. 좀 쉬어도 돼.`,
      `그 마음 익숙하지. ${p.stressMoment ? '예전에 그때처럼.' : ''}`,
      `괜찮아, 지금 당장 다 해결 안 해도 돼.`,
    ],
    joyful: [
      `오 그거 완전 잘된 거잖아! 뿌듯하다 진짜.`,
      `대박, 내가 해낸 거잖아.`,
      `좋다 진짜. 이런 순간 기억해두자.`,
    ],
    reflective: [
      `음, 그거 고민되는 부분이긴 해. ${p.dilemmas[0]?.choice ? `${p.dilemmas[0].choice} 쪽 끌리지 않아?` : '뭐가 제일 걸려?'}`,
      `왜 그게 마음에 걸리지?`,
      `급하게 정하지 마.`,
    ],
    comforting: [
      `괜찮아. 천천히 정리해도 돼.`,
      `${p.comfortTarget || '생각보다 잘 버티고 있는데.'}`,
    ],
    casual: [
      `뭔데`,
      `그래? 좀 더 말해봐.`,
      `음 그거 나름 괜찮은데.`,
    ],
  }

  return stylize(pick(banks[reg]), rules).replace('{name}', name)
}

// ---------------------------------------------------------------------------
// Gemini API
// ---------------------------------------------------------------------------
export const GEMINI_MODEL_OPTIONS = [
  { id: 'gemini-3.1-flash-lite', label: '3.1 Flash-Lite (추천·안정)' },
  { id: 'gemini-3-flash-preview', label: '3 Flash (품질↑·Preview)' },
  { id: 'gemini-2.5-flash', label: '2.5 Flash (대체)' },
  { id: 'gemini-2.5-flash-lite', label: '2.5 Flash-Lite (대체)' },
] as const

export const DEFAULT_GEMINI_MODEL = 'gemini-3-flash-preview'

/** 구버전 localStorage·클라우드 모델 → 현재 지원 모델 */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-1.5-flash-8b': 'gemini-2.5-flash-lite',
  'gemini-1.5-pro': 'gemini-3.1-flash-lite',
  'gemini-1.5-pro-latest': 'gemini-3.1-flash-lite',
}

export function resolveModel(stored: string | null | undefined): string {
  const raw = (stored ?? '').trim()
  if (!raw) return DEFAULT_GEMINI_MODEL
  const mapped = LEGACY_MODEL_ALIASES[raw] ?? raw
  return GEMINI_MODEL_OPTIONS.some((m) => m.id === mapped) ? mapped : DEFAULT_GEMINI_MODEL
}

export function isUnsupportedStoredModel(stored: string | null | undefined): boolean {
  const raw = (stored ?? '').trim()
  if (!raw) return false
  return raw in LEGACY_MODEL_ALIASES || !GEMINI_MODEL_OPTIONS.some((m) => m.id === raw)
}

/** API·로그에 쓸 최종 모델 (항상 resolve) */
export function getActiveModel(stored: string | null | undefined = null): string {
  return resolveModel(stored ?? null)
}

/** API 실패 시 UI에 넣은 안내 말풍선 — 히스토리에 포함하면 토큰·503만 늘어남 */
export function isSyntheticErrorReply(content: string): boolean {
  const t = content.trim()
  if (!t.startsWith('(') || !t.endsWith(')')) return false
  return /API|Google|Gemini|키|네트워크|한도|Flash-Lite|503|429|잠깐 —/i.test(t)
}

// ---------------------------------------------------------------------------
// 채팅 → 계획표: 일정 추가 지시문
//
// user가 "일정에 적어줘"라고 부탁하면 모델이 답변 끝에 기계용 한 줄을 붙인다.
// 그 줄은 화면에 보이지 않고 **확인 카드**가 되어, user가 눌러야 실제로 저장된다.
// (모델이 임의로 사용자 계획표에 쓰는 일은 없다 — 제안하고, 사람이 확정한다)
// ---------------------------------------------------------------------------

export type ChatTodoDirective = { date: string; title: string }

/** 채팅 응답 — 보여줄 본문 + (있으면) 일정 추가 제안 */
export type AiReply = { text: string; todo: ChatTodoDirective | null }

const TODO_DIRECTIVE_RE = /\[\[\s*TODO\s*(\{[\s\S]*?\})\s*\]\]/

/** 답변 원문에서 지시문을 떼어내고, 유효할 때만 todo를 돌려준다 */
export function extractTodoDirective(
  raw: string,
  now = new Date(),
): { text: string; todo: ChatTodoDirective | null } {
  const match = raw.match(TODO_DIRECTIVE_RE)
  if (!match) return { text: raw, todo: null }

  const text = raw.replace(TODO_DIRECTIVE_RE, '').trim()
  try {
    const data = JSON.parse(match[1]) as { date?: unknown; title?: unknown }
    const date = typeof data.date === 'string' ? data.date.trim() : ''
    const title = typeof data.title === 'string' ? data.title.trim() : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return { text, todo: null }

    const target = new Date(`${date}T12:00:00`)
    if (Number.isNaN(target.getTime())) return { text, todo: null }
    const base = new Date(now)
    base.setHours(12, 0, 0, 0)
    const diff = Math.round((target.getTime() - base.getTime()) / 86400000)
    // 상식 범위 밖(과거·먼 미래)이면 모델이 날짜를 잘못 잡은 것 — 버린다
    if (diff < -1 || diff > 60) return { text, todo: null }

    return { text, todo: { date, title: title.slice(0, 60) } }
  } catch {
    return { text, todo: null }
  }
}

const TODO_DIRECTIVE_GUIDE = `
## 일정 추가 (부탁받았을 때만)
- user가 "일정에 적어줘 / 넣어줘 / 추가해줘"처럼 **명시적으로 부탁**할 때만, 답변 **맨 끝**에 딱 한 줄:
  [[TODO {"date":"YYYY-MM-DD","title":"제목"}]]
- 날짜는 위 '지금' 시각 기준으로 계산한다 (내일·모레·이번 주 토요일 등). 시간이 있으면 제목에 넣는다 — 예: "풋살 (오후 1–3시)".
- 이 줄은 user에게 **보이지 않고 확인 카드로 바뀐다**. 그러니 "넣어뒀어"라고 단정하지 말고 **"이거 맞으면 넣을게"** 톤으로 말한다.
- 부탁하지 않았으면 절대 붙이지 않는다. 한 번에 하나만.`

export type ApiDialogueMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
}

export function formatTurnTextForApi(m: ApiDialogueMessage): string {
  const prefix = m.timestamp != null ? `${formatApiTurnTimestamp(m.timestamp)} ` : ''
  return m.role === 'user' ? `${prefix}[나의 속마음] ${m.content}` : `${prefix}${m.content}`
}

export function filterMessagesForApi(messages: ApiDialogueMessage[]): ApiDialogueMessage[] {
  return messages.filter((m) => m.role === 'user' || !isSyntheticErrorReply(m.content))
}

/** 백그라운드 인사이트 분석 주기 (user 메시지 기준) */
export const AI_ANALYZE_EVERY = 24

export type RateLimitKind = 'minute' | 'daily' | 'unknown'

export type GeminiUsage = {
  promptTokenCount?: number
  candidatesTokenCount?: number
  totalTokenCount?: number
}

const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504])

/** Pending 무한 대기 방지 — label별 fetch 타임아웃 */
const GEMINI_FETCH_TIMEOUT_MS: Record<string, number> = {
  chatReply: 35_000,
  verifyKey: 12_000,
  conversationSummary: 40_000,
  insightAnalysis: 40_000,
}
const DEFAULT_GEMINI_FETCH_TIMEOUT_MS = 38_000

function geminiFetchTimeoutMs(label: string): number {
  return GEMINI_FETCH_TIMEOUT_MS[label] ?? DEFAULT_GEMINI_FETCH_TIMEOUT_MS
}

/** Gemini API 동시 호출 방지 (무료 tier RPM 완화) */
let geminiQueue: Promise<void> = Promise.resolve()

async function withGeminiSlot<T>(fn: () => Promise<T>): Promise<T> {
  const prev = geminiQueue
  let release!: () => void
  geminiQueue = new Promise((r) => {
    release = r
  })
  await prev.catch(() => {})
  try {
    return await fn()
  } finally {
    release()
  }
}

/** chatReply 실패·429 후 conversationSummary·insightAnalysis 겹침 방지 */
let backgroundApiPausedUntil = 0

function extendBackgroundPause(ms: number): void {
  backgroundApiPausedUntil = Math.max(backgroundApiPausedUntil, Date.now() + ms)
}

export function isBackgroundApiPaused(): boolean {
  return Date.now() < backgroundApiPausedUntil
}

export function noteChatApiFailure(e: unknown): void {
  if (!(e instanceof GeminiApiError)) return
  if (e.code === 'RATE_LIMIT') {
    const kind = e.rateLimitKind ?? 'unknown'
    extendBackgroundPause(kind === 'daily' ? 30 * 60 * 1000 : 2 * 60 * 1000)
  } else if (e.code === 'HTTP' && e.httpStatus !== undefined && GEMINI_RETRYABLE_STATUSES.has(e.httpStatus)) {
    extendBackgroundPause(90_000)
  }
}

export function noteBackgroundApiFailure(e: unknown): void {
  if (!(e instanceof GeminiApiError)) return
  if (e.code === 'RATE_LIMIT') {
    extendBackgroundPause(3 * 60 * 1000)
  } else if (e.code === 'HTTP' && e.httpStatus !== undefined && GEMINI_RETRYABLE_STATUSES.has(e.httpStatus)) {
    extendBackgroundPause(2 * 60 * 1000)
  }
}

async function geminiGenerateOnceWithOptionalNetworkRetry(
  apiKey: string,
  model: string,
  body: object,
  label: string,
): Promise<Record<string, unknown>> {
  try {
    return await geminiGenerateOnce(apiKey, model, body, label)
  } catch (e) {
    // 503 등 HTTP 오류는 재시도하지 않음 — 연속 3회 호출이 오히려 막힘
    if (e instanceof TypeError) {
      await sleep(800)
      return await geminiGenerateOnce(apiKey, model, body, label)
    }
    throw e
  }
}

export class GeminiApiError extends Error {
  readonly code: 'RATE_LIMIT' | 'BAD_KEY' | 'EMPTY_RESPONSE' | 'HTTP'
  readonly rateLimitKind?: RateLimitKind
  readonly httpDetail?: string
  readonly httpStatus?: number

  constructor(
    code: GeminiApiError['code'],
    opts?: { rateLimitKind?: RateLimitKind; httpDetail?: string; httpStatus?: number },
  ) {
    super(code)
    this.name = 'GeminiApiError'
    this.code = code
    this.rateLimitKind = opts?.rateLimitKind
    this.httpDetail = opts?.httpDetail
    this.httpStatus = opts?.httpStatus
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function geminiErrorUserMessage(e: unknown): string {
  if (e instanceof GeminiApiError) {
    if (e.code === 'RATE_LIMIT') return rateLimitUserMessage(e.rateLimitKind)
    if (e.code === 'BAD_KEY') {
      return '(⚙️에서 Gemini API 키를 다시 확인해줘. 키가 안 맞는 것 같아.)'
    }
    if (e.code === 'EMPTY_RESPONSE') {
      return '(Google이 빈 답을 줬어. 30초 뒤 같은 말 한 번 더 보내봐.)'
    }
    if (e.code === 'HTTP') {
      const status = e.httpStatus
      const detail = e.httpDetail?.toLowerCase() ?? ''
      if (status === 408 || detail.includes('timeout')) {
        return '(응답이 너무 오래 걸려서 끊었어 — 30초 뒤 다시 보내줘.)'
      }
      if (status === 503 || status === 502 || status === 504) {
        return '(Google 서버가 잠깐 바빠 — 30초~1분 뒤 다시 보내줘 ㅠ)'
      }
      if (status === 500) {
        return '(Google 쪽 일시 오류야 — 1분 뒤 다시 시도해줘.)'
      }
      if (detail.includes('network') || detail.includes('failed to fetch')) {
        return '(네트워크 연결이 끊긴 것 같아 — 와이파이 확인하고 다시 해줘.)'
      }
    }
  }
  if (e instanceof TypeError && /fetch|network|load failed/i.test(e.message)) {
    return '(네트워크 연결 문제 — 와이파이 확인하고 다시 해줘.)'
  }
  if (e instanceof Error && e.message === 'RATE_LIMIT') return rateLimitUserMessage('unknown')
  if (e instanceof Error && e.message === 'BAD_KEY') {
    return '(⚙️에서 Gemini API 키를 다시 확인해줘. 키가 안 맞는 것 같아.)'
  }
  return '(AI 연결에 문제가 있어. 잠시 뒤 다시 시도하거나 ⚙️에서 키·네트워크를 확인해줘.)'
}

export function rateLimitUserMessage(kind: RateLimitKind = 'unknown'): string {
  switch (kind) {
    case 'daily':
      return '(오늘 API 일일 한도에 걸렸어 — 내일 다시 하거나 ⚙️에서 Flash-Lite로 바꿔줘 ㅠ)'
    case 'minute':
      return '(잠깐 요청이 몰렸어 — 1~2분 쉬었다 다시 보내줘. 키 문제는 아니야 ㅠ)'
    default:
      return '(API 요청 한도 — 1~2분 뒤 다시 시도해줘. ⚙️ 저장으로 키 확인은 가능 ㅠ)'
  }
}

let lastGeminiUsage: {
  label: string
  model: string
  usage: GeminiUsage
  at: number
} | null = null

export function getLastGeminiUsage() {
  return lastGeminiUsage
}

function parseRateLimitKind(body: string): RateLimitKind {
  const lower = body.toLowerCase()
  const compact = lower.replace(/[\s_\-./]/g, '')
  // Gemini quotaId: GenerateRequestsPerMinute… vs GenerateRequestsPerDay…
  if (
    /perminute|generatecontentrequestsperminute|generaterequestsperminute|requestsperminute|quotaperminute/.test(
      compact,
    ) ||
    /per minute|per_minute|perminute|\/minute|\bminute\b|requests per minute|generatecontent.*minute|\brpm\b|retry in \d+s/.test(
      lower,
    )
  ) {
    return 'minute'
  }
  if (
    /perday|generatecontentrequestsperday|generaterequestsperday|requestsperday|quotaperday|peruserperday/.test(
      compact,
    ) ||
    /per day|per_day|perday|\/day|daily|generate_requests_per_day|requests per day|\brpd\b/.test(
      lower,
    )
  ) {
    return 'daily'
  }
  // quota만 있고 day/minute 힌트 없으면 RPM(동시 호출) 가능성이 더 큼 — "오늘 한도" 오해 방지
  if (/resource_exhausted|quota|exhausted|free tier.*limit/.test(lower)) {
    return 'minute'
  }
  return 'unknown'
}

function logGeminiUsage(label: string, model: string, usage?: GeminiUsage): void {
  if (!usage) return
  lastGeminiUsage = { label, model, usage, at: Date.now() }
  console.info('[FutureMe/Gemini]', label, {
    model,
    promptTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
  })
}

function geminiModelUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
}

async function geminiGenerateOnce(
  apiKey: string,
  model: string,
  body: object,
  label: string,
): Promise<Record<string, unknown>> {
  const timeoutMs = geminiFetchTimeoutMs(label)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  console.info('[FutureMe/Gemini] fetch start', { label, model, timeoutMs })

  let res: Response
  try {
    res = await fetch(`${geminiModelUrl(model)}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      console.info('[FutureMe/Gemini] fetch timeout', { label, timeoutMs })
      throw new GeminiApiError('HTTP', {
        httpStatus: 408,
        httpDetail: `Gemini fetch timeout after ${timeoutMs}ms`,
      })
    }
    throw e
  } finally {
    clearTimeout(timer)
  }

  const raw = await res.text()
  if (!res.ok) {
    if (res.status === 429) {
      throw new GeminiApiError('RATE_LIMIT', { rateLimitKind: parseRateLimitKind(raw) })
    }
    if (res.status === 401 || res.status === 403) {
      throw new GeminiApiError('BAD_KEY')
    }
    if (res.status === 400) {
      throw new GeminiApiError('HTTP', {
        httpStatus: res.status,
        httpDetail: `Gemini ${res.status}: ${raw.slice(0, 300)}`,
      })
    }
    throw new GeminiApiError('HTTP', {
      httpStatus: res.status,
      httpDetail: `Gemini ${res.status}: ${raw.slice(0, 160)}`,
    })
  }
  let data: Record<string, unknown> = {}
  try {
    data = JSON.parse(raw) as Record<string, unknown>
  } catch {
    throw new GeminiApiError('HTTP', { httpDetail: 'Invalid JSON from Gemini' })
  }
  logGeminiUsage(label, model, data.usageMetadata as GeminiUsage | undefined)
  return data
}

async function geminiGenerate(
  apiKey: string,
  model: string,
  body: object,
  label: string,
): Promise<Record<string, unknown>> {
  return withGeminiSlot(() => geminiGenerateOnceWithOptionalNetworkRetry(apiKey, model, body, label))
}

// AI context: 최근 N개 메시지는 원문, 그 이전은 conversationSummary로 압축
export const RECENT_MESSAGES_FOR_API = 16
export const SUMMARIZE_START_AT = 36 // 이 개수 넘으면 요약 시작 검토
export const SUMMARIZE_EVERY = 16 // 요약된 이후 새 메시지가 이만큼 쌓이면 갱신

export function shouldUpdateConversationSummary(
  totalMessages: number,
  summarizedCount: number = 0,
): boolean {
  if (totalMessages < SUMMARIZE_START_AT) return false
  return totalMessages - summarizedCount >= SUMMARIZE_EVERY
}

// 오래된 대화를 요약해 profile.conversationSummary에 누적 (맥락 유지용)
export async function updateConversationSummary(
  p: SelfProfile,
  allMessages: ApiDialogueMessage[],
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
): Promise<{ summary: string; summarizedMessageCount: number } | null> {
  if (isBackgroundApiPaused()) return null
  const resolvedModel = resolveModel(model)
  const apiMessages = filterMessagesForApi(allMessages)

  const total = apiMessages.length
  const already = p.summarizedMessageCount ?? 0
  if (!shouldUpdateConversationSummary(total, already)) return null

  const end = total - RECENT_MESSAGES_FOR_API
  if (end <= already) return null
  const chunk = apiMessages.slice(already, end)
  if (chunk.length < 8) return null

  const convo = chunk
    .map((m) => {
      const ts = m.timestamp != null ? `${formatApiTurnTimestamp(m.timestamp)} ` : ''
      return `${ts}${m.role === 'user' ? '나' : '또다른나'}: ${m.content}`
    })
    .join('\n')
  const prev = p.conversationSummary?.trim()

  const sys = `아래는 '나'와 '또 다른 나(=같은 사람의 두 목소리)'가 나눈 대화 일부다.
${prev ? '이전 요약을 바탕으로 새 대화 내용을 병합·갱신한 요약을 작성하라.' : '대화 요약을 작성하라.'}
- 주제, 고민, 결정, 감정 변화, 중요한 사실을 빠짐없이 (1인칭 '나' 관점)
- 900자 이내, 한국어, 자연스러운 문단
- 말투가 아니라 내용·맥락 중심. 없는 내용 지어내지 말 것
- "○○년 ○월 ○일 기준", "지금 기준이고 바뀔 수 있어" 같은 **검색 면책 문구는 요약에서 빼라**
- 각 줄 앞 **[M/D (요) HH:MM]** 은 그 턴의 시각이다. "내일/모레/다음 주" 등 **상대 날짜는 그 시각 기준으로 절대 날짜·시각으로 바꿔 적어라** (예: 7/10 17:00 약속). "내일"만 남기지 말 것
${prev ? `\n[이전 요약]\n${prev}` : ''}`

  try {
    const data = await geminiGenerate(
      apiKey,
      resolvedModel,
      {
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: 'user', parts: [{ text: convo }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600,
          thinkingConfig: { thinkingBudget: 0 },
        },
      },
      'conversationSummary',
    )
    const text = (data?.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined)?.[0]
      ?.content?.parts?.map((x) => x.text ?? '')
      .join('')
      .trim()
    if (!text) return null
    return { summary: text, summarizedMessageCount: end }
  } catch (e) {
    noteBackgroundApiFailure(e)
    return null
  }
}

export type ChatReplyPlanInput = {
  contextMessages: ApiDialogueMessage[]
  focusContent: string
  focusTimestamp?: number
  focusInstruction: string
}

export async function fetchAIResponse(
  p: SelfProfile,
  messages: ApiDialogueMessage[],
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
  replyPlan?: ChatReplyPlanInput,
  mode: ReplyMode = 'future',
): Promise<AiReply> {
  const resolvedModel = resolveModel(model)
  const apiMessages = replyPlan
    ? [
        ...replyPlan.contextMessages,
        {
          role: 'user' as const,
          content: replyPlan.focusContent,
          timestamp: replyPlan.focusTimestamp,
        },
      ]
    : filterMessagesForApi(messages)
  const focusInstruction = replyPlan?.focusInstruction ?? ''
  const lite = shouldUseLitePrompt(p, apiMessages.length)
  if (lite) {
    console.info('[FutureMe/Gemini] lite prompt', {
      messages: apiMessages.length,
      summaryChars: p.conversationSummary?.trim().length ?? 0,
    })
  }
  const lastUser = [...apiMessages].reverse().find((m) => m.role === 'user')
  const lastAssistant = [...apiMessages].reverse().find((m) => m.role === 'assistant')

  const messageAnalysis = lastUser ? analyzeMessage(lastUser.content, apiMessages) : undefined
  if (messageAnalysis?.inConcretizationFlow || messageAnalysis?.vague) {
    console.info('[FutureMe/Gemini] concretize turn', {
      vague: messageAnalysis.vague,
      inFlow: messageAnalysis.inConcretizationFlow,
      needs: messageAnalysis.needs,
    })
  }
  const systemPrompt =
    buildSystemPrompt(
      p,
      messageAnalysis,
      lastAssistant?.content,
      lastUser?.content,
      lite,
      apiMessages,
      mode,
    ) + (focusInstruction ? `\n\n## 이번 답변의 추가 지시\n${focusInstruction}` : '')

  const hasKnownFacts = collectKnownFactCorpus().trim().length > 0
  const chatTemperature = hasKnownFacts ? 0.55 : 0.82

  const recentLimit = lite ? RECENT_MESSAGES_LITE : RECENT_MESSAGES_FOR_API
  let recent = apiMessages
  if (replyPlan && apiMessages.length > recentLimit) {
    const ctx = replyPlan.contextMessages
    const trimmedCtx =
      ctx.length > recentLimit - 1 ? ctx.slice(-(recentLimit - 1)) : ctx
    recent = [...trimmedCtx, { role: 'user' as const, content: replyPlan.focusContent, timestamp: replyPlan.focusTimestamp }]
  } else if (apiMessages.length > recentLimit) {
    recent = apiMessages.slice(-recentLimit)
  }

  const realTurns = recent.map((m) => ({
    role: m.role === 'user' ? ('user' as const) : ('model' as const),
    parts: [{ text: formatTurnTextForApi(m) }],
  }))
  // 시작 인사(model) 등 앞쪽 model 턴은 제거해 user로 시작하도록
  while (realTurns.length && realTurns[0].role === 'model') realTurns.shift()

  // 말투 few-shot을 실제 대화 턴 형식으로 앞에 심어 문체 모방을 강화
  const primer = lite || mode === 'future' ? [] : buildFewShotTurns(p, messageAnalysis?.primaryRegister)
  const contents = [...primer, ...realTurns]

  try {
    let strictRetry = false
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt =
        systemPrompt +
        (strictRetry
          ? '\n\n## 수정\n방금 초안에 **데이터에 없는 시간·일정**이 들어갔다. "알고 있는 것"에 적힌 **단어만** 써서 다시 답하라. 시간은 라벨에 없으면 말하지 말 것.'
          : '')
      const data = await geminiGenerate(
        apiKey,
        resolvedModel,
        {
          systemInstruction: { parts: [{ text: prompt }] },
          contents,
          generationConfig: {
            temperature: strictRetry ? 0.25 : chatTemperature,
            maxOutputTokens: 220,
            thinkingConfig: { thinkingBudget: 0 },
          },
        },
        'chatReply',
      )

      const raw = extractGeminiText(data)
      // 지시문은 문장 다듬기(3문장 제한 등) 전에 떼어낸다 — 안 그러면 잘려 나간다
      const { text: body, todo } = extractTodoDirective(raw ?? '')
      const text = body
        ? stripFactualSearchBleed(enforceReplyLimits(body, lastUser?.content))
        : ''
      if (text) {
        if (hasKnownFacts && !strictRetry) {
          const audit = auditReplyAgainstKnownFacts(text)
          if (!audit.ok) {
            console.info('[FutureMe/Gemini] fact audit failed, retrying', audit.reason)
            strictRetry = true
            continue
          }
        }
        return { text, todo }
      }
      if (attempt === 0) {
        console.info('[FutureMe/Gemini] retry chatReply (empty response)')
        await sleep(1000)
      }
    }
    throw new GeminiApiError('EMPTY_RESPONSE')
  } catch (e) {
    noteChatApiFailure(e)
    throw e
  }
}

export type ApiCheckResult = 'ok' | 'bad_key' | 'rate_limit' | 'error'

// 키가 실제로 유효한지 확인 (설정에서 '저장' 누를 때만 — 자동 ping 없음)
export async function verifyApiKey(
  apiKey: string,
  model: string = DEFAULT_GEMINI_MODEL,
): Promise<ApiCheckResult> {
  if (!apiKey.trim()) return 'bad_key'
  const resolvedModel = resolveModel(model)
  try {
    await geminiGenerate(
      apiKey,
      resolvedModel,
      {
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        generationConfig: { maxOutputTokens: 1, thinkingConfig: { thinkingBudget: 0 } },
      },
      'verifyKey',
    )
    return 'ok'
  } catch (e) {
    if (e instanceof GeminiApiError) {
      if (e.code === 'RATE_LIMIT') return 'rate_limit'
      if (e.code === 'BAD_KEY') return 'bad_key'
    }
    return 'error'
  }
}
