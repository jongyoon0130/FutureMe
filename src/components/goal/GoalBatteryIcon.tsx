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
  done?: number
  total?: number
  pct?: number
  hasTasks: boolean
  inRange?: boolean
}

export function GoalBatteryIcon({ done, total, pct, hasTasks, inRange = true }: Props) {
  const fillPct =
    hasTasks && total && total > 0
      ? (done ?? 0) / total * 100
      : hasTasks && pct !== undefined
        ? pct
        : 0
  const colorPct = Math.round(fillPct)
  const fillColor = batteryFillColor(colorPct, hasTasks)
  const muted = !inRange

  return (
    <div className={`goal-battery ${muted ? 'muted' : ''}`} aria-hidden>
      <div className="goal-battery-cap" />
      <div className="goal-battery-body">
        {hasTasks && fillPct > 0 ? (
          <div
            className="goal-battery-fill"
            style={{
              height: `${Math.max(0, Math.min(100, fillPct))}%`,
              background: fillColor,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
