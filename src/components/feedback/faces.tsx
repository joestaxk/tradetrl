import type { Mood } from '#/lib/feedback'
import { cn } from '#/components/ui/cn'

/**
 * The four faces, drawn rather than typed.
 *
 * §12 forbids emoji as icons, and for good reason here: 🙂 renders as four
 * different faces on four different platforms, so a "good" on Android and a
 * "good" on iOS would not be the same question. These are one shape, one
 * stroke weight, one meaning.
 */
export function Face({ mood, className }: { mood: Mood; className?: string }) {
  const mouth: Record<Mood, string> = {
    love: 'M8.5 14.5c1 1.6 2.2 2.4 3.5 2.4s2.5-.8 3.5-2.4',
    good: 'M8.8 14.2c.9 1.1 1.9 1.7 3.2 1.7s2.3-.6 3.2-1.7',
    meh: 'M8.8 15h6.4',
    bad: 'M8.5 16.4c1-1.5 2.2-2.3 3.5-2.3s2.5.8 3.5 2.3',
  }

  return (
    <svg viewBox="0 0 24 24" className={cn('size-6', className)} aria-hidden fill="none">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
      {/* Eyes: a flat line for 'meh' reads as indifference better than dots. */}
      {mood === 'meh' ? (
        <>
          <path d="M8.4 9.9h1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <path d="M14 9.9h1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="9.2" cy="9.9" r="1" fill="currentColor" />
          <circle cx="14.8" cy="9.9" r="1" fill="currentColor" />
        </>
      )}
      <path
        d={mouth[mood]}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
