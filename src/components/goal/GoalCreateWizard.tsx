import { useMemo, useState, type ReactNode } from 'react'
import type { SelfProfile } from '../../types/self'
import type { GoalIntake, GoalMotivationAnswers, GoalPlan } from '../../types/goalPlan'
import { emptyGoalIntake, GOAL_PLAN_TEMPLATE_VERSION } from '../../types/goalPlan'
import { buildEmptyHierarchy } from '../../lib/goalHierarchyEngine'
import { getHorizonMeta } from '../../lib/goalHorizon'
import {
  creationModeToTemplate,
  GOAL_CREATION_MODES,
  type GoalCreationMode,
} from '../../lib/goalCreationConfig'
import {
  GOAL_MOTIVATION_CATEGORY_LABELS,
  GOAL_MOTIVATION_QUESTIONS,
  type GoalMotivationQuestion,
} from '../../lib/goalMotivationConfig'
import { buildGoalPlan } from '../../lib/goalTemplateEngine'
import { saveGoalPlan } from '../../lib/goalPlanStore'
import { GoalNav } from './GoalShell'
import { GoalRoutineFrequencyPicker } from './GoalRoutineFrequencyPicker'

interface Props {
  profile: SelfProfile
  onComplete: (plan: GoalPlan) => void
  onCancel: () => void
}

const TOTAL_STEPS = 1 + GOAL_MOTIVATION_QUESTIONS.length

function defaultDeadline(): string {
  const d = new Date()
  d.setMonth(d.getMonth() + 3)
  return d.toISOString().slice(0, 10)
}

function emptyMotivation(): GoalMotivationAnswers {
  return {}
}

function PromptText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

