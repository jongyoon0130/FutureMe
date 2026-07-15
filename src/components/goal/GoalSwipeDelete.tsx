import { useRef, useState, type PointerEvent, type ReactNode } from 'react'

const ACTION_WIDTH = 72
const SNAP_THRESHOLD = 36

function TrashIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  )
}

function shouldStartDrag(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el?.closest) return true
  if (el.closest('input, textarea, select, .goal-chk-tap, .goal-chk, .goal-chk-input, .goal-chk-drill')) return false
  return true
}

export function GoalSwipeDelete({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef<{ x: number; y: number; base: number; lock: 'x' | 'y' | null } | null>(null)

  const clamp = (v: number) => Math.max(-ACTION_WIDTH, Math.min(0, v))

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!shouldStartDrag(e.target)) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    dragStart.current = { x: e.clientX, y: e.clientY, base: offset, lock: null }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current
    if (!start) return

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y

    if (!start.lock) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      if (Math.abs(dy) >= Math.abs(dx)) {
        dragStart.current = null
        return
      }
      start.lock = 'x'
    }
    if (start.lock !== 'x') return

    if (!dragging) {
      setDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    e.preventDefault()
    setOffset(clamp(start.base + dx))
  }

  const finishDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    const wasDragging = dragging
    dragStart.current = null
    setDragging(false)
    if (wasDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      setOffset((o) => (o < -SNAP_THRESHOLD ? -ACTION_WIDTH : 0))
    }
  }

  const isOpen = offset < 0

  return (
    <div className={['goal-swipe-wrap', isOpen ? 'open' : '', dragging ? 'dragging' : ''].filter(Boolean).join(' ')}>
      {isOpen || dragging ? (
        <div className="goal-swipe-actions">
          <button
            type="button"
            className="goal-swipe-delete"
            onClick={() => {
              onDelete()
              setOffset(0)
            }}
            aria-label="삭제"
          >
            <TrashIcon />
          </button>
        </div>
      ) : null}
      <div
        className="goal-swipe-content"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 0.22s ease',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {children}
      </div>
    </div>
  )
}
