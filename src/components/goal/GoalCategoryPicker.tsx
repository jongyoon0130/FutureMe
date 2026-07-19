import { useEffect, useRef, useState } from 'react'

export type GoalCategoryOption = { id: string; label: string }

interface Props {
  options: GoalCategoryOption[]
  value: string
  onChange: (id: string) => void
  className?: string
  menuClassName?: string
}

export function GoalCategoryPicker({ options, value, onChange, className, menuClassName }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.id === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!selected || options.length <= 1) {
    return selected ? <span className={className ?? 'goal-chk-goal'}>{selected.label}</span> : null
  }

  return (
    <div className={`goal-tier-add-picker ${className ?? ''}`.trim()} ref={rootRef}>
      <button
        type="button"
        className="goal-tier-add-picker-btn goal-chk-goal-picker-btn"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="카테고리 변경"
      >
        <span className="goal-tier-add-picker-label">{selected.label}</span>
        <span className="goal-tier-add-picker-chevron" aria-hidden>
          ▾
        </span>
      </button>
      {open ? (
        <div className={`goal-tier-add-menu ${menuClassName ?? ''}`.trim()} role="listbox">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              aria-selected={opt.id === value}
              className={`goal-tier-add-menu-item ${opt.id === value ? 'on' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onChange(opt.id)
                setOpen(false)
              }}
            >
              {opt.label}
              {opt.id === value ? <span aria-hidden>✓</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
