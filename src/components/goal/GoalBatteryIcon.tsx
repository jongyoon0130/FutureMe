/** 일간 할 일 완료율 → 배터리 색 (파스텔 톤) */
export function batteryFillColor(pct: number, hasTasks: boolean): string {
  if (!hasTasks) return 'transparent'
  if (pct >= 100) return '#62d98a'
  if (pct >= 80) return '#9ee07a'
  if (pct >= 60) return '#ffe082'
  if (pct >= 40) return '#ffcc80'
  if (pct >= 20) return '#ffab91'
  return '#ff9090'
}

interface Props {
  pct: number
  hasTasks: boolean
  inRange?: boolean
}

export function GoalBatteryIcon({ pct, hasTasks, inRange = true }: Props) {
  const fillPct = hasTasks ? Math.max(0, Math.min(100, pct)) : 0
  const fillColor = batteryFillColor(fillPct, hasTasks)
  const muted = !inRange

  return (
    <div className={`goal-battery ${muted ? 'muted' : ''}`} aria-hidden>
      <div className="goal-battery-cap" />
      <div className="goal-battery-body">
        {fillPct > 0 ? (
          <div
            className="goal-battery-fill"
            style={{
              height: `${fillPct}%`,
              background: fillColor,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
