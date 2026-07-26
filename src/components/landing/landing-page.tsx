import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Eye,
  Clock,
  FileDown,
  Flame,
  LayoutGrid,
  List,
  Shield,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/primitives'
import { SegmentedGroup, SegmentedItem, SegmentedShell } from '#/components/ui/toggles'
import { Wordmark } from '#/components/app/mark'
import { cn } from '#/components/ui/cn'

/**
 * Landing page (§11).
 *
 * The hero demo is the product's actual argument — the calendar/list toggle in
 * motion — so it is a real, working toggle rendering real component code, not
 * a screenshot.
 */
export function LandingPage() {
  return (
    <div className="grain min-h-dvh">
      <LandingHeader />
      <Hero />
      <DemoSection />
      <Features />
      <Pricing />
      <LandingFooter />
    </div>
  )
}

function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-base/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-5">
        <Wordmark />
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/app">Sign in</Link>
          </Button>
          <Button variant="primary" size="sm" asChild>
            <Link to="/app">
              Start free
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="mesh relative overflow-hidden px-5 pb-16 pt-16 sm:pb-24 sm:pt-24">
      <div className="mx-auto w-full max-w-3xl text-center">
        <div className="stagger flex justify-center" style={{ '--i': 0 } as React.CSSProperties}>
          <Badge tone="accent" size="md">
            <Eye aria-hidden />
            Observe. Never gate.
          </Badge>
        </div>

        {/* Staggered text reveal, line by line. */}
        <h1 className="mt-6 font-display text-[2.5rem] leading-[1.05] tracking-[-0.01em] text-ink sm:text-6xl">
          <span className="stagger block" style={{ '--i': 1 } as React.CSSProperties}>
            Log like a pro trader,
          </span>
          <span className="stagger block" style={{ '--i': 2 } as React.CSSProperties}>
            not a <span className="italic text-accent-bright">diary</span>.
          </span>
        </h1>

        <p
          className="stagger mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-ink-dim sm:text-lg"
          style={{ '--i': 3 } as React.CSSProperties}
        >
          Log it in ten seconds — pair, size, result, nothing else required. Then
          watch the pattern write itself: the setups that actually pay, the
          sessions where you're sharp, and the exact rule you keep breaking when
          it counts.
        </p>

        <div
          className="stagger mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ '--i': 4 } as React.CSSProperties}
        >
          <Button variant="primary" size="lg" asChild className="w-full sm:w-auto">
            <Link to="/app">
              Start your journal
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          <span className="text-[13px] text-ink-faint">
            Free forever. Google sign-in, no card.
          </span>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ demo */

const DEMO_DAYS = [
  { date: 'Mon 13', pnl: 420, trades: 2, wins: 2, outcome: 'win' as const },
  { date: 'Tue 14', pnl: -180, trades: 2, wins: 1, outcome: 'loss' as const },
  { date: 'Wed 15', pnl: 0, trades: 0, wins: 0, outcome: 'flat' as const },
  { date: 'Thu 16', pnl: 960, trades: 3, wins: 3, outcome: 'win' as const },
  { date: 'Fri 17', pnl: -240, trades: 1, wins: 0, outcome: 'loss' as const },
]

const DEMO_TRADES: Record<string, { pair: string; result: 'win' | 'loss' }[]> = {
  'Mon 13': [
    { pair: 'XAUUSD', result: 'win' },
    { pair: 'EURUSD', result: 'win' },
  ],
  'Tue 14': [
    { pair: 'XAUUSD', result: 'win' },
    { pair: 'EURUSD', result: 'loss' },
  ],
  'Thu 16': [
    { pair: 'US30', result: 'win' },
    { pair: 'XAUUSD', result: 'win' },
    { pair: 'GBPUSD', result: 'win' },
  ],
  'Fri 17': [{ pair: 'EURUSD', result: 'loss' }],
}

function DemoSection() {
  const [mode, setMode] = useState<'calendar' | 'list'>('calendar')
  const ref = useReveal()

  // Show the toggle doing its job, once, shortly after it scrolls into view.
  useEffect(() => {
    const t = setTimeout(() => setMode('list'), 3200)
    const t2 = setTimeout(() => setMode('calendar'), 6400)
    return () => {
      clearTimeout(t)
      clearTimeout(t2)
    }
  }, [])

  return (
    <section ref={ref} className="reveal px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-4xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-2xl text-ink sm:text-3xl">
              One set of trades. Two ways to read them.
            </h2>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-muted">
              The grid for shape, the list for detail. Same data, same tap-through — it's
              a rendering choice, not a second feature to learn.
            </p>
          </div>
          <SegmentedGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as 'calendar' | 'list')}
            aria-label="Preview view mode"
            asChild
          >
            <SegmentedShell>
              <SegmentedItem value="calendar">
                <LayoutGrid className="size-3.5" aria-hidden />
                Calendar
              </SegmentedItem>
              <SegmentedItem value="list">
                <List className="size-3.5" aria-hidden />
                List
              </SegmentedItem>
            </SegmentedShell>
          </SegmentedGroup>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-panel p-3 sm:p-5">
          {mode === 'calendar' ? <DemoCalendar /> : <DemoList />}
        </div>
      </div>
    </section>
  )
}

