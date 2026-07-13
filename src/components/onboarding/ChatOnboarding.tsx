import { useEffect, useRef, useState } from 'react'
import type { SelfProfile, Register, Dilemma, FutureSelfProfile } from '../../types/self'
import { emptyProfile, BIG_FIVE_ITEMS, DILEMMA_SPECS } from '../../types/self'
import { scoreBigFive, collectStyleSamples, extractStyleRules } from '../../lib/selfEngine'
import { saveOnboardingProgress, loadOnboardingProgress, clearOnboardingProgress } from '../../lib/storage'
import { APP_TAGLINE, FUTURE_YEARS_AHEAD } from '../../lib/brand'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { Button } from '../ui'

interface SavedProgress {
  stepIdx: number
  transcript: Bubble[]
  draft: SelfProfile
  bigFiveAnswers: Record<string, number>
  dilemmaDraft: Record<number, Dilemma>
}

interface Checkpoint {
  stepIdx: number
  transcript: Bubble[]
  draft: SelfProfile
  bigFiveAnswers: Record<string, number>
  dilemmaDraft: Record<number, Dilemma>
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

type Bubble = { id: string; role: 'bot' | 'user'; content: string }

type Step =
  | { kind: 'name'; lines: string[] }
  | { kind: 'age'; lines: string[] }
  | { kind: 'mbti'; lines: string[] }
  | { kind: 'text'; lines: string[]; field: TextField; register: Register; placeholder: string; optional?: boolean }
  | { kind: 'bigfive'; lines: string[] }
  | { kind: 'dilemma-choice'; lines: string[]; specIdx: number }
  | { kind: 'dilemma-reason'; lines: string[]; specIdx: number }
  | { kind: 'section'; lines: string[] }
  | { kind: 'future-text'; lines: string[]; field: keyof FutureSelfProfile; placeholder: string; optional?: boolean }

type TextField =
  | 'lifeContext'
  | 'corePriority'
  | 'successDef'
  | 'admire'
  | 'turningPoint'
  | 'proudMoment'
  | 'stressMoment'
  | 'comfortMemory'
  | 'comfortTarget'
  | 'fear'
  | 'desire'
  | 'avoidance'
  | 'growthDirection'

// 순서 설계: 가벼운 사실 → 성격 → 가치관(추상→구체→종합) → 깊은 서사 → 위로.
// 초반엔 부담 없이 워밍업하고, 라포가 쌓인 뒤 감정적으로 깊은 걸 묻는다.
const STEPS: Step[] = [
  {
    kind: 'name',
    lines: [
      `안녕. Future Me야.`,
      `${FUTURE_YEARS_AHEAD}년 뒤 — 네가 목표로 하는 **미래의 너**와 대화할 수 있게 만들 거야.`,
      '평소 친구한테 톡하듯 편하게 써줘. ㅋㅋ든 ㅠㅠ든 그대로.',
      '먼저 **지금의 너**부터. 부를 이름이나 별명 알려줘.',
    ],
  },
  { kind: 'age', lines: ['반가워, {name}. 몇 살이야?'] },
  {
    kind: 'mbti',
    lines: ['가볍게 시작할게. 혹시 MBTI 알아?', '알면 골라주고, 모르면 그냥 넘어가도 돼.'],
  },
  {
    kind: 'text',
    lines: ['오케이. 요즘은 뭐 하면서 지내?'],
    field: 'lifeContext',
    register: 'casual',
    placeholder: '예: 그냥 회사 다니지 뭐ㅋㅋ 요즘 좀 지쳤어',
  },
  {
    kind: 'bigfive',
    lines: ['이제 네가 어떤 사람인지 감 좀 잡아볼게.', '아래 문장들이 너랑 얼마나 맞는지 슬라이더로 알려줘.'],
  },
  {
    kind: 'text',
    lines: ['좋아. 이제 좀 더 깊은 얘기 해볼까.', '지금 네 인생에서 절대 못 놓는 거… 딱 하나만 꼽으면 뭐야? 왜 그게 1순위인지도 살짝 알려줘.'],
    field: 'corePriority',
    register: 'reflective',
    placeholder: '예: 그냥 내 성장? 멈춰 있는 느낌 들면 못 견디겠더라',
  },
  { kind: 'dilemma-choice', lines: ['상황을 몇 개 던져볼게. 고민되면 그냥 끌리는 쪽으로.', DILEMMA_SPECS[0].prompt], specIdx: 0 },
  { kind: 'dilemma-reason', lines: ['오, 왜 그쪽이야?'], specIdx: 0 },
  { kind: 'dilemma-choice', lines: [DILEMMA_SPECS[1].prompt], specIdx: 1 },
  { kind: 'dilemma-reason', lines: ['왜 그렇게 생각해?'], specIdx: 1 },
  { kind: 'dilemma-choice', lines: [DILEMMA_SPECS[2].prompt], specIdx: 2 },
  { kind: 'dilemma-reason', lines: ['이유가 궁금하네.'], specIdx: 2 },
  { kind: 'dilemma-choice', lines: [DILEMMA_SPECS[3].prompt], specIdx: 3 },
  { kind: 'dilemma-reason', lines: ['오케이. 왜?'], specIdx: 3 },
  {
    kind: 'text',
    lines: ['이런 얘기 들으니까 너 좀 알 것 같아.', '너한테 "잘 산다"는 건 어떤 거야? 어떤 삶이면 나 좀 만족스럽다 싶을까?'],
    field: 'successDef',
    register: 'reflective',
    placeholder: '예: 돈 많은 것보다 그냥 내 사람들이랑 편하게 웃으면서 사는 거',
  },
  {
    kind: 'text',
    lines: ['닮고 싶거나 존경하는 사람 있어? 누구의 어떤 점이 그래?'],
    field: 'admire',
    register: 'reflective',
    placeholder: "예: 우리 엄마. 어떤 상황에서도 안 흔들리는 게 대단해 (없으면 '없어')",
    optional: true,
  },
  {
    kind: 'text',
    lines: ['이제 진짜 너에 대한 얘기. 지금의 너를 만든 결정적인 순간 하나만 떠올려볼래? 편하게.'],
    field: 'turningPoint',
    register: 'reflective',
    placeholder: '예: 군대에서 처음 리더 맡았을 때, 그때 많이 바뀐 것 같아',
  },
  {
    kind: 'text',
    lines: ['오 좋다. 그럼 반대로 — 스스로 진짜 대견했던 때는 언제야?'],
    field: 'proudMoment',
    register: 'joyful',
    placeholder: '예: 아무도 안 믿었는데 끝까지 해냈을 때',
  },
  {
    kind: 'text',
    lines: ['살다 보면 지치는 순간도 있잖아. 최근에 제일 스트레스 받거나 힘들었던 거 있어?'],
    field: 'stressMoment',
    register: 'venting',
    placeholder: '예: 요즘 일도 사람도 다 버거워서 좀 지쳤어',
  },
  {
    kind: 'text',
    lines: ['조금 솔직한 얘기 하나만 더. 요즘 제일 무섭거나, 무서워서 자꾸 피하게 되는 거 있어?'],
    field: 'fear',
    register: 'venting',
    placeholder: '예: 도전했다가 실패해서 사람들 실망시키는 거',
  },
  {
    kind: 'text',
    lines: ['그거랑 이어서 — 사실은 해야 하는 걸 아는데, 자꾸 미루거나 피하는 건 뭐야?'],
    field: 'avoidance',
    register: 'reflective',
    placeholder: '예: 계속 미루는 이직 준비… 시작을 못 하겠어',
    optional: true,
  },
  {
    kind: 'text',
    lines: ['남들한테는 잘 말 안 하지만, 속으로 진짜 원하는 거. 하나만 꺼내볼래?'],
    field: 'desire',
    register: 'reflective',
    placeholder: '예: 그냥 인정받고 싶어. 잘하고 있다는 말 한마디',
  },
  {
    kind: 'text',
    lines: ['거의 다 왔어. 1년 뒤엔 어떤 나가 돼 있으면 “좀 컸다” 싶을까?'],
    field: 'growthDirection',
    register: 'reflective',
    placeholder: '예: 덜 눈치 보고, 하고 싶은 건 일단 해보는 나',
  },
  {
    kind: 'text',
    lines: ['그랬구나... 고생 많았네.', '혹시 요즘 주변에 힘들어하던 사람은 없었어? 있었다면 뭐라고 해줬는지 궁금해.'],
    field: 'comfortMemory',
    register: 'comforting',
    placeholder: "없으면 '없어'라고 해도 돼",
    optional: true,
  },
  {
    kind: 'text',
    lines: ['그리고 이건 좀 다른 건데 — 넌 힘들 때 누가 어떤 말 해주면 좀 괜찮아져?'],
    field: 'comfortTarget',
    register: 'comforting',
    placeholder: '예: 그냥 괜찮다고, 네 잘못 아니라고 해주면 좀 나아',
  },
  {
    kind: 'section',
    lines: [
      '좋아, {name}. **지금의 너**는 충분히 알겠어.',
      `이제 **${FUTURE_YEARS_AHEAD}년 뒤** — 네가 꿈꾸는, 이루고 싶은 **미래의 너**를 만들어보자.`,
      '상상해도 돼. 그때의 직업, 삶, 관계… 편하게 써줘.',
    ],
  },
  {
    kind: 'future-text',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤, 너는 무슨 일을 하고 있어? 직업·하는 일 구체적으로.`],
    field: 'career',
    placeholder: '예: 내가 원하던 분야 팀 리드, 혹은 1인 창업해서 안정적으로',
  },
  {
    kind: 'future-text',
    lines: ['그때 경제적으로는? 연봉·재산·돈 걱정 정도까지.'],
    field: 'income',
    placeholder: '예: 월세 걱정 없고, 여유 있게 저축·투자하는 정도',
  },
  {
    kind: 'future-text',
    lines: ['관계는? 가족·연애·결혼·주변 사람들.'],
    field: 'relationship',
    placeholder: '예: 좋은 사람 옆에 있고, 부모님한테도 자주 연락하는',
  },
  {
    kind: 'future-text',
    lines: ['몸·건강 상태는?'],
    field: 'health',
    placeholder: '예: 체력 좋고, 규칙적으로 운동하는 몸',
  },
  {
    kind: 'future-text',
    lines: ['하루는 어떻게 보내? 라이프스타일·루틴.'],
    field: 'lifestyle',
    placeholder: '예: 아침에 운동, 낮엔 일, 저녁엔 내 사람들이랑',
  },
  {
    kind: 'future-text',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤, 네가 제일 자랑스러워할 성취 하나.`],
    field: 'achievement',
    placeholder: '예: 미루던 걸 끝내고, 내 기준에선 성공했다고 느끼는 것',
  },
  {
    kind: 'future-text',
    lines: ['그 길을 오면서 배운 핵심 한 가지.'],
    field: 'lesson',
    placeholder: '예: 완벽보다 매일 조금씩이 이겼더라',
  },
  {
    kind: 'future-text',
    lines: [`지금(${FUTURE_YEARS_AHEAD}년 전)의 너한테 꼭 해주고 싶은 말.`],
    field: 'advice',
    placeholder: '예: 너무 불안해하지 마, 네 페이스대로 가도 돼',
  },
  {
    kind: 'future-text',
    lines: [`${FUTURE_YEARS_AHEAD}년 뒤의 너, 말투·성격은 지금이랑 어떻게 달라?`],
    field: 'voiceNote',
    placeholder: '예: 지금보다 담담하고, 덜 조급하게 말하는 편',
  },
]

