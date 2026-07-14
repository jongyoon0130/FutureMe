import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { AdviceTone, Dilemma, LifeDomain, SelfProfile } from '../../types/self'
import { emptyProfile, LIFE_DOMAIN_LABELS, ADVICE_TONE_LABELS, DILEMMA_SPECS } from '../../types/self'
import { collectStyleSamples, extractStyleRules } from '../../lib/selfEngine'
import { saveOnboardingProgress, loadOnboardingProgress, clearOnboardingProgress, ONBOARDING_PROGRESS_VERSION } from '../../lib/storage'
import { APP_TAGLINE } from '../../lib/brand'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { Button } from '../ui'
import {
  ADVICE_PRESETS,
  CONTINUITY_LABELS,
  FEARED_SELF_OPTIONS,
  LIFE_DOMAIN_ORDER,
  ONBOARDING_STEPS,
  SPEECH_TONE_OPTIONS,
  TRAIT_SHIFT_OPTIONS,
  WEEKLY_ACTION_OPTIONS,
  type FutureField,
  type OnboardingStep,
  type ProfileField,
} from '../../lib/onboardingConfig'

const ONBOARDING_VERSION = ONBOARDING_PROGRESS_VERSION

interface SavedProgress {
  version?: number
  stepIdx: number
  transcript: Bubble[]
  draft: SelfProfile
  dilemmaDraft: Dilemma | null
}

