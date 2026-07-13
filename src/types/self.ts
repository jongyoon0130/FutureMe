// Future Me — 현재의 나 + 5년 뒤 미래의 나 페르소나

export type Register = 'casual' | 'reflective' | 'venting' | 'joyful' | 'comforting'

export const REGISTER_LABELS: Record<Register, string> = {
  casual: '일상',
  reflective: '성찰',
  venting: '토로',
  joyful: '기쁨',
  comforting: '위로',
}

// L4: 레지스터별 말투 샘플 (원문 few-shot 재료)
export interface StyleSample {
  register: Register
  text: string
  source: 'onboarding' | 'chat'
  at: number
}

// L4: 자동 추출한 말투 규칙서 (stylometry)
export interface StyleRules {
  banmal: boolean
  avgSentenceLen: number
  usesEmoji: boolean
  usesConsonants: boolean // ㅋㅋ, ㅠㅠ, ㅎㅎ
  exclamationHeavy: boolean
  ellipsisHeavy: boolean
  endings: string[] // 자주 쓰는 종결/어투
  fillers: string[] // 자주 쓰는 필러
}

// L1: 기질 (Big Five, 1~7)
export interface BigFive {
  openness: number
  conscientiousness: number
  extraversion: number
  agreeableness: number
  neuroticism: number
}

// L2: 가치·판단 (딜레마에서 드러난 것)
export interface Dilemma {
  id: string
  prompt: string
  choice: string
  reason: string
}

// 대화에서 관찰한 잠정 인사이트 (온보딩 데이터보다 낮은 신뢰도)
export type InsightKind = 'state' | 'value' | 'preference' | 'fact'

export const INSIGHT_LABELS: Record<InsightKind, string> = {
  state: '요즘 상황',
  value: '가치관',
  preference: '취향·선호',
  fact: '사실',
}

export interface Insight {
  id: string
  kind: InsightKind
  text: string // 관찰된 문장(정규화)
  count: number // 반복해서 드러난 횟수(=신뢰도)
  source?: 'local' | 'ai' // local=키워드 규칙, ai=대화 추론
  firstAt: number
  lastAt: number
}

// ---------------------------------------------------------------------------
// 성장·행동 지향 (자기이해 → 용기 → 작은 실행)
// ---------------------------------------------------------------------------

// 저장한 고민 (반복 인식 + 나중에 되돌아보기)
export interface SavedDilemma {
  id: string
  text: string // 고민 원문
  createdAt: number
  status: 'open' | 'resolved'
  resolvedNote?: string // 어떻게 풀렸는지
  resolvedAt?: number
  linkedActionIds?: string[] // 이 고민에서 파생된 작은 행동
}

// 작은 행동 (용기 → 실행)
export interface SmallAction {
  id: string
  text: string // "다음 약속 내가 먼저 잡기" 같은 아주 작은 한 걸음
  createdAt: number
  done: boolean
  doneAt?: number
  fromDilemmaId?: string // 어떤 고민에서 나왔는지
}

// 미래의 나(혹은 현재의 나)에게 남기는 메모
export interface FutureSelfNote {
  id: string
  text: string
  createdAt: number
  horizon?: string // "1주" | "1개월" | "1년" 뒤의 나
  sourceMessageId?: string
}

export interface FutureSelfProfile {
  /** 5년 뒤 직업·일 */
  career: string
  /** 연봉·재산·경제 상태 */
  income: string
  /** 가족·연애·관계 */
  relationship: string
  /** 건강·몸·컨디션 */
  health: string
  /** 하루·라이프스타일 */
  lifestyle: string
  /** 가장 자랑스러운 성취 */
  achievement: string
  /** 5년 지나며 배운 핵심 교훈 */
  lesson: string
  /** 지금의 나에게 꼭 해주고 싶은 말 */
  advice: string
  /** 미래의 나 말투·성격 (지금보다 어떻게 다른지) */
  voiceNote: string
}

export function emptyFutureSelf(): FutureSelfProfile {
  return {
    career: '',
    income: '',
    relationship: '',
    health: '',
    lifestyle: '',
    achievement: '',
    lesson: '',
    advice: '',
    voiceNote: '',
  }
}

