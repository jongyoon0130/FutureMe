import type { MainTab } from './types'

interface Props {
  active: MainTab
  onChange: (tab: MainTab) => void
}

function ChatIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  )
}

function ScheduleIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

const TABS: { id: MainTab; label: string; Icon: typeof ChatIcon }[] = [
  { id: 'chat', label: '채팅', Icon: ChatIcon },
  { id: 'home', label: '홈', Icon: HomeIcon },
  { id: 'schedule', label: '스케줄', Icon: ScheduleIcon },
]

export function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="app-bottom-nav"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
      aria-label="메인 메뉴"
    >
      <div className="app-bottom-nav-inner">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = active === id
          const isHome = id === 'home'
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id)}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className={`app-bottom-nav-item${isHome ? ' app-bottom-nav-item-home' : ''}`}
            >
              <span className={`app-bottom-nav-icon${isActive ? ' on' : ''}${isHome ? ' home' : ''}`}>
                <Icon active={isActive} />
              </span>
              <span className={`app-bottom-nav-label${isActive ? ' on' : ''}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
