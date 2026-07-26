/**
 * Domain types. Mirrors the Firestore schema 1:1 so the same shapes flow from
 * the client SDK, the Admin SDK (cron/email), and the pure analytics layer.
 *
 * Optionality here is the product philosophy encoded in the type system:
 * only `date`, `pair`, `direction`, `outcome` and `pnl` are non-optional.
 * Everything else is a nicety the trader may never fill in — and must never
 * be required to.
 */

export type EntryDetailLevel = 'minimal' | 'detailed'
export type Direction = 'buy' | 'sell'
export type Outcome = 'win' | 'loss' | 'flat'
export type PeriodKind = 'week' | 'month'

/**
 * A trade is logged in one of two states.
 *
 * `open` is for the moment you set a limit and walk away: pair, direction, the
 * levels if you have them, and nothing else. It has no outcome and no P&L, so
 * it is excluded from every statistic until it is resolved. `closed` is a
 * finished trade with a result.
 *
 * Absent on older documents, which is why every read defaults it to 'closed'.
 */
export type TradeStatus = 'open' | 'closed'

/** Codes for computed rule breaks. Never user-entered. */
export type ViolationCode =
  | 'risk-exceeded'
  | 'pair-not-allowed'
  | 'over-trade-cap'
  | 'weekend-trade'
  | 'session-not-allowed'
  | 'outside-trading-hours'
  | 'off-plan-strategy'

/** Directional bias, recorded per timeframe. */
export type Bias = 'bullish' | 'bearish' | 'neutral'

/**
 * A chart timeframe.
 *
 * A fixed list rather than free text, so per-timeframe statistics don't
 * fragment across "H4", "4h" and "4 hour". It covers the full ladder people
 * actually use, from yearly down to the one-minute.
 *
 * The codes disambiguate the one genuine collision in trading notation: "3M"
 * means three months to a swing trader and three minutes to a scalper. Months
 * are `M3`, minutes are `m3`, and the labels spell it out either way.
 */
export type Timeframe = string

export interface TimeframeOption {
  value: Timeframe
  /** Full name, shown in the picker. */
  label: string
  /** Compact form, shown on a chip or in a dense row. */
  short: string
  group: 'Long term' | 'Hourly' | 'Intraday'
}

export const TIMEFRAME_OPTIONS: TimeframeOption[] = [
  { value: 'Y1', label: 'Yearly', short: '1Y', group: 'Long term' },
  { value: 'M6', label: '6 Month', short: '6M', group: 'Long term' },
  { value: 'M3', label: 'Quarterly — 3 Month', short: '3M', group: 'Long term' },
  { value: 'M1', label: 'Monthly', short: '1M', group: 'Long term' },
  { value: 'W1', label: 'Weekly', short: '1W', group: 'Long term' },
  { value: 'D1', label: 'Daily', short: '1D', group: 'Long term' },

  { value: 'H12', label: '12 Hour', short: '12H', group: 'Hourly' },
  { value: 'H8', label: '8 Hour', short: '8H', group: 'Hourly' },
  { value: 'H6', label: '6 Hour', short: '6H', group: 'Hourly' },
  { value: 'H4', label: '4 Hour', short: '4H', group: 'Hourly' },
  { value: 'H3', label: '3 Hour', short: '3H', group: 'Hourly' },
  { value: 'H2', label: '2 Hour', short: '2H', group: 'Hourly' },
  { value: 'H1', label: '1 Hour', short: '1H', group: 'Hourly' },

  { value: 'm45', label: '45 Minute', short: '45m', group: 'Intraday' },
  { value: 'm30', label: '30 Minute', short: '30m', group: 'Intraday' },
  { value: 'm15', label: '15 Minute', short: '15m', group: 'Intraday' },
  { value: 'm10', label: '10 Minute', short: '10m', group: 'Intraday' },
  { value: 'm5', label: '5 Minute', short: '5m', group: 'Intraday' },
  { value: 'm3', label: '3 Minute', short: '3m', group: 'Intraday' },
  { value: 'm1', label: '1 Minute', short: '1m', group: 'Intraday' },
]

export const TIMEFRAME_GROUPS: TimeframeOption['group'][] = [
  'Long term',
  'Hourly',
  'Intraday',
]

/** Offered as one-tap chips — the ones most top-down analysis uses. */
export const COMMON_TIMEFRAMES: Timeframe[] = ['W1', 'D1', 'H4', 'H1', 'm15', 'm5']

