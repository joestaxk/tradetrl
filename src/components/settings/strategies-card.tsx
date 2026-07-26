import { useState } from 'react'
import { Archive, Layers, Loader2, Pencil, Plus, RotateCcw } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Field, Input, Textarea } from '#/components/ui/field'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Badge, Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'
import { toast } from '#/components/ui/toast'
import { useAuth } from '#/lib/auth'
import { useStrategies } from '#/lib/use-strategies'
import { archiveStrategy, createStrategy, restoreStrategy, updateStrategy } from '#/lib/repo'
import { isDuplicateName } from '#/lib/strategies'
import type { Strategy } from '#/lib/types'
import { cn } from '#/components/ui/cn'

/**
 * Your setups, named.
 *
 * This replaces the old free-text "entry model" note, which asked for a
 * paragraph and then did nothing with it. A named strategy can be attached to
 * a trade, which is what lets the review finally answer the question that
 * matters: which of these actually makes money.
 *
 * Kept shallow on purpose — a name and a couple of lines on how you enter.
 * The moment this needs scrolling, nobody maintains it.
 */
export function StrategiesCard() {
  const { user } = useAuth()
  const { all, active } = useStrategies()
  const [editing, setEditing] = useState<Strategy | 'new' | null>(null)

  const archived = all.filter((s) => s.archivedAt)

  return (
    <Card id="strategies">
      <CardHeader>
        <div>
          <CardTitle>Your strategies</CardTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Name the setups you actually trade. Tag a trade with one and your review can
            tell you which of them pays — and which one you only think does.
          </p>
        </div>
        <Layers className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </CardHeader>

      <CardBody className="flex flex-col gap-2">
        {active.length === 0 && archived.length === 0 && (
          <p className="text-[13px] leading-relaxed text-ink-muted">
            Nothing named yet. Most people have two or three — a London sweep, an NY open
            range, a daily continuation.
          </p>
        )}

        {active.map((s) => (
          <div
            key={s.id}
            className="flex items-start gap-3 rounded-xl border border-line bg-raised px-3.5 py-3"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[13px] font-medium text-ink">{s.name}</span>
              {s.entry && (
                <span className="text-[12px] leading-relaxed text-ink-muted">{s.entry}</span>
              )}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => setEditing(s)}
                aria-label={`Edit ${s.name}`}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Retire ${s.name}`}
                onClick={async () => {
                  if (!user) return
                  try {
                    await archiveStrategy(user.uid, s.id)
                    toast.success(`${s.name} retired`, {
                      description: 'Past trades keep it — it just stops appearing.',
                    })
                  } catch {
                    toast.error("Couldn't retire that")
                  }
                }}
              >
                <Archive aria-hidden />
              </Button>
            </div>
          </div>
        ))}

        {archived.length > 0 && (
          <div className="mt-1 flex flex-col gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Retired
            </span>
            {archived.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink-muted">
                  {s.name}
                </span>
                <Badge tone="neutral">kept on past trades</Badge>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Restore ${s.name}`}
                  onClick={async () => {
                    if (!user) return
                    try {
                      await restoreStrategy(user.uid, s.id)
                    } catch {
                      toast.error("Couldn't restore that")
                    }
                  }}
                >
                  <RotateCcw aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="mt-1 self-start"
          onClick={() => setEditing('new')}
        >
          <Plus aria-hidden />
          Add a strategy
        </Button>
      </CardBody>

      <StrategyDialog
        open={editing !== null}
        strategy={editing === 'new' ? undefined : (editing ?? undefined)}
        existing={all}
        onOpenChange={(v) => !v && setEditing(null)}
      />
    </Card>
  )
}

function StrategyDialog({
  open,
  strategy,
  existing,
  onOpenChange,
}: {
  open: boolean
  strategy?: Strategy
  existing: Strategy[]
  onOpenChange: (v: boolean) => void
}) {
  const { user } = useAuth()
  const [name, setName] = useState(strategy?.name ?? '')
  const [entry, setEntry] = useState(strategy?.entry ?? '')
  const [busy, setBusy] = useState(false)

  const reseed = (v: boolean) => {
    if (v) {
      setName(strategy?.name ?? '')
      setEntry(strategy?.entry ?? '')
    }
    onOpenChange(v)
  }

  // Near-duplicates make the picker unusable — two chips reading "London sweep"
  // tell you nothing about which one you tapped last week.
  const duplicate = name.trim() !== '' && isDuplicateName(existing, name, strategy?.id)
  const valid = name.trim().length > 0 && !duplicate

  const save = async () => {
    if (!user || !valid) return
    setBusy(true)
    try {
      if (strategy) {
        await updateStrategy(user.uid, strategy.id, {
          name: name.trim(),
          entry: entry.trim() || undefined,
        })
      } else {
        await createStrategy(user.uid, { name: name.trim(), entry: entry.trim() })
      }
      toast.success(strategy ? 'Strategy updated' : 'Strategy added')
      onOpenChange(false)
    } catch (e) {
      console.error('[strategies] save failed:', e)
      toast.error("Couldn't save that strategy")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reseed}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{strategy ? 'Edit strategy' : 'New strategy'}</DialogTitle>
          <p className="text-[13px] text-ink-muted">
            A name you'll recognise in a picker, and how you get in.
          </p>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <Field
            label="Name"
            error={duplicate ? 'You already have one with that name.' : null}
          >
            {(id) => (
              <Input
                id={id}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="London sweep"
                className={cn(duplicate && 'border-loss')}
              />
            )}
          </Field>

          <Field
            label="How you enter"
            optional
            hint="A couple of lines. This is for you, not for us."
          >
            {(id) => (
              <Textarea
                id={id}
                rows={3}
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder={'Sweep of the Asia low, reclaim on the 5m, enter the retest.'}
              />
            )}
          </Field>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid || busy}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {strategy ? 'Save' : 'Add it'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
