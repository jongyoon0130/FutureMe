import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { SelfProfile } from '../../types/self'
import type {
  DeliverableFormat,
  GoalIntake,
  GoalPlan,
  GoalProgress,
  RoutineFrequency,
  RoutineHistory,
} from '../../types/goalPlan'
import {
  DELIVERABLE_FORMAT_LABELS,
  GOAL_PROGRESS_LABELS,
  GOAL_TEMPLATE_LABELS,
  emptyGoalIntake,
} from '../../types/goalPlan'
import { ROUTINE_FREQUENCY_LABELS, ROUTINE_HISTORY_LABELS } from '../../types/goalPlan'
import { GOAL_INTAKE_CORE_STEPS, buildIntakeFlow, type GoalIntakeStep } from '../../lib/goalPlannerConfig'
import { buildGoalPlan, classifyGoalTemplate, migrateGoalPlan } from '../../lib/goalTemplateEngine'
import { saveGoalPlan } from '../../lib/goalPlanStore'
import { FutureMeLogo } from '../brand/FutureMeLogo'
import { Button } from '../ui'

type Bubble = { id: string; role: 'bot' | 'user'; content: string }

interface Props {
  profile: SelfProfile
  onComplete: (plan: GoalPlan) => void
  onCancel: () => void
}

