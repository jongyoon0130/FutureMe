import type { GoalPlan, PlanSection } from '../../types/goalPlan'
import { isRoutinePlan } from '../../lib/goalRoutineEngine'
import { SecLabel } from './GoalShell'

const ROUTINE_BOILERPLATE = new Set(['데일리 체크', '이번 주 행동', '이번 주 목표', '습관 앵커', '주간 회고', 'Outcome'])

function isTemplateDayLabel(label: string): boolean {
  return /^[월화수목금토일]\s*—\s*$/.test(label.trim())
}

function sectionHasContent(section: PlanSection, plan: GoalPlan): boolean {
  if (isRoutinePlan(plan) && ROUTINE_BOILERPLATE.has(section.title)) return false
  if (section.title === 'Outcome' && section.value?.trim() === plan.title.trim()) return false
  if (section.items?.every((it) => isTemplateDayLabel(it.label) && !it.done)) return false
  if (section.value?.trim() || section.pairRight?.trim()) return true
  if (section.items?.some((it) => it.label.trim() || it.done)) return true
  if (section.phases?.some((ph) => ph.tasks.some((t) => t.label.trim() || t.done))) return true
  if (section.weeks?.some((w) => w.focus.trim() || w.items.some((it) => it.label.trim() || it.done))) return true
  return false
}

function ChecklistBlock({ section }: { section: PlanSection }) {
  const items = (section.items ?? []).filter((it) => it.label.trim() || it.done)
  if (!items.length) return null
  return (
    <div className="goal-section-card">
      <strong>{section.title}</strong>
      {section.hint ? <p className="goal-field-hint">{section.hint}</p> : null}
      <ul className="goal-section-checklist">
        {items.map((it) => (
          <li key={it.id} className={it.done ? 'done' : undefined}>
            <span className="goal-section-check" aria-hidden>
              {it.done ? '✓' : ''}
            </span>
            <span>{it.label.trim() || '(미입력)'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TextBlock({ section }: { section: PlanSection }) {
  const value = section.value?.trim()
  if (!value) return null
  return (
    <div className="goal-section-card">
      <strong>{section.title}</strong>
      {section.hint ? <p className="goal-field-hint">{section.hint}</p> : null}
      <p className="goal-section-text">{value}</p>
    </div>
  )
}

function PairBlock({ section }: { section: PlanSection }) {
  const left = section.value?.trim()
  const right = section.pairRight?.trim()
  if (!left && !right) return null
  return (
    <div className="goal-section-card">
      <strong>{section.title}</strong>
      <div className="goal-section-pair">
        <div>
          <em>{section.pairLeftLabel ?? 'Left'}</em>
          <p>{left || '—'}</p>
        </div>
        <div>
          <em>{section.pairRightLabel ?? 'Right'}</em>
          <p>{right || '—'}</p>
        </div>
      </div>
    </div>
  )
}

/** 예전 플랜 뷰에 있던 섹션(성공 기준, 리스크 등) — 가지치기 화면에서도 보이게 */
export function GoalPlanSectionsSummary({ plan }: { plan: GoalPlan }) {
  if (isRoutinePlan(plan)) return null

  const sections = plan.sections.filter((s) => sectionHasContent(s, plan))
  if (!sections.length) return null

  return (
    <>
      <SecLabel>계획 메모 · 예전에 적어 둔 내용</SecLabel>
      {sections.map((section) => {
        if (section.kind === 'checklist') return <ChecklistBlock key={section.id} section={section} />
        if (section.kind === 'pair') return <PairBlock key={section.id} section={section} />
        if (section.kind === 'text') return <TextBlock key={section.id} section={section} />
        return null
      })}
    </>
  )
}
