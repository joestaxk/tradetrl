import { cn } from '#/components/ui/cn'

/**
 * The tradetrl mark.
 *
 * The name reads as "trade control", so the mark is the control caret (⌃)
 * sitting over a ledger rule — the peak of a price move and a keyboard
 * modifier at the same time. Two strokes only, which is what lets it stay
 * legible at 16px in a browser tab and at 200px on the landing hero (§12).
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn('size-8', className)}
      role="img"
      aria-label="tradetrl"
    >
      <rect
        x="1"
        y="1"
        width="30"
        height="30"
        rx="9"
        fill="var(--color-panel)"
        stroke="var(--color-line-strong)"
        strokeWidth="1.5"
      />
      {/* the control caret — the peak of the move */}
      <path
        d="M9 17.5 16 10l7 7.5"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* the ledger rule it sits on */}
      <path
        d="M9.5 23h13"
        stroke="var(--color-ink-faint)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Lockup. Set in the geometric sans rather than the display serif — the name
 * is a lowercase command-line word, and a serif would fight that.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Mark className="size-7" />
      <span className="text-[17px] font-semibold leading-none tracking-[-0.02em] text-ink">
        trade<span className="text-accent">trl</span>
      </span>
    </span>
  )
}
