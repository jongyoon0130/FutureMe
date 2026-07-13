import type { ReactNode } from 'react'
import type { SelfProfile, BigFive, Dilemma } from '../../types/self'
import { INSIGHT_LABELS } from '../../types/self'
import {
  removeSavedDilemma,
  removeSmallAction,
  toggleSmallAction,
  removeFutureSelfNote,
  removeInsight,
  clearInsights,
} from '../../lib/growthStore'

interface Props {
  profile: SelfProfile
  onClose: () => void
  onDelete?: () => void
  onUpdate?: (p: SelfProfile) => void
}

const BIG_FIVE_LABELS: { key: keyof BigFive; label: string; invert?: boolean }[] = [
  { key: 'openness', label: '개방성' },
  { key: 'conscientiousness', label: '성실성' },
  { key: 'extraversion', label: '외향성' },
  { key: 'agreeableness', label: '우호성' },
  { key: 'neuroticism', label: '정서 안정성', invert: true },
]

function traitLevel(score: number): string {
  if (score >= 5) return '높음'
  if (score <= 3) return '낮음'
  return '중간'
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-serif text-sm text-accent-dim tracking-wide">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted uppercase tracking-wider">{label}</p>
      <p className="text-sm text-ink/90 leading-relaxed whitespace-pre-line">{value.trim()}</p>
    </div>
  )
}

