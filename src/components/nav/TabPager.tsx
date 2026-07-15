import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { MAIN_TABS, type MainTab } from './types'

interface Props {
  active: MainTab
  onChange: (tab: MainTab) => void
  enabled: boolean
  chat: ReactNode
  home: ReactNode
  schedule: ReactNode
}

const TAB_INDEX: Record<MainTab, number> = {
  chat: 0,
  home: 1,
  schedule: 2,
}

export function TabPager({ active, onChange, enabled, chat, home, schedule }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const widthRef = useRef(0)
  const scrollRafRef = useRef<number | null>(null)
  const programmaticScrollRef = useRef(false)

  const scrollToTab = useCallback((tab: MainTab, behavior: ScrollBehavior = 'smooth') => {
    const el = scrollerRef.current
    if (!el) return
    const width = widthRef.current || el.clientWidth
    programmaticScrollRef.current = true
    el.scrollTo({ left: TAB_INDEX[tab] * width, behavior })
    window.setTimeout(() => {
      programmaticScrollRef.current = false
    }, behavior === 'smooth' ? 320 : 0)
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    const measure = () => {
      widthRef.current = el.clientWidth
      scrollToTab(active, 'auto')
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [active, scrollToTab])

  useEffect(() => {
    if (!enabled) return
    scrollToTab(active)
  }, [active, enabled, scrollToTab])

  const handleScroll = () => {
    if (!enabled || programmaticScrollRef.current) return
    if (scrollRafRef.current != null) return
    scrollRafRef.current = window.requestAnimationFrame(() => {
      scrollRafRef.current = null
      const el = scrollerRef.current
      if (!el) return
      const width = widthRef.current || el.clientWidth
      if (!width) return
      const index = Math.round(el.scrollLeft / width)
      const tab = MAIN_TABS[Math.min(Math.max(index, 0), MAIN_TABS.length - 1)]
      if (tab && tab !== active) onChange(tab)
    })
  }

  if (!enabled) {
    return (
      <div className="h-full overflow-hidden">
        {active === 'chat' && chat}
        {active === 'home' && home}
        {active === 'schedule' && schedule}
      </div>
    )
  }

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      className="tab-pager h-full flex overflow-x-auto snap-x snap-mandatory overscroll-x-contain"
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}
    >
      <div className="w-full shrink-0 snap-center h-full overflow-hidden">{chat}</div>
      <div className="w-full shrink-0 snap-center h-full overflow-hidden">{home}</div>
      <div className="w-full shrink-0 snap-center h-full overflow-hidden">{schedule}</div>
    </div>
  )
}
