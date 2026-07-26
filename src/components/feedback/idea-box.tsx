import { useState } from 'react'
import { Check, Lightbulb, Loader2, Send } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { telegramUrl } from '#/lib/env'
import { Textarea } from '#/components/ui/field'
import { Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'

/**
 * The always-open door.
 *
 * The one-time prompt goes away for good once answered — but that must not
 * mean "you've had your say". This lives in Settings permanently, takes as
 * many messages as someone wants to send, and never asks for a rating again.
 */
export function IdeaBox({
  onSend,
}: {
  onSend: (note: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  const send = async () => {
    if (!note.trim()) return
    setBusy(true)
    try {
      await onSend(note)
      setNote('')
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Tell us something</CardTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Something broken, something missing, something annoying — it lands on
            my Telegram and I read every one. As often as you like.
          </p>
        </div>
        <Lightbulb className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="I wish it could…"
          aria-label="Your message"
        />
        <div className="flex items-center gap-3">
          <Button variant="primary" size="sm" onClick={send} disabled={!note.trim() || busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Send
          </Button>
          {sent && (
            <span className="flex items-center gap-1.5 text-[12px] text-win-bright animate-[fade_0.3s_var(--ease-out-quint)]">
              <Check className="size-3.5" aria-hidden />
              Got it — thank you.
            </span>
          )}
        </div>

        {/*
          A bot can only message someone who messaged it first, so the form
          above is one-way by design. This is the other half — a real
          conversation, in an app they already have on their phone.
        */}
        {telegramUrl && (
          <p className="flex flex-wrap items-center gap-1.5 text-[12px] leading-relaxed text-ink-muted">
            <Send className="size-3 shrink-0 text-ink-faint" aria-hidden />
            Want a reply, or just want to talk it through?{' '}
            <a
              href={telegramUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-accent-bright underline decoration-dotted underline-offset-2 hover:text-accent"
            >
              Message me on Telegram
            </a>
            .
          </p>
        )}
      </CardBody>
    </Card>
  )
}
