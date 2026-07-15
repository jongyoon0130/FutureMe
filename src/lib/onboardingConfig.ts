import type { AdviceTone, LifeDomain, Register } from '../types/self'
import { FUTURE_YEARS_AHEAD } from './brand'

export const SPEECH_TONE_OPTIONS = ['반말·편하게', '담담하게', '직설적으로', '따뜻하게'] as const

export const LIFE_DOMAIN_ORDER: LifeDomain[] = [
  'work',
  'money',
  'relationship',
  'health',
  'growth',
  'meaning',
]

export const FEARED_SELF_OPTIONS = [
  '정체된 커리어',
  '돈 걱정 반복',
  '외로운 관계',
  '번아웃',
  '후회만 남음',
  '남 눈치만 보는 삶',
  '포기하고 안주하는 삶',
] as const

export const TRAIT_SHIFT_OPTIONS = [
  '담담해짐',
  '덜 조급',
  '더 솔직',
  '더 규율적',
  '더 따뜻',
  '더 결단력',
  '자신감',
  '지금과 비슷',
] as const

export const ADVICE_PRESETS: Record<AdviceTone, string[]> = {
  comfort: [
    '너무 완벽하려 하지 마. 지금 속도면 충분해. 불안해도 괜찮고, 네 페이스대로 가도 돼.',
    '비교하지 마. 네가 걸어온 길만큼은 이미 의미 있어.',
  ],
  tough: [
    '미루는 게 습관이면 5년 뒤도 똑같아. 완벽할 때까지 기다리면 영원히 안 시작해.',
    '피하는 선택이 결국 네 삶이 돼. 지금 불편한 한 걸음이 필요해.',
  ],
  cheer: [
    '넌 생각보다 잘하고 있어. 작은 시도가 쌓이면 큰 변화야. 오늘 한 걸음이 5년 뒤를 만든다.',
  ],
  real: [
    '지금 걱정하는 것, 대부분 지나가. 완벽한 타이밍은 없어. 통제 못 하는 건 놓아도 돼.',
  ],
}

export const WEEKLY_ACTION_OPTIONS = [
  '운동 1회',
  '지원서·포트폴리오 30분',
  '중요한 대화 1번',
  '저축·가계 점검',
  '학습 25분',
  '잘 모르겠어',
] as const

export const CONTINUITY_LABELS = ['완전 남', '', '', '반반', '', '', '거의 같은 사람'] as const

export type ProfileField =
  | 'currentRole'
  | 'lifeContext'
  | 'styleSample'
  | 'corePriority'
  | 'successDef'
  | 'stressMoment'
  | 'fear'
  | 'desire'
  | 'growthDirection'

export type FutureField =
  | 'identityLine'
  | 'typicalDay'
  | 'throughline'
  | 'career'
  | 'careerDaily'
  | 'income'
  | 'relationship'
  | 'health'
  | 'homeLife'
  | 'achievement'
  | 'obstacleOvercome'
  | 'lesson'
  | 'avoidedPath'
  | 'regretThatWasnt'
  | 'futureVoiceSample'
  | 'adviceLine'

export type OnboardingStep =
  | { kind: 'name'; lines: string[] }
  | { kind: 'age'; lines: string[] }
  | {
      kind: 'profile-text'
      lines: string[]
      field: ProfileField
      register: Register
      placeholder: string
      maxLength: number
      minLength?: number
      optional?: boolean
    }
  | { kind: 'concerns'; lines: string[]; max: number }
  | { kind: 'speech-tone'; lines: string[] }
  | { kind: 'dilemma-choice'; lines: string[] }
  | { kind: 'dilemma-reason'; lines: string[] }
  | { kind: 'section'; lines: string[] }
  | {
      kind: 'future-text'
      lines: string[]
      field: FutureField
      placeholder: string
      maxLength: number
      minLength?: number
      optional?: boolean
    }
  | { kind: 'thriving-domains'; lines: string[]; max: number }
  | { kind: 'feared-selves'; lines: string[]; max: number }
  | { kind: 'traits-shift'; lines: string[]; max: number }
  | { kind: 'advice'; lines: string[] }
  | { kind: 'continuity'; lines: string[] }
  | { kind: 'weekly-action'; lines: string[] }
  | { kind: 'ask-about'; lines: string[] }

