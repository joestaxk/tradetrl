import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, SlidersHorizontal } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/overlays'
import { Badge } from '#/components/ui/primitives'
import {
  CLASS_LABEL,
  findInstrument,
  groupInstruments,
  normalizeSymbol,
  type Instrument,
} from '#/lib/instruments'
import { cn } from '#/components/ui/cn'

/**
 * Searchable pair picker (§3).
 *
 * Hand-rolled on Radix Popover rather than pulling in cmdk: the list is 37
 * static items, so filtering is trivial, and this way the keyboard model and
 * every pixel of the styling belong to the design system rather than to a
 * library's defaults (§8).
 *
 * The last row is always "Other / custom pair", so a trader on an instrument
 * we haven't curated is never stuck — they land in manual mode instead (§4).
 */

const CUSTOM = '__custom__'

interface Props {
  value: string
  onChange: (symbol: string) => void
  /** Called when the trader deliberately picks the custom escape hatch. */
  onCustom: () => void
  id?: string
  recent?: string[]
}

export function PairCombobox({ value, onChange, onCustom, id, recent = [] }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(() => groupInstruments(query), [query])

  /** Flattened for keyboard navigation; the custom row is always last. */
  const flat = useMemo<(Instrument | typeof CUSTOM)[]>(
    () => [...groups.flatMap((g) => g.items), CUSTOM],
    [groups],
  )

  const selected = findInstrument(value)
  const isCustomValue = value.trim() !== '' && selected === null

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      // Focus lands in the search box, not the trigger — the point of opening
      // this is to type.
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  useEffect(() => {
    setActive(0)
  }, [query])

  // Keep the highlighted row in view during arrow-key navigation.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (item: Instrument | typeof CUSTOM) => {
    if (item === CUSTOM) {
      onCustom()
    } else {
      onChange(item.symbol)
    }
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, flat.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[active]
      if (item) choose(item)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  let index = -1

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'group flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-[10px] px-3',
            'bg-raised border border-line text-left text-sm',
            'transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]',
            'hover:border-line-strong',
            'focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-wash)]',
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {value ? (
              <>
                <span className="truncate font-medium text-ink">
                  {selected?.symbol ?? normalizeSymbol(value)}
                </span>
                {selected ? (
                  <span className="hidden truncate text-xs text-ink-muted sm:inline">
                    {selected.name}
                  </span>
                ) : (
                  <Badge tone="accent" className="shrink-0">
                    custom
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-ink-faint">Pick a pair</span>
            )}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-ink-muted transition-transform duration-200 group-data-[state=open]:rotate-180"
            aria-hidden
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] min-w-[15rem] p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pairs…"
            aria-label="Search pairs"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 w-full min-w-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-faint sm:text-sm"
          />
        </div>

        <div ref={listRef} className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
          {groups.map((group) => (
            <div key={group.class}>
              <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                {CLASS_LABEL[group.class]}
              </p>
              {group.items.map((item) => {
                index += 1
                const i = index
                return (
                  <Row
                    key={item.symbol}
                    active={active === i}
                    selected={selected?.symbol === item.symbol}
                    onSelect={() => choose(item)}
                    onHover={() => setActive(i)}
                  >
                    <span className="truncate font-medium text-ink">{item.symbol}</span>
                    <span className="truncate text-xs text-ink-muted">{item.name}</span>
                    {recent.includes(item.symbol) && (
                      <Badge tone="neutral" className="ml-auto shrink-0">
                        recent
                      </Badge>
                    )}
                  </Row>
                )
              })}
            </div>
          ))}

          {groups.length === 0 && (
            <p className="px-2.5 py-3 text-[13px] leading-relaxed text-ink-muted">
              Nothing matches “{query}”. You can still log it as a custom pair.
            </p>
          )}

          {/* Always last, always visible — the escape hatch from §3/§4. */}
          <div className="mt-1 border-t border-line pt-1">
            <Row
              active={active === flat.length - 1}
              selected={isCustomValue}
              onSelect={() => choose(CUSTOM)}
              onHover={() => setActive(flat.length - 1)}
            >
              <SlidersHorizontal className="size-3.5 shrink-0 text-ink-muted" aria-hidden />
              <span className="truncate font-medium text-ink">Other / custom pair</span>
              <span className="hidden truncate text-xs text-ink-muted sm:inline">
                you set the value
              </span>
            </Row>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function Row({
  active,
  selected,
  onSelect,
  onHover,
  children,
}: {
  active: boolean
  selected: boolean
  onSelect: () => void
  onHover: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      data-active={active}
      onClick={onSelect}
      onMouseMove={onHover}
      className={cn(
        // 44px tall: this list is scrolled with a thumb as often as a mouse.
        'flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px]',
        'transition-colors duration-100',
        active ? 'bg-raised' : 'bg-transparent',
      )}
    >
      {children}
      {selected && <Check className="ml-auto size-4 shrink-0 text-accent" aria-hidden />}
    </button>
  )
}