interface Checkpoint {
  stepIdx: number
  transcript: Bubble[]
  draft: SelfProfile
  dilemmaDraft: Dilemma | null
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

type Bubble = { id: string; role: 'bot' | 'user'; content: string }

interface Props {
  onComplete: (profile: SelfProfile) => void
  onExitToList: () => void
}

function previewText(text: string, max = 72): string {
  const t = text.trim().replace(/\s+/g, ' ')
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export function ChatOnboarding({ onComplete, onExitToList }: Props) {
  const restored = useRef<SavedProgress | null>(
    (() => {
      const s = loadOnboardingProgress<SavedProgress>()
      return s && s.version === ONBOARDING_VERSION && s.stepIdx > 0 ? s : null
    })(),
  )
  const [transcript, setTranscript] = useState<Bubble[]>(() => restored.current?.transcript ?? [])
  const [stepIdx, setStepIdx] = useState(() => restored.current?.stepIdx ?? 0)
  const [botTyping, setBotTyping] = useState(false)
  const [inputReady, setInputReady] = useState(() => !!restored.current)
  const draft = useRef<SelfProfile>(restored.current?.draft ?? emptyProfile())
  const dilemmaDraft = useRef<Dilemma | null>(restored.current?.dilemmaDraft ?? null)
  const skipAnnounceForStep = useRef<number | null>(restored.current ? restored.current.stepIdx : null)
  const history = useRef<Checkpoint[]>([])
  const [historyLen, setHistoryLen] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  const step = ONBOARDING_STEPS[stepIdx]
  const totalSteps = ONBOARDING_STEPS.length

  const goBack = () => {
    if (history.current.length < 2) return
    history.current.pop()
    const prev = history.current[history.current.length - 1]
    draft.current = clone(prev.draft)
    dilemmaDraft.current = prev.dilemmaDraft ? { ...prev.dilemmaDraft } : null
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

  useEffect(() => {
    saveOnboardingProgress({
      version: ONBOARDING_VERSION,
      stepIdx,
      transcript,
      draft: draft.current,
      dilemmaDraft: dilemmaDraft.current,
    })
  }, [transcript, stepIdx])

  useEffect(() => {
    if (!inputReady) return
    const top = history.current[history.current.length - 1]
    if (top && top.stepIdx === stepIdx && top.transcript.length === transcript.length) return
    history.current.push({
      stepIdx,
      transcript: clone(transcript),
      draft: clone(draft.current),
      dilemmaDraft: dilemmaDraft.current ? { ...dilemmaDraft.current } : null,
    })
    setHistoryLen(history.current.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputReady, stepIdx, transcript.length])

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
    if (dilemmaDraft.current) p.dilemmas = [dilemmaDraft.current]
    p.styleSamples = collectStyleSamples(p)
    p.styleRules = extractStyleRules(p.styleSamples)
    p.completedAt = new Date().toISOString()
    if (!p.id) p.id = crypto.randomUUID()
    clearOnboardingProgress()
    onComplete(p)
  }

  const submitAndAdvance = (display: string, isLast = false) => {
    pushUser(display)
    if (isLast || stepIdx === ONBOARDING_STEPS.length - 1) finish()
    else advance()
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
              <span className="text-[10px] text-muted">
                {stepIdx + 1} / {totalSteps}
              </span>
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
        {inputReady && (
          <StepInput
            step={step}
            draft={draft}
            dilemmaDraft={dilemmaDraft}
            onSubmit={submitAndAdvance}
          />
        )}
      </div>
    </div>
  )
}

function setProfileField(draft: SelfProfile, field: ProfileField, value: string) {
  switch (field) {
    case 'currentRole':
      draft.currentRole = value
      break
    case 'lifeContext':
      draft.lifeContext = value
      break
    case 'styleSample':
      draft.styleSample = value
      break
    case 'corePriority':
      draft.corePriority = value
      break
    case 'successDef':
      draft.successDef = value
      break
    case 'stressMoment':
      draft.stressMoment = value
      break
    case 'fear':
      draft.fear = value
      break
    case 'desire':
      draft.desire = value
      break
    case 'growthDirection':
      draft.growthDirection = value
      break
  }
}

function setFutureField(draft: SelfProfile, field: FutureField, value: string) {
  draft.future[field] = value
}

function StepInput({
  step,
  draft,
  dilemmaDraft,
  onSubmit,
}: {
  step: OnboardingStep
  draft: MutableRefObject<SelfProfile>
  dilemmaDraft: MutableRefObject<Dilemma | null>
  onSubmit: (display: string, isLast?: boolean) => void
}) {
  switch (step.kind) {
    case 'name':
      return (
        <ShortTextInput
          placeholder="예: 민수 / 지은"
          hint="호칭만 짧게"
          maxLength={16}
          onSubmit={(v) => {
            draft.current.name = v
            onSubmit(v)
          }}
        />
      )
    case 'age':
      return (
        <AgeInput
          onSubmit={(age) => {
            draft.current.age = age
            onSubmit(`${age}살`)
          }}
        />
      )
    case 'profile-text':
      return (
        <TextAreaInput
          placeholder={step.placeholder}
          maxLength={step.maxLength}
          minLength={step.minLength}
          optional={step.optional}
          rows={step.maxLength > 250 ? 4 : 2}
          onSubmit={(v) => {
            setProfileField(draft.current, step.field, v)
            onSubmit(previewText(v))
          }}
        />
      )
    case 'concerns':
      return (
        <ChipMultiSelect
          options={LIFE_DOMAIN_ORDER.map((d) => LIFE_DOMAIN_LABELS[d])}
          max={step.max}
          onSubmit={(labels) => {
            const domains = labels.map(
              (l) => Object.entries(LIFE_DOMAIN_LABELS).find(([, v]) => v === l)?.[0] as LifeDomain,
            )
            draft.current.concernDomains = domains
            if (!draft.current.lifeContext?.trim()) {
              draft.current.lifeContext = labels.join(', ')
            }
            onSubmit(labels.join(' · '))
          }}
        />
      )
    case 'speech-tone':
      return (
        <ChipSelect
          options={[...SPEECH_TONE_OPTIONS]}
          onSubmit={(v) => {
            draft.current.speechTone = v
            onSubmit(v)
          }}
        />
      )
    case 'dilemma-choice':
      return (
        <ChoiceInput
          options={DILEMMA_SPECS[0].options}
          onSubmit={(choice) => {
            dilemmaDraft.current = {
              id: DILEMMA_SPECS[0].id,
              prompt: DILEMMA_SPECS[0].prompt,
              choice,
              reason: '',
            }
            onSubmit(choice)
          }}
        />
      )
    case 'dilemma-reason':
      return (
        <TextAreaInput
          placeholder="한두 문장이면 충분해"
          maxLength={180}
          minLength={5}
          rows={2}
          onSubmit={(v) => {
            if (dilemmaDraft.current) dilemmaDraft.current.reason = v
            onSubmit(previewText(v))
          }}
        />
      )
    case 'future-text':
      return (
        <TextAreaInput
          placeholder={step.placeholder}
          maxLength={step.maxLength}
          minLength={step.minLength}
          optional={step.optional}
          rows={step.maxLength > 300 ? 5 : 3}
          onSubmit={(v) => {
            setFutureField(draft.current, step.field, v)
            onSubmit(previewText(v))
          }}
        />
      )
    case 'thriving-domains':
      return (
        <ChipMultiSelect
          options={LIFE_DOMAIN_ORDER.map((d) => LIFE_DOMAIN_LABELS[d])}
          max={step.max}
          onSubmit={(labels) => {
            const domains = labels.map(
              (l) => Object.entries(LIFE_DOMAIN_LABELS).find(([, v]) => v === l)?.[0] as LifeDomain,
            )
            draft.current.future.thrivingDomains = domains
            onSubmit(labels.join(' · '))
          }}
        />
      )
    case 'feared-selves':
      return (
        <ChipMultiSelect
          options={[...FEARED_SELF_OPTIONS]}
          max={step.max}
          onSubmit={(labels) => {
            draft.current.future.fearedSelves = labels
            onSubmit(labels.join(' · '))
          }}
        />
      )
    case 'traits-shift':
      return (
        <ChipMultiSelect
          options={[...TRAIT_SHIFT_OPTIONS]}
          max={step.max}
          onSubmit={(labels) => {
            draft.current.future.traitsShift = labels
            onSubmit(labels.join(' · '))
          }}
        />
      )
    case 'advice':
      return (
        <AdviceLongPanel
          onSubmit={(tone, line) => {
            draft.current.future.adviceTone = tone
            draft.current.future.adviceLine = line
            draft.current.comfortTarget = line
            onSubmit(`[${ADVICE_TONE_LABELS[tone]}] ${previewText(line, 100)}`)
          }}
        />
      )
    case 'continuity':
      return (
        <ContinuityPanel
          onSubmit={(score) => {
            draft.current.future.continuityScore = score
            onSubmit(CONTINUITY_LABELS[score - 1] || `${score}/7`)
          }}
        />
      )
    case 'weekly-action':
      return (
        <WeeklyActionPanel
          onSubmit={(action) => {
            draft.current.future.weeklyAction = action
            onSubmit(action)
          }}
        />
      )
    case 'ask-about':
      return (
        <ChipSelect
          options={LIFE_DOMAIN_ORDER.map((d) => LIFE_DOMAIN_LABELS[d])}
          onSubmit={(label) => {
            const domain = Object.entries(LIFE_DOMAIN_LABELS).find(([, v]) => v === label)?.[0] as LifeDomain
            draft.current.future.askAbout = domain
            onSubmit(label, true)
          }}
        />
      )
    default:
      return null
  }
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
        <Button onClick={submit} disabled={!v.trim()} className="px-5">
          →
        </Button>
      </div>
      {hint && <p className="text-[11px] text-muted mt-2 px-1">{hint}</p>}
    </div>
  )
}

function TextAreaInput({
  placeholder,
  maxLength,
  minLength = 0,
  optional,
  rows = 3,
  onSubmit,
}: {
  placeholder: string
  maxLength: number
  minLength?: number
  optional?: boolean
  rows?: number
  onSubmit: (v: string) => void
}) {
  const [v, setV] = useState('')
  const len = v.trim().length
  const ok = len >= minLength || (optional && len === 0)
  const submit = () => {
    const val = v.trim()
    if (val && len >= minLength) onSubmit(val)
    else if (optional && !val) onSubmit('(건너뜀)')
  }
  return (
    <div className="px-5 py-4">
      <textarea
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-ink placeholder:text-muted/60 text-sm resize-none"
      />
      <div className="flex items-center justify-between mt-2 gap-2">
        <span className="text-[10px] text-muted">
          {len}/{maxLength}
          {minLength > 0 && len < minLength ? ` · ${minLength}자 이상` : ''}
        </span>
        <div className="flex gap-2">
          {optional && (
            <button type="button" onClick={() => onSubmit('(건너뜀)')} className="text-xs text-muted hover:text-ink px-2">
              건너뛰기
            </button>
          )}
          <Button onClick={submit} disabled={!ok} className="px-5">
            →
          </Button>
        </div>
      </div>
    </div>
  )
}

function AgeInput({ onSubmit }: { onSubmit: (age: number) => void }) {
  const [age, setAge] = useState(25)
  return (
    <div className="px-5 py-4">
      <p className="text-center text-3xl font-semibold text-glow mb-3">
        {age}
        <span className="text-base text-muted ml-1">살</span>
      </p>
      <input
        type="range"
        min={14}
        max={70}
        value={age}
        onChange={(e) => setAge(Number(e.target.value))}
        className="w-full accent-accent mb-3"
      />
      <Button onClick={() => onSubmit(age)} className="w-full">
        이거 맞아
      </Button>
    </div>
  )
}

function ChipSelect({ options, onSubmit }: { options: string[]; onSubmit: (v: string) => void }) {
  return (
    <div className="px-5 py-4 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onSubmit(o)}
          className="px-4 py-2.5 rounded-full border border-border bg-surface-2 text-sm hover:border-accent hover:bg-accent/10 transition-all"
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function ChipMultiSelect({
  options,
  max,
  onSubmit,
}: {
  options: string[]
  max: number
  onSubmit: (selected: string[]) => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const toggle = (o: string) => {
    setSelected((prev) => {
      if (prev.includes(o)) return prev.filter((x) => x !== o)
      if (prev.length >= max) return prev
      return [...prev, o]
    })
  }
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap gap-2 mb-3">
        {options.map((o) => {
          const active = selected.includes(o)
          return (
            <button
              key={o}
              type="button"
              onClick={() => toggle(o)}
              className={`px-4 py-2.5 rounded-full border text-sm transition-all ${
                active
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border bg-surface-2 hover:border-accent/40'
              }`}
            >
              {o}
            </button>
          )
        })}
      </div>
      <Button onClick={() => onSubmit(selected)} disabled={selected.length === 0} className="w-full">
        {selected.length > 0 ? `선택 완료 (${selected.length}/${max})` : '하나 이상 골라줘'}
      </Button>
    </div>
  )
}

function ChoiceInput({ options, onSubmit }: { options: string[]; onSubmit: (v: string) => void }) {
  return (
    <div className="px-5 py-4 space-y-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onSubmit(o)}
          className="w-full text-left px-4 py-3 rounded-xl bg-surface-2 border border-border hover:border-accent hover:bg-accent/10 transition-all text-sm"
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function AdviceLongPanel({ onSubmit }: { onSubmit: (tone: AdviceTone, line: string) => void }) {
  const [tone, setTone] = useState<AdviceTone>('comfort')
  const [text, setText] = useState('')
  const presets = ADVICE_PRESETS[tone]

  const submit = () => {
    const v = text.trim()
    if (v.length >= 20) onSubmit(tone, v.slice(0, 360))
  }

  return (
    <div className="px-5 py-4 space-y-3 max-h-[52vh] overflow-y-auto">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ADVICE_TONE_LABELS) as AdviceTone[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTone(t)}
            className={`px-3 py-2 rounded-full border text-xs ${
              tone === t ? 'border-accent bg-accent/15 text-accent' : 'border-border bg-surface-2'
            }`}
          >
            {ADVICE_TONE_LABELS[t]}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">예시 누르면 편집할 수 있어요</p>
      <div className="space-y-2">
        {presets.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setText(p)}
            className="w-full text-left px-4 py-3 rounded-xl bg-surface-2 border border-border hover:border-accent text-sm leading-relaxed"
          >
            {p}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        maxLength={360}
        placeholder="미래의 네가 지금의 너한테 보내는 편지 (20자 이상)"
        className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm resize-none"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted">{text.trim().length}/360</span>
        <Button onClick={submit} disabled={text.trim().length < 20} className="px-5">
          →
        </Button>
      </div>
    </div>
  )
}

function ContinuityPanel({ onSubmit }: { onSubmit: (score: number) => void }) {
  const [score, setScore] = useState(4)
  const overlap = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9][score - 1] ?? 0.45

  return (
    <div className="px-5 py-4">
      <div className="flex justify-center mb-4">
        <svg width="120" height="60" viewBox="0 0 120 60" aria-hidden>
          <circle cx="40" cy="30" r="28" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted" />
          <circle
            cx={40 + 56 * overlap}
            cy="30"
            r="28"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-accent"
          />
        </svg>
      </div>
      <p className="text-center text-sm text-ink mb-3">{CONTINUITY_LABELS[score - 1] || `${score}/7`}</p>
      <input
        type="range"
        min={1}
        max={7}
        value={score}
        onChange={(e) => setScore(Number(e.target.value))}
        className="w-full accent-accent mb-3"
      />
      <div className="flex justify-between text-[10px] text-muted px-1 mb-3">
        <span>완전 남</span>
        <span>거의 같은 사람</span>
      </div>
      <Button onClick={() => onSubmit(score)} className="w-full">
        이 정도야
      </Button>
    </div>
  )
}

function WeeklyActionPanel({ onSubmit }: { onSubmit: (action: string) => void }) {
  const [custom, setCustom] = useState('')
  return (
    <div className="px-5 py-4 space-y-2">
      {[...WEEKLY_ACTION_OPTIONS].map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onSubmit(o === '잘 모르겠어' ? '아직 정하지 않았어' : o)}
          className="w-full text-left px-4 py-3 rounded-xl bg-surface-2 border border-border hover:border-accent text-sm"
        >
          {o}
        </button>
      ))}
      <div className="flex gap-2 pt-2">
        <input
          value={custom}
          maxLength={80}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && custom.trim() && onSubmit(custom.trim())}
          placeholder="직접 입력"
          className="flex-1 px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm"
        />
        <Button onClick={() => custom.trim() && onSubmit(custom.trim())} disabled={!custom.trim()} className="px-4">
          →
        </Button>
      </div>
    </div>
  )
}
