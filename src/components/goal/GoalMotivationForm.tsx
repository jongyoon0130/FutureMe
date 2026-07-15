import { useState } from 'react'
import type { GoalMotivationAnswers, GoalPlan } from '../../types/goalPlan'
import {
  GOAL_MOTIVATION_CATEGORY_LABELS,
  GOAL_MOTIVATION_QUESTIONS,
} from '../../lib/goalMotivationConfig'
import { GoalNav } from './GoalShell'

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

export function motivationPreview(m?: GoalMotivationAnswers): string {
  if (!m) return '아직 답변 없음 · 탭해서 작성'
  const filled = GOAL_MOTIVATION_QUESTIONS.filter((q) => m[q.id as keyof GoalMotivationAnswers]?.trim())
  if (!filled.length) return '아직 답변 없음 · 탭해서 작성'
  const first = m[filled[0].id as keyof GoalMotivationAnswers]?.trim()
  if (filled.length === 1 && first) return first.length > 40 ? `${first.slice(0, 40)}…` : first
  return `${filled.length}개 답변 · 탭해서 보기`
}

interface FormProps {
  plan: GoalPlan
  onSave: (plan: GoalPlan) => void
  onCancel: () => void
}

export function GoalMotivationForm({ plan, onSave, onCancel }: FormProps) {
  const [answers, setAnswers] = useState<GoalMotivationAnswers>(() => ({ ...plan.motivation }))

  const setAnswer = (id: keyof GoalMotivationAnswers, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }))
  }

  const save = () => {
    onSave({ ...plan, motivation: { ...answers } })
  }

  return (
    <>
      <GoalNav tier="최종" tierClass="f" title="나를 위한 질문" onBack={onCancel} />
      <div className="goal-scroll">
        <p className="goal-field-hint" style={{ marginBottom: 16 }}>
          목표를 만들 때 적은 답이에요. 흔들릴 때 다시 읽고, 필요하면 고쳐도 돼요.
        </p>
        {GOAL_MOTIVATION_QUESTIONS.map((q) => {
          const qid = q.id as keyof GoalMotivationAnswers
          return (
            <div key={q.id} className="goal-motivation-block">
              <span className={`goal-badge ${q.category === 'why' ? 'w' : q.category === 'success' ? 'm' : 'd'}`}>
                {GOAL_MOTIVATION_CATEGORY_LABELS[q.category]}
              </span>
              <p className="goal-motivation-prompt">
                <PromptText text={q.prompt.replace(/\?$/, '')} />
              </p>
              <textarea
                rows={4}
                value={answers[qid] ?? ''}
                placeholder={q.hint}
                onChange={(e) => setAnswer(qid, e.target.value)}
              />
            </div>
          )
        })}
        <button type="button" className="goal-cta" onClick={save}>
          저장
        </button>
      </div>
    </>
  )
}

interface ReadonlyProps {
  plan: GoalPlan
  onEdit: () => void
}

/** 최종 목표 화면 — 답변 미리보기 카드 */
export function GoalMotivationCard({ plan, onEdit }: ReadonlyProps) {
  const m = plan.motivation
  const hasAny = GOAL_MOTIVATION_QUESTIONS.some((q) => m?.[q.id as keyof GoalMotivationAnswers]?.trim())

  return (
    <button type="button" className="goal-motivation-card" onClick={onEdit}>
      <div className="goal-motivation-card-head">
        <span className="goal-motivation-card-icon">💭</span>
        <div>
          <strong>나를 위한 질문</strong>
          <span>{hasAny ? '답변 보기 · 수정' : '답변 작성하기'}</span>
        </div>
        <span className="goal-chev">›</span>
      </div>
      {hasAny ? (
        <div className="goal-motivation-card-preview">
          {GOAL_MOTIVATION_QUESTIONS.map((q) => {
            const text = m?.[q.id as keyof GoalMotivationAnswers]?.trim()
            if (!text) return null
            return (
              <div key={q.id} className="goal-motivation-snippet">
                <em>{GOAL_MOTIVATION_CATEGORY_LABELS[q.category]}</em>
                <p>{text}</p>
              </div>
            )
          })}
        </div>
      ) : null}
    </button>
  )
}
