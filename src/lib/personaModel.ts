// ---------------------------------------------------------------------------
// 페르소나 모델 — SelfProfile의 ~30개 평면 필드를 구조화한 단일 진실 공급원.
//
// 온보딩 질문·프롬프트·프로필 UI가 각자 필드를 직접 뒤지는 대신, 여기서
// "어떤 필드가 페르소나의 어느 축(facet)이고 얼마나 중요한지(tier)"를 한 번만
// 정의한다. 이 모델이 하는 일 세 가지:
//
//  1. 충실도(completeness) — 페르소나가 얼마나 채워졌는지 점수화
//  2. 빈 곳 감지(gaps) — 지금 채우면 대화 품질이 가장 좋아질 질문 추천
//  3. 프롬프트 렌더링 — 중요한 것부터, 빈 필드는 빼고, 길이는 티어별로 잘라서
//
// tier 기준:
//  - core:    없으면 "미래의 나"가 남처럼 말한다 (정체성·말투·생생한 하루)
//  - support: 대화의 깊이를 만든다 (가치관·서사·성장 축)
//  - color:   있으면 디테일이 풍부해진다 (돈·집·건강 같은 삶의 단면)
// ---------------------------------------------------------------------------
import type { SelfProfile } from '../types/self'
import { LIFE_DOMAIN_LABELS } from '../types/self'
import { collectStyleSamples, extractStyleRules } from './selfEngine'
import { FUTURE_YEARS_AHEAD } from './brand'

export type PersonaTier = 'core' | 'support' | 'color'

export type PersonaFacetId =
  | 'identity' // 미래 정체성
  | 'voice' // 말투
  | 'present' // 지금의 나
  | 'values' // 가치관
  | 'growth' // 성장 축 (두려움·욕망·방향)
  | 'narrative' // 도달 서사·리얼리즘
  | 'future' // 미래 삶의 단면

export const PERSONA_FACET_LABELS: Record<PersonaFacetId, string> = {
  identity: '미래 정체성',
  voice: '말투',
  present: '지금의 나',
  values: '가치관',
  growth: '성장 축',
  narrative: '도달 서사',
  future: '미래의 삶',
}

export interface PersonaFieldSpec {
  key: string
  facet: PersonaFacetId
  tier: PersonaTier
  /** 프롬프트·UI에 쓰는 짧은 라벨 */
  label: string
  /** 나중에 채울 때 사용자에게 물어볼 질문 */
  question: string
  placeholder?: string
  /** 현재 값 (트림된 문자열, 비어 있으면 '') */
  get: (p: SelfProfile) => string
  /** 채우기 UI용 — 있으면 ProfileSheet에서 직접 입력 가능 (순수 함수) */
  set?: (p: SelfProfile, value: string) => SelfProfile
}

const t = (v: string | undefined | null): string => v?.trim() ?? ''

function setFuture(field: keyof SelfProfile['future']): (p: SelfProfile, v: string) => SelfProfile {
  return (p, v) => ({ ...p, future: { ...p.future, [field]: v.trim() } })
}

function setSelf(field: keyof SelfProfile): (p: SelfProfile, v: string) => SelfProfile {
  return (p, v) => ({ ...p, [field]: v.trim() })
}