export function timeframeOption(value: string | undefined): TimeframeOption | undefined {
  if (!value) return undefined
  return TIMEFRAME_OPTIONS.find((t) => t.value === value)
}

/** Compact label, falling back to the stored value for anything unrecognised. */
export function timeframeShort(value: string | undefined): string {
  return timeframeOption(value)?.short ?? value ?? ''
}

export function timeframeLabel(value: string | undefined): string {
  return timeframeOption(value)?.label ?? value ?? ''
}

/** Bias is recorded per timeframe, on whichever ones the trader uses. */
export type BiasTimeframe = Timeframe

/**
 * A marked-up chart.
 *
 * Deliberately a list rather than the old before/after pair: real analysis
 * produces three or four screenshots — the daily for context, the H4 for the
 * level, the M15 for the entry — and forcing that into two slots meant
 * throwing most of it away.
 */
export interface ChartRef {
  url: string
  /** Which timeframe this screenshot is of. */
  timeframe?: Timeframe
  /** 'before' / 'after', or anything the trader types. */
  label?: string
  /** What they read on this timeframe at the time. */
  bias?: Bias
}

export interface Violation {
  code: ViolationCode
  /** Plain-language, non-shaming. Rendered verbatim in the review screen. */
  message: string
}

export interface RiskRules {
  maxRiskPerTradePct?: number
  allowedPairs?: string[]
  /** Optional self-imposed cap on trades per day. */
  maxTradesPerDay?: number
  /**
   * "I don't trade weekends." Crypto runs 24/7 and some brokers quote
   * Sunday-evening FX, so this is opt-in rather than assumed.
   */
  noWeekendTrading?: boolean
  /**
   * Ids of the trader's own `SessionWindow`s that they actually trade.
   *
   * Declaring "I trade New York" and then logging an Asian session trade is a
   * real deviation, and the review should say so — the same way it does for a
   * pair outside your list. Empty or absent means no limit.
   *
   * Macros inside a session are deliberately *not* part of this: taking an
   * entry ten minutes outside your usual killzone is context for the review,
   * not a rule you broke.
   */
  allowedSessionIds?: string[]
  /**
   * A window in the trader's own wall-clock, 'HH:mm'. "I trade 08:00 to 17:00."
   * Wraps past midnight quite happily, which an Asia-session trader needs.
   */
  tradingWindow?: { start: string; end: string }
}

/**
 * Which balance a risk percentage is measured against.
 *
 * `starting` is prop-firm behaviour: 1% means 1% of the deposit, fixed, so the
 * limit never drifts as the account moves. `current` compounds with the
 * running balance, which is what most discretionary traders mean. Neither is
 * more correct, so it is a per-account choice rather than a global one.
 */
export type RiskBasis = 'starting' | 'current'

/**
 * 12- or 24-hour clock.
 *
 * Display only. Every stored time stays 24h 'HH:mm', which is what makes
 * comparisons, sorting and session boundaries work — a preference that
 * changed the data would be a preference that corrupted it.
 */
export type TimeFormat = '12h' | '24h'

/**
 * A named block of the trading day, defined by the trader.
 *
 * The app used to hardcode Asia / London / New York on fixed hours, which is
 * wrong for almost everyone: sessions shift with daylight saving, brokers
 * disagree about boundaries, and a trader's "London" often means the first
 * ninety minutes of it rather than the whole eight hours.
 *
 * Crucially this is *not* a rule. Trading outside your own windows produces no
 * violation and no warning — it just shows up in the review, where knowing
 * that your 3am trades lose money is useful rather than scolding.
 */
export interface SessionWindow {
  id: string
  name: string
  /** 'HH:mm' in the trader's own clock. */
  start: string
  end: string
  /**
   * Sharper windows inside the session — the macros and killzones people
   * actually take entries in. Reported separately, because "London" and
   * "the 09:50 macro" are different questions.
   */
  macros?: { id: string; name: string; start: string; end: string }[]
}

/**
 * Sensible starting points, all editable. Times are the common retail
 * conventions in UTC; anyone trading a different clock moves them once.
 */
export const DEFAULT_SESSION_WINDOWS: SessionWindow[] = [
  { id: 'asia', name: 'Asia', start: '00:00', end: '07:00' },
  {
    id: 'london',
    name: 'London',
    start: '07:00',
    end: '12:00',
    macros: [{ id: 'london-open', name: 'London open', start: '07:00', end: '09:00' }],
  },
  {
    id: 'newyork',
    name: 'New York',
    start: '12:00',
    end: '21:00',
    macros: [
      { id: 'ny-am', name: 'NY AM', start: '13:30', end: '16:00' },
      { id: 'ny-macro', name: 'NY macro', start: '14:50', end: '15:10' },
    ],
  },
]

