import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react'

const REVEAL = 76
const OPEN_THRESHOLD = REVEAL * 0.45
const TAP_SLOP = 8

function TrashIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7h12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

interface Props {
  children: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onPress: () => void
  onDelete: () => void
  deleteLabel?: string
}

export function SwipeableListRow({
  children,
  open,
  onOpenChange,
  onPress,
  onDelete,
  deleteLabel = '삭제',
}: Props) {
  const [offset, setOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const offsetRef = useRef(0)
  const drag = useRef<{ startX: number; startOffset: number; moved: boolean } | null>(null)

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    if (!open) setOffset(0)
  }, [open])

  const snapOffset = (value: number) => {
    if (Math.abs(value) >= OPEN_THRESHOLD) {
      return value > 0 ? REVEAL : -REVEAL
    }
    return 0
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    setIsDragging(true)
    drag.current = { startX: e.clientX, startOffset: offsetRef.current, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const delta = e.clientX - drag.current.startX
    if (Math.abs(delta) > TAP_SLOP) drag.current.moved = true
    const next = Math.max(-REVEAL, Math.min(REVEAL, drag.current.startOffset + delta))
    setOffset(next)
    if (next !== 0) onOpenChange(true)
  }

  const finishDrag = () => {
    if (!drag.current) return
    if (!drag.current.moved) {
      if (Math.abs(drag.current.startOffset) >= OPEN_THRESHOLD) {
        setOffset(0)
        onOpenChange(false)
      } else {
        onPress()
      }
    } else {
      const snapped = snapOffset(offsetRef.current)
      setOffset(snapped)
      onOpenChange(snapped !== 0)
    }
    drag.current = null
    setIsDragging(false)
  }

  const showLeft = offset > 0
  const showRight = offset < 0

  return (
    <div className="relative overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 w-[76px] flex items-center justify-center bg-status-error text-surface ${
          showLeft ? '' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label={deleteLabel}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="w-full h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
        >
          <TrashIcon />
          <span>{deleteLabel}</span>
        </button>
      </div>
      <div
        className={`absolute inset-y-0 right-0 w-[76px] flex items-center justify-center bg-status-error text-surface ${
          showRight ? '' : 'pointer-events-none opacity-0'
        }`}
      >
        <button
          type="button"
          aria-label={deleteLabel}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="w-full h-full flex flex-col items-center justify-center gap-1 text-[11px] font-medium"
        >
          <TrashIcon />
          <span>{deleteLabel}</span>
        </button>
      </div>

      <div
        className="relative z-10 bg-void touch-pan-y select-none cursor-grab active:cursor-grabbing"
        style={{
          transform: `translateX(${offset}px)`,
          transition: isDragging ? 'none' : 'transform 0.22s ease-out',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        {children}
      </div>
    </div>
  )
}