/** ~28단계: Future You급 생생함 + 말투 학습 + throughline */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    kind: 'name',
    lines: [
      `안녕. Future Me야.`,
      `${FUTURE_YEARS_AHEAD}년 뒤 **미래의 너**와 대화할 수 있게 만들 거야.`,
      '핵심 질문부터 같이 잡아볼게. 막히는 서술형은 건너뛰고 나중에 프로필에서 채워도 돼.',
      '먼저 부를 이름이나 별명 알려줘.',
    ],
  },
  { kind: 'age', lines: ['반가워, {name}. 몇 살이야?'] },
  {
    kind: 'profile-text',
    lines: ['지금 네 **역할·상황**은? (학생, 직장, 구직, 창업 등)'],
    field: 'currentRole',
    register: 'casual',
    placeholder: '예: IT 회사 2년차 백엔드 / 대4 취준 / 1인 창업 준비 중',
    maxLength: 120,
    minLength: 8,
  },
  {
    kind: 'profile-text',
    lines: ['요즘 **하루하루**는 어떻게 지내?'],
    field: 'lifeContext',
    register: 'casual',
    placeholder: '예: 출퇴근하고 퇴근 후 공부… 주말엔 친구 만나고 요즘 좀 지쳐',
    maxLength: 280,
    minLength: 15,
  },
  {
    kind: 'concerns',
    lines: ['요즘 제일 **신경 쓰이는 영역**은? (최대 3개)'],
    max: 3,
  },
  {
    kind: 'profile-text',
    lines: [
      '**말투 학습** — 친구한테 카톡하듯, 오늘 기분이나 하루를 **그대로** 적어줘.',
      'ㅋㅋ, ㅠㅠ, 줄임말 그대로 OK.',
    ],
    field: 'styleSample',
    register: 'casual',
    placeholder: '예: 아 오늘 진짜… 회의 두 번이나 끌려가서 녹초됨 ㅠㅠ 그래도 저녁에 산책은 함',
    maxLength: 320,
    minLength: 30,
  },
  {
    kind: 'profile-text',
    lines: ['인생에서 **절대 못 놓는 것** — 딱 하나 + 왜인지'],
    field: 'corePriority',
    register: 'reflective',
    placeholder: '예: 성장. 멈춰 있는 느낌 들면 못 견디겠더라',
    maxLength: 200,
    minLength: 10,
  },
  {
    kind: 'profile-text',
    lines: ['너한테 **"잘 산다"**는 건 어떤 삶이야?'],
    field: 'successDef',
    register: 'reflective',
    placeholder: '예: 돈보다 내 사람들이랑 편하게 웃으면서, 내 선택에 후회 없는',
    maxLength: 200,
    minLength: 10,
  },
  { kind: 'dilemma-choice', lines: ['가치관 하나만. 고민되면 끌리는 쪽으로.', '안정적인데 지루한 길 vs 불안하지만 하고 싶은 길?'] },
  { kind: 'dilemma-reason', lines: ['왜 그쪽이야?'] },
  {
    kind: 'profile-text',
    lines: ['최근 **제일 힘들었던 순간** — 편하게'],
    field: 'stressMoment',
    register: 'venting',
    placeholder: '예: 요즘 일도 사람도 다 버거워서 좀 지쳤어',
    maxLength: 220,
    minLength: 10,
  },
  {
    kind: 'profile-text',
    lines: ['요즘 **무섭거나** 자꾸 피하게 되는 것'],
    field: 'fear',
    register: 'venting',
    placeholder: '예: 도전했다가 실패해서 사람들 실망시키는 거',
    maxLength: 180,
    minLength: 8,
  },
  {
    kind: 'profile-text',
    lines: ['속으로 **진짜 원하는 것** — 잘 말 안 하는 그거'],
    field: 'desire',
    register: 'reflective',
    placeholder: '예: 인정받고 싶어. 잘하고 있다는 말 한마디',
    maxLength: 180,
    minLength: 8,
  },
  {
    kind: 'profile-text',
    lines: ['**1년 뒤** 어떤 나가 되어 있으면 "좀 컸다" 싶을까?'],
    field: 'growthDirection',
    register: 'reflective',
    placeholder: '예: 덜 눈치 보고, 하고 싶은 건 일단 해보는 나',
    maxLength: 180,
    minLength: 8,
  },
  {
    kind: 'speech-tone',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤 **미래의 너**, 어떤 말투로 대화하면 좋을까?`],
  },
  {
    kind: 'section',
    lines: [
      '좋아, {name}. **지금의 너**는 충분히 알겠어.',
      `이제 **${FUTURE_YEARS_AHEAD}년 뒤** — 꿈꾸는 **미래의 너**를 만들어보자.`,
      '상상해도 돼. 구체적일수록 대화가 살아나.',
    ],
  },
  {
    kind: 'future-text',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤, 너를 **한 문장**으로`],
    field: 'identityLine',
    placeholder: '예: 내 속도로 성장하며 팀을 이끄는 사람',
    maxLength: 80,
    minLength: 8,
  },
  {
    kind: 'thriving-domains',
    lines: [`그때 인생에서 **가장 잘 풀렸으면** 하는 영역 (최대 3)`],
    max: 3,
  },
  {
    kind: 'future-text',
    lines: [
      `**생생함** — ${FUTURE_YEARS_AHEAD}년 뒤, 평범한 **하루**를 타임라인처럼.`,
      '아침→낮→저녁, 어디서 뭐 하고 누구랑 있는지.',
    ],
    field: 'typicalDay',
    placeholder: '예: 7시 기상, 운동, 9시 출근… 점심에 동료랑… 퇴근 후 카페에서 책',
    maxLength: 420,
    minLength: 40,
  },
  {
    kind: 'future-text',
    lines: [
      `**Future memory** — 지금부터 ${FUTURE_YEARS_AHEAD}년, **어떻게** 그 삶에 도달했어?`,
      '전환점, 선택, 포기한 것, 붙잡은 것.',
    ],
    field: 'throughline',
    placeholder: '예: 2년차에 이직했고… 실패도 있었는데… 그때 멘토 만나서…',
    maxLength: 420,
    minLength: 40,
  },
  {
    kind: 'future-text',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤 **직업·하는 일** (구체적으로)`],
    field: 'career',
    placeholder: '예: 원하던 분야 시니어 / 1인 창업 3년차 / 대학원 후 연구직',
    maxLength: 200,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: ['그 일의 **하루 루틴** — 보통 뭐 하면서 시간 보내?'],
    field: 'careerDaily',
    placeholder: '예: 오전 미팅, 오후 집중 개발, 가끔 멘토링',
    maxLength: 220,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: ['**경제·돈** — 연봉·저축·걱정 정도'],
    field: 'income',
    placeholder: '예: 월세 걱정 없고, 6개월치 비상금+여유 저축',
    maxLength: 200,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: ['**관계** — 가족·연애·결혼·친구'],
    field: 'relationship',
    placeholder: '예: 좋은 사람 옆에 있고, 부모님한테 자주 연락, 든든한 친구 2–3명',
    maxLength: 220,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: ['**건강·몸** — 체력, 습관, 컨디션'],
    field: 'health',
    placeholder: '예: 주 3회 운동, 술 줄임, 멘탈은 예전보다 안정',
    maxLength: 200,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: ['**사는 곳·라이프** — 어디서, 어떤 분위기로'],
    field: 'homeLife',
    placeholder: '예: 회사 가까운 원룸/자취, 주말엔 카페·산책, 혼자만의 시간도 있음',
    maxLength: 220,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤, **제일 자랑스러운 성취**`],
    field: 'achievement',
    placeholder: '예: 미루던 걸 끝내고, 내 기준에선 성공했다고 느끼는 것',
    maxLength: 220,
    minLength: 10,
  },
  {
    kind: 'future-text',
    lines: ['그 길에서 **가장 힘들었던 것** — 어떻게 넘었어?'],
    field: 'obstacleOvercome',
    placeholder: '예: 1년간 번아웃… 휴식 후 방향 다시 잡고 작은 목표부터',
    maxLength: 220,
    minLength: 15,
  },
  {
    kind: 'future-text',
    lines: ['그 과정에서 **배운 핵심 한 가지**'],
    field: 'lesson',
    placeholder: '예: 완벽보다 매일 조금씩이 이겼더라',
    maxLength: 200,
    minLength: 8,
  },
  {
    kind: 'feared-selves',
    lines: [`피하고 싶은 ${FUTURE_YEARS_AHEAD}년 뒤 (최대 3)`],
    max: 3,
  },
  {
    kind: 'future-text',
    lines: ['**그렇게 될 뻔했던 순간** — 어떤 선택이었어?'],
    field: 'avoidedPath',
    placeholder: '예: 안정만 쫓다가 soul dead 될 뻔… 이직 안 했으면…',
    maxLength: 220,
    minLength: 15,
  },
  {
    kind: 'future-text',
    lines: [`지금(${FUTURE_YEARS_AHEAD}년 전) **걱정**인데, ${FUTURE_YEARS_AHEAD}년 뒤 보면 별거 아니었던 것`],
    field: 'regretThatWasnt',
    placeholder: '예: 나이, 비교, 남 시선… 지나고 보니 내 페이스가 맞았음',
    maxLength: 220,
    minLength: 10,
  },
  {
    kind: 'traits-shift',
    lines: ['그 사이 **어떻게 변했어?** (성격·태도, 최대 4)'],
    max: 4,
  },
  {
    kind: 'future-text',
    lines: [
      `**미래의 너 말투** — ${FUTURE_YEARS_AHEAD}년 뒤 **네가** 지금의 너한테 카톡 보낸다면?`,
      '1인칭, 3–5문장. 위에서 고른 말투 느낌으로.',
    ],
    field: 'futureVoiceSample',
    placeholder: '예: 야, 지금 너무 조급해하지 마. 나 여기까지 왔는데…',
    maxLength: 320,
    minLength: 40,
  },
  {
    kind: 'advice',
    lines: [`지금(${FUTURE_YEARS_AHEAD}년 전)의 너한테 **편지** — 미래의 네가 꼭 해주고 싶은 말.`],
  },
  {
    kind: 'continuity',
    lines: ['지금의 너 ↔ 5년 뒤 너, **얼마나 이어져** 있어?'],
  },
  {
    kind: 'weekly-action',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤를 위해, **이번 주**에 할 한 가지`],
  },
  {
    kind: 'ask-about',
    lines: ['미래의 너에게 **제일 자주** 묻고 싶은 주제'],
  },
]
