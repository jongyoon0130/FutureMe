import { useEffect, useState } from 'react'
import type { SelfProfile } from '../../types/self'
import type { GoalPlan } from '../../types/goalPlan'
import { deleteGoalPlan, loadGoalPlans } from '../../lib/goalPlanStore'
import { planSummaryLine } from '../../lib/goalTemplateEngine'
import { GoalCreateWizard } from './GoalCreateWizard'
import { GoalDrilldownHome } from './GoalDrilldownHome'
import { GoalNav, GoalShell } from './GoalShell'

type Mode = 'home' | 'drill' | 'create' | 'list'

interface Props {
  profile: SelfProfile
  onClose?: () => void
  embedded?: boolean
}

export function GoalPlanSheet({ profile, onClose, embedded = false }: Props) {
  const [mode, setMode] = useState<Mode>('home')
  const [plans, setPlans] = useState<GoalPlan[]>(() => loadGoalPlans(profile.id, profile))
  const [activePlanId, setActivePlanId] = useState<string | null>(null)

  useEffect(() => {
    setPlans(loadGoalPlans(profile.id, profile))
  }, [mode, profile.id, profile])

  useEffect(() => {
    if (mode !== 'drill' || !activePlanId) return
    if (!plans.some((p) => p.id === activePlanId && p.hierarchy)) {
      setActivePlanId(null)
      setMode('home')
    }
  }, [mode, activePlanId, plans])

  const refresh = () => setPlans(loadGoalPlans(profile.id, profile))

  const handleDelete = (plan: GoalPlan) => {
    if (!window.confirm(`'${plan.title}' 목표를 삭제할까요?`)) return
    deleteGoalPlan(profile.id, plan.id)
    refresh()
    if (activePlanId === plan.id) {
      setActivePlanId(null)
      setMode('home')
    }
  }

  if (mode === 'create') {
    return (
      <GoalShell embedded={embedded}>
        <GoalCreateWizard
          profile={profile}
          onComplete={() => {
            refresh()
            setMode('home')
          }}
          onCancel={() => setMode('home')}
        />
      </GoalShell>
    )
  }

  if (mode === 'drill' && activePlanId && plans.some((p) => p.id === activePlanId && p.hierarchy)) {
    return (
      <GoalShell embedded={embedded}>
        <GoalDrilldownHome
          plans={plans}
          profile={profile}
          initialPlanId={activePlanId}
          onPlansChange={setPlans}
          onBack={() => {
            setActivePlanId(null)
            setMode('home')
            refresh()
          }}
        />
      </GoalShell>
    )
  }

  if (mode === 'list') {
    return (
      <GoalShell embedded={embedded}>
        <GoalNav tier="설정" title="목표 관리" onBack={() => setMode('home')} />
        <div className="goal-scroll">
          {plans.length === 0 ? (
            <p className="goal-empty">아직 목표가 없어요</p>
          ) : (
            plans.map((plan) => (
              <div key={plan.id} className="goal-week-card" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  style={{ flex: 1, textAlign: 'left', background: 'transparent' }}
                  onClick={() => {
                    setActivePlanId(plan.id)
                    setMode('drill')
                  }}
                >
                  <strong>{plan.title}</strong>
                  <p className="goal-field-hint">{planSummaryLine(plan)}</p>
                </button>
                <button type="button" className="goal-add-line" style={{ color: 'var(--goal-muted)' }} onClick={() => handleDelete(plan)}>
                  삭제
                </button>
              </div>
            ))
          )}
          <button type="button" className="goal-cta" onClick={() => setMode('create')}>
            + 새 목표 만들기
          </button>
        </div>
      </GoalShell>
    )
  }

  return (
    <GoalShell embedded={embedded}>
      <GoalDrilldownHome plans={plans} profile={profile} onPlansChange={setPlans} onBack={onClose} />
      <button
        type="button"
        className={`goal-fab${embedded ? ' goal-fab-with-nav' : ''}`}
        onClick={() => setMode('create')}
        aria-label="새 목표"
      >
        +
      </button>
    </GoalShell>
  )
}
