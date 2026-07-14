import type { SelfProfile } from '../types/self'
import { ADVICE_TONE_LABELS, LIFE_DOMAIN_LABELS } from '../types/self'
import { FUTURE_YEARS_AHEAD } from './brand'
import {
  clipPhrase,
  extractThemeTags,
  toCoreMessage,
  toDashboardValue,
  toNominalPhrase,
  toRoleLabel,
  toTagline,
  toVoiceKeywords,
} from './profilePhrases'

function dedupeChips(items: string[]): string[] {
  const out: string[] = []
  for (const item of items.map((s) => s.trim()).filter(Boolean)) {
    if (out.some((x) => x === item || (x.length > 3 && item.length > 3 && (x.includes(item) || item.includes(x))))) continue
    out.push(item)
  }
  return out
}

export function buildDefaultListPreview(profile: SelfProfile): string {
  const f = profile.future
  if (f.identityLine?.trim()) return toDashboardValue(f.identityLine, 80)
  if (profile.currentRole?.trim()) return toRoleLabel(profile.currentRole)
  const tags = extractThemeTags(profile.lifeContext, 1)
  if (tags[0]) return tags[0]
  if (profile.corePriority?.trim()) return toDashboardValue(profile.corePriority, 80)
  return '미래의 나와 대화를 시작해보세요'
}

export interface DashboardStat {
  label: string
  value: string
}

export interface DashboardCard {
  id: string
  title: string
  accent?: 'default' | 'future' | 'values'
  stats?: DashboardStat[]
  /** 짧은 핵심 한 줄 (명사형) */
  headline?: string
  chips?: string[]
}

export interface ProfileDashboard {
  roleShort: string
  tagline: string
  focusChips: string[]
  traitChips: string[]
  cards: DashboardCard[]
  continuityScore?: number
  adviceTone?: string
}

