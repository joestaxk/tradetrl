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
export type ViolationCode = 'risk-exceeded' | 'pair-not-allowed' | 'over-trade-cap'

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
}

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
  /** Theme is locked dark by design; stored so Settings can say so honestly. */
  themeLock: 'dark'
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
}

export interface Journal {
  id: string
  name: string
  createdAt: number
  /** e.g. 'prop' | 'personal' | 'backtest' — free text, shown as a chip. */
  kind?: string
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
  beforeChartUrl?: string
  afterChartUrl?: string

  // --- always optional ---
  reason?: string
  tags?: string[]

  /** Computed at write time (§5). Never blocks the save. */
  ruleViolations?: Violation[]
  createdAt: number
  updatedAt?: number
}

/** Draft shape used by the entry form before an id/timestamps exist. */
export type TradeDraft = Omit<Trade, 'id' | 'createdAt' | 'ruleViolations' | 'journalId'>

export interface PeriodPlan {
  /** 'W-2026-30' or 'M-2026-07' */
  id: string
  kind: PeriodKind
  periodStart: string
  periodEnd: string
  /** The trader's own words. No taxonomy, no dropdown. */
  entryModelNote: string
  riskRuleSnapshot: RiskRules
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
