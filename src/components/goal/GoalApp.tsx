import { useEffect, useMemo, useState } from 'react'
import { getGoalAppProfile } from '../../lib/goalAppOwner'
import { loadGoalPlans } from '../../lib/goalPlanStore'
import { importGoalPlansSnapshot } from '../../lib/goalPlanSnapshot'
import { GoalPlanSheet } from './GoalPlanSheet'

/** Future Me 채팅과 분리된 독립 목표 앱 셸 */
export function GoalApp({ embedded = false }: { embedded?: boolean }) {
  const profile = useMemo(() => getGoalAppProfile(), [])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let plans = loadGoalPlans(profile.id, profile)
      if (!plans.length && import.meta.env.DEV) {
        try {
          const res = await fetch('/goal-recovery-snapshot.json', { cache: 'no-store' })
          if (res.ok) {
            const snap = await res.json()
            if (snap?.ownerId && Array.isArray(snap.plans) && snap.plans.length) {
              importGoalPlansSnapshot(snap)
              plans = loadGoalPlans(profile.id, profile)
            }
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [profile])

  if (!ready) return null

  if (embedded) return <GoalPlanSheet profile={profile} embedded />

  // 단독 실행(goals.html) — 메인 앱으로 돌아갈 길이 없으면 막다른 페이지가 되므로
  // 상단에 얇은 복귀 배너를 둔다. (홈 탭에 임베드될 때는 하단 네비가 그 역할)
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <a
        href="/"
        style={{
          flexShrink: 0,
          display: 'block',
          padding: '8px 16px',
          textAlign: 'center',
          fontSize: '12px',
          textDecoration: 'none',
          color: 'var(--goal-accent-deep, #2f6b46)',
          background: 'var(--goal-accent-soft, #e6f4ea)',
          borderBottom: '1px solid var(--goal-line, #e5e8eb)',
        }}
      >
        ← Future Me 앱으로 돌아가기 · 이 화면은 목표 앱 단독 미리보기예요
      </a>
      <div style={{ flex: 1, minHeight: 0 }}>
        <GoalPlanSheet profile={profile} embedded={false} />
      </div>
    </div>
  )
}
