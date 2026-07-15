import { useEffect, useMemo, useState } from 'react'
import type { SelfProfile } from '../../types/self'
import type { GoalPlan, PlanSection } from '../../types/goalPlan'
import { GOAL_PLAN_TEMPLATE_VERSION, GOAL_TEMPLATE_LABELS } from '../../types/goalPlan'
import { migrateGoalPlan, planProgress } from '../../lib/goalTemplateEngine'
import {
  addCheckItem,
  currentPhaseLabel,
  patchSection,
  toggleCheckItem,
  toggleRoadmapTask,
  toggleWeekItem,
  updateCheckLabel,
  updateRoadmapTaskLabel,
  updateWeekFocus,
} from '../../lib/goalPlanMutations'
import { touchGoalPlan } from '../../lib/goalPlanStore'

interface Props {
  plan: GoalPlan
  profile: SelfProfile
  onBack: () => void
  onUpdate: (plan: GoalPlan) => void
}

function daysUntil(deadline: string): number | null {
  if (!deadline) return null
  const end = new Date(`${deadline}T12:00:00`)
  if (Number.isNaN(end.getTime())) return null
  return Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

function phaseStatusKo(s: string): string {
  return s === 'done' ? '완료' : s === 'current' ? '진행 중' : '예정'
}

export function GoalPlanView({ plan, profile, onBack, onUpdate }: Props) {
  const [local, setLocal] = useState(() => migrateGoalPlan(plan, profile))
  const [activeWeekIdx, setActiveWeekIdx] = useState(0)

  useEffect(() => {
    const migrated = migrateGoalPlan(plan, profile)
    const isLegacy =
      plan.templateVersion !== GOAL_PLAN_TEMPLATE_VERSION ||
      !plan.sections.some((s) => s.kind === 'roadmap' || s.kind === 'weeks' || s.kind === 'pipeline')
    if (!isLegacy) return
    const saved = touchGoalPlan(migrated.profileId, migrated)
    setLocal(saved)
    onUpdate(saved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id])

  const persist = (next: GoalPlan) => {
    setLocal(next)
    onUpdate(touchGoalPlan(next.profileId, next))
  }

  const pct = useMemo(() => planProgress(local), [local])
  const dDay = daysUntil(local.intake.deadline)
  const ring = 2 * Math.PI * 28
  const offset = ring - (pct / 100) * ring
  const phaseLabel = useMemo(() => currentPhaseLabel(local), [local])

  const badgeClass =
    local.templateType === 'deliverable'
      ? 'bg-accent/15 text-accent-dim'
      : local.templateType === 'routine'
        ? 'bg-[color-mix(in_srgb,var(--color-status-warn)_16%,white)] text-status-warn'
        : 'bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] text-accent'

  const renderSection = (section: PlanSection, idx: number) => {
    const delay = { animationDelay: `${Math.min(idx, 10) * 35}ms` }

    if (section.kind === 'roadmap' && section.phases) {
      return (
        <section key={section.id} className="rounded-[22px] border border-border/80 bg-surface p-4 shadow-[0_6px_20px_rgba(58,47,44,0.04)] animate-fade-up" style={delay}>
          <SectionHead title={section.title} hint={section.hint} tag={`${section.phases.length} phases`} />
          <div className="space-y-0">
            {section.phases.map((ph, pi) => (
              <div key={ph.id} className={`grid grid-cols-[28px_1fr] gap-2.5 pb-3.5 ${pi === section.phases!.length - 1 ? 'pb-0' : ''}`}>
                <div className="flex flex-col items-center">
                  <div
                    className={`w-[22px] h-[22px] rounded-full border-2 grid place-items-center text-[10px] font-bold shrink-0 ${
                      ph.status === 'done'
                        ? 'bg-accent border-accent text-white'
                        : ph.status === 'current'
                          ? 'border-accent text-accent shadow-[0_0_0_4px_color-mix(in_srgb,var(--color-accent)_12%,transparent)]'
                          : 'border-border bg-surface text-muted'
                    }`}
                  >
                    {ph.status === 'done' ? <CheckIcon /> : pi}
                  </div>
                  {pi < section.phases!.length - 1 && (
                    <div className={`w-0.5 flex-1 mt-1 min-h-3 rounded-full ${ph.status === 'done' ? 'bg-accent/40' : 'bg-border'}`} />
                  )}
                </div>
                <div
                  className={`rounded-[14px] p-3 ${
                    ph.status === 'current' ? 'bg-surface border border-accent/25 shadow-[0_4px_14px_rgba(58,47,44,0.06)]' : 'bg-surface-2/80'
                  }`}
                >
                  <div className="flex justify-between items-center gap-2 mb-2">
                    <strong className="text-[13px] font-semibold text-ink">Phase {pi} · {ph.title}</strong>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                        ph.status === 'done'
                          ? 'bg-[color-mix(in_srgb,var(--color-status-ok)_12%,white)] text-status-ok'
                          : ph.status === 'current'
                            ? 'bg-accent/12 text-accent'
                            : 'bg-surface text-muted'
                      }`}
                    >
                      {phaseStatusKo(ph.status)}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {ph.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => persist(toggleRoadmapTask(local, section.id, ph.id, task.id))}
                        className={`flex items-center gap-2 w-full text-left text-xs font-medium ${task.done ? 'line-through text-muted' : 'text-ink-soft'}`}
                      >
                        <span
                          className={`w-4 h-4 rounded-[5px] border-[1.5px] grid place-items-center shrink-0 ${
                            task.done ? 'bg-accent border-accent text-white' : 'bg-surface border-border'
                          }`}
                        >
                          {task.done && <CheckIcon />}
                        </span>
                        <input
                          value={task.label}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => persist(updateRoadmapTaskLabel(local, section.id, ph.id, task.id, e.target.value))}
                          className="flex-1 bg-transparent border-0 focus:outline-none"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (section.kind === 'weeks' && section.weeks) {
      const weeks = section.weeks
      const active = weeks[activeWeekIdx] ?? weeks[0]
      return (
        <section key={section.id} className="rounded-[22px] border border-border/80 bg-surface p-4 shadow-[0_6px_20px_rgba(58,47,44,0.04)] animate-fade-up" style={delay}>
          <SectionHead title={section.title} hint={section.hint} />
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            {weeks.map((w, i) => {
              const done = w.items.filter((it) => it.done && it.label.trim()).length
              const total = w.items.filter((it) => it.label.trim()).length || w.items.length
              return (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setActiveWeekIdx(i)}
                  className={`shrink-0 min-w-[72px] px-3 py-2.5 rounded-[14px] text-center transition-all ${
                    i === activeWeekIdx ? 'bg-ink text-surface' : 'bg-surface-2 hover:bg-surface-2/80'
                  }`}
                >
                  <div className={`text-[10px] font-bold ${i === activeWeekIdx ? 'opacity-70' : 'text-muted'}`}>{w.label}</div>
                  <div className="text-[13px] font-bold tabular-nums mt-0.5">{w.dateLabel}</div>
                  <div className="flex justify-center gap-1 mt-1.5">
                    {Array.from({ length: Math.max(total, 3) }).map((_, di) => (
                      <i
                        key={di}
                        className={`w-1 h-1 rounded-full ${i === activeWeekIdx ? (di < done ? 'bg-accent opacity-100' : 'bg-surface opacity-40') : di < done ? 'bg-accent' : 'bg-border'}`}
                      />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
          {active && (
            <div className="mt-3 rounded-[14px] bg-surface-2 p-3 space-y-2">
              <input
                value={active.focus}
                onChange={(e) => persist(updateWeekFocus(local, section.id, active.id, e.target.value))}
                className="w-full bg-transparent text-xs font-bold text-ink focus:outline-none"
                placeholder="이번 주 포커스"
              />
              {active.items.map((item) => (
                <label key={item.id} className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => persist(toggleWeekItem(local, section.id, active.id, item.id))}
                    className="accent-accent"
                  />
                  <input
                    value={item.label}
                    onChange={(e) => {
                      const next = { ...item, label: e.target.value }
                      const weeksNext = weeks.map((w) =>
                        w.id === active.id ? { ...w, items: w.items.map((it) => (it.id === item.id ? next : it)) } : w,
                      )
                      persist(patchSection(local, section.id, { weeks: weeksNext }))
                    }}
                    className="flex-1 bg-transparent border-0 focus:outline-none"
                    placeholder="세부 작업"
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      )
    }

    if (section.kind === 'pipeline' && section.pipelineSteps) {
      const idx = section.pipelineIndex ?? 0
      return (
        <section key={section.id} className="rounded-[22px] border border-border/80 bg-surface p-4 shadow-[0_6px_20px_rgba(58,47,44,0.04)] animate-fade-up" style={delay}>
          <SectionHead title={section.title} hint={section.hint} />
          <div className="grid grid-cols-4 gap-1">
            {section.pipelineSteps.map((step, i) => (
              <div
                key={step}
                className={`text-center py-2.5 px-1 rounded-xl ${
                  i < idx ? 'bg-accent/12 text-accent-dim' : i === idx ? 'bg-accent-dim text-surface' : 'bg-surface-2 text-muted'
                }`}
              >
                <span className="block text-sm font-bold">{i + 1}</span>
                <span className="block text-[9px] font-bold mt-0.5 opacity-80">{step}</span>
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (section.title === '버퍼') {
      return (
        <div
          key={section.id}
          className="flex items-start gap-2.5 px-3.5 py-3 rounded-[14px] bg-accent-dim/10 border border-accent-dim/20 animate-fade-up"
          style={delay}
        >
          <strong className="text-[11px] font-bold text-accent-dim shrink-0">BUFFER</strong>
          <textarea
            value={section.value ?? ''}
            onChange={(e) => persist(patchSection(local, section.id, { value: e.target.value }))}
            rows={2}
            className="flex-1 bg-transparent text-xs text-ink-soft resize-none focus:outline-none leading-relaxed"
          />
        </div>
      )
    }

    const isToday = section.title.includes('오늘')
    const isRisk = section.title.includes('리스크')
    const isDaily = section.title.includes('데일리')

    return (
      <section
        key={section.id}
        className={`rounded-[22px] border border-border/80 bg-surface p-4 shadow-[0_6px_20px_rgba(58,47,44,0.04)] animate-fade-up ${
          isToday ? 'border-l-[3px] border-l-accent' : isRisk ? 'border-l-[3px] border-l-status-warn' : ''
        }`}
        style={delay}
      >
        <SectionHead title={section.title} hint={section.hint} tag={isToday ? 'Today' : undefined} />

        {section.kind === 'text' && !isDaily && (
          <textarea
            value={section.value ?? ''}
            onChange={(e) => persist(patchSection(local, section.id, { value: e.target.value }))}
            rows={section.title.includes('Outcome') || section.title.includes('회고') ? 3 : 2}
            placeholder="직접 입력"
            className="w-full px-3.5 py-2.5 rounded-xl border border-border/70 bg-surface-2/50 text-sm resize-none focus:outline-none focus:border-accent/50 focus:ring-2 focus:ring-accent/10"
          />
        )}

        {section.kind === 'pair' && (
          <div className="grid grid-cols-2 gap-2">
            <label className="rounded-[14px] p-3 bg-accent/10 border border-accent/20 space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-accent">{section.pairLeftLabel}</span>
              <textarea
                value={section.value ?? ''}
                onChange={(e) => persist(patchSection(local, section.id, { value: e.target.value }))}
                rows={3}
                className="w-full bg-transparent text-xs resize-none focus:outline-none"
                placeholder="꼭 할 것"
              />
            </label>
            <label className="rounded-[14px] p-3 bg-ink/[0.04] border border-border space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{section.pairRightLabel}</span>
              <textarea
                value={section.pairRight ?? ''}
                onChange={(e) => persist(patchSection(local, section.id, { pairRight: e.target.value }))}
                rows={3}
                className="w-full bg-transparent text-xs resize-none focus:outline-none"
                placeholder="안 할 것"
              />
            </label>
          </div>
        )}

        {section.kind === 'checklist' && isDaily && (
          <div className="grid grid-cols-7 gap-1.5">
            {(section.items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => persist(toggleCheckItem(local, section.id, item.id))}
                className={`aspect-square rounded-lg text-[9px] font-bold transition-all ${
                  item.done ? 'bg-status-warn text-white scale-105' : 'bg-surface-2 text-muted hover:bg-surface-2/80'
                }`}
              >
                {item.label.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {section.kind === 'checklist' && !isDaily && isRisk && (
          <div className="space-y-2">
            {(section.items ?? []).map((item) => (
              <div key={item.id} className="rounded-[14px] p-3 bg-[color-mix(in_srgb,var(--color-status-warn)_8%,white)] border border-status-warn/15">
                <button type="button" onClick={() => persist(toggleCheckItem(local, section.id, item.id))} className="flex items-start gap-2 w-full text-left">
                  <span className={`w-5 h-5 rounded-md border grid place-items-center shrink-0 ${item.done ? 'bg-status-ok border-status-ok text-white' : 'border-border bg-surface'}`}>
                    {item.done && <CheckIcon />}
                  </span>
                  <input
                    value={item.label}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => persist(updateCheckLabel(local, section.id, item.id, e.target.value))}
                    className="flex-1 bg-transparent text-xs font-medium focus:outline-none"
                    placeholder="리스크 · 플랜 B"
                  />
                </button>
              </div>
            ))}
          </div>
        )}

        {section.kind === 'checklist' && !isDaily && !isRisk && (
          <div className="space-y-1">
            {(section.items ?? []).map((item, i) =>
              isToday ? (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => persist(toggleCheckItem(local, section.id, item.id))}
                  className={`w-full grid grid-cols-[auto_1fr_auto] gap-2.5 items-center p-3 rounded-[14px] text-left transition-all ${
                    item.done ? 'opacity-55' : 'bg-surface-2 hover:bg-surface-2/70'
                  }`}
                >
                  <span className={`w-1 h-7 rounded-full ${i === 0 ? 'bg-status-error' : i === 1 ? 'bg-status-warn' : 'bg-accent'}`} />
                  <input
                    value={item.label}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => persist(updateCheckLabel(local, section.id, item.id, e.target.value))}
                    placeholder={i === 0 ? '가장 중요한 한 가지' : '할 일'}
                    className="bg-transparent text-sm font-semibold focus:outline-none w-full"
                  />
                  <span className={`w-[22px] h-[22px] rounded-full border-2 grid place-items-center ${item.done ? 'bg-accent border-accent text-white' : 'border-border'}`}>
                    {item.done && <CheckIcon />}
                  </span>
                </button>
              ) : (
                <label
                  key={item.id}
                  className={`flex items-start gap-2.5 rounded-xl px-2.5 py-2 ${item.done ? 'bg-[color-mix(in_srgb,var(--color-status-ok)_10%,white)]' : 'hover:bg-surface-2/50'}`}
                >
                  <button
                    type="button"
                    onClick={() => persist(toggleCheckItem(local, section.id, item.id))}
                    className={`mt-0.5 w-5 h-5 rounded-[7px] border-[1.5px] grid place-items-center shrink-0 ${
                      item.done ? 'bg-status-ok border-status-ok text-white' : 'bg-surface border-border'
                    }`}
                  >
                    {item.done && <CheckIcon />}
                  </button>
                  <input
                    value={item.label}
                    onChange={(e) => persist(updateCheckLabel(local, section.id, item.id, e.target.value))}
                    placeholder="항목 입력"
                    className={`flex-1 bg-transparent text-sm focus:outline-none ${item.done ? 'line-through text-muted' : 'text-ink'}`}
                  />
                </label>
              ),
            )}
            {!isToday && (
              <button type="button" onClick={() => persist(addCheckItem(local, section.id))} className="text-xs text-accent font-medium px-2.5 pt-1">
                + 항목 추가
              </button>
            )}
          </div>
        )}
      </section>
    )
  }

  return (
    <div className="h-full flex flex-col max-w-lg mx-auto bg-void">
      <header className="px-5 pt-4 pb-4 border-b border-border/70 bg-surface/90 backdrop-blur-md shrink-0">
        <button type="button" onClick={onBack} className="text-xs text-muted hover:text-ink mb-3">
          ← 플래너 목록
        </button>

        <span className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-full mb-2 ${badgeClass}`}>
          {GOAL_TEMPLATE_LABELS[local.templateType]} · v{GOAL_PLAN_TEMPLATE_VERSION}
        </span>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted mb-1">AI가 맞춰 준 계획</p>
            <h1 className="text-[24px] font-semibold text-ink leading-tight tracking-tight">{local.title}</h1>
            <div className="flex flex-wrap gap-2 mt-2.5">
              {dDay != null && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink bg-surface border border-border px-2.5 py-1 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  {dDay >= 0 ? `D-${dDay}` : `D+${Math.abs(dDay)}`}
                </span>
              )}
              {local.intake.deadline && (
                <span className="text-[11px] font-medium text-muted bg-surface-2 px-2.5 py-1 rounded-full tabular-nums">
                  마감 {local.intake.deadline.replace(/-/g, '/').slice(5)}
                </span>
              )}
            </div>
          </div>

          <div className="relative w-16 h-16 shrink-0">
            <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
              <circle cx="32" cy="32" r="28" fill="none" stroke="var(--color-surface-2)" strokeWidth="6" />
              <circle
                cx="32"
                cy="32"
                r="28"
                fill="none"
                stroke={
                  local.templateType === 'deliverable'
                    ? 'var(--color-accent-dim)'
                    : local.templateType === 'routine'
                      ? 'var(--color-status-warn)'
                      : 'var(--color-accent)'
                }
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={ring}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-[13px] font-bold tabular-nums">{pct}%</div>
          </div>
        </div>

        {local.templateType === 'backplan' && (
          <div className="mt-3 rounded-[14px] bg-surface-2/80 px-3 py-2.5">
            <p className="text-xs font-semibold text-ink">{phaseLabel}</p>
            <div className="h-1.5 bg-surface rounded-full mt-2 overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">{local.sections.map(renderSection)}</div>

      <div className="px-5 py-3 border-t border-border/70 bg-surface/90 text-center">
        <p className="text-[11px] text-muted">입력하면 바로 저장 · 진행률 {pct}%</p>
      </div>
    </div>
  )
}

function SectionHead({ title, hint, tag }: { title: string; hint?: string; tag?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div>
        <h2 className="text-[13px] font-bold text-ink tracking-tight">{title}</h2>
        {hint && <p className="text-[11px] text-muted mt-1 leading-relaxed">{hint}</p>}
      </div>
      {tag && <span className="text-[10px] font-bold text-muted bg-surface-2 px-2 py-1 rounded-md shrink-0">{tag}</span>}
    </div>
  )
}
