import { useRef, type ReactNode } from 'react'
import type { ChatMessage } from '../../types/self'
import {
  buildChatDisplayItems,
  formatChatTime,
  meBubbleRadius,
  themBubbleRadius,
} from '../../lib/chatDisplay'

const LONG_PRESS_MS = 550
const DRAG_CANCEL_PX = 10

interface Props {
  messages: ChatMessage[]
  selfName: string
  revealProgress: { msgId: string; shown: number } | null
  selectMode?: boolean
  selectedIds?: ReadonlySet<string>
  onToggleSelect?: (msgId: string) => void
  onEnterSelectMode?: (msgId: string) => void
}

function SelectCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      className={`w-[22px] h-[22px] rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
        checked
          ? 'border-accent bg-accent text-surface'
          : 'border-muted/50 bg-surface'
      }`}
      aria-hidden
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  )
}

/** 길게 누름(움직임 없음) → 삭제 선택. 드래그 → 텍스트 선택·복사 */
function MessageBubble({
  msgId,
  selectMode,
  selected,
  onEnterSelectMode,
  className,
  children,
}: {
  msgId: string
  selectMode: boolean
  selected: boolean
  onEnterSelectMode?: (id: string) => void
  className: string
  children: ReactNode
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    if (selectMode) return
    clearTimer()
    const startX = e.clientX
    const startY = e.clientY
    let moved = false

    const onMove = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > DRAG_CANCEL_PX) {
        moved = true
        clearTimer()
      }
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      clearTimer()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)

    timerRef.current = setTimeout(() => {
      if (!moved) {
        onEnterSelectMode?.(msgId)
      }
    }, LONG_PRESS_MS)
  }

  const selectionClass = selectMode
    ? 'select-none pointer-events-none'
    : 'select-text cursor-text [-webkit-user-select:text] [user-select:text]'

  return (
    <div
      className={`${className} ${selectionClass} ${
        selected && selectMode ? 'ring-2 ring-accent/40' : ''
      }`}
      onPointerDown={selectMode ? undefined : handlePointerDown}
    >
      {children}
    </div>
  )
}

function MessageRow({
  msgId,
  selected,
  selectMode,
  onToggleSelect,
  children,
  align,
}: {
  msgId: string
  selected: boolean
  selectMode: boolean
  onToggleSelect?: (id: string) => void
  children: ReactNode
  align: 'me' | 'them'
}) {
  const handleClick = () => {
    if (!selectMode) return
    const sel = window.getSelection()
    if (sel && sel.toString().trim().length > 0) return
    onToggleSelect?.(msgId)
  }

  return (
    <div
      className={`flex items-start gap-2.5 ${selectMode ? 'cursor-pointer' : ''} ${
        selected ? 'opacity-100' : selectMode ? 'opacity-90' : ''
      }`}
      onClick={handleClick}
    >
      {selectMode && (
        <div className={`pt-1 shrink-0 ${align === 'me' ? 'order-first' : 'order-first'}`}>
          <SelectCheckbox checked={selected} />
        </div>
      )}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export function ChatMessageList({
  messages,
  selfName,
  revealProgress,
  selectMode = false,
  selectedIds,
  onToggleSelect,
  onEnterSelectMode,
}: Props) {
  const items = buildChatDisplayItems(messages)
  const selected = selectedIds ?? new Set<string>()

  return (
    <>
      {items.map((item, idx) => {
        if (item.kind === 'date') {
          return (
            <div key={`date-${idx}-${item.label}`} className="flex justify-center py-3">
              <span className="inline-flex items-center gap-1.5 text-[11px] text-ink/55 px-3.5 py-1.5 rounded-full bg-surface border border-border/50 shadow-sm">
                <span className="text-[12px] leading-none" aria-hidden>
                  📅
                </span>
                {item.label}
              </span>
            </div>
          )
        }

        const shown =
          revealProgress?.msgId === item.msgId
            ? revealProgress.shown
            : item.segments.length
        const segments = item.segments.slice(0, shown)
        if (!segments.length) return null

        const time = formatChatTime(item.timestamp)
        const isSelected = selected.has(item.msgId)

        if (item.role === 'user') {
          return (
            <MessageRow
              key={item.msgId}
              msgId={item.msgId}
              selected={isSelected}
              selectMode={selectMode}
              onToggleSelect={onToggleSelect}
              align="me"
            >
              <div className="flex justify-end items-end gap-1.5 animate-fade-up">
                <span className="text-[11px] text-ink/45 shrink-0 mb-1 tabular-nums leading-none tracking-tight select-none">
                  {time}
                </span>
                <div className="flex flex-col items-end gap-1 max-w-[78%]">
                  {segments.map((seg, i) => (
                    <MessageBubble
                      key={`${item.msgId}-${i}`}
                      msgId={item.msgId}
                      selectMode={selectMode}
                      selected={isSelected}
                      onEnterSelectMode={onEnterSelectMode}
                      className={`px-3.5 py-2.5 text-[15px] leading-[1.45] whitespace-pre-line ${meBubbleRadius(i, segments.length)}`}
                    >
                      {seg}
                    </MessageBubble>
                  ))}
                </div>
              </div>
            </MessageRow>
          )
        }

        return (
          <MessageRow
            key={item.msgId}
            msgId={item.msgId}
            selected={isSelected}
            selectMode={selectMode}
            onToggleSelect={onToggleSelect}
            align="them"
          >
            <div className="flex items-start gap-1.5 animate-fade-up">
              <div className="w-7 shrink-0 pt-0.5">
                <div className="w-7 h-7 rounded-full chat-avatar flex items-center justify-center text-[11px] font-medium select-none">
                  {selfName[0] ?? '나'}
                </div>
              </div>
              <div className="flex items-end gap-1.5 min-w-0 flex-1">
                <div className="flex flex-col gap-1 max-w-[78%]">
                  {segments.map((seg, i) => (
                    <MessageBubble
                      key={`${item.msgId}-${i}`}
                      msgId={item.msgId}
                      selectMode={selectMode}
                      selected={isSelected}
                      onEnterSelectMode={onEnterSelectMode}
                      className={`px-3.5 py-2.5 text-[15px] leading-[1.45] whitespace-pre-line ${themBubbleRadius(i, segments.length)}`}
                    >
                      {seg}
                    </MessageBubble>
                  ))}
                </div>
                <span className="text-[11px] text-ink/45 shrink-0 mb-1 tabular-nums leading-none tracking-tight select-none">
                  {time}
                </span>
              </div>
            </div>
          </MessageRow>
        )
      })}
    </>
  )
}