export function GoalCreateWizard({ profile, onComplete, onCancel }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [creationMode, setCreationMode] = useState<GoalCreationMode | null>(null)
  const [title, setTitle] = useState('')
  const [deadline, setDeadline] = useState(defaultDeadline())
  const [motivation, setMotivation] = useState<GoalMotivationAnswers>(emptyMotivation)
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('weekly')
  const [timesPerWeek, setTimesPerWeek] = useState(3)
  const [sessionLength, setSessionLength] = useState<'light' | 'moderate'>('moderate')

  const isHabit = creationMode === 'habit'
  const modeMeta = GOAL_CREATION_MODES.find((m) => m.id === creationMode)

  const meta = useMemo(() => getHorizonMeta(deadline), [deadline])
  const motivationQ = GOAL_MOTIVATION_QUESTIONS[stepIdx - 1] as GoalMotivationQuestion | undefined

  const stepTitle =
    stepIdx === 0 ? '새 목표' : GOAL_MOTIVATION_CATEGORY_LABELS[motivationQ!.category]

  const goBack = () => (stepIdx === 0 ? onCancel() : setStepIdx(stepIdx - 1))

  const setMotivationAnswer = (id: keyof GoalMotivationAnswers, value: string) => {
    setMotivation((m) => ({ ...m, [id]: value }))
  }

  const handleCadenceChange = (next: 'daily' | 'weekly') => {
    setCadence(next)
    if (next === 'daily') setTimesPerWeek(7)
    else if (timesPerWeek >= 7) setTimesPerWeek(3)
  }

  const validateStep = (): boolean => {
    if (stepIdx === 0) {
      if (!creationMode || !title.trim() || !deadline) return false
      return true
    }
    const q = GOAL_MOTIVATION_QUESTIONS[stepIdx - 1]
    const ans = motivation[q.id as keyof GoalMotivationAnswers]
    return !!ans?.trim()
  }

  const goNext = () => {
    if (!validateStep()) return
    if (stepIdx < TOTAL_STEPS - 1) setStepIdx(stepIdx + 1)
    else save()
  }

  const save = () => {
    if (!creationMode || !title.trim() || !deadline) {
      setStepIdx(0)
      return
    }
    for (const q of GOAL_MOTIVATION_QUESTIONS) {
      if (!motivation[q.id as keyof GoalMotivationAnswers]?.trim()) {
        setStepIdx(GOAL_MOTIVATION_QUESTIONS.indexOf(q) + 1)
        return
      }
    }

    const routineTimes = isHabit ? (cadence === 'daily' ? 7 : timesPerWeek) : undefined
    const intake: GoalIntake = {
      ...emptyGoalIntake(),
      goal: title.trim(),
      deadline,
      ...(isHabit
        ? {
            routineTimesPerWeek: routineTimes,
            ...(cadence === 'daily' ? { routineSessionLength: sessionLength } : {}),
          }
        : {}),
    }
    const templateType = creationModeToTemplate(creationMode)
    const base = buildGoalPlan(profile.id, intake, profile, templateType)
    const hierarchy = buildEmptyHierarchy(deadline, title.trim())
    const plan: GoalPlan = {
      ...base,
      hierarchy,
      motivation: { ...motivation },
      templateVersion: GOAL_PLAN_TEMPLATE_VERSION,
    }
    saveGoalPlan(plan)
    onComplete(plan)
  }

  let body: ReactNode = null

  if (stepIdx === 0) {
    body = (
      <>
        <div className="goal-field">
          <label>어떤 목표인가요? *</label>
          <div className="goal-mode-grid">
            {GOAL_CREATION_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`goal-mode-card ${creationMode === m.id ? 'on' : ''}`}
                onClick={() => setCreationMode(m.id)}
              >
                <span className="goal-mode-icon">{m.icon}</span>
                <strong>{m.title}</strong>
                <span>{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {creationMode ? (
          <>
            <div className="goal-field">
              <label>{isHabit ? '습관 이름 *' : '프로젝트 이름 *'}</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={modeMeta?.placeholder}
              />
            </div>

            {isHabit ? (
              <GoalRoutineFrequencyPicker
                cadence={cadence}
                timesPerWeek={timesPerWeek}
                sessionLength={sessionLength}
                onCadenceChange={handleCadenceChange}
                onTimesChange={setTimesPerWeek}
                onSessionLengthChange={setSessionLength}
              />
            ) : null}

            <div className="goal-field">
              <label>{isHabit ? '언제까지 지킬까요? *' : '마감 *'}</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <p className="goal-field-hint">{meta.hint}</p>
              {!isHabit ? (
                <div className="goal-field-hint" style={{ marginTop: 6 }}>
                  {meta.showMonthLayer ? <div>· 월 {meta.monthCount}칸</div> : null}
                  {meta.showWeekLayer ? <div>· 주 W1–W{meta.weekCount}</div> : null}
                  <div>· 일 {meta.dayCount}칸</div>
                </div>
              ) : null}
            </div>

            <p className="goal-field-hint" style={{ marginBottom: 12 }}>
              {isHabit
                ? '홈 달력에서 날짜별 + 로 그날 할 일을 추가하고 체크해요'
                : '월·주·일 목표는 만들고 난 뒤 홈에서 + 로 추가해요'}
            </p>
          </>
        ) : null}
      </>
    )
  } else if (motivationQ) {
    const qid = motivationQ.id as keyof GoalMotivationAnswers
    body = (
      <>
        <p className="goal-motivation-prompt">
          <PromptText text={motivationQ.prompt} />
        </p>
        <div className="goal-field">
          <textarea
            rows={5}
            value={motivation[qid] ?? ''}
            placeholder={motivationQ.hint}
            onChange={(e) => setMotivationAnswer(qid, e.target.value)}
          />
        </div>
      </>
    )
  }

  const isLast = stepIdx === TOTAL_STEPS - 1

  return (
    <>
      <GoalNav
        tier={`새 목표 ${stepIdx + 1}/${TOTAL_STEPS}`}
        tierClass={stepIdx === 0 ? 'f' : undefined}
        title={stepTitle}
        onBack={goBack}
      />
      <div className="goal-scroll">
        <div className="goal-step-dots">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <i key={i} className={i === stepIdx ? 'on' : ''} />
          ))}
        </div>
        {body}
        <button type="button" className="goal-cta" onClick={goNext} disabled={!validateStep()}>
          {isLast ? '목표 만들기' : '다음'}
        </button>
      </div>
    </>
  )
}
