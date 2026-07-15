import type { PlanCheckItem } from '../../types/goalPlan'

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M5 12l5 5L20 7" />
    </svg>
  )
}

interface Props {
  items: PlanCheckItem[]
  onToggle: (itemId: string) => void
  goalName?: string
  onDrill?: () => void
  emptyLabel?: string
}

export function HierarchyChecklist({ items, onToggle, goalName, onDrill, emptyLabel = '항목 없음' }: Props) {
  const visible = items.filter((i) => i.label.trim())
  if (!visible.length) {
    return <p className="text-[13px] text-muted px-1 py-2">{emptyLabel}</p>
  }

  return (
    <div className="space-y-2">
      {visible.map((it) => (
        <div
          key={it.id}
          className={`flex gap-2.5 items-start rounded-[14px] border border-border bg-surface p-3 ${it.done ? 'opacity-60' : ''}`}
        >
          <button
            type="button"
            onClick={() => onToggle(it.id)}
            className={`w-[22px] h-[22px] rounded-full border-2 shrink-0 grid place-items-center mt-0.5 ${
              it.done ? 'bg-status-ok border-status-ok text-white' : 'border-border'
            }`}
          >
            {it.done ? <CheckIcon /> : null}
          </button>
          <div className="flex-1 min-w-0">
            {goalName ? <p className="text-[10px] font-bold text-muted mb-0.5">{goalName}</p> : null}
            <p className={`text-sm font-semibold leading-snug ${it.done ? 'line-through text-muted' : 'text-ink'}`}>
              {it.label}
            </p>
          </div>
          {onDrill ? (
            <button type="button" onClick={onDrill} className="text-muted text-lg px-1 shrink-0">
              ›
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function TierBadge({ tier }: { tier: 'daily' | 'weekly' | 'monthly' }) {
  const styles = {
    daily: 'bg-[color-mix(in_srgb,var(--color-status-warn)_18%,white)] text-status-warn',
    weekly: 'bg-[color-mix(in_srgb,var(--color-accent)_14%,white)] text-accent',
    monthly: 'bg-accent/12 text-accent-dim',
  }
  const labels = { daily: '일간', weekly: '주간', monthly: '월간' }
  return (
    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wide ${styles[tier]}`}>
      {labels[tier]}
    </span>
  )
}

export function ProgressRing({ pct, size = 44 }: { pct: number; size?: number }) {
  const inner = size - 10
  return (
    <div
      className="rounded-full grid place-items-center font-bold text-[11px] shrink-0"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--color-accent) 0 ${pct}%, color-mix(in srgb, var(--color-border) 60%, white) ${pct}% 100%)`,
      }}
    >
      <span
        className="rounded-full bg-surface grid place-items-center"
        style={{ width: inner, height: inner }}
      >
        {pct}%
      </span>
    </div>
  )
}

export function BranchRow({
  icon,
  title,
  sub,
  pct,
  onClick,
  tone = 'week',
}: {
  icon: string
  title: string
  sub: string
  pct?: number
  onClick: () => void
  tone?: 'goal' | 'week' | 'day'
}) {
  const iconBg =
    tone === 'goal'
      ? 'bg-accent/12 text-accent'
      : tone === 'day'
        ? 'bg-[color-mix(in_srgb,var(--color-status-warn)_18%,white)] text-status-warn'
        : 'bg-[color-mix(in_srgb,var(--color-accent)_12%,white)] text-accent'
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5 text-left hover:border-accent/30 transition-colors"
    >
      <div className={`w-10 h-10 rounded-xl grid place-items-center font-bold text-sm shrink-0 ${iconBg}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-ink truncate">{title}</p>
        <p className="text-xs text-muted mt-0.5 truncate">{sub}</p>
      </div>
      {pct !== undefined ? <span className="text-xs font-bold text-accent shrink-0">{pct}%</span> : null}
      <span className="text-muted shrink-0">›</span>
    </button>
  )
}

export function ScreenNav({
  tier,
  title,
  onBack,
  action,
}: {
  tier: string
  title: string
  onBack: () => void
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-surface shrink-0">
      <button
        type="button"
        onClick={onBack}
        className="w-9 h-9 rounded-[11px] border border-border grid place-items-center text-muted"
      >
        ‹
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted">{tier}</p>
        <h1 className="text-[15px] font-bold truncate">{title}</h1>
      </div>
      {action ? (
        <button type="button" onClick={action.onClick} className="text-xs font-bold text-accent px-2.5 py-1.5 rounded-lg bg-accent/10">
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