function defaultDeadline(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

export function GoalPlanIntake({ profile, onComplete, onCancel }: Props) {
  const intake = useRef<GoalIntake>(emptyGoalIntake())
  const [steps, setSteps] = useState<GoalIntakeStep[]>(GOAL_INTAKE_CORE_STEPS)
  const [stepIdx, setStepIdx] = useState(0)
  const [transcript, setTranscript] = useState<Bubble[]>([])
  const [botTyping, setBotTyping] = useState(false)
  const [inputReady, setInputReady] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  const step = steps[stepIdx]
  const totalSteps = steps.length

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript, botTyping, inputReady])

  useEffect(() => {
    if (!step) return
    const lines = step.lines
    let cancelled = false
    const timers: ReturnType<typeof setTimeout>[] = []
    setInputReady(false)
    setBotTyping(true)

    let elapsed = 0
    lines.forEach((line, idx) => {
      elapsed += Math.min(900, 280 + line.length * 16) + 180
      const t = setTimeout(() => {
        if (cancelled) return
        setTranscript((prev) => [...prev, { id: crypto.randomUUID(), role: 'bot', content: line }])
        if (idx === lines.length - 1) {
          setBotTyping(false)
          setInputReady(true)
        }
      }, elapsed)
      timers.push(t)
    })

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
    }
  }, [stepIdx, step])

  const pushUser = (content: string) => {
    setTranscript((t) => [...t, { id: crypto.randomUUID(), role: 'user', content }])
  }

  const finish = () => {
    const built = buildGoalPlan(profile.id, intake.current, profile)
    const plan = migrateGoalPlan(built, profile)
    saveGoalPlan(plan)
    pushUser(`[${GOAL_TEMPLATE_LABELS[plan.templateType]}] 플래너 생성됐어`)
    onComplete(plan)
  }

  const advance = (display: string) => {
    pushUser(display)
    if (stepIdx === 3) {
      const type = classifyGoalTemplate(intake.current)
      setSteps(buildIntakeFlow(type))
      setStepIdx(4)
      return
    }
    if (stepIdx >= steps.length - 1) {
      finish()
      return
    }
    setStepIdx((s) => s + 1)
  }

  const progress = Math.round(((stepIdx + 1) / totalSteps) * 100)

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto">
      <div className="px-5 pt-4 pb-3 border-b border-border/40 bg-surface/80">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <FutureMeLogo size={36} />
            <div>
              <h1 className="text-base font-medium text-ink">목표 플래너 만들기</h1>
              <p className="text-[11px] text-muted">4문항 + 맞춤 2문항</p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="text-xs text-muted hover:text-ink px-2 py-1 rounded-lg">
            취소
          </button>
        </div>
        <div className="h-[3px] bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full bg-accent transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-[10px] text-muted mt-1">
          {stepIdx + 1} / {totalSteps}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
        {transcript.map((b) => (
          <div key={b.id} className={`flex ${b.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
            <div className={`max-w-[78%] px-3.5 py-2.5 text-[15px] leading-[1.45] whitespace-pre-line ${b.role === 'user' ? 'chat-bubble-me' : 'chat-bubble-them'}`}>
              {b.content}
            </div>
          </div>
        ))}
        {botTyping && (
          <div className="px-4 py-3 rounded-2xl bg-surface-2 border border-border inline-flex gap-1">
            <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
            <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
            <span className="typing-dot w-2 h-2 rounded-full bg-muted" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border bg-surface/80">
        {inputReady && step && (
          <IntakeInput step={step} intake={intake} onSubmit={advance} />
        )}
      </div>
    </div>
  )
}

function IntakeInput({
  step,
  intake,
  onSubmit,
}: {
  step: GoalIntakeStep
  intake: MutableRefObject<GoalIntake>
  onSubmit: (display: string) => void
}) {
  switch (step.kind) {
    case 'goal':
      return (
        <TextField
          placeholder="예: 8/15까지 앱스토어 출시"
          maxLength={120}
          minLength={4}
          onSubmit={(v) => {
            intake.current.goal = v
            onSubmit(v.length > 40 ? `${v.slice(0, 40)}…` : v)
          }}
        />
      )
    case 'deadline':
      return (
        <DeadlineField
          defaultValue={defaultDeadline()}
          onSubmit={(v) => {
            intake.current.deadline = v
            onSubmit(v)
          }}
        />
      )
    case 'success':
      return (
        <TextAreaField
          placeholder="예: App Store 심사 통과 · 출시 완료"
          maxLength={200}
          minLength={4}
          onSubmit={(v) => {
            intake.current.successCriteria = v
            onSubmit(v.length > 48 ? `${v.slice(0, 48)}…` : v)
          }}
        />
      )
    case 'progress':
      return (
        <ChipField
          options={Object.entries(GOAL_PROGRESS_LABELS).map(([k, v]) => ({ id: k, label: v }))}
          onSubmit={(id, label) => {
            intake.current.progress = id as GoalProgress
            onSubmit(label)
          }}
        />
      )
    case 'blockers':
      return (
        <TextAreaField
          placeholder="예: 앱 심사 리젝, 풀타임 병행, 디자인 자료 부족"
          maxLength={200}
          minLength={3}
          onSubmit={(v) => {
            intake.current.blockers = v
            onSubmit(v.length > 48 ? `${v.slice(0, 48)}…` : v)
          }}
        />
      )
    case 'scope-exclude':
      return (
        <TextAreaField
          placeholder="예: 안드로이드는 이번에 제외"
          maxLength={160}
          optional
          onSubmit={(v) => {
            intake.current.scopeExclude = v === '(건너뜀)' ? '' : v
            onSubmit(v)
          }}
        />
      )
    case 'deliverable-format':
      return (
        <ChipField
          options={Object.entries(DELIVERABLE_FORMAT_LABELS).map(([k, v]) => ({ id: k, label: v }))}
          onSubmit={(id, label) => {
            intake.current.deliverableFormat = id as DeliverableFormat
            onSubmit(label)
          }}
        />
      )
    case 'feedback':
      return (
        <ChipField
          options={[
            { id: 'yes', label: '있음' },
            { id: 'no', label: '없음 · 셀프 리뷰' },
          ]}
          onSubmit={(id, label) => {
            intake.current.hasFeedback = id === 'yes'
            onSubmit(label)
          }}
        />
      )
    case 'routine-frequency':
      return (
        <ChipField
          options={Object.entries(ROUTINE_FREQUENCY_LABELS).map(([k, v]) => ({ id: k, label: v }))}
          onSubmit={(id, label) => {
            intake.current.routineFrequency = id as RoutineFrequency
            onSubmit(label)
          }}
        />
      )
    case 'routine-history':
      return (
        <ChipField
          options={Object.entries(ROUTINE_HISTORY_LABELS).map(([k, v]) => ({ id: k, label: v }))}
          onSubmit={(id, label) => {
            intake.current.routineHistory = id as RoutineHistory
            onSubmit(label)
          }}
        />
      )
    default:
      return null
  }
}

function TextField({
  placeholder,
  maxLength,
  minLength,
  onSubmit,
}: {
  placeholder: string
  maxLength: number
  minLength: number
  onSubmit: (v: string) => void
}) {
  const [v, setV] = useState('')
  return (
    <div className="px-5 py-4 flex gap-2">
      <input
        autoFocus
        value={v}
        maxLength={maxLength}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v.trim().length >= minLength && onSubmit(v.trim())}
        placeholder={placeholder}
        className="flex-1 px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm"
      />
      <Button onClick={() => onSubmit(v.trim())} disabled={v.trim().length < minLength} className="px-5">
        →
      </Button>
    </div>
  )
}

function TextAreaField({
  placeholder,
  maxLength,
  minLength = 0,
  optional,
  onSubmit,
}: {
  placeholder: string
  maxLength: number
  minLength?: number
  optional?: boolean
  onSubmit: (v: string) => void
}) {
  const [v, setV] = useState('')
  const ok = v.trim().length >= minLength || (optional && !v.trim())
  return (
    <div className="px-5 py-4">
      <textarea
        autoFocus
        value={v}
        rows={3}
        maxLength={maxLength}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm resize-none"
      />
      <div className="flex justify-end gap-2 mt-2">
        {optional && (
          <button type="button" onClick={() => onSubmit('(건너뜀)')} className="text-xs text-muted px-2">
            건너뛰기
          </button>
        )}
        <Button onClick={() => onSubmit(v.trim() || '(건너뜀)')} disabled={!ok} className="px-5">
          →
        </Button>
      </div>
    </div>
  )
}

function DeadlineField({ defaultValue, onSubmit }: { defaultValue: string; onSubmit: (v: string) => void }) {
  const [v, setV] = useState(defaultValue)
  return (
    <div className="px-5 py-4 space-y-3">
      <input
        type="date"
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="w-full px-4 py-3 rounded-xl bg-surface-2 border border-border focus:border-accent focus:outline-none text-sm"
      />
      <Button onClick={() => v && onSubmit(v)} disabled={!v} className="w-full">
        이 날짜로
      </Button>
    </div>
  )
}

function ChipField({
  options,
  onSubmit,
}: {
  options: { id: string; label: string }[]
  onSubmit: (id: string, label: string) => void
}) {
  return (
    <div className="px-5 py-4 flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onSubmit(o.id, o.label)}
          className="px-4 py-2.5 rounded-full border border-border bg-surface-2 text-sm hover:border-accent hover:bg-accent/10"
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