interface Props {
  onComplete: (profile: SelfProfile) => void
  onExitToList: () => void
}

export function ChatOnboarding({ onComplete, onExitToList }: Props) {
  // stepIdx가 0(인트로만 본 상태)이면 복원하지 않고 새로 시작 → 스테일/중복 방지
  const restored = useRef<SavedProgress | null>(
    (() => {
      const s = loadOnboardingProgress<SavedProgress>()
      return s && s.stepIdx > 0 ? s : null
    })(),
  )
  const [transcript, setTranscript] = useState<Bubble[]>(() => restored.current?.transcript ?? [])
  const [stepIdx, setStepIdx] = useState(() => restored.current?.stepIdx ?? 0)
  const [botTyping, setBotTyping] = useState(false)
  const [inputReady, setInputReady] = useState(() => !!restored.current)
  const draft = useRef<SelfProfile>(restored.current?.draft ?? emptyProfile())
  const bigFiveAnswers = useRef<Record<string, number>>(restored.current?.bigFiveAnswers ?? {})
  const dilemmaDraft = useRef<Record<number, Dilemma>>(restored.current?.dilemmaDraft ?? {})
  // 이 stepIdx는 이미 화면에 있으니 애너운스(타이핑)를 건너뛴다 (복원/되돌리기용).
  // 소비형 불리언이 아니라 stepIdx 값 비교라 StrictMode 이중실행에도 안전.
  const skipAnnounceForStep = useRef<number | null>(restored.current ? restored.current.stepIdx : null)
  const history = useRef<Checkpoint[]>([])
  const [historyLen, setHistoryLen] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  const step = STEPS[stepIdx]
  const totalSteps = STEPS.length

  // 직전 답변으로 되돌리기 (한 단계 뒤로) — 되돌아간 스텝은 재타이핑 없이 바로 표시
  const goBack = () => {
    if (history.current.length < 2) return
    history.current.pop() // 현재 단계 체크포인트 제거
    const prev = history.current[history.current.length - 1]
    draft.current = clone(prev.draft)
    bigFiveAnswers.current = { ...prev.bigFiveAnswers }
    dilemmaDraft.current = { ...prev.dilemmaDraft }
    skipAnnounceForStep.current = prev.stepIdx
    setHistoryLen(history.current.length)
    setTranscript(clone(prev.transcript))
    setBotTyping(false)
    setInputReady(true)
    setStepIdx(prev.stepIdx)
  }

  const exitToList = () => {
    const hasAnswers = transcript.some((b) => b.role === 'user')
    if (hasAnswers || stepIdx > 0) {
      const ok = window.confirm(
        '목록으로 나갈까요?\n진행 중인 내용은 이 기기에 저장돼 있어요. (+ 만들기에서 이어서 할 수 있어요)',
      )
      if (!ok) return
    }
    onExitToList()
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, botTyping, inputReady])

  // 진행상황 자동저장 (새로고침/실수해도 이어서 가능)
  useEffect(() => {
    saveOnboardingProgress({
      stepIdx,
      transcript,
      draft: draft.current,
      bigFiveAnswers: bigFiveAnswers.current,
      dilemmaDraft: dilemmaDraft.current,
    })
  }, [transcript, stepIdx])

  // 단계가 입력 가능해지면 그 시점을 체크포인트로 저장 (중복 방지: 같은 stepIdx+길이면 skip)
  useEffect(() => {
    if (!inputReady) return
    const top = history.current[history.current.length - 1]
    if (top && top.stepIdx === stepIdx && top.transcript.length === transcript.length) return
    history.current.push({
      stepIdx,
      transcript: clone(transcript),
      draft: clone(draft.current),
      bigFiveAnswers: { ...bigFiveAnswers.current },
      dilemmaDraft: { ...dilemmaDraft.current },
    })
    setHistoryLen(history.current.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputReady, stepIdx, transcript.length])

  // 스텝 진입 시 봇 라인 순차 출력.
  // 복원/되돌리기로 이미 화면에 있는 스텝이면(skipAnnounceForStep===stepIdx) 애너운스를 건너뛴다.
  // 플래그를 소비하지 않으므로 StrictMode 이중실행에도 두 번 다 스킵되어 중복이 없다.
  useEffect(() => {
    if (skipAnnounceForStep.current === stepIdx) {
      setInputReady(true)
      return
    }
    const lines = step.lines.map((l) => l.replace('{name}', draft.current.name || '너'))
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    setInputReady(false)
    setBotTyping(true)

    let elapsed = 0
    lines.forEach((line, idx) => {
      elapsed += Math.min(1000, 300 + line.length * 18) + 200
      const t = setTimeout(() => {
        if (cancelled) return
        setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: 'bot', content: line }])
        if (idx === lines.length - 1) {
          setBotTyping(false)
          if (step.kind === 'section') {
            setTimeout(() => setStepIdx((s) => s + 1), 500)
          } else {
            setInputReady(true)
          }
        }
      }, elapsed)
      timers.push(t)
    })

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx])

  const pushUser = (content: string) => {
    setTranscript((t) => [...t, { id: crypto.randomUUID(), role: 'user', content }])
  }

  const advance = () => setStepIdx((s) => s + 1)

  const finish = () => {
    const p = draft.current
    p.bigFive = scoreBigFive(bigFiveAnswers.current)
    p.dilemmas = DILEMMA_SPECS.map((_, i) => dilemmaDraft.current[i]).filter(Boolean)
    p.styleSamples = collectStyleSamples(p)
    p.styleRules = extractStyleRules(p.styleSamples)
    if (!p.future) {
      p.future = {
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
    p.completedAt = new Date().toISOString()
    clearOnboardingProgress()
    onComplete(p)
  }

  const progress = Math.round(((stepIdx + 1) / totalSteps) * 100)

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto">
      <div className="px-5 pt-5 pb-3 border-b border-border/40 bg-surface/80">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center justify-center w-10 h-10 shrink-0">
              <FutureMeLogo size={40} />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-medium text-ink">미래의 나 만들기</h1>
              <p className="text-[11px] text-muted mt-0.5 truncate">{APP_TAGLINE}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={exitToList}
            className="text-xs text-muted hover:text-ink whitespace-nowrap px-2 py-1 rounded-lg hover:bg-ink/5 transition-colors shrink-0"
          >
            ← 목록
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[10px] text-muted">진행률</span>
              <span className="text-xs text-muted shrink-0">{progress}%</span>
            </div>
            <div className="h-[3px] bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-700 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={goBack}
            disabled={historyLen < 2}
            title={historyLen < 2 ? '아직 되돌릴 답변이 없어요' : '방금 답한 질문으로'}
            className="text-xs text-muted hover:text-accent whitespace-nowrap px-2 py-1 rounded-lg hover:bg-ink/5 transition-colors disabled:opacity-30 disabled:hover:text-muted disabled:hover:bg-transparent disabled:cursor-not-allowed shrink-0"
          >
            이전 질문
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {transcript.map((b, i) => (
          <Row
            key={b.id}
            role={b.role}
            content={b.content}
            showAvatar={b.role === 'bot' && transcript[i - 1]?.role !== 'bot'}
          />
        ))}
        {botTyping && (
          <div className="flex items-center gap-2">
            <Avatar />
            <div className="px-4 py-3 rounded-2xl bg-surface-2 border border-border flex gap-1">
              <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
              <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
              <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-surface/80 backdrop-blur-md">
        {inputReady && step.kind === 'name' && (
          <ShortTextInput
            placeholder="예: 민수 / 지은 / 야"
            hint="호칭만 짧게 (문장 말고 부를 이름 하나)"
            maxLength={16}
            onSubmit={(v) => {
              draft.current.name = v
              pushUser(v)
              advance()
            }}
          />
        )}
        {inputReady && step.kind === 'age' && (
          <AgeInput
            onSubmit={(age) => {
              draft.current.age = age
              pushUser(`${age}살`)
              advance()
            }}
          />
        )}
        {inputReady && step.kind === 'mbti' && (
          <MbtiInput
            onSubmit={(mbti) => {
              draft.current.mbti = mbti
              pushUser(mbti || '(MBTI는 잘 몰라)')
              advance()
            }}
          />
        )}
        {inputReady && step.kind === 'text' && (
          <LongTextInput
            placeholder={step.placeholder}
            optional={step.optional}
            onSubmit={(v) => {
              draft.current[step.field] = v
              pushUser(v)
              if (stepIdx === STEPS.length - 1) finish()
              else advance()
            }}
          />
        )}
        {inputReady && step.kind === 'future-text' && (
          <LongTextInput
            placeholder={step.placeholder}
            optional={step.optional}
            onSubmit={(v) => {
              draft.current.future[step.field] = v
              pushUser(v)
              if (stepIdx === STEPS.length - 1) finish()
              else advance()
            }}
          />
        )}
        {inputReady && step.kind === 'bigfive' && (
          <BigFivePanel
            onSubmit={(answers) => {
              bigFiveAnswers.current = answers
              pushUser('(성향 체크 완료 ✓)')
              advance()
            }}
          />
        )}
        {inputReady && step.kind === 'dilemma-choice' && (
          <ChoiceInput
            options={DILEMMA_SPECS[step.specIdx].options}
            onSubmit={(choice) => {
              dilemmaDraft.current[step.specIdx] = {
                id: DILEMMA_SPECS[step.specIdx].id,
                prompt: DILEMMA_SPECS[step.specIdx].prompt,
                choice,
                reason: '',
              }
              pushUser(choice)
              advance()
            }}
          />
        )}
        {inputReady && step.kind === 'dilemma-reason' && (
          <LongTextInput
            placeholder="한 줄이면 충분해"
            onSubmit={(v) => {
              const d = dilemmaDraft.current[step.specIdx]
              if (d) d.reason = v
              pushUser(v)
              advance()
            }}
          />
        )}
      </div>
    </div>
  )
}

function Avatar() {
  return (
    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
      <FutureMeLogo size={32} />
    </div>
  )
}

function Row({
  role,
  content,
  showAvatar = true,
}: {
  role: 'bot' | 'user'
  content: string
  showAvatar?: boolean
}) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
      {role === 'bot' &&
        (showAvatar ? (
          <div className="mr-2 self-end mb-0.5">
            <Avatar />
          </div>
        ) : (
          <div className="w-8 mr-2 flex-shrink-0" />
        ))}
      <div
        className={`max-w-[78%] px-3.5 py-2.5 text-[15px] leading-[1.45] whitespace-pre-line ${
          role === 'user' ? 'chat-bubble-me' : 'chat-bubble-them'
        }`}
      >
        {content}
      </div>
    </div>
  )
}

