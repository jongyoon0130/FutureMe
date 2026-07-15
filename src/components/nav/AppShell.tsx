import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { TabPager } from './TabPager'
import type { MainTab } from './types'

interface Props {
  activeTab: MainTab
  onTabChange: (tab: MainTab) => void
  showNav: boolean
  chat: ReactNode
  home: ReactNode
  schedule: ReactNode
}

const BOTTOM_NAV_HEIGHT = '5.25rem'

export function AppShell({ activeTab, onTabChange, showNav, chat, home, schedule }: Props) {
  return (
    <div className="h-full relative">
      <div
        className="h-full overflow-hidden"
        style={showNav ? { paddingBottom: `calc(${BOTTOM_NAV_HEIGHT} + env(safe-area-inset-bottom, 0px))` } : undefined}
      >
        <TabPager
          active={activeTab}
          onChange={onTabChange}
          enabled={showNav}
          chat={chat}
          home={home}
          schedule={schedule}
        />
      </div>
      {showNav && <BottomNav active={activeTab} onChange={onTabChange} />}
    </div>
  )
}
