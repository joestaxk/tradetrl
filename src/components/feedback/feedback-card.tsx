import { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/field'
import { Face } from '#/components/feedback/faces'
import { MOODS, replyFor, type Mood } from '#/lib/feedback'
import { cn } from '#/components/ui/cn'

/**
 * "How's it going?"
 *
 * Never labelled a survey, never scored 1–10, and it does not block anything.
 * One tap answers it; the sentence afterwards is genuinely optional, and the
 * card thanks them and leaves either way.
 */
export function FeedbackCard({
  onSubmit,
  onDismiss,
  className,
}: {
  onSubmit: (mood: Mood, note: string) => Promise<void>
  onDismiss: () => void
  className?: string
}) {
  const [mood, setMood] = useState<Mood | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const send = async () => {
    if (!mood) return
    setBusy(true)
    try {
      await onSubmit(mood, note)
      setDone(true)
      // Let them read the thank-you, then get out of the way.
      setTimeout(onDismiss, 2200)
    } finally {
      setBusy(false)
    }
  }

  if (done && mood) {
    return (
      <section
        className={cn(
          'flex items-center gap-3 rounded-xl border border-win-edge bg-win-wash px-4 py-3.5',
          'animate-[fade_0.3s_var(--ease-out-quint)]',
          className,
        )}
      >
        <Check className="size-4 shrink-0 text-win-bright" aria-hidden />
        <p className="text-[13px] text-ink-dim">{replyFor(mood)}</p>
      </section>
    )
  }

  return (
    <section
      className={cn('relative rounded-xl border border-line bg-panel p-4 sm:p-5', className)}
      aria-label="How is it going?"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Not now"
        className={cn(
          'absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg',
          'text-ink-faint transition-colors duration-150 hover:bg-raised hover:text-ink-dim',
        )}
      >
        <X className="size-3.5" aria-hidden />
      </button>

      <p className="pr-8 text-[15px] font-medium text-ink">How's this going for you?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        One tap. It helps us know what to fix next.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {MOODS.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => setMood(m.value)}
            aria-pressed={mood === m.value}
            className={cn(
              'flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2',
              'border transition-[border-color,background-color,color,transform] duration-200',
              'ease-[var(--ease-out-quint)] hover:-translate-y-0.5',
              mood === m.value
                ? 'border-accent bg-accent-wash text-accent-bright'
                : 'border-line bg-raised text-ink-muted hover:border-line-strong hover:text-ink-dim',
            )}
          >
            <Face mood={m.value} className="size-6" />
            <span className="text-[11px] font-medium leading-none">{m.label}</span>
          </button>
        ))}
      </div>

      {/* The note only appears once they've answered — asking for prose up
          front is what makes people close these things. */}
      {mood && (
        <div className="mt-4 flex flex-col gap-2.5 animate-[fade_0.25s_var(--ease-out-quint)]">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={
              mood === 'bad' || mood === 'meh'
                ? "What's getting in the way? (optional)"
                : 'Anything you\'d change? (optional)'
            }
            aria-label="Anything you would change"
          />
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={send} disabled={busy}>
              {busy && <Loader2 className="animate-spin" aria-hidden />}
              Send
            </Button>
            <span className="text-[12px] text-ink-faint">
              or just send the face — that's plenty.
            </span>
          </div>
        </div>
      )}
    </section>
  )
}