export interface SelfProfile {
  id: string // 프로필 고유 ID (멀티 프로필)
  // L0 앵커 (현재의 나)
  name: string
  age: number
  lifeContext: string
  mbti: string // 기본 성향 앵커 (모르면 '')
  /** 5년 뒤 목표하는 미래의 나 */
  future: FutureSelfProfile
  // L1 기질
  bigFive: BigFive
  // L2 가치·판단
  dilemmas: Dilemma[]
  corePriority: string // 인생에서 절대 못 놓는 1순위 + 이유
  successDef: string // 나에게 '잘 산다'는 것의 정의
  admire: string // 존경·닮고 싶은 사람과 그 이유
  // L3 서사 정체성
  turningPoint: string
  proudMoment: string
  stressMoment: string
  comfortMemory: string // 남을 위로한 기억 (위로 톤 output)
  comfortTarget: string // 나를 위로하는 말 (복제 AI가 나를 위로할 방법)
  // 성장 4축 (자기이해: 두려움·욕망·회피·성장방향) — 온보딩에서 수집
  fear?: string // 무섭거나 자꾸 피하게 되는 것
  desire?: string // 사실은 원하는 것 (겉으로 잘 말 못한)
  avoidance?: string // 자꾸 미루거나 회피하는 것
  growthDirection?: string // 되고 싶은 나 / 성장 방향
  // L4 언어
  styleSamples: StyleSample[]
  styleRules?: StyleRules
  // 대화에서 조심스럽게 축적한 관찰(잠정)
  insights?: Insight[]
  // 명시적으로 저장한 것 (자기이해 → 용기 → 실행)
  savedDilemmas?: SavedDilemma[]
  smallActions?: SmallAction[]
  futureSelfNotes?: FutureSelfNote[]
  // 긴 대화 맥락: 오래된 턴은 요약으로 압축, 최근 턴은 원문 유지
  conversationSummary?: string
  summarizedMessageCount?: number // 요약에 포함된 메시지 수 (앞쪽부터)
  completedAt?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'self'
  content: string
  timestamp: number
}

export function emptyProfile(): SelfProfile {
  return {
    id: '',
    name: '',
    age: 25,
    lifeContext: '',
    mbti: '',
    future: emptyFutureSelf(),
    bigFive: {
      openness: 4,
      conscientiousness: 4,
      extraversion: 4,
      agreeableness: 4,
      neuroticism: 4,
    },
    dilemmas: [],
    corePriority: '',
    successDef: '',
    admire: '',
    turningPoint: '',
    proudMoment: '',
    stressMoment: '',
    comfortMemory: '',
    comfortTarget: '',
    fear: '',
    desire: '',
    avoidance: '',
    growthDirection: '',
    styleSamples: [],
    insights: [],
    savedDilemmas: [],
    smallActions: [],
    futureSelfNotes: [],
    summarizedMessageCount: 0,
  }
}

// Big Five 초단축 문항 (TIPI 스타일, ★=역채점)
export interface BigFiveItem {
  id: string
  text: string
  dim: keyof BigFive
  reverse: boolean
}

export const BIG_FIVE_ITEMS: BigFiveItem[] = [
  { id: 'o1', text: '새로운 아이디어나 낯선 경험에 끌린다', dim: 'openness', reverse: false },
  { id: 'o2', text: '익숙하고 검증된 방식이 더 편하다', dim: 'openness', reverse: true },
  { id: 'c1', text: '할 일을 미리 계획하고 끝까지 지킨다', dim: 'conscientiousness', reverse: false },
  { id: 'c2', text: '즉흥적으로 움직이는 편이다', dim: 'conscientiousness', reverse: true },
  { id: 'e1', text: '사람들과 어울리면 에너지가 생긴다', dim: 'extraversion', reverse: false },
  { id: 'e2', text: '혼자 있는 시간이 나를 회복시킨다', dim: 'extraversion', reverse: true },
  { id: 'a1', text: '상대 입장에 잘 공감하고 맞춰준다', dim: 'agreeableness', reverse: false },
  { id: 'a2', text: '내 의견을 굽히지 않고 밀어붙인다', dim: 'agreeableness', reverse: true },
  { id: 'n1', text: '걱정이나 불안을 자주 느낀다', dim: 'neuroticism', reverse: false },
  { id: 'n2', text: '웬만한 일에는 감정이 흔들리지 않는다', dim: 'neuroticism', reverse: true },
]

export interface DilemmaSpec {
  id: string
  prompt: string
  options: string[]
}

export const DILEMMA_SPECS: DilemmaSpec[] = [
  {
    id: 'stability',
    prompt: '안정적인데 좀 지루한 길이랑, 불안하지만 하고 싶은 길. 하나만 고르라면?',
    options: ['안정적인 쪽', '하고 싶은 쪽', '상황 따라 다름'],
  },
  {
    id: 'honesty',
    prompt: '친한 친구가 명백히 틀렸는데, 지적하면 상처받을 것 같아. 어떻게 해?',
    options: ['그래도 솔직히 말함', '굳이 말 안 하고 넘어감'],
  },
  {
    id: 'conflict',
    prompt: '누군가랑 부딪쳤을 때 너는 보통?',
    options: ['감정부터 솔직히 말함', '논리적으로 정리부터', '일단 피하고 시간 둠'],
  },
  {
    id: 'money',
    prompt: '갑자기 목돈이 생겼어. 가장 먼저 뭐 할래?',
    options: ['저축·미래 대비', '경험·여행', '나눔·주변 챙김'],
  },
]