function BigFiveBars({ b }: { b: BigFive }) {
  return (
    <div className="space-y-3">
      {BIG_FIVE_LABELS.map(({ key, label, invert }) => {
        const raw = b[key]
        const score = invert ? 8 - raw : raw
        const pct = Math.round(((score - 1) / 6) * 100)
        return (
          <div key={key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-ink/80">{label}</span>
              <span className="text-muted">{traitLevel(score)}</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden border border-border">
              <div
                className="h-full bg-gradient-to-r from-glow/80 to-accent rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function DilemmaBlock({ d }: { d: Dilemma }) {
  return (
    <div className="p-3 rounded-xl bg-surface border border-border space-y-2">
      <p className="text-xs text-muted leading-relaxed">{d.prompt}</p>
      <p className="text-sm text-ink font-medium">→ {d.choice}</p>
      {d.reason?.trim() && (
        <p className="text-xs text-ink/70 leading-relaxed border-t border-border pt-2">{d.reason.trim()}</p>
      )}
    </div>
  )
}

export function ProfileSheet({ profile: p, onClose, onDelete, onUpdate }: Props) {
  const rules = p.styleRules
  const onboardingSamples = p.styleSamples.filter((s) => s.source === 'onboarding')
  const insights = (p.insights ?? []).filter((i) => i.source === 'ai' || i.count >= 2)
  const editable = !!onUpdate
  const savedDilemmas = p.savedDilemmas ?? []
  const smallActions = p.smallActions ?? []
  const futureNotes = p.futureSelfNotes ?? []

  const styleChips: string[] = []
  if (rules) {
    styleChips.push(rules.banmal ? '반말' : '존댓말')
    if (rules.usesConsonants) styleChips.push('ㅋㅋ/ㅠㅠ')
    if (rules.usesEmoji) styleChips.push('이모지')
    if (rules.endings[0]) styleChips.push(rules.endings[0])
  }

  const completedLabel = p.completedAt
    ? new Date(p.completedAt).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    : null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void/40 backdrop-blur-sm animate-fade-up">
      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto bg-surface shadow-xl border-x border-border min-h-0">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-ink/5"
          >
            ← 돌아가기
          </button>
          <h2 className="text-base font-medium text-ink">내 프로필</h2>
          <div className="w-16" />
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-6 space-y-8">
          <div className="flex flex-col items-center text-center pb-2">
            <div className="w-16 h-16 rounded-full chat-avatar flex items-center justify-center text-2xl font-medium mb-3">
              {p.name[0] ?? '나'}
            </div>
            <h1 className="text-2xl font-normal text-ink">{p.name || '이름 없음'}</h1>
            <p className="text-sm text-muted mt-1">
              {[p.age ? `${p.age}세` : null, p.mbti || null].filter(Boolean).join(' · ') || '또 다른 나'}
            </p>
            {completedLabel && (
              <p className="text-[11px] text-muted/60 mt-2">프로필 만든 날 · {completedLabel}</p>
            )}
          </div>

          <Section title="기본">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-4">
              <Row label="요즘 상황" value={p.lifeContext} />
              {!p.lifeContext?.trim() && <p className="text-xs text-muted">입력된 내용 없음</p>}
            </div>
          </Section>

          <Section title="성격 (Big Five)">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border">
              <BigFiveBars b={p.bigFive} />
            </div>
          </Section>

          <Section title="가치관 · 선택">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-4">
              <Row label="인생 1순위" value={p.corePriority} />
              <Row label="잘 산다는 것" value={p.successDef} />
              <Row label="닮고 싶은 사람" value={p.admire} />
            </div>
            {p.dilemmas.length > 0 && (
              <div className="space-y-2 mt-3">
                {p.dilemmas.map((d) => (
                  <DilemmaBlock key={d.id} d={d} />
                ))}
              </div>
            )}
          </Section>

          <Section title="나의 이야기">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-4">
              <Row label="인생의 전환점" value={p.turningPoint} />
              <Row label="뿌듯했던 순간" value={p.proudMoment} />
              <Row label="힘들었던 순간" value={p.stressMoment} />
              <Row label="남을 위로했던 기억" value={p.comfortMemory} />
              <Row label="나를 위로하는 말" value={p.comfortTarget} />
            </div>
          </Section>

          {(p.fear?.trim() || p.desire?.trim() || p.avoidance?.trim() || p.growthDirection?.trim()) && (
            <Section title="성장 축">
              <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-4">
                <Row label="두려움 · 회피" value={p.fear} />
                <Row label="자꾸 미루는 것" value={p.avoidance} />
                <Row label="진짜 원하는 것" value={p.desire} />
                <Row label="되고 싶은 나" value={p.growthDirection} />
              </div>
            </Section>
          )}

          {savedDilemmas.length > 0 && (
            <Section title="저장한 고민">
              <div className="space-y-2">
                {savedDilemmas.map((d) => (
                  <div
                    key={d.id}
                    className="p-3 rounded-xl bg-surface-2 border border-border flex items-start gap-2"
                  >
                    <span
                      className={`text-sm leading-relaxed flex-1 ${
                        d.status === 'resolved' ? 'text-muted line-through' : 'text-ink/90'
                      }`}
                    >
                      {d.text}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onUpdate?.(removeSavedDilemma(p, d.id))}
                        className="shrink-0 text-muted hover:text-status-error text-xs px-1"
                        aria-label="고민 삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {smallActions.length > 0 && (
            <Section title="작은 행동">
              <div className="space-y-2">
                {smallActions.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl bg-surface-2 border border-border flex items-center gap-2.5"
                  >
                    <button
                      type="button"
                      onClick={() => onUpdate?.(toggleSmallAction(p, a.id))}
                      disabled={!editable}
                      className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center text-[11px] ${
                        a.done ? 'border-accent bg-accent text-surface' : 'border-muted/50 text-transparent'
                      }`}
                      aria-label={a.done ? '완료 해제' : '완료 표시'}
                    >
                      ✓
                    </button>
                    <span
                      className={`text-sm flex-1 leading-relaxed ${
                        a.done ? 'text-muted line-through' : 'text-ink/90'
                      }`}
                    >
                      {a.text}
                    </span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onUpdate?.(removeSmallAction(p, a.id))}
                        className="shrink-0 text-muted hover:text-status-error text-xs px-1"
                        aria-label="행동 삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {futureNotes.length > 0 && (
            <Section title="미래의 나 메모">
              <div className="space-y-2">
                {futureNotes.map((n) => (
                  <div
                    key={n.id}
                    className="p-3 rounded-xl bg-surface-2 border border-border flex items-start gap-2"
                  >
                    <span className="text-sm text-ink/90 leading-relaxed flex-1">{n.text}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onUpdate?.(removeFutureSelfNote(p, n.id))}
                        className="shrink-0 text-muted hover:text-status-error text-xs px-1"
                        aria-label="메모 삭제"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="말투">
            <div className="p-4 rounded-2xl bg-surface-2 border border-border space-y-3">
              {styleChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {styleChips.map((c) => (
                    <span
                      key={c}
                      className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
              {onboardingSamples.length > 0 ? (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-muted">온보딩 때 쓴 말</p>
                  {onboardingSamples.map((s, i) => (
                    <p key={i} className="text-sm text-ink/80 leading-relaxed pl-3 border-l-2 border-accent/30">
                      {s.text}
                    </p>
                  ))}
                </div>
              ) : (
                !styleChips.length && <p className="text-xs text-muted">아직 수집된 말투 샘플 없음</p>
              )}
            </div>
          </Section>

          {insights.length > 0 && (
            <Section title="대화에서 알게 된 것">
              <div className="space-y-2">
                {insights.slice(0, 8).map((i) => (
                  <div key={i.id} className="p-3 rounded-xl bg-surface-2 border border-border flex gap-2 items-start">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-glow/10 text-glow border border-glow/20 whitespace-nowrap h-fit">
                      {INSIGHT_LABELS[i.kind]}
                    </span>
                    <span className="text-sm text-ink/80 leading-relaxed flex-1">{i.text}</span>
                    {editable && (
                      <button
                        type="button"
                        onClick={() => onUpdate?.(removeInsight(p, i.id))}
                        className="shrink-0 text-muted hover:text-status-error text-xs px-1"
                        aria-label="이건 내가 아니야 — 삭제"
                        title="이건 내가 아니야"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {editable && (
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        '대화에서 관찰한 기억을 전부 지울까요?\n(온보딩 프로필·대화 내용은 그대로예요.)',
                      )
                    ) {
                      onUpdate?.(clearInsights(p))
                    }
                  }}
                  className="mt-2 text-xs text-muted hover:text-status-error underline"
                >
                  기억 전체 지우기
                </button>
              )}
            </Section>
          )}
        </div>

        {onDelete && (
          <div className="px-5 py-4 border-t border-border shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose()
                onDelete()
              }}
              className="w-full py-3 rounded-xl text-sm text-red-500/90 hover:bg-red-500/5 border border-red-500/20 transition-colors"
            >
              이 프로필 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