export function buildProfileDashboard(p: SelfProfile): ProfileDashboard {
  const f = p.future

  const roleShort = toRoleLabel(p.currentRole || p.lifeContext)
  const tagline =
    toTagline([p.corePriority, p.growthDirection, f.identityLine]) ||
    extractThemeTags(p.lifeContext, 3).join(' · ') ||
    '프로필 요약'

  const focusChips = dedupeChips([
    ...(p.concernDomains ?? []).map((d) => LIFE_DOMAIN_LABELS[d]),
    ...f.thrivingDomains.map((d) => LIFE_DOMAIN_LABELS[d]),
  ]).slice(0, 5)

  const traitChips = dedupeChips([
    p.speechTone ?? '',
    ...f.traitsShift.map((t) => toNominalPhrase(t, 10) || t),
    f.adviceTone ? ADVICE_TONE_LABELS[f.adviceTone] : '',
  ]).slice(0, 4)

  const cards: DashboardCard[] = []

  const rhythmTags = dedupeChips([
    ...extractThemeTags(p.lifeContext, 5),
    ...extractThemeTags(p.currentRole, 2),
  ])
  const stressValue = toDashboardValue(p.stressMoment, 18)
  if (rhythmTags.length || stressValue) {
    cards.push({
      id: 'rhythm',
      title: '요즘 리듬',
      chips: rhythmTags,
      stats: stressValue ? [{ label: '요즘 걸림', value: stressValue }] : undefined,
    })
  }

  const valueStats: DashboardStat[] = []
  if (p.corePriority?.trim()) valueStats.push({ label: '1순위', value: toDashboardValue(p.corePriority, 18) })
  if (p.successDef?.trim()) valueStats.push({ label: '잘 산다', value: toDashboardValue(p.successDef, 18) })
  if (p.growthDirection?.trim()) valueStats.push({ label: '1년 뒤', value: toDashboardValue(p.growthDirection, 18) })
  if (valueStats.length) {
    cards.push({ id: 'values', title: '가치 · 방향', accent: 'values', stats: valueStats })
  }

  const mindStats: DashboardStat[] = []
  if (p.fear?.trim()) mindStats.push({ label: '두려움', value: toDashboardValue(p.fear, 16) })
  if (p.desire?.trim()) mindStats.push({ label: '원하는 것', value: toDashboardValue(p.desire, 16) })
  if (mindStats.length) {
    cards.push({ id: 'mind', title: '속마음', stats: mindStats })
  }

  if (p.dilemmas[0]) {
    const d = p.dilemmas[0]
    cards.push({
      id: 'dilemma',
      title: '선택의 기준',
      headline: toNominalPhrase(d.choice, 16) || d.choice,
      stats: d.reason?.trim() ? [{ label: '이유', value: toDashboardValue(d.reason, 18) }] : undefined,
    })
  }

  const futureStats: DashboardStat[] = []
  if (f.career?.trim()) futureStats.push({ label: '일', value: toDashboardValue(f.career, 16) })
  if (f.achievement?.trim()) futureStats.push({ label: '성취', value: toDashboardValue(f.achievement, 16) })
  if (f.weeklyAction?.trim()) futureStats.push({ label: '이번 주', value: toDashboardValue(f.weeklyAction, 14) })

  const futureTags = dedupeChips([
    ...extractThemeTags(f.throughline, 3),
    ...extractThemeTags(f.typicalDay, 2),
  ])

  if (f.identityLine?.trim() || futureStats.length || futureTags.length) {
    cards.push({
      id: 'future',
      title: `${FUTURE_YEARS_AHEAD}년 뒤`,
      accent: 'future',
      headline: f.identityLine?.trim() ? toDashboardValue(f.identityLine, 28) : undefined,
      stats: futureStats.length ? futureStats : undefined,
      chips: dedupeChips([...futureTags, ...f.fearedSelves.slice(0, 2).map((s) => toNominalPhrase(s, 10) || s)]).slice(0, 5),
    })
  }

  if (f.adviceLine?.trim() || f.lesson?.trim()) {
    cards.push({
      id: 'letter',
      title: '미래의 나 → 지금',
      headline: toCoreMessage(f.adviceLine || f.lesson),
    })
  }

  const styleSample =
    p.styleSample?.trim() ||
    p.styleSamples.find((s) => s.source === 'onboarding')?.text?.trim()
  const voiceTags = toVoiceKeywords(styleSample)
  const styleChips: string[] = []
  if (p.styleRules) {
    styleChips.push(p.styleRules.banmal ? '반말' : '존댓말')
    if (p.styleRules.usesConsonants) styleChips.push('ㅋㅋ/ㅠㅠ')
    if (p.styleRules.usesEmoji) styleChips.push('이모지')
  }
  if (styleChips.length || voiceTags.length) {
    cards.push({
      id: 'voice',
      title: '말투',
      chips: dedupeChips([...styleChips, ...voiceTags]),
    })
  }

  return {
    roleShort,
    tagline,
    focusChips,
    traitChips,
    cards,
    continuityScore: f.continuityScore,
    adviceTone: f.adviceTone ? ADVICE_TONE_LABELS[f.adviceTone] : undefined,
  }
}

/** @deprecated */
export interface ProfileSnapshot {
  headline: string
  oneLiner: string
  concernChips: string[]
  futureChips: string[]
  currentRows: { label: string; value: string }[]
  valuesRows: { label: string; value: string }[]
  futureRows: { label: string; value: string }[]
  styleChips: string[]
  styleSample?: string
}

export function buildProfileSnapshot(p: SelfProfile): ProfileSnapshot {
  const dash = buildProfileDashboard(p)
  return {
    headline: dash.roleShort,
    oneLiner: dash.tagline,
    concernChips: dash.focusChips,
    futureChips: dash.traitChips,
    currentRows: [],
    valuesRows: [],
    futureRows: [],
    styleChips: [],
  }
}

export function summarizeLine(text: string | undefined, max = 56): string {
  return clipPhrase(toDashboardValue(text, max), max)
}
