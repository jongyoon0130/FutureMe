import { useState, type ReactNode } from 'react'
import type { SelfProfile } from '../../types/self'
import { INSIGHT_LABELS } from '../../types/self'
import { FUTURE_YEARS_AHEAD } from '../../lib/brand'
import { SPEECH_TONE_OPTIONS } from '../../lib/onboardingConfig'
import { buildProfileDashboard, type DashboardCard } from '../../lib/profileSummary'
import {
  applyPersonaAnswer,
  personaCompleteness,
  personaGaps,
  type PersonaFieldSpec,
} from '../../lib/personaModel'
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-[11px] font-medium text-muted uppercase tracking-wider px-0.5">{title}</h3>
      {children}
    </section>
  )
}

function EditField({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
}) {
  const cls =
    'w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-sm text-ink placeholder:text-muted/50 focus:outline-none focus:border-accent/50'
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] text-muted">{label}</span>
      {multiline ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className={`${cls} resize-none leading-relaxed`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  )
}

function Chip({ children, variant = 'default' }: { children: ReactNode; variant?: 'default' | 'muted' | 'future' }) {
  const styles = {
    default: 'bg-accent/12 text-accent border-accent/25',
    muted: 'bg-ink/[0.04] text-ink/75 border-border/60',
    future: 'bg-glow/15 text-accent-dim border-glow/30',
  }
  return (
    <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium ${styles[variant]}`}>{children}</span>
  )
}

function StatGrid({ stats }: { stats: { label: string; value: string }[] }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {stats.map((s) => (
        <div key={s.label} className="flex items-start justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
          <span className="text-[11px] text-muted shrink-0 pt-0.5">{s.label}</span>
          <span className="text-sm text-ink text-right leading-snug">{s.value}</span>
        </div>
      ))}
    </div>
  )
}

function DashboardCardView({ card }: { card: DashboardCard }) {
  const accentBorder =
    card.accent === 'future'
      ? 'border-glow/35 bg-gradient-to-br from-glow/8 to-surface-2'
      : card.accent === 'values'
        ? 'border-accent/25 bg-gradient-to-br from-accent/6 to-surface-2'
        : 'border-border/70 bg-surface-2/80'

  return (
    <article className={`rounded-2xl border p-4 space-y-3 ${accentBorder}`}>
      <h4 className="text-xs font-semibold text-ink/80">{card.title}</h4>

      {card.headline && (
        <p className={`text-[15px] font-semibold leading-snug tracking-tight ${card.accent === 'future' ? 'text-ink' : 'text-ink/90'}`}>
          {card.headline}
        </p>
      )}

      {card.chips && card.chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.chips.map((c) => (
            <Chip key={c} variant={card.accent === 'future' ? 'future' : 'default'}>
              {c}
            </Chip>
          ))}
        </div>
      )}

      {card.stats && card.stats.length > 0 && <StatGrid stats={card.stats} />}
    </article>
  )
}

function ContinuityBar({ score }: { score: number }) {
  const pct = Math.round(((score - 1) / 6) * 100)
  const label = score >= 6 ? '거의 같은 사람' : score >= 4 ? '조금 달라졌지만 나' : '꽤 다른 버전'
  return (
    <div className="rounded-2xl border border-border/70 bg-surface-2/80 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-ink/80">미래 자아 연속성</span>
        <span className="text-[11px] text-muted">{score}/7</span>
      </div>
      <div className="h-2 bg-surface rounded-full overflow-hidden border border-border/40">
        <div className="h-full bg-gradient-to-r from-accent/70 to-glow rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
}

/**
 * 페르소나 충실도 + "지금 채우면 좋은 질문" 카드.
 * 온보딩을 핵심만 하고 넘어온 사용자가, 대화 품질에 가장 도움되는 질문부터
 * 하나씩 채울 수 있게 한다. 답변은 말투 학습에도 반영된다 (applyPersonaAnswer).
 */
function PersonaGapsCard({ profile, onUpdate }: { profile: SelfProfile; onUpdate: (p: SelfProfile) => void }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const completeness = personaCompleteness(profile)
  const gaps = personaGaps(profile, 3)
  const pct = Math.round(completeness.overall * 100)

  if (!gaps.length && pct >= 100) return null

  const openGap = (field: PersonaFieldSpec) => {
    setOpenKey(field.key)
    setAnswer('')
  }

  const save = (field: PersonaFieldSpec) => {
    const v = answer.trim()
    if (!v) return
    onUpdate(applyPersonaAnswer(profile, field, v))
    setOpenKey(null)
    setAnswer('')
  }

  return (
    <div className="rounded-2xl border border-glow/30 bg-glow/8 p-4 space-y-3">
      <div>
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium text-accent">미래의 나, 얼마나 또렷해?</p>
          <span className="text-xs text-muted">{pct}%</span>
        </div>
        <div className="h-[5px] bg-surface-2 rounded-full overflow-hidden mt-1.5">
          <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[11px] text-muted mt-1.5">
          채울수록 대화가 진짜 나 같아져. 지금 가장 도움되는 질문부터:
        </p>
      </div>
      <div className="space-y-2">
        {gaps.map((field) =>
          openKey === field.key ? (
            <div key={field.key} className="rounded-xl border border-accent/30 bg-surface p-3 space-y-2">
              <p className="text-sm text-ink leading-snug">{field.question}</p>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={field.placeholder ?? '한두 문장이면 충분해'}
                rows={3}
                autoFocus
                className="w-full rounded-xl border border-border bg-surface-2/60 p-3 text-sm resize-none focus:outline-none focus:border-accent/50"
              />
              <div className="flex gap-2 justify-end">
                <button type="button" onClick={() => setOpenKey(null)} className="text-xs text-muted px-2 py-1.5">
                  다음에
                </button>
                <button
                  type="button"
                  onClick={() => save(field)}
                  disabled={!answer.trim()}
                  className="text-xs font-medium text-accent px-3 py-1.5 rounded-lg bg-accent/10 disabled:opacity-40"
                >
                  저장
                </button>
              </div>
            </div>
          ) : (
            <button
              key={field.key}
              type="button"
              onClick={() => openGap(field)}
              className="w-full text-left rounded-xl border border-border/70 bg-surface px-3 py-2.5 text-sm text-ink/85 hover:border-accent/40 transition-colors"
            >
              <span className="text-[10px] text-muted block mb-0.5">{field.label}</span>
              {field.question}
            </button>
          ),
        )}
      </div>
    </div>
  )
}

export function ProfileSheet({ profile: p, onClose, onDelete, onUpdate }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<SelfProfile>(p)
  const editable = !!onUpdate
  const dash = buildProfileDashboard(editing ? draft : p)

  const insights = (p.insights ?? []).filter((i) => i.source === 'ai' || i.count >= 2)
  const savedDilemmas = p.savedDilemmas ?? []
  const smallActions = p.smallActions ?? []
  const futureNotes = p.futureSelfNotes ?? []
  // 채팅에서 저장 버튼을 걷어낸 뒤로는 새로 쌓이지 않는다 — 남은 건 예전 기록뿐
  const hasPastRecords = savedDilemmas.length > 0 || smallActions.length > 0 || futureNotes.length > 0

  const saveEdits = () => {
    if (!onUpdate) return
    onUpdate({ ...draft, name: draft.name.trim() || '이름 없음' })
    setEditing(false)
  }

  const cancelEdits = () => {
    setDraft(p)
    setEditing(false)
  }

  const patch = (partial: Partial<SelfProfile>) => setDraft((d) => ({ ...d, ...partial }))
  const patchFuture = (partial: Partial<SelfProfile['future']>) =>
    setDraft((d) => ({ ...d, future: { ...d.future, ...partial } }))

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void/40 backdrop-blur-sm animate-fade-up">
      <div className="flex-1 flex flex-col max-w-lg w-full mx-auto bg-surface shadow-xl border-x border-border min-h-0">
        <header className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <button
            type="button"
            onClick={editing ? cancelEdits : onClose}
            className="text-sm text-muted hover:text-ink px-2 py-1 rounded-lg hover:bg-ink/5"
          >
            {editing ? '취소' : '← 돌아가기'}
          </button>
          <h2 className="text-base font-medium text-ink">내 프로필</h2>
          {editable && !editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(p)
                setEditing(true)
              }}
              className="text-sm text-accent hover:text-accent-dim px-2 py-1 rounded-lg hover:bg-accent/5"
            >
              편집
            </button>
          ) : editing ? (
            <button type="button" onClick={saveEdits} className="text-sm text-accent font-medium px-2 py-1 rounded-lg hover:bg-accent/5">
              저장
            </button>
          ) : (
            <div className="w-10" />
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {editing ? (
            <>
              <div className="space-y-3">
                <EditField label="이름·별명" value={draft.name} onChange={(v) => patch({ name: v })} />
                <EditField label="나이" value={String(draft.age || '')} onChange={(v) => patch({ age: Number(v) || 0 })} />
              </div>
              <Section title="지금의 나">
                <div className="rounded-2xl border border-border bg-surface-2/80 p-4 space-y-3">
                  <EditField label="역할·상황" value={draft.currentRole ?? ''} onChange={(v) => patch({ currentRole: v })} />
                  <EditField label="요즘 하루" value={draft.lifeContext} onChange={(v) => patch({ lifeContext: v })} multiline />
                  <EditField label="절대 못 놓는 것" value={draft.corePriority} onChange={(v) => patch({ corePriority: v })} multiline />
                  <EditField label="잘 산다는 것" value={draft.successDef} onChange={(v) => patch({ successDef: v })} multiline />
                  <EditField label="1년 뒤 되고 싶은 나" value={draft.growthDirection ?? ''} onChange={(v) => patch({ growthDirection: v })} multiline />
                  <EditField label="두려움·회피" value={draft.fear ?? ''} onChange={(v) => patch({ fear: v })} multiline />
                  <EditField label="속으로 원하는 것" value={draft.desire ?? ''} onChange={(v) => patch({ desire: v })} multiline />
                  <label className="block space-y-1.5">
                    <span className="text-[11px] text-muted">미래의 나 말투</span>
                    <select
                      value={draft.speechTone ?? ''}
                      onChange={(e) => patch({ speechTone: e.target.value })}
                      className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-sm text-ink focus:outline-none focus:border-accent/50"
                    >
                      <option value="">선택 안 함</option>
                      {SPEECH_TONE_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Section>
              <Section title={`${FUTURE_YEARS_AHEAD}년 뒤 미래의 나`}>
                <div className="rounded-2xl border border-border bg-surface-2/80 p-4 space-y-3">
                  <EditField label="5년 뒤 한 줄" value={draft.future.identityLine} onChange={(v) => patchFuture({ identityLine: v })} />
                  <EditField label="지금→5년 경로" value={draft.future.throughline} onChange={(v) => patchFuture({ throughline: v })} multiline />
                  <EditField label="평범한 하루" value={draft.future.typicalDay} onChange={(v) => patchFuture({ typicalDay: v })} multiline />
                  <EditField label="미래의 나 → 지금 편지" value={draft.future.adviceLine} onChange={(v) => patchFuture({ adviceLine: v })} multiline />
                </div>
              </Section>
            </>
          ) : (
            <>
              {/* Hero */}
              <div className="rounded-2xl border border-accent/20 bg-gradient-to-br from-accent/8 via-surface to-surface-2 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl chat-avatar flex items-center justify-center text-xl font-semibold shrink-0 shadow-sm">
                    {p.name[0] ?? '나'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-semibold text-ink truncate">{p.name || '이름 없음'}</h1>
                    <p className="text-sm text-muted mt-0.5 truncate">
                      {[p.age ? `${p.age}세` : null, dash.roleShort].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
                {dash.tagline && <p className="text-sm text-ink/80 mt-4 leading-relaxed">{dash.tagline}</p>}
                {(dash.focusChips.length > 0 || dash.traitChips.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {dash.focusChips.map((c) => (
                      <Chip key={c}>{c}</Chip>
                    ))}
                    {dash.traitChips.map((c) => (
                      <Chip key={c} variant="muted">
                        {c}
                      </Chip>
                    ))}
                  </div>
                )}
              </div>

              {onUpdate && <PersonaGapsCard profile={p} onUpdate={onUpdate} />}

              {/* Quick stats */}
              {(dash.adviceTone || (dash.continuityScore != null && dash.continuityScore <= 0)) && (
                <div className="grid grid-cols-2 gap-2.5">
                  {dash.adviceTone && (
                    <div className="rounded-xl border border-border/60 bg-surface-2/60 px-3 py-2.5 col-span-2 sm:col-span-1">
                      <p className="text-[10px] text-muted uppercase tracking-wide">조언 톤</p>
                      <p className="text-sm font-medium text-ink mt-0.5">{dash.adviceTone}</p>
                    </div>
                  )}
                </div>
              )}

              {dash.continuityScore != null && dash.continuityScore > 0 && <ContinuityBar score={dash.continuityScore} />}

              {/* Dashboard cards */}
              <div className="space-y-3">
                {dash.cards.map((card) => (
                  <DashboardCardView key={card.id} card={card} />
                ))}
              </div>

              {hasPastRecords && (
                <p className="text-[11px] text-muted px-1 -mb-1">
                  아래는 지난 기록이에요. 지금은 새로 쌓지 않지만, 지우기 전까지 그대로 남아 있어요.
                </p>
              )}

              {savedDilemmas.length > 0 && (
                <Section title="저장한 고민 (지난 기록)">
                  <div className="space-y-2">
                    {savedDilemmas.map((d) => (
                      <div key={d.id} className="p-3 rounded-xl bg-surface-2/80 border border-border/70 flex items-start gap-2">
                        <span className={`text-sm leading-snug flex-1 ${d.status === 'resolved' ? 'text-muted line-through' : 'text-ink/90'}`}>
                          {d.text}
                        </span>
                        {editable && (
                          <button type="button" onClick={() => onUpdate?.(removeSavedDilemma(p, d.id))} className="shrink-0 text-muted hover:text-status-error text-xs px-1" aria-label="고민 삭제">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {smallActions.length > 0 && (
                <Section title="작은 행동 (지난 기록)">
                  <div className="space-y-2">
                    {smallActions.map((a) => (
                      <div key={a.id} className="p-3 rounded-xl bg-surface-2/80 border border-border/70 flex items-center gap-2.5">
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
                        <span className={`text-sm flex-1 leading-snug ${a.done ? 'text-muted line-through' : 'text-ink/90'}`}>{a.text}</span>
                        {editable && (
                          <button type="button" onClick={() => onUpdate?.(removeSmallAction(p, a.id))} className="shrink-0 text-muted hover:text-status-error text-xs px-1" aria-label="행동 삭제">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {futureNotes.length > 0 && (
                <Section title="미래의 나 메모 (지난 기록)">
                  <div className="space-y-2">
                    {futureNotes.map((n) => (
                      <div key={n.id} className="p-3 rounded-xl bg-surface-2/80 border border-border/70 flex items-start gap-2">
                        <span className="text-sm text-ink/90 leading-snug flex-1">{n.text}</span>
                        {editable && (
                          <button type="button" onClick={() => onUpdate?.(removeFutureSelfNote(p, n.id))} className="shrink-0 text-muted hover:text-status-error text-xs px-1" aria-label="메모 삭제">
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {insights.length > 0 && (
                <Section title="대화에서 알게 된 것">
                  <div className="space-y-2">
                    {insights.slice(0, 6).map((i) => (
                      <div key={i.id} className="p-3 rounded-xl bg-surface-2/80 border border-border/70 flex gap-2 items-start">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-glow/10 text-glow border border-glow/20 whitespace-nowrap h-fit">
                          {INSIGHT_LABELS[i.kind]}
                        </span>
                        <span className="text-sm text-ink/80 leading-snug flex-1">{i.text}</span>
                        {editable && (
                          <button type="button" onClick={() => onUpdate?.(removeInsight(p, i.id))} className="shrink-0 text-muted hover:text-status-error text-xs px-1" aria-label="삭제">
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
                        if (window.confirm('대화에서 관찰한 기억을 전부 지울까요?\n(온보딩 프로필·대화 내용은 그대로예요.)')) {
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
            </>
          )}
        </div>

        {onDelete && !editing && (
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