function ShortTextInput({
  placeholder,
  hint,
  maxLength,
  onSubmit,
}: {
  placeholder: string
  hint?: string
  maxLength?: number
  onSubmit: (v: string) => void
}) {
  const [v, setV] = useState('')
  const submit = () => {
    if (v.trim()) onSubmit(v.trim())
  }
  return (
    <div className="px-5 py-4">
      <div className="flex gap-2">
        <input
          autoFocus
          value={v}
          maxLength={maxLength}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder={placeholder}
          className="flex-1 px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-ink placeholder:text-muted/60 text-sm"
        />
        <Button onClick={submit} disabled={!v.trim()} className="px-5">→</Button>
      </div>
      {hint && <p className="text-[11px] text-muted mt-2 px-1">{hint}</p>}
    </div>
  )
}

function LongTextInput({
  placeholder,
  optional,
  onSubmit,
}: {
  placeholder: string
  optional?: boolean
  onSubmit: (v: string) => void
}) {
  const [v, setV] = useState('')
  const submit = () => {
    const val = v.trim()
    if (val) onSubmit(val)
    else if (optional) onSubmit('없어')
  }
  return (
    <div className="px-5 py-4 flex gap-2 items-end">
      <textarea
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
        rows={1}
        placeholder={placeholder}
        className="flex-1 px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-ink placeholder:text-muted/60 text-sm resize-none max-h-32"
      />
      <Button onClick={submit} disabled={!v.trim() && !optional} className="px-5">→</Button>
    </div>
  )
}

