import { useEffect, useState } from 'react'
import {
  THEME_CHANGE_EVENT,
  THEME_PRESETS,
  loadThemeId,
  saveThemeId,
  type ThemeId,
} from '../../lib/themes'

interface Props {
  /** compact: 목록 화면 하단 · full: 설정 패널 */
  variant?: 'compact' | 'full'
}

function ThemeSwatch({
  id,
  swatchA,
  swatchB,
  label,
  selected,
  onSelect,
  size = 'md',
}: {
  id: ThemeId
  swatchA: string
  swatchB: string
  label: string
  selected: boolean
  onSelect: (id: ThemeId) => void
  size?: 'sm' | 'md'
}) {
  const dim = size === 'sm' ? 'w-9 h-9' : 'w-11 h-11'
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      title={label}
      aria-label={`${label} 테마`}
      aria-pressed={selected}
      className={`relative shrink-0 rounded-full transition-all ${dim} ${
        selected
          ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface-2 scale-105'
          : 'ring-1 ring-border/60 hover:ring-accent/50 hover:scale-105'
      }`}
    >
      <span
        className="absolute inset-0 rounded-full overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${swatchA} 49.5%, ${swatchB} 50.5%)`,
        }}
      />
      <span
        className="absolute inset-0 rounded-full pointer-events-none"
        style={{
          background:
            'linear-gradient(135deg, transparent calc(50% - 0.75px), rgba(255,255,255,0.35) calc(50% - 0.75px), rgba(255,255,255,0.35) calc(50% + 0.75px), transparent calc(50% + 0.75px))',
        }}
        aria-hidden
      />
    </button>
  )
}

export function ThemePicker({ variant = 'full' }: Props) {
  const [active, setActive] = useState<ThemeId | null>(() => loadThemeId())

  useEffect(() => {
    const sync = () => setActive(loadThemeId())
    window.addEventListener(THEME_CHANGE_EVENT, sync)
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync)
  }, [])

  const pick = (id: ThemeId) => {
    saveThemeId(id)
    setActive(id)
  }

  if (variant === 'compact') {
    return (
      <div className="px-5 py-3 border-t border-border/50 bg-surface/60">
        <p className="text-[10px] text-muted/70 mb-2">테마</p>
        <div className="flex flex-wrap gap-2.5 justify-center">
          {THEME_PRESETS.map((t) => (
            <ThemeSwatch
              key={t.id}
              id={t.id}
              swatchA={t.swatchA}
              swatchB={t.swatchB}
              label={t.label}
              selected={active === t.id}
              onSelect={pick}
              size="sm"
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-muted mb-1">테마</p>
      <p className="text-[11px] text-muted/70 mb-3">동그라미를 눌러 색 조합을 바꿀 수 있어요</p>
      <div className="flex flex-wrap gap-3">
        {THEME_PRESETS.map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-1.5">
            <ThemeSwatch
              id={t.id}
              swatchA={t.swatchA}
              swatchB={t.swatchB}
              label={t.label}
              selected={active === t.id}
              onSelect={pick}
            />
            <span className="text-[10px] text-muted/80 text-center leading-tight max-w-[4.5rem]">
              {t.label.split(' · ')[0]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