export interface UserPrefs {
  entryDetailLevel: EntryDetailLevel
  emailCheckInOptIn: boolean
  riskRules: RiskRules
  /** 'week' | 'month' — cadence of the entry-model note (§6). */
  planCadence: PeriodKind
  /** Account size, used to derive risk % from risk amount when not given. */
  accountSize?: number
  currency?: string
  /** IANA zone; drives day bucketing and the session heatmap. */
  timezone?: string
  /**
   * How clock times are *displayed*. Storage is always 24h 'HH:mm' — this is
   * presentation only, so switching it never rewrites a single trade.
   */
  timeFormat?: TimeFormat
  /**
   * The trader's own sessions. Absent means they haven't customised them and
   * `DEFAULT_SESSION_WINDOWS` applies.
   */
  sessionWindows?: SessionWindow[]
  /** Theme is locked dark by design; stored so Settings can say so honestly. */
  themeLock: 'dark'
}

export interface FeedbackState {
  /** Set once they answer. We never ask again after this. */
  submittedAt?: number
  /** Set when they close the card without answering. */
  dismissedAt?: number
  mood?: 'love' | 'good' | 'meh' | 'bad'
}

export interface UserDoc {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
  createdAt: number
  lastActiveAt: number
  onboardedAt?: number
  prefs: UserPrefs
  /** Pro entitlement. Free tier stays fully functional for real journaling. */
  plan: 'free' | 'pro'
  /** Multiple journals (Pro). Free users have exactly one, id 'default'. */
  activeJournalId: string
  feedback?: FeedbackState
}

/**
 * A journal is a trading account.
 *
 * Risk is meaningless without knowing which balance it is a percentage of, so
 * account size, currency and rules live here rather than on the user — a 1%
 * rule on a 50k prop account and on a 100k personal account are different
 * amounts of money, and conflating them would make every risk figure wrong.
 *
 * Anything left unset falls back to the user's defaults; see `resolveJournal`.
 */
export interface Journal {
  id: string
  name: string
  createdAt: number
  /** e.g. 'prop' | 'personal' | 'backtest' — free text, shown as a chip. */
  kind?: string
  /**
   * What the account held on day one. Required for new accounts: without it
   * "1% risk" is not a number, and the running balance has nothing to count
   * from. Optional in the type only so accounts created before this existed
   * still read back.
   */
  startingBalance?: number
  /** The day the balance above was true, so P&L is counted from the right point. */
  startedOn?: string
  riskBasis?: RiskBasis
  currency?: string
  riskRules?: RiskRules
  archivedAt?: number
}

/** A journal with every setting resolved against the user's defaults. */
export interface ResolvedJournal {
  id: string
  name: string
  kind?: string
  startingBalance?: number
  startedOn?: string
  riskBasis: RiskBasis
  currency: string
  riskRules: RiskRules
}

/** A journal's balance, resolved against its trades. */
export interface AccountStanding {
  startingBalance: number | null
  /** starting + every closed trade's P&L. */
  currentBalance: number | null
  /** Total P&L since the account opened. */
  netPnl: number
  /** Growth on the starting balance, as a percentage. */
  returnPct: number | null
  /** What a risk percentage is measured against, per `riskBasis`. */
  riskBase: number | null
  /** Lowest the balance ever went, and how far below its peak. */
  peakBalance: number | null
  maxDrawdown: number
  maxDrawdownPct: number | null
  closedTrades: number
}

export interface Trade {
  id: string
  journalId: string
  /** ISO local date 'YYYY-MM-DD'. The day bucket — never a timestamp. */
  date: string
  /** Optional local clock time 'HH:mm', drives the session heatmap. */
  time?: string
  pair: string
  direction: Direction
  status: TradeStatus
  /** Meaningless while `status` is 'open' — resolved trades only. */
  outcome: Outcome
  /** The one number that is always required *once closed*. Signed. */
  pnl: number
  /**
   * When the trade actually closed, in the trader's own wall-clock — not when
   * they got round to pressing the button. Prefilled with "now" at resolution
   * and editable, because someone journalling on Sunday about Thursday's trade
   * would otherwise record a three-day hold.
   */
  closeDate?: string
  closeTime?: string
  /** Server-side audit of when it was marked resolved. Never shown as duration. */
  closedAt?: number

