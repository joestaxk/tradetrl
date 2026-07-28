import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Button } from '#/components/ui/button'
import { Field, Textarea } from '#/components/ui/field'
import { ReasonChips } from '#/components/trades/reason-chips'
import { toast } from '#/components/ui/toast'
import { patchTrade } from '#/lib/repo'
import { useAuth } from '#/lib/auth'
import { useAppStore } from '#/store/app'
import type { Outcome } from '#/lib/types'

/**
 * The reflection step, asked straight after a trade is saved.
 *
 * ── Why it moved here ─────────────────────────────────────────────────────
 * These two fields already existed — at line ~950 of a 1,025-line form, below
 * the charts. A trader who took a loss and wanted to write down why scrolled,
 * never reached them, and reported the feature as missing. Anything that far
 * down a form on a phone effectively does not exist.
 *
 * ── Why a second step rather than moving them up ──────────────────────────
 * Recording *what happened* and reflecting on *why* are different mental
 * modes, and the second one only makes sense once the first is done. Saving
 * first also means the trade is safe before any of this is asked — nothing
 * here can cost someone their entry.
 *
 * ── What it deliberately does not do ──────────────────────────────────────
 * It does not celebrate a win or console a loss. A reckless trade that
 * happened to win would collect the congratulations, and a disciplined loss
 * the sympathy — teaching that outcome is what matters, which is the exact
 * association this app exists to break. Same question, same weight, whichever
 * way it went.
 */
export function ReflectionSheet() {
  const { user } = useAuth()
  const target = useAppStore((s) => s.reflectTarget)
  const closeReflection = useAppStore((s) => s.closeReflection)

  const [reasonTags, setReasonTags] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const open = target !== null

  useEffect(() => {
    if (!open || !target) return
    setReasonTags(target.reasonTags ?? [])
    setReason(target.reason ?? '')
  }, [open, target])

  if (!target) return null

  const outcome: Exclude<Outcome, never> = target.outcome
  const prompt =
    outcome === 'loss'
      ? 'What took you out?'
      : outcome === 'win'
        ? 'What worked?'
        : 'What changed your mind?'

  const save = async () => {
    if (!user) return
    setBusy(true)
    try {
      await patchTrade(user.uid, target.id, {
        reasonTags: reasonTags.length > 0 ? reasonTags : undefined,
        reason: reason.trim() || undefined,
      })
      closeReflection()
    } catch (e) {
      console.error('[reflection] save failed:', e)
      // The trade itself is already saved, so this is genuinely minor —
      // say so rather than implying something was lost.
      toast.error("Couldn't save your note", {
        description: 'The trade itself is safe. You can add this from the trade any time.',
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeReflection()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{prompt}</DialogTitle>
          <p className="text-[13px] text-ink-muted">
            {target.pair.toUpperCase()} is logged. This part is optional — skip it and
            nothing is lost.
          </p>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-5">
          {/*
            The free-text box first, because it is the thing people come
            looking for and could not find. Chips are the structured version
            underneath, for the pattern engine.
          */}
          <Field label="In your own words" optional>
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                autoFocus
                placeholder={
                  outcome === 'loss'
                    ? 'Chased it after the first one stopped out. Knew better.'
                    : 'London open, swept the Asia low, took the reclaim.'
                }
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>

          <Field
            label="Or tick what applies"
            optional
            tip="A fixed list can be counted. Six trades marked “moved my stop” add up; six sentences saying roughly that do not."
          >
            {() => (
              <ReasonChips
                outcome={outcome}
                value={reasonTags}
                onChange={setReasonTags}
              />
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={closeReflection} disabled={busy}>
            Skip
          </Button>
          <Button variant="primary" onClick={save} disabled={busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Save note
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