function AgeInput({ onSubmit }: { onSubmit: (age: number) => void }) {
  const [age, setAge] = useState(25)
  return (
    <div className="px-5 py-4">
      <p className="text-center text-3xl font-semibold text-glow mb-3">{age}<span className="text-base text-muted ml-1">살</span></p>
      <input
        type="range"
        min={14}
        max={70}
        value={age}
        onChange={(e) => setAge(Number(e.target.value))}
        className="w-full accent-accent mb-3"
      />
      <Button onClick={() => onSubmit(age)} className="w-full">이거 맞아</Button>
    </div>
  )
}

const MBTI_AXES: [string, string][] = [
  ['E', 'I'],
  ['N', 'S'],
  ['T', 'F'],
  ['J', 'P'],
]
const MBTI_HINTS = ['외향 / 내향', '직관 / 감각', '사고 / 감정', '계획 / 즉흥']

function MbtiInput({ onSubmit }: { onSubmit: (v: string) => void }) {
  const [picks, setPicks] = useState<(string | null)[]>([null, null, null, null])
  const done = picks.every((p) => p !== null)
  return (
    <div className="px-5 py-4 space-y-3">
      {MBTI_AXES.map(([a, b], i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-[11px] text-muted w-16">{MBTI_HINTS[i]}</span>
          <div className="flex-1 grid grid-cols-2 gap-2">
            {[a, b].map((letter) => (
              <button
                key={letter}
                onClick={() => setPicks((p) => p.map((x, idx) => (idx === i ? letter : x)))}
                className={`py-2.5 rounded-xl border text-sm font-serif transition-all ${
                  picks[i] === letter
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface-2 text-muted hover:text-ink hover:border-accent/40'
                }`}
              >
                {letter}
              </button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onSubmit('')}
          className="flex-1 py-3 rounded-xl border border-border text-muted text-sm hover:text-ink hover:border-accent/40 transition-colors"
        >
          잘 몰라 / 넘어가기
        </button>
        <Button onClick={() => onSubmit(picks.join(''))} disabled={!done} className="flex-1">
          {done ? `${picks.join('')} 맞아` : '4개 다 골라줘'}
        </Button>
      </div>
    </div>
  )
}

function ChoiceInput({ options, onSubmit }: { options: string[]; onSubmit: (v: string) => void }) {
  return (
    <div className="px-5 py-4 space-y-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSubmit(o)}
          className="w-full text-left px-4 py-3 rounded-xl bg-surface-2 border border-border hover:border-accent hover:bg-accent/10 transition-all text-sm"
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function BigFivePanel({ onSubmit }: { onSubmit: (a: Record<string, number>) => void }) {
  const [answers, setAnswers] = useState<Record<string, number>>(() =>
    Object.fromEntries(BIG_FIVE_ITEMS.map((i) => [i.id, 4])),
  )
  return (
    <div className="px-5 py-4 max-h-[46vh] overflow-y-auto">
      <div className="space-y-4">
        {BIG_FIVE_ITEMS.map((item) => (
          <div key={item.id}>
            <p className="text-sm text-ink/90 mb-2">{item.text}</p>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted w-10">아니다</span>
              <input
                type="range"
                min={1}
                max={7}
                value={answers[item.id]}
                onChange={(e) => setAnswers((a) => ({ ...a, [item.id]: Number(e.target.value) }))}
                className="flex-1 accent-accent"
              />
              <span className="text-[10px] text-muted w-10 text-right">그렇다</span>
            </div>
          </div>
        ))}
      </div>
      <Button onClick={() => onSubmit(answers)} className="w-full mt-5">다 했어</Button>
    </div>
  )
}