  // --- detailed level ---
  lotSize?: number
  riskAmount?: number
  riskPct?: number
  entryPrice?: number
  exitPrice?: number
  stopPrice?: number
  /** Where you're aiming. Only meaningful on an open trade. */
  targetPrice?: number
  /** Computed R-multiple when the inputs allow it. */
  rMultiple?: number

  /**
   * Risk-calculator snapshot. Stored, never recomputed on read.
   *
   * If the gold contract-size default is corrected next month, a trade logged
   * today must still show the risk figure the trader actually saw — silently
   * restating history is the fastest way to lose their trust in the numbers.
   */
  pipValueUsed?: number
  calcMode?: 'curated' | 'manual'
  /**
   * Every screenshot attached to the trade, in the order the trader added
   * them. Replaces the old two-URL pair; those still read back via
   * `chartsOf()` so nothing logged before this is lost.
   */
  charts?: ChartRef[]
  /** @deprecated Superseded by `charts`. Still read for older trades. */
  beforeChartUrl?: string
  /** @deprecated Superseded by `charts`. Still read for older trades. */
  afterChartUrl?: string

  /** Which named setup this was. */
  strategyId?: string
  /**
   * True when `strategyId` wasn't among the period plan's strategies at the
   * time of writing. Computed once, at write, and stored — recomputing later
   * against an edited plan would quietly rewrite history.
   */
  offPlan?: boolean

  /**
   * Directional bias per timeframe, recorded at entry. Lets the review ask a
   * question no single trade can: do you actually win when you trade with
   * your own higher-timeframe read, or against it?
   */
  bias?: Partial<Record<BiasTimeframe, Bias>>

  // --- always optional ---
  reason?: string
  /**
   * What happened, from a fixed vocabulary — 'bias-wrong', 'moved-stop'.
   *
   * Separate from `tags`, which name the setup. These name the post-mortem,
   * and being a fixed list is the whole point: six trades tagged 'moved-stop'
   * can be added up, six sentences saying roughly that cannot.
   */
  reasonTags?: string[]
  tags?: string[]

  /** Computed at write time (§5). Never blocks the save. */
  ruleViolations?: Violation[]
  createdAt: number
  updatedAt?: number
}

/** Draft shape used by the entry form before an id/timestamps exist. */
export type TradeDraft = Omit<Trade, 'id' | 'createdAt' | 'ruleViolations' | 'journalId'>

/**
 * A named setup, in the trader's own words.
 *
 * Shared across accounts on purpose: "London sweep" is the same idea whether
 * you take it on a prop account or a personal one, and keeping one definition
 * is what lets the review answer "does this setup actually work for me" across
 * everything rather than per-silo.
 *
 * Deliberately thin. A strategy is a name and how you enter — not a taxonomy,
 * not a checklist, not a form. The moment it needs scrolling nobody maintains
 * it.
 */
export interface Strategy {
  id: string
  name: string
  /** How you get in, in a sentence or three. Optional. */
  entry?: string
  createdAt: number
  archivedAt?: number
}

/**
 * What the trader said they'd trade this period, and the rules in force.
 *
 * `strategyIds` is an intention, never a restriction. Logging a setup that
 * isn't on the list always succeeds — it is simply marked off-plan, and the
 * review reports it whether it won or lost. A profitable deviation is exactly
 * as worth knowing about as a losing one.
 */
export interface PeriodPlan {
  /** 'W-2026-30' or 'M-2026-07' */
  id: string
  kind: PeriodKind
  periodStart: string
  periodEnd: string
  /** Strategies the trader intends to use this period. */
  strategyIds: string[]
  riskRuleSnapshot: RiskRules
  /**
   * Set when the first trade of the period is logged. From that moment the
   * risk rules are frozen until the next period begins — you cannot rewrite
   * the rule you just broke. Strategies stay editable, because a real setup
   * taken mid-week needs somewhere honest to go.
   */
  lockedAt?: number
  /**
   * Accounts that have logged a trade into this period.
   *
   * Per-account, because accounts have their own rules — trading your prop
   * account on Monday has no business freezing the rules on your personal one.
   */
  lockedAccounts?: string[]
  /** Optional free-text note. Survives from the old entry-model field. */
  note?: string
  createdAt: number
  updatedAt?: number
}

export interface PeriodReview {
  id: string
  periodStart: string
  periodEnd: string
  adherenceScore: number
  violatingTrades: string[]
  summary: string
  computedAt: number
}
