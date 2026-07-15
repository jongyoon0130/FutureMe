export type ThemeId = 'crimson' | 'spring' | 'violet' | 'rosy' | 'cobalt' | 'neon'

export type ThemeTokens = {
  void: string
  surface: string
  'surface-2': string
  border: string
  ink: string
  muted: string
  accent: string
  'accent-dim': string
  glow: string
  'glow-dim': string
  'bubble-me': string
  'bubble-them': string
  avatar: string
  'avatar-ink': string
  'status-ok': string
  'status-warn': string
  'status-error': string
  scrollbar: string
}

export type ThemePreset = {
  id: ThemeId
  label: string
  swatchA: string
  swatchB: string
  tokens: ThemeTokens
}

const THEME_STORAGE_KEY = 'futureme-theme'
export const THEME_CHANGE_EVENT = 'futureme-theme-change'

/** 고정 테마 — 5번 Cobalt · White (테마 선택 UI 비활성) */
export const DEFAULT_THEME_ID: ThemeId = 'cobalt'

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'crimson',
    label: 'Crimson · Snow',
    swatchA: '#FD1843',
    swatchB: '#FFF9FA',
    tokens: {
      void: '#fce8ec',
      surface: '#FFF9FA',
      'surface-2': '#f5e0e6',
      border: '#f0b0c0',
      ink: '#2a1520',
      muted: '#a87080',
      accent: '#FD1843',
      'accent-dim': '#e0153a',
      glow: '#ff6b8a',
      'glow-dim': '#FD1843',
      'bubble-me': '#ffc0d0',
      'bubble-them': '#ffffff',
      avatar: '#FD1843',
      'avatar-ink': '#ffffff',
      'status-ok': '#16a34a',
      'status-warn': '#d97706',
      'status-error': '#dc2626',
      scrollbar: '#f0b0c0',
    },
  },
  {
    id: 'spring',
    label: 'Spring · Dark',
    swatchA: '#21F1A8',
    swatchB: '#171717',
    tokens: {
      void: '#171717',
      surface: '#1f1f1f',
      'surface-2': '#262626',
      border: '#333333',
      ink: '#f0f0f0',
      muted: '#9ca3af',
      accent: '#21F1A8',
      'accent-dim': '#1ad99a',
      glow: '#21F1A8',
      'glow-dim': '#17c98a',
      'bubble-me': '#1e4d3f',
      'bubble-them': '#222222',
      avatar: '#21F1A8',
      'avatar-ink': '#0d1f18',
      'status-ok': '#4ade80',
      'status-warn': '#fbbf24',
      'status-error': '#f87171',
      scrollbar: '#333333',
    },
  },
  {
    id: 'violet',
    label: 'Violet · Lime',
    swatchA: '#B6FF00',
    swatchB: '#3C1A47',
    tokens: {
      void: '#3C1A47',
      surface: '#45204d',
      'surface-2': '#4e2558',
      border: '#6a3570',
      ink: '#f5f0f8',
      muted: '#c4a8cc',
      accent: '#B6FF00',
      'accent-dim': '#a0e600',
      glow: '#B6FF00',
      'glow-dim': '#9de600',
      'bubble-me': '#5a6020',
      'bubble-them': '#4a2552',
      avatar: '#B6FF00',
      'avatar-ink': '#1a1a1a',
      'status-ok': '#86efac',
      'status-warn': '#fde047',
      'status-error': '#fca5a5',
      scrollbar: '#6a3570',
    },
  },
  {
    id: 'rosy',
    label: 'Rosy · Slate',
    swatchA: '#C9847A',
    swatchB: '#4A5568',
    tokens: {
      void: '#4A5568',
      surface: '#525d70',
      'surface-2': '#5a6578',
      border: '#6a7588',
      ink: '#f8f4f2',
      muted: '#c4b0aa',
      accent: '#C9847A',
      'accent-dim': '#b8746a',
      glow: '#d9948a',
      'glow-dim': '#c9847a',
      'bubble-me': '#8a6058',
      'bubble-them': '#566070',
      avatar: '#C9847A',
      'avatar-ink': '#ffffff',
      'status-ok': '#86efac',
      'status-warn': '#fcd34d',
      'status-error': '#fca5a5',
      scrollbar: '#6a7588',
    },
  },
  {
    id: 'cobalt',
    label: 'Cobalt · White',
    swatchA: '#0047FF',
    swatchB: '#F8F7F4',
    tokens: {
      void: '#e8edf8',
      surface: '#F8F7F4',
      'surface-2': '#dce6f5',
      border: '#b8cce8',
      ink: '#1a2240',
      muted: '#6878a0',
      accent: '#0047FF',
      'accent-dim': '#003dd9',
      glow: '#6690ff',
      'glow-dim': '#0047FF',
      'bubble-me': '#a8c4ff',
      'bubble-them': '#ffffff',
      avatar: '#0047FF',
      'avatar-ink': '#ffffff',
      'status-ok': '#16a34a',
      'status-warn': '#d97706',
      'status-error': '#dc2626',
      scrollbar: '#b8cce8',
    },
  },
  {
    id: 'neon',
    label: 'Lime · Black',
    swatchA: '#2BEE34',
    swatchB: '#141414',
    tokens: {
      void: '#141414',
      surface: '#1a1a1a',
      'surface-2': '#222222',
      border: '#333333',
      ink: '#f0f0f0',
      muted: '#9ca3af',
      accent: '#2BEE34',
      'accent-dim': '#25d42e',
      glow: '#2BEE34',
      'glow-dim': '#22c82b',
      'bubble-me': '#1a4020',
      'bubble-them': '#1e1e1e',
      avatar: '#2BEE34',
      'avatar-ink': '#0a1a0c',
      'status-ok': '#4ade80',
      'status-warn': '#fbbf24',
      'status-error': '#f87171',
      scrollbar: '#333333',
    },
  },
]

const themeMap = Object.fromEntries(THEME_PRESETS.map((t) => [t.id, t])) as Record<ThemeId, ThemePreset>

export function getThemePreset(id: ThemeId): ThemePreset {
  return themeMap[id]
}

export function isThemeId(value: string): value is ThemeId {
  return value in themeMap
}

export function loadThemeId(): ThemeId | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw || !isThemeId(raw)) return null
    return raw
  } catch {
    return null
  }
}

export function applyTheme(id: ThemeId): void {
  const preset = getThemePreset(id)
  const root = document.documentElement
  for (const [key, value] of Object.entries(preset.tokens)) {
    root.style.setProperty(`--color-${key}`, value)
  }
  root.dataset.theme = id
}

export function saveThemeId(id: ThemeId): void {
  localStorage.setItem(THEME_STORAGE_KEY, id)
  applyTheme(id)
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: id }))
}

/** 앱 시작 시 — 5번 테마 ID만 고정 (비주얼은 goals.html / goal-app.css 기준) */
export function initTheme(): ThemeId {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, DEFAULT_THEME_ID)
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME_ID
}
