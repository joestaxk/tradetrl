import { useMemo, useState } from 'react'
import { Tag as TagIcon, X } from 'lucide-react'
import { Input } from '#/components/ui/field'
import { cn } from '#/components/ui/cn'

/**
 * Tags, with the trader's own vocabulary offered back to them.
 *
 * Free-text tagging quietly rots without this: "london", "London" and
 * "london-open" become three tags, each with a third of the data, and the
 * per-setup win rates they were supposed to power become meaningless. Showing
 * what already exists makes reusing a tag the path of least resistance.
 */
export function TagInput({
  value,
  onChange,
  suggestions,
  id,
}: {
  /** Committed tags. */
  value: string[]
  onChange: (tags: string[]) => void
  /** Every tag this trader has used before, most used first. */
  suggestions: string[]
  id?: string
}) {
  const [draft, setDraft] = useState('')

  const matches = useMemo(() => {
    const used = new Set(value.map((t) => t.toLowerCase()))
    const q = draft.trim().toLowerCase()
    return suggestions
      .filter((s) => !used.has(s.toLowerCase()))
      .filter((s) => (q ? s.toLowerCase().includes(q) : true))
      .slice(0, 8)
  }, [suggestions, value, draft])

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,/g, '')
    if (!tag) return
    // Case-insensitive dedupe, keeping whatever casing already existed.
    if (value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
      setDraft('')
      return
    }
    const existing = suggestions.find((s) => s.toLowerCase() === tag.toLowerCase())
    onChange([...value, existing ?? tag])
    setDraft('')
  }

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag))

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <TagIcon
          className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint"
          aria-hidden
        />
        <Input
          id={id}
          className="pl-8"
          placeholder="breakout"
          value={draft}
          autoCapitalize="none"
          autoCorrect="off"
          onChange={(e) => {
            // A typed comma means "that one's done" — matches how people
            // actually type lists without needing to explain it.
            if (e.target.value.includes(',')) add(e.target.value)
            else setDraft(e.target.value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
              remove(value[value.length - 1])
            }
          }}
          onBlur={() => add(draft)}
        />
      </div>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-accent-edge bg-accent-wash py-1 pl-2.5 pr-1 text-[12px] text-ink"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                style={{ width: 18, height: 18, minWidth: 18, minHeight: 18, flex: '0 0 auto' }}
                className="inline-flex items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-overlay hover:text-ink"
                aria-label={`Remove ${tag}`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}

      {matches.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wider text-ink-faint">
            {draft.trim() ? 'Matching' : 'You’ve used before'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {matches.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className={cn(
                  'h-8 rounded-lg border border-line bg-raised px-2.5 text-[12px] text-ink-dim',
                  'transition-colors duration-150 hover:border-accent-edge hover:text-ink',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Every tag used before, most-used first — so the common ones surface. */
export function tagVocabulary(trades: { tags?: string[] }[]): string[] {
  const counts = new Map<string, { label: string; n: number }>()
  for (const t of trades) {
    for (const raw of t.tags ?? []) {
      const key = raw.trim().toLowerCase()
      if (!key) continue
      const hit = counts.get(key)
      if (hit) hit.n += 1
      else counts.set(key, { label: raw.trim(), n: 1 })
    }
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).map((v) => v.label)
}