function DemoCalendar() {
  return (
    <div key="cal" className="animate-[fade_0.35s_var(--ease-out-quint)]">
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
          <span
            key={d}
            className="pb-1 text-center text-[10px] font-medium uppercase tracking-wider text-ink-faint"
          >
            {d}
          </span>
        ))}
        {DEMO_DAYS.map((d, i) => (
          <div
            key={d.date}
            className={cn(
              'stagger flex min-h-[4.5rem] flex-col justify-between rounded-lg border p-2',
              d.outcome === 'win' && 'border-win-edge bg-win-wash',
              d.outcome === 'loss' && 'border-loss-edge bg-loss-wash',
              d.outcome === 'flat' && 'border-transparent',
            )}
            style={{ '--i': i } as React.CSSProperties}
          >
            <span className="text-[11px] text-ink-muted tnum">{d.date.split(' ')[1]}</span>
            {d.trades > 0 ? (
              <span className="flex flex-col">
                <span
                  className={cn(
                    'text-[13px] font-medium leading-tight tnum',
                    d.outcome === 'win' ? 'text-win-bright' : 'text-loss-bright',
                  )}
                >
                  {d.pnl > 0 ? '+' : '−'}${Math.abs(d.pnl)}
                </span>
                <span className="text-[10px] text-ink-faint">{d.trades} trades</span>
              </span>
            ) : (
              <span className="mx-auto mb-1 size-1 rounded-full bg-line-strong" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoList() {
  const active = DEMO_DAYS.filter((d) => d.trades > 0)
  return (
    <div key="list" className="animate-[fade_0.35s_var(--ease-out-quint)]">
      <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
        This week
      </p>
      <div className="flex flex-col gap-1.5">
        {active.map((d, i) => (
          <div
            key={d.date}
            className={cn(
              'stagger overflow-hidden rounded-xl border bg-raised',
              d.outcome === 'win' ? 'border-win-edge' : 'border-loss-edge',
            )}
            style={{ '--i': i } as React.CSSProperties}
          >
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span
                className={cn(
                  'h-7 w-1 shrink-0 rounded-full',
                  d.outcome === 'win' ? 'bg-win' : 'bg-loss',
                )}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium text-ink">{d.date}</span>
                <span className="text-[11px] text-ink-muted">
                  {d.trades} trades, {d.wins} {d.wins === 1 ? 'win' : 'wins'},{' '}
                  {d.trades - d.wins} {d.trades - d.wins === 1 ? 'loss' : 'losses'}
                </span>
              </span>
              <span
                className={cn(
                  'ml-auto text-[13px] font-medium tnum',
                  d.outcome === 'win' ? 'text-win-bright' : 'text-loss-bright',
                )}
              >
                {d.pnl > 0 ? '+' : '−'}${Math.abs(d.pnl)}
              </span>
            </div>
            <div className="flex flex-col border-t border-line/70">
              {DEMO_TRADES[d.date]?.map((t) => (
                <span
                  key={t.pair + t.result}
                  className="flex items-center gap-2 px-3.5 py-1.5 text-[13px] last:pb-2.5"
                >
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      t.result === 'win' ? 'bg-win' : 'bg-loss',
                    )}
                  />
                  <span className="font-medium text-ink-dim">{t.pair}</span>
                  <span
                    className={cn(
                      'text-[12px]',
                      t.result === 'win' ? 'text-win' : 'text-loss',
                    )}
                  >
                    {t.result}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- features */

const FEATURES = [
  {
    icon: Zap,
    title: 'Four taps to log',
    body: "Pair, win or loss, how much. That's the required set — and it's the whole reason you'll still be doing this in three months.",
  },
  {
    icon: Shield,
    title: 'Rules that watch, not nag',
    body: 'Set a max risk or a list of pairs. Break one and the trade still saves, silently noted. You hear about it on Sunday, not mid-trade.',
  },
  {
    icon: CalendarDays,
    title: 'A month at a glance',
    body: 'Green days, red days, and the shape of the week beside them. Tap any day for the equity curve, the trades and your own notes.',
  },
  {
    icon: BarChart3,
    title: 'Real trader maths',
    body: 'R-multiples, expectancy, profit factor and max drawdown — computed from the same lightweight entries, not a second data-entry job.',
  },
  {
    icon: Clock,
    title: 'Sessions, derived',
    body: 'Add a clock time and your Asia/London/New York performance appears on its own. No extra fields, no tagging.',
  },
  {
    icon: Flame,
    title: 'Streaks that reward showing up',
    body: 'Consecutive days logged — never consecutive wins. Gamifying wins would gamify risk-taking, which is the opposite of the point.',
  },
]

function Features() {
  const ref = useReveal()
  return (
    <section ref={ref} className="reveal px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="max-w-xl font-display text-2xl text-ink sm:text-3xl">
          Built around one rule: nothing is mandatory except the outcome.
        </h2>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <div
              key={title}
              className={cn(
                'stagger flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-5',
                'transition-[border-color,transform] duration-300 ease-[var(--ease-out-quint)]',
                'hover:-translate-y-0.5 hover:border-line-strong',
              )}
              style={{ '--i': i } as React.CSSProperties}
            >
              <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-raised text-accent-bright">
                <Icon className="size-4" aria-hidden />
              </span>
              <h3 className="text-[15px] font-medium text-ink">{title}</h3>
              <p className="text-[13px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- pricing */

const INCLUDED = [
  'Unlimited trades, unlimited accounts',
  'Calendar and list views, one tap apart',
  'Day detail with equity curve and your own notes',
  'Live risk calculator — it sizes the trade for you',
  'Log a setup now, mark it win or loss later',
  'Risk rules that watch without ever blocking a save',
  'Weekly and monthly review, with your entry-model note',
  'Discipline score and trend',
  'Revenge-trade, overtrading and tilt detection',
  'R-multiple, expectancy, profit factor and drawdown',
  'Session and weekday heatmap',
  'Per-setup win rates from lightweight tags',
  'Separate journals for prop, personal and backtest',
  'Hold-time tracking',
  'Before/after chart viewer',
  'CSV export — your data leaves whenever you want',
  'Journaling streaks that reward showing up, not winning',
]

function Pricing() {
  const ref = useReveal()
  return (
    <section ref={ref} className="reveal px-5 py-12 sm:py-20">
      <div className="mx-auto w-full max-w-3xl">
        <div className="text-center">
          <h2 className="font-display text-2xl text-ink sm:text-3xl">
            All of it. For nothing.
          </h2>
          <p className="mx-auto mt-2.5 max-w-lg text-sm leading-relaxed text-ink-muted">
            Charging for the habit would just recreate the problem this exists to
            solve. There is no paid tier, no trial timer and no feature held back
            to upsell you later.
          </p>
        </div>

        <div
          className="stagger mt-8 rounded-2xl border border-accent-edge bg-panel p-6 sm:p-8"
          style={{ '--i': 0 } as React.CSSProperties}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <span className="flex items-baseline gap-2">
              <span className="font-display text-5xl leading-none text-ink">$0</span>
              <span className="text-[13px] text-ink-muted">forever</span>
            </span>
            <Badge tone="accent" size="md">
              <Sparkles aria-hidden />
              Everything included
            </Badge>
          </div>

          <ul className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {INCLUDED.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[13px] text-ink-dim">
                <Check className="mt-0.5 size-3.5 shrink-0 text-win" aria-hidden />
                {f}
              </li>
            ))}
          </ul>

          <Button variant="primary" size="lg" asChild className="mt-7 w-full sm:w-auto">
            <Link to="/app">
              Start your journal
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[12px] text-ink-faint">
          <FileDown className="size-3.5" aria-hidden />
          Export to CSV whenever you want. No lock-in, no hostage-taking.
        </p>
      </div>
    </section>
  )
}

function LandingFooter() {
  return (
    <footer className="border-t border-line px-5 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Wordmark />
        <p className="text-center text-[12px] leading-relaxed text-ink-faint sm:text-right">
          A journal, not a coach. It shows you what happened and lets you decide what it
          means.
        </p>
      </div>
    </footer>
  )
}

/* ---------------------------------------------------------------- reveal */

/**
 * Scroll-triggered reveal (§11). Uses IntersectionObserver rather than a
 * scroll listener so it costs nothing on the main thread, and degrades to
 * "always visible" when the API or JS is unavailable — content must never be
 * hidden behind an animation that didn't run.
 */
function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.revealed = 'true'
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.revealed = 'true'
            io.disconnect()
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return ref
}