export const PERSONA_FIELDS: PersonaFieldSpec[] = [
  // ── core — 이게 없으면 페르소나가 무너진다 ────────────────────────────
  {
    key: 'identityLine', facet: 'identity', tier: 'core',
    label: `${FUTURE_YEARS_AHEAD}년 뒤 정체성`,
    question: `${FUTURE_YEARS_AHEAD}년 뒤의 너를 한 문장으로 하면?`,
    placeholder: '예: 내 속도로 성장하며 팀을 이끄는 사람',
    get: (p) => t(p.future?.identityLine), set: setFuture('identityLine'),
  },
  {
    key: 'typicalDay', facet: 'future', tier: 'core',
    label: '평범한 하루 (생생함)',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 평범한 하루를 아침→저녁 타임라인처럼 그려줘.`,
    placeholder: '예: 7시 기상, 운동, 9시 출근… 저녁엔 카페에서 책',
    get: (p) => t(p.future?.typicalDay), set: setFuture('typicalDay'),
  },
  {
    key: 'futureVoiceSample', facet: 'voice', tier: 'core',
    label: '미래의 나 말투 샘플',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 네가 지금의 너한테 카톡을 보낸다면? (1인칭 3~5문장)`,
    placeholder: '예: 야, 너무 조급해하지 마. 나 여기까지 왔는데…',
    get: (p) => t(p.future?.futureVoiceSample), set: setFuture('futureVoiceSample'),
  },
  {
    key: 'adviceLine', facet: 'future', tier: 'core',
    label: '지금의 나에게 편지',
    question: '미래의 네가 지금의 너에게 꼭 해주고 싶은 말 한 줄은?',
    get: (p) => t(p.future?.adviceLine), set: setFuture('adviceLine'),
  },
  {
    key: 'styleSample', facet: 'voice', tier: 'core',
    label: '내 말투 샘플',
    question: '친구한테 카톡하듯, 오늘 기분이나 하루를 그대로 적어줘. (ㅋㅋ, ㅠㅠ 그대로)',
    get: (p) => t(p.styleSample), set: setSelf('styleSample'),
  },
  {
    key: 'speechTone', facet: 'voice', tier: 'core',
    label: '선호하는 대화 톤',
    question: '미래의 너는 어떤 말투였으면 좋겠어? (반말·편하게 / 담담하게 / 직설적으로 / 따뜻하게)',
    get: (p) => t(p.speechTone), set: setSelf('speechTone'),
  },
  {
    key: 'currentRole', facet: 'present', tier: 'core',
    label: '지금 역할·상황',
    question: '지금 네 역할·상황은? (학생, 직장, 구직, 창업 등)',
    get: (p) => t(p.currentRole), set: setSelf('currentRole'),
  },
  {
    key: 'lifeContext', facet: 'present', tier: 'core',
    label: '요즘 하루하루',
    question: '요즘 하루하루는 어떻게 지내?',
    get: (p) => t(p.lifeContext), set: setSelf('lifeContext'),
  },

  // ── support — 대화의 깊이를 만든다 ──────────────────────────────────
  {
    key: 'throughline', facet: 'narrative', tier: 'support',
    label: `지금→${FUTURE_YEARS_AHEAD}년 도달 경로`,
    question: `지금부터 ${FUTURE_YEARS_AHEAD}년, 어떻게 그 삶에 도달했어? 전환점·선택·포기한 것.`,
    get: (p) => t(p.future?.throughline), set: setFuture('throughline'),
  },
  {
    key: 'career', facet: 'future', tier: 'support',
    label: '직업·일',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 직업·하는 일은? (구체적으로)`,
    get: (p) => t(p.future?.career), set: setFuture('career'),
  },
  {
    key: 'obstacleOvercome', facet: 'narrative', tier: 'support',
    label: '넘어선 어려움',
    question: '그 길에서 가장 힘들었던 것과, 어떻게 넘었는지?',
    get: (p) => t(p.future?.obstacleOvercome), set: setFuture('obstacleOvercome'),
  },
  {
    key: 'lesson', facet: 'values', tier: 'support',
    label: '배운 핵심',
    question: '그 과정에서 배운 핵심 한 가지는?',
    get: (p) => t(p.future?.lesson), set: setFuture('lesson'),
  },
  {
    key: 'regretThatWasnt', facet: 'narrative', tier: 'support',
    label: '별거 아니었던 걱정',
    question: `지금 걱정인데 ${FUTURE_YEARS_AHEAD}년 뒤 보면 별거 아니었던 건 뭘까?`,
    get: (p) => t(p.future?.regretThatWasnt), set: setFuture('regretThatWasnt'),
  },
  {
    key: 'corePriority', facet: 'values', tier: 'support',
    label: '절대 못 놓는 것',
    question: '인생에서 절대 못 놓는 것 하나 + 왜?',
    get: (p) => t(p.corePriority), set: setSelf('corePriority'),
  },
  {
    key: 'successDef', facet: 'values', tier: 'support',
    label: '"잘 산다"의 정의',
    question: '너한테 "잘 산다"는 건 어떤 삶이야?',
    get: (p) => t(p.successDef), set: setSelf('successDef'),
  },
  {
    key: 'fear', facet: 'growth', tier: 'support',
    label: '두려움·회피',
    question: '요즘 무섭거나 자꾸 피하게 되는 건?',
    get: (p) => t(p.fear), set: setSelf('fear'),
  },
  {
    key: 'desire', facet: 'growth', tier: 'support',
    label: '진짜 원하는 것',
    question: '속으로 진짜 원하는 것 — 잘 말 안 하는 그거, 뭐야?',
    get: (p) => t(p.desire), set: setSelf('desire'),
  },
  {
    key: 'growthDirection', facet: 'growth', tier: 'support',
    label: '성장 방향',
    question: '1년 뒤 어떤 내가 되어 있으면 "좀 컸다" 싶을까?',
    get: (p) => t(p.growthDirection), set: setSelf('growthDirection'),
  },
  {
    key: 'stressMoment', facet: 'present', tier: 'support',
    label: '최근 힘들었던 순간',
    question: '최근 제일 힘들었던 순간은? 편하게.',
    get: (p) => t(p.stressMoment), set: setSelf('stressMoment'),
  },
  {
    key: 'comfortTarget', facet: 'growth', tier: 'support',
    label: '듣고 싶은 위로',
    question: '힘들 때 어떤 말을 들으면 힘이 나?',
    get: (p) => t(p.comfortTarget), set: setSelf('comfortTarget'),
  },
  {
    key: 'thrivingDomains', facet: 'future', tier: 'support',
    label: '잘 풀렸으면 하는 영역',
    question: '',
    get: (p) => (p.future?.thrivingDomains ?? []).map((d) => LIFE_DOMAIN_LABELS[d] ?? d).join(', '),
  },
  {
    key: 'fearedSelves', facet: 'future', tier: 'support',
    label: '피하고 싶은 미래',
    question: '',
    get: (p) => (p.future?.fearedSelves ?? []).join(', '),
  },
  {
    key: 'weeklyAction', facet: 'growth', tier: 'support',
    label: '이번 주 작은 행동',
    question: '',
    get: (p) => t(p.future?.weeklyAction),
  },

  // ── color — 삶의 단면 디테일 ────────────────────────────────────────
  {
    key: 'careerDaily', facet: 'future', tier: 'color',
    label: '업무/공부 루틴',
    question: '그 일의 하루 루틴은? 보통 뭐 하면서 시간 보내?',
    get: (p) => t(p.future?.careerDaily), set: setFuture('careerDaily'),
  },
  {
    key: 'income', facet: 'future', tier: 'color',
    label: '경제·돈',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 경제 상황은? 연봉·저축·걱정 정도.`,
    get: (p) => t(p.future?.income), set: setFuture('income'),
  },
  {
    key: 'relationship', facet: 'future', tier: 'color',
    label: '관계',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 가족·연애·친구 관계는?`,
    get: (p) => t(p.future?.relationship), set: setFuture('relationship'),
  },
  {
    key: 'health', facet: 'future', tier: 'color',
    label: '건강·몸',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 체력·습관·컨디션은?`,
    get: (p) => t(p.future?.health), set: setFuture('health'),
  },
  {
    key: 'homeLife', facet: 'future', tier: 'color',
    label: '사는 곳·라이프',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 어디서, 어떤 분위기로 살고 있어?`,
    get: (p) => t(p.future?.homeLife), set: setFuture('homeLife'),
  },
  {
    key: 'achievement', facet: 'future', tier: 'color',
    label: '자랑스러운 성취',
    question: `${FUTURE_YEARS_AHEAD}년 뒤 제일 자랑스러운 성취는?`,
    get: (p) => t(p.future?.achievement), set: setFuture('achievement'),
  },
  {
    key: 'avoidedPath', facet: 'narrative', tier: 'color',
    label: '될 뻔했던 길',
    question: '피하고 싶은 미래가 될 뻔했던 순간 — 어떤 선택이었어?',
    get: (p) => t(p.future?.avoidedPath), set: setFuture('avoidedPath'),
  },
  {
    key: 'traitsShift', facet: 'future', tier: 'color',
    label: '변한 태도·성격',
    question: '',
    get: (p) => (p.future?.traitsShift ?? []).join(', '),
  },
  {
    key: 'turningPoint', facet: 'narrative', tier: 'color',
    label: '나를 만든 전환점',
    question: '지금까지 살면서 너를 만든 결정적 순간 하나는?',
    get: (p) => t(p.turningPoint), set: setSelf('turningPoint'),
  },
  {
    key: 'proudMoment', facet: 'narrative', tier: 'color',
    label: '대견했던 순간',
    question: '스스로 대견했던 때는 언제야?',
    get: (p) => t(p.proudMoment), set: setSelf('proudMoment'),
  },
  {
    key: 'concernDomains', facet: 'present', tier: 'color',
    label: '신경 쓰이는 영역',
    question: '',
    get: (p) => (p.concernDomains ?? []).map((d) => LIFE_DOMAIN_LABELS[d] ?? d).join(', '),
  },
]

const TIER_WEIGHT: Record<PersonaTier, number> = { core: 3, support: 2, color: 1 }

export interface PersonaCompleteness {
  /** 0~1 — 티어 가중 평균 */
  overall: number
  filled: number
  total: number
  byFacet: Record<PersonaFacetId, { filled: number; total: number }>
}

export function personaCompleteness(p: SelfProfile): PersonaCompleteness {
  const byFacet = Object.fromEntries(
    (Object.keys(PERSONA_FACET_LABELS) as PersonaFacetId[]).map((f) => [f, { filled: 0, total: 0 }]),
  ) as PersonaCompleteness['byFacet']

  let weightFilled = 0
  let weightTotal = 0
  let filled = 0
  for (const field of PERSONA_FIELDS) {
    const has = field.get(p).length > 0
    const w = TIER_WEIGHT[field.tier]
    weightTotal += w
    byFacet[field.facet].total += 1
    if (has) {
      weightFilled += w
      byFacet[field.facet].filled += 1
      filled += 1
    }
  }
  return {
    overall: weightTotal ? weightFilled / weightTotal : 0,
    filled,
    total: PERSONA_FIELDS.length,
    byFacet,
  }
}

/**
 * 지금 채우면 대화 품질이 가장 좋아질 빈 필드 — core부터, 같은 티어 안에서는
 * 정의 순서대로. 직접 입력 가능한(set이 있는) 필드만 추천한다.
 */
export function personaGaps(p: SelfProfile, limit = 3): PersonaFieldSpec[] {
  const order: PersonaTier[] = ['core', 'support', 'color']
  const gaps: PersonaFieldSpec[] = []
  for (const tier of order) {
    for (const field of PERSONA_FIELDS) {
      if (field.tier !== tier || !field.set || !field.question) continue
      if (field.get(p).length === 0) gaps.push(field)
      if (gaps.length >= limit) return gaps
    }
  }
  return gaps
}

/**
 * 페르소나 필드를 채운 뒤 말투 학습까지 갱신한 새 프로필을 돌려준다.
 * (온보딩 서술형 답은 말투 샘플이기도 하므로, 나중에 채워도 학습에 반영)
 */
export function applyPersonaAnswer(p: SelfProfile, field: PersonaFieldSpec, value: string): SelfProfile {
  if (!field.set) return p
  const next = field.set(p, value)
  const chatSamples = (next.styleSamples ?? []).filter((s) => s.source === 'chat')
  const samples = [...collectStyleSamples(next), ...chatSamples]
  return { ...next, styleSamples: samples, styleRules: extractStyleRules(samples) }
}

// ---------------------------------------------------------------------------
// 프롬프트 렌더링 — "미래의 나" 정체성 블록
// ---------------------------------------------------------------------------

/** 티어별로 프롬프트에 싣는 최대 길이 — 중요할수록 길게 허용 */
const TIER_MAX_LEN: Record<PersonaTier, number> = { core: 420, support: 200, color: 110 }

const clip = (v: string, max: number): string => (v.length > max ? `${v.slice(0, max)}…` : v)

/** 프롬프트의 미래 정체성 블록에 들어가는 필드 (렌더 순서대로) */
const FUTURE_BLOCK_KEYS = [
  'identityLine',
  'typicalDay',
  'throughline',
  'career',
  'careerDaily',
  'income',
  'relationship',
  'health',
  'homeLife',
  'achievement',
  'obstacleOvercome',
  'lesson',
  'thrivingDomains',
  'fearedSelves',
  'avoidedPath',
  'regretThatWasnt',
  'traitsShift',
  'futureVoiceSample',
  'adviceLine',
  'weeklyAction',
] as const

/**
 * buildSystemPrompt의 "N년 뒤의 나" 섹션 본문.
 * - lite(긴 대화 압축 모드)에서는 core 필드만 실어 토큰을 아낀다
 * - 일반 턴에서는 전부 싣되, 중요한 것부터 + 티어별 길이 제한
 * - 빈 필드는 줄 자체를 만들지 않는다
 */
export function renderFutureSelfBlock(p: SelfProfile, lite = false): string {
  const byKey = new Map(PERSONA_FIELDS.map((f) => [f.key, f]))
  const lines: string[] = []

  for (const key of FUTURE_BLOCK_KEYS) {
    const field = byKey.get(key)
    if (!field) continue
    if (lite && field.tier !== 'core') continue
    const value = field.get(p)
    if (!value) continue
    if (key === 'adviceLine') {
      lines.push(`- ${field.label} (${p.future?.adviceTone ?? 'comfort'}): "${clip(value, TIER_MAX_LEN[field.tier])}"`)
    } else {
      lines.push(`- ${field.label}: "${clip(value, TIER_MAX_LEN[field.tier])}"`)
    }
  }

  // continuityScore·askAbout은 기본값이 있어 "입력했다"는 증거가 못 된다 —
  // 실제 페르소나 입력이 하나도 없으면 지어내지 말라는 안내만 싣는다.
  if (!lines.length) {
    return '- (미래 프로필 미입력 — 대화로 자연스럽게 채워가기. 아는 척 금지)'
  }

  if (!lite && p.future?.continuityScore) {
    lines.push(`- 미래 자아 연속성: ${p.future.continuityScore}/7`)
  }
  if (!lite && p.future?.askAbout) {
    lines.push(`- 자주 묻고 싶은 주제: ${LIFE_DOMAIN_LABELS[p.future.askAbout] ?? p.future.askAbout}`)
  }
  if (p.speechTone?.trim()) lines.push(`- user가 선호하는 대화 톤: ${p.speechTone.trim()}`)
  if (p.styleSample?.trim()) {
    const s = p.styleSample.trim()
    lines.push(`- user 말투 샘플(참고): "${clip(s, 80)}"`)
  }

  return lines.join('\n')
}
