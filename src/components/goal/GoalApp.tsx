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

  return <GoalPlanSheet profile={profile} embedded={embedded} />
}
