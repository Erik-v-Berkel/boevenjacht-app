import { useEffect, useRef, useState } from 'react'

/** Knop die je `ms` milliseconden ingedrukt moet houden (tegen per ongeluk drukken). */
export function HoldButton({
  ms = 3000,
  disabled,
  onHold,
  children,
}: {
  ms?: number
  disabled?: boolean
  onHold: () => void
  children: React.ReactNode
}) {
  const [progress, setProgress] = useState(0)
  const start = useRef<number | null>(null)
  const frame = useRef(0)

  const stop = () => {
    start.current = null
    cancelAnimationFrame(frame.current)
    setProgress(0)
  }

  const step = () => {
    if (start.current === null) return
    const p = Math.min(1, (performance.now() - start.current) / ms)
    setProgress(p)
    if (p >= 1) {
      stop()
      navigator.vibrate?.(200)
      onHold()
    } else {
      frame.current = requestAnimationFrame(step)
    }
  }

  const begin = (e: React.PointerEvent) => {
    if (disabled) return
    e.preventDefault()
    start.current = performance.now()
    frame.current = requestAnimationFrame(step)
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  return (
    <button
      disabled={disabled}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="relative w-full touch-none overflow-hidden rounded-xl bg-yellow-400 px-4 py-4 text-lg font-black text-slate-900 select-none disabled:opacity-40"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
    >
      <span className="absolute inset-y-0 left-0 bg-yellow-200" style={{ width: `${progress * 100}%` }} />
      <span className="relative">{children}</span>
    </button>
  )
}
