import { useEffect, useState } from 'react'
import { Clock, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/field'
import { Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'
import { toast } from '#/components/ui/toast'
import { useAuth } from '#/lib/auth'
import {
  newSessionWindow,
  overlappingWindows,
  sessionWindowsOf,
  windowLength,
} from '#/lib/sessions'
import type { SessionWindow } from '#/lib/types'
import { formatTimeRange, timeFormatOf } from '#/lib/clock'
import { cn } from '#/components/ui/cn'

/**
 * When you trade, in your own words and your own clock.
 *
 * Explicitly not a rule. Nothing here can be violated and nothing here
 * produces a warning — trading at 3am is a fact about your history, not a
 * transgression. It exists so the review can tell you which of your own
 * windows actually makes money, which is a question hardcoded
 * Asia/London/New York boundaries could never answer.
 */
export function SessionsCard() {
  const { profile, updatePrefs } = useAuth()
  const [windows, setWindows] = useState<SessionWindow[]>([])
  const [busy, setBusy] = useState(false)
  const clock = timeFormatOf(profile?.prefs)

  useEffect(() => {
    setWindows(sessionWindowsOf(profile?.prefs))
  }, [profile?.prefs])

  const update = (i: number, patch: Partial<SessionWindow>) =>
    setWindows((cur) => cur.map((w, idx) => (idx === i ? { ...w, ...patch } : w)))

  const save = async () => {
    setBusy(true)
    try {
      // Nameless rows are abandoned edits, not sessions.
      const cleaned = windows
        .filter((w) => w.name.trim() !== '')
        .map((w) => ({
          ...w,
          name: w.name.trim(),
          macros: (w.macros ?? []).filter((m) => m.name.trim() !== ''),
        }))
      await updatePrefs({ sessionWindows: cleaned })
      toast.success('Sessions saved', {
        description: 'Your review and heatmap now use these.',
      })
    } catch {
      toast.error("Couldn't save your sessions")
    } finally {
      setBusy(false)
    }
  }

  const overlaps = overlappingWindows(windows.filter((w) => w.name.trim() !== ''))

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>When you trade</CardTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            Your sessions, on your clock. Add the macros and killzones you take entries
            in and the review reports each one separately.
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
            These are never rules. Trading outside them is never flagged — it just shows
            up in your review, where it's useful instead of annoying.
          </p>
        </div>
        <Clock className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </CardHeader>

      <CardBody className="flex flex-col gap-3">
        {windows.map((w, i) => (
          <div key={w.id} className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={w.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="Session name"
                aria-label={`Session ${i + 1} name`}
                className="min-w-0 flex-1"
              />
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${w.name || 'session'}`}
                onClick={() => setWindows((cur) => cur.filter((_, idx) => idx !== i))}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <TimeField
                label="from"
                value={w.start}
                onChange={(v) => update(i, { start: v })}
              />
              <TimeField label="to" value={w.end} onChange={(v) => update(i, { end: v })} />
              <span className="text-[11px] text-ink-faint tnum">
                {formatTimeRange(w.start, w.end, clock)} · {formatLength(windowLength(w))}
              </span>
            </div>

            {/* Macros — the sharper windows inside the session. */}
            <div className="flex flex-col gap-1.5 border-t border-line/70 pt-2">
              {(w.macros ?? []).map((m, mi) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 pl-2">
                  <span className="text-ink-faint" aria-hidden>
                    ↳
                  </span>
                  <Input
                    value={m.name}
                    onChange={(e) =>
                      update(i, {
                        macros: (w.macros ?? []).map((x, xi) =>
                          xi === mi ? { ...x, name: e.target.value } : x,
                        ),
                      })
                    }
                    placeholder="Macro name"
                    aria-label="Macro name"
                    className="h-9 min-w-0 flex-1 text-[13px]"
                  />
                  <TimeField
                    label=""
                    value={m.start}
                    onChange={(v) =>
                      update(i, {
                        macros: (w.macros ?? []).map((x, xi) =>
                          xi === mi ? { ...x, start: v } : x,
                        ),
                      })
                    }
                  />
                  <TimeField
                    label="–"
                    value={m.end}
                    onChange={(v) =>
                      update(i, {
                        macros: (w.macros ?? []).map((x, xi) =>
                          xi === mi ? { ...x, end: v } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove macro"
                    onClick={() =>
                      update(i, { macros: (w.macros ?? []).filter((_, xi) => xi !== mi) })
                    }
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ))}

              <button
                type="button"
                onClick={() =>
                  update(i, {
                    macros: [
                      ...(w.macros ?? []),
                      {
                        id: `m${Date.now().toString(36)}`,
                        name: '',
                        start: w.start,
                        end: w.end,
                      },
                    ],
                  })
                }
                className="flex min-h-9 items-center gap-1.5 self-start pl-2 text-[12px] text-ink-faint transition-colors hover:text-accent-bright"
              >
                <Plus className="size-3" aria-hidden />
                Add a macro or killzone
              </button>
            </div>
          </div>
        ))}

        {overlaps.length > 0 && (
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-caution">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {overlaps.map(([a, b]) => `${a} overlaps ${b}`).join(', ')}. That's allowed —
            a trade in both counts to the narrower one.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWindows((cur) => [...cur, newSessionWindow()])}
          >
            <Plus aria-hidden />
            Add a session
          </Button>
          <Button variant="primary" size="sm" onClick={save} disabled={busy}>
            Save sessions
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <span className="flex items-center gap-1.5">
      {label && <span className="text-[12px] text-ink-muted">{label}</span>}
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-9 rounded-lg border border-line bg-panel px-2 text-[13px] text-ink tnum',
          'focus:border-accent focus:outline-none',
          '[&::-webkit-calendar-picker-indicator]:opacity-50',
          '[&::-webkit-calendar-picker-indicator]:invert',
        )}
      />
    </span>
  )
}

function formatLength(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
