/**
 * Firestore access layer. Everything that touches the database lives here so
 * the rest of the app deals in plain domain objects.
 *
 * Two rules enforced at this boundary:
 *  - `undefined` never reaches Firestore (it rejects it); optional fields are
 *    omitted instead, which keeps a `minimal` trader's docs genuinely small.
 *  - violations are computed here, on write, and never block the write.
 */

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  deleteField,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { getDb } from './firebase'
import { computeViolations } from './violations'
import { derive, outcomeOf } from './calc'
import { periodId, periodRange } from './dates'
import type {
  Journal,
  PeriodPlan,
  RiskRules,
  SessionWindow,
  Strategy,
  Trade,
  TradeDraft,
  UserDoc,
  UserPrefs,
} from './types'

export { DEFAULT_JOURNAL_ID } from './journals'
import { DEFAULT_JOURNAL_ID } from './journals'

export const DEFAULT_PREFS: UserPrefs = {
  entryDetailLevel: 'minimal',
  emailCheckInOptIn: false,
  riskRules: {},
  planCadence: 'week',
  themeLock: 'dark',
  currency: 'USD',
}

function db() {
  const d = getDb()
  if (!d) throw new Error('Firestore is not configured')
  return d
}

/**
 * Is this a plain `{}` object, as opposed to a class instance?
 *
 * This distinction is load-bearing. Firestore's `serverTimestamp()`,
 * `Timestamp`, `GeoPoint` and `FieldValue` are all class instances that must
 * reach the SDK untouched. Recursing into one turns the sentinel into
 * `{ _methodName: 'serverTimestamp' }`, which Firestore rejects — and it
 * rejects the whole write, so the trade never saves.
 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Strip undefined recursively — Firestore rejects it outright.
 *
 * Arrays are cleaned element by element, which is not optional. Firestore
 * rejects `undefined` *inside* an array exactly as it does at the top level,
 * and it fails the whole write rather than the offending field. A chart row
 * carrying `{ url, timeframe: undefined }` therefore stopped an entire trade
 * from saving — the chart went missing and so did the trade, with the calendar
 * simply never showing it.
 */
export function clean<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue
    if (isPlainObject(v)) {
      const nested = clean(v)
      if (Object.keys(nested).length > 0) out[k] = nested
      continue
    }
    if (Array.isArray(v)) {
      out[k] = cleanArray(v)
      continue
    }
    // Dates, Timestamps and FieldValue sentinels pass through whole.
    out[k] = v
  }
  return out as T
}

/**
 * Cleans array members. `undefined` entries are dropped rather than preserved
 * as holes, because Firestore cannot store a hole either.
 */
function cleanArray(arr: unknown[]): unknown[] {
  return arr
    .filter((v) => v !== undefined)
    .map((v) => {
      if (isPlainObject(v)) return clean(v)
      if (Array.isArray(v)) return cleanArray(v)
      return v
    })
}

function toMillis(v: unknown): number {
  if (v instanceof Timestamp) return v.toMillis()
  if (typeof v === 'number') return v
  return Date.now()
}

// ---------------------------------------------------------------------------
// Users

export async function loadUser(uid: string): Promise<UserDoc | null> {
  const snap = await getDoc(doc(db(), 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    uid,
    displayName: data.displayName ?? null,
    email: data.email ?? null,
    photoURL: data.photoURL ?? null,
    createdAt: toMillis(data.createdAt),
    lastActiveAt: toMillis(data.lastActiveAt),
    onboardedAt: data.onboardedAt ? toMillis(data.onboardedAt) : undefined,
    prefs: { ...DEFAULT_PREFS, ...(data.prefs ?? {}) },
    plan: data.plan === 'pro' ? 'pro' : 'free',
    activeJournalId: data.activeJournalId ?? DEFAULT_JOURNAL_ID,
    feedback: data.feedback as UserDoc['feedback'],
  }
}

export interface AuthIdentity {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

/** Create on first sign-in, refresh identity + stamp lastActiveAt after. */
export async function upsertUser(identity: AuthIdentity): Promise<UserDoc> {
  const ref = doc(db(), 'users', identity.uid)
  const existing = await getDoc(ref)
  const now = Date.now()

  if (!existing.exists()) {
    const fresh: Omit<UserDoc, 'uid'> = {
      displayName: identity.displayName,
      email: identity.email,
      photoURL: identity.photoURL,
      createdAt: now,
      lastActiveAt: now,
      prefs: DEFAULT_PREFS,
      plan: 'free',
      activeJournalId: DEFAULT_JOURNAL_ID,
    }
    await setDoc(ref, clean(fresh as unknown as Record<string, unknown>))
    await ensureDefaultJournal(identity.uid)
    return { uid: identity.uid, ...fresh }
  }

  await updateDoc(ref, {
    lastActiveAt: now,
    displayName: identity.displayName,
    email: identity.email,
    photoURL: identity.photoURL,
  })
  const loaded = await loadUser(identity.uid)
  return loaded!
}

export async function touchSession(uid: string): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { lastActiveAt: Date.now() })
}

export async function savePrefs(uid: string, prefs: Partial<UserPrefs>): Promise<void> {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(prefs)) {
    if (v === undefined) continue
    patch[`prefs.${k}`] = v
  }
  if (Object.keys(patch).length === 0) return
  await updateDoc(doc(db(), 'users', uid), patch)
}

export async function completeOnboarding(
  uid: string,
  prefs: Partial<UserPrefs>,
): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), {
    ...Object.fromEntries(
      Object.entries(prefs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [`prefs.${k}`, v]),
    ),
    onboardedAt: Date.now(),
  })
}

/**
 * Records a response, and the fact that one was given.
 *
 * The individual responses go into a subcollection rather than overwriting
 * each other, so someone who sends three ideas over a year has all three —
 * while `feedback.submittedAt` on the user doc is what silences the prompt.
 */
export async function saveFeedback(
  uid: string,
  input: {
    mood?: 'love' | 'good' | 'meh' | 'bad'
    note?: string
    kind?: 'feedback' | 'idea'
    dismissed?: boolean
  },
): Promise<void> {
  const now = Date.now()

  if (input.dismissed) {
    await updateDoc(doc(db(), 'users', uid), { 'feedback.dismissedAt': now })
    return
  }

  await setDoc(
    doc(collection(db(), 'users', uid, 'feedback')),
    clean({
      mood: input.mood,
      note: input.note,
      kind: input.kind ?? 'feedback',
      createdAt: serverTimestamp(),
    }),
  )

  // An unprompted idea should never silence the one-time prompt.
  if (input.kind !== 'idea') {
    await updateDoc(doc(db(), 'users', uid), {
      'feedback.submittedAt': now,
      ...(input.mood ? { 'feedback.mood': input.mood } : {}),
    })
  }
}

export async function setPlan(uid: string, plan: 'free' | 'pro'): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { plan })
}

// ---------------------------------------------------------------------------
// Journals (Pro: multiple; free: exactly one)

function journalsCol(uid: string) {
  return collection(db(), 'users', uid, 'journals')
}

export async function ensureDefaultJournal(uid: string): Promise<void> {
  const ref = doc(journalsCol(uid), DEFAULT_JOURNAL_ID)
  const snap = await getDoc(ref)
  if (snap.exists()) return
  await setDoc(ref, { name: 'My journal', createdAt: Date.now(), kind: 'personal' })
}

/**
 * Live journals.
 *
 * A one-shot fetch was the reason a settings change didn't show until you
 * changed tab or reloaded: nothing told the rest of the app the document had
 * moved. Subscribing means an edit propagates the moment Firestore accepts it,
 * and the optimistic layer in `useJournals` covers the round trip before that.
 */
export function subscribeJournals(
  uid: string,
  onData: (rows: Journal[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(journalsCol(uid), orderBy('createdAt', 'asc')),
    (snap) => {
      const rows = snap.docs.map((d) => toJournal(d.id, d.data()))
      onData(
        rows.length > 0
          ? rows
          : [{ id: DEFAULT_JOURNAL_ID, name: 'My journal', createdAt: Date.now() }],
      )
    },
    (e) => onError?.(e),
  )
}

export async function listJournals(uid: string): Promise<Journal[]> {
  const snap = await getDocs(query(journalsCol(uid), orderBy('createdAt', 'asc')))
  const rows = snap.docs.map((d) => toJournal(d.id, d.data()))
  // Never return an empty list: a trader always has at least one account, and
  // a missing journals collection is our bookkeeping problem, not theirs.
  return rows.length > 0
    ? rows
    : [{ id: DEFAULT_JOURNAL_ID, name: 'My journal', createdAt: Date.now() }]
}

function toJournal(id: string, data: Record<string, unknown>): Journal {
  return {
    id,
    name: (data.name as string) ?? 'Journal',
    createdAt: toMillis(data.createdAt),
    kind: data.kind as string | undefined,
    // `accountSize` was the old field name and meant the same thing. Reading
    // it as a fallback keeps accounts created before starting balances existed
    // showing the right number instead of silently reverting to blank.
    startingBalance:
      (data.startingBalance as number | undefined) ??
      (data.accountSize as number | undefined),
    startedOn: data.startedOn as string | undefined,
    riskBasis: data.riskBasis === 'current' ? 'current' : 'starting',
    currency: data.currency as string | undefined,
    riskRules: (data.riskRules as Journal['riskRules']) ?? undefined,
    archivedAt: data.archivedAt ? toMillis(data.archivedAt) : undefined,
  }
}

export async function createJournal(
  uid: string,
  input: Omit<Journal, 'id' | 'createdAt'>,
): Promise<Journal> {
  const ref = doc(journalsCol(uid))
  const journal = { ...input, createdAt: Date.now() }
  await setDoc(ref, clean(journal as unknown as Record<string, unknown>))
  return { id: ref.id, ...journal }
}

export async function updateJournal(
  uid: string,
  id: string,
  patch: Partial<Omit<Journal, 'id' | 'createdAt'>>,
): Promise<void> {
  // A cleared field must actually clear, so undefined becomes deleteField()
  // rather than being dropped — otherwise a journal could never fall back to
  // the user's default once it had its own value.
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    payload[k] = v === undefined ? deleteField() : v
  }
  if (Object.keys(payload).length === 0) return
  await updateDoc(doc(journalsCol(uid), id), payload)
}

export async function setActiveJournal(uid: string, journalId: string): Promise<void> {
  await updateDoc(doc(db(), 'users', uid), { activeJournalId: journalId })
}

export async function deleteJournal(uid: string, id: string): Promise<void> {
  if (id === DEFAULT_JOURNAL_ID) throw new Error('The default journal cannot be deleted')
  const trades = await getDocs(query(tradesCol(uid), where('journalId', '==', id)))
  // Firestore batches cap at 500 writes.
  for (let i = 0; i < trades.docs.length; i += 400) {
    const batch = writeBatch(db())
    for (const d of trades.docs.slice(i, i + 400)) batch.delete(d.ref)
    await batch.commit()
  }
  await deleteDoc(doc(journalsCol(uid), id))
}

// ---------------------------------------------------------------------------
// Trades

function tradesCol(uid: string) {
  return collection(db(), 'users', uid, 'trades')
}

function toTrade(id: string, data: Record<string, unknown>): Trade {
  const pnl = typeof data.pnl === 'number' ? data.pnl : 0
  return {
    id,
    journalId: (data.journalId as string) ?? DEFAULT_JOURNAL_ID,
    date: data.date as string,
    time: data.time as string | undefined,
    pair: (data.pair as string) ?? '',
    direction: data.direction === 'sell' ? 'sell' : 'buy',
    // Documents written before open trades existed have no status and are all
    // finished trades, so anything that isn't explicitly 'open' is closed.
    status: data.status === 'open' ? 'open' : 'closed',
    outcome: (data.outcome as Trade['outcome']) ?? outcomeOf(pnl),
    pnl,
    targetPrice: data.targetPrice as number | undefined,
    closeDate: data.closeDate as string | undefined,
    closeTime: data.closeTime as string | undefined,
    closedAt: data.closedAt ? toMillis(data.closedAt) : undefined,
    lotSize: data.lotSize as number | undefined,
    riskAmount: data.riskAmount as number | undefined,
    riskPct: data.riskPct as number | undefined,
    entryPrice: data.entryPrice as number | undefined,
    exitPrice: data.exitPrice as number | undefined,
    stopPrice: data.stopPrice as number | undefined,
    rMultiple: data.rMultiple as number | undefined,
    pipValueUsed: data.pipValueUsed as number | undefined,
    calcMode: (data.calcMode as Trade['calcMode']) ?? undefined,
    beforeChartUrl: data.beforeChartUrl as string | undefined,
    afterChartUrl: data.afterChartUrl as string | undefined,
    reason: data.reason as string | undefined,
    tags: data.tags as string[] | undefined,
    ruleViolations: (data.ruleViolations as Trade['ruleViolations']) ?? [],
    createdAt: toMillis(data.createdAt),
    updatedAt: data.updatedAt ? toMillis(data.updatedAt) : undefined,
  }
}

/**
 * Live subscription to a journal's trades. The calendar, list view, review
 * screen and Pro analytics all read from this one stream — a trade saved
 * anywhere appears everywhere, with no refetch.
 */
export function subscribeTrades(
  uid: string,
  journalId: string,
  onData: (trades: Trade[]) => void,
  onError?: (e: Error) => void,
): () => void {
  // Deliberately a single-field query. Combining `where('journalId')` with
  // `orderBy('date')` needs a composite index, and until someone clicks the
  // link in the console error the subscription throws and the journal renders
  // empty with no explanation. Filtering by journal in memory costs nothing at
  // this scale and means the app works on a freshly created database.
  const q = query(tradesCol(uid), orderBy('date', 'desc'), limit(3000))
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs
          .map((d) => toTrade(d.id, d.data()))
          .filter((t) => t.journalId === journalId),
      ),
    (e) => onError?.(e),
  )
}

export interface SaveTradeContext {
  rules: RiskRules
  accountSize?: number
  /** Strategies planned for the period this trade falls in. */
  plannedStrategyIds?: string[]
  strategyNameOf?: (id: string) => string | undefined
  /** The trader's own sessions, so the session check uses their boundaries. */
  sessionWindows?: SessionWindow[]
  /** Trades already logged that same day, for the daily-cap check. */
  sameDayTradeCount?: number
}

/**
 * Save a trade. Violations are computed here and stored — the save itself is
 * never conditional on them (§5: observe, never gate).
 */
export async function saveTrade(
  uid: string,
  journalId: string,
  draft: TradeDraft,
  ctx: SaveTradeContext,
  existingId?: string,
): Promise<string> {
  const isOpen = draft.status === 'open'

  const figures = derive({
    pair: draft.pair,
    direction: draft.direction,
    entryPrice: draft.entryPrice,
    exitPrice: draft.exitPrice,
    stopPrice: draft.stopPrice,
    lotSize: draft.lotSize,
    pnl: draft.pnl,
    riskAmount: draft.riskAmount,
    accountSize: ctx.accountSize,
  })

  // An open trade has no result yet. Zero is a placeholder, not a break-even,
  // which is exactly why the stats layer filters on status rather than on P&L.
  const pnl = isOpen ? 0 : (figures.pnl ?? draft.pnl ?? 0)
  const riskPct = draft.riskPct ?? figures.riskPct ?? undefined
  const riskAmount = draft.riskAmount ?? figures.riskAmount ?? undefined

  // Risk rules are about what you committed to when you entered, so they are
  // computed for open trades too — the size and the pair are already decided.
  const violations = computeViolations(
    {
      pair: draft.pair,
      date: draft.date,
      time: draft.time,
      strategyId: draft.strategyId,
      riskPct,
      riskAmount,
    },
    {
      rules: ctx.rules,
      accountSize: ctx.accountSize,
      sameDayTradeCount: ctx.sameDayTradeCount,
      plannedStrategyIds: ctx.plannedStrategyIds,
      strategyNameOf: ctx.strategyNameOf,
      sessionWindows: ctx.sessionWindows,
    },
  )

  /*
    Whether this trade was outside the period's plan is decided once, here, and
    stored. Recomputing it on read would let a trader edit next week's plan and
    silently rewrite whether last week's trades were on plan — which is exactly
    the kind of retroactive tidying a journal exists to prevent.
  */
  const offPlan =
    (ctx.plannedStrategyIds?.length ?? 0) > 0 &&
    Boolean(draft.strategyId) &&
    !ctx.plannedStrategyIds!.includes(draft.strategyId!)

  const payload = clean({
    ...draft,
    journalId,
    status: isOpen ? 'open' : 'closed',
    pnl,
    outcome: isOpen ? 'flat' : outcomeOf(pnl),
    riskPct,
    riskAmount,
    rMultiple: isOpen ? undefined : (draft.rMultiple ?? figures.rMultiple ?? undefined),
    offPlan: offPlan || undefined,
    // Only stamped once, when it stops being open.
    closedAt: isOpen ? undefined : (draft.closedAt ?? Date.now()),
    ruleViolations: violations,
    updatedAt: serverTimestamp(),
  } as unknown as Record<string, unknown>)

  if (existingId) {
    await updateDoc(doc(tradesCol(uid), existingId), payload)
    return existingId
  }
  const ref = doc(tradesCol(uid))
  await setDoc(ref, { ...payload, createdAt: serverTimestamp() })

  /*
    Freeze the period's rules now that it has a trade in it. Done after the
    write and deliberately not awaited into the failure path: a locking hiccup
    must never cost someone their trade, which is the thing they actually came
    here to save.
  */
  void lockPeriodRules(uid, draft.date, 'week', ctx.rules, journalId).catch((e) => {
    console.error('[repo] could not lock period rules:', e)
  })

  return ref.id
}

export async function deleteTrade(uid: string, tradeId: string): Promise<void> {
  await deleteDoc(doc(tradesCol(uid), tradeId))
}

// ---------------------------------------------------------------------------
// Period plans (§6)

function plansCol(uid: string) {
  return collection(db(), 'users', uid, 'periodPlans')
}

export async function loadPlan(uid: string, id: string): Promise<PeriodPlan | null> {
  const snap = await getDoc(doc(plansCol(uid), id))
  if (!snap.exists()) return null
  return toPlan(id, snap.data())
}

function toPlan(id: string, d: Record<string, unknown>): PeriodPlan {
  return {
    id,
    kind: d.kind === 'month' ? 'month' : 'week',
    periodStart: d.periodStart as string,
    periodEnd: d.periodEnd as string,
    strategyIds: (d.strategyIds as string[]) ?? [],
    riskRuleSnapshot: (d.riskRuleSnapshot as RiskRules) ?? {},
    lockedAt: d.lockedAt ? toMillis(d.lockedAt) : undefined,
    lockedAccounts: (d.lockedAccounts as string[]) ?? undefined,
    note: d.note as string | undefined,
    createdAt: toMillis(d.createdAt),
    updatedAt: d.updatedAt ? toMillis(d.updatedAt) : undefined,
  }
}

export async function listPlans(uid: string): Promise<PeriodPlan[]> {
  const snap = await getDocs(query(plansCol(uid), orderBy('periodStart', 'desc'), limit(120)))
  return snap.docs.map((d) => toPlan(d.id, d.data()))
}

/**
 * Declare which strategies you intend to trade this period.
 *
 * The risk rules in force are snapshotted here, so a later settings change
 * can't retroactively rewrite what you were measured against.
 */
export async function savePlan(
  uid: string,
  anchorDay: string,
  kind: 'week' | 'month',
  strategyIds: string[],
  rules: RiskRules,
  note?: string,
): Promise<string> {
  const id = periodId(anchorDay, kind)
  const { start, end } = periodRange(anchorDay, kind)
  const ref = doc(plansCol(uid), id)
  const existing = await getDoc(ref)

  await setDoc(
    ref,
    clean({
      kind,
      periodStart: start,
      periodEnd: end,
      strategyIds,
      // Snapshot the rules only on creation. Re-snapshotting on every edit
      // would let today's rules silently become the yardstick for trades
      // logged days ago.
      riskRuleSnapshot: existing.exists()
        ? ((existing.data().riskRuleSnapshot as RiskRules) ?? rules)
        : rules,
      note,
      createdAt: existing.exists() ? existing.data().createdAt : Date.now(),
      updatedAt: Date.now(),
    }),
    { merge: true },
  )
  return id
}

/**
 * Freeze the period's risk rules, called when its first trade is logged.
 *
 * Idempotent: once stamped it never moves, so logging the tenth trade of the
 * week doesn't reset the clock. Creates the plan if the trader never opened
 * the review screen — the lock has to hold either way.
 */
export async function lockPeriodRules(
  uid: string,
  anchorDay: string,
  kind: 'week' | 'month',
  rules: RiskRules,
  journalId?: string,
): Promise<void> {
  const id = periodId(anchorDay, kind)
  const { start, end } = periodRange(anchorDay, kind)
  const ref = doc(plansCol(uid), id)
  const existing = await getDoc(ref)

  if (existing.exists()) {
    const locked = (existing.data().lockedAccounts as string[] | undefined) ?? []
    if (journalId && locked.includes(journalId)) return
    await updateDoc(ref, {
      lockedAt: existing.data().lockedAt ?? Date.now(),
      lockedAccounts: journalId ? [...locked, journalId] : locked,
    })
    return
  }

  await setDoc(
    ref,
    clean({
      kind,
      periodStart: start,
      periodEnd: end,
      strategyIds: [],
      riskRuleSnapshot: rules,
      lockedAt: Date.now(),
      lockedAccounts: journalId ? [journalId] : [],
      createdAt: Date.now(),
    }),
  )
}

// ---------------------------------------------------------------------------
// Strategies — shared across every account (see lib/strategies.ts)

function strategiesCol(uid: string) {
  return collection(db(), 'users', uid, 'strategies')
}

export async function listStrategies(uid: string): Promise<Strategy[]> {
  const snap = await getDocs(query(strategiesCol(uid), orderBy('createdAt', 'asc')))
  return snap.docs.map((d) => ({
    id: d.id,
    name: (d.data().name as string) ?? 'Untitled',
    entry: d.data().entry as string | undefined,
    createdAt: toMillis(d.data().createdAt),
    archivedAt: d.data().archivedAt ? toMillis(d.data().archivedAt) : undefined,
  }))
}

export function subscribeStrategies(
  uid: string,
  onData: (rows: Strategy[]) => void,
  onError?: (e: Error) => void,
): () => void {
  return onSnapshot(
    query(strategiesCol(uid), orderBy('createdAt', 'asc')),
    (snap) =>
      onData(
        snap.docs.map((d) => ({
          id: d.id,
          name: (d.data().name as string) ?? 'Untitled',
          entry: d.data().entry as string | undefined,
          createdAt: toMillis(d.data().createdAt),
          archivedAt: d.data().archivedAt ? toMillis(d.data().archivedAt) : undefined,
        })),
      ),
    (e) => onError?.(e),
  )
}

export async function createStrategy(
  uid: string,
  input: { name: string; entry?: string },
): Promise<Strategy> {
  const ref = doc(strategiesCol(uid))
  const row = { name: input.name.trim(), entry: input.entry?.trim(), createdAt: Date.now() }
  await setDoc(ref, clean(row))
  return { id: ref.id, ...row }
}

export async function updateStrategy(
  uid: string,
  id: string,
  patch: Partial<Pick<Strategy, 'name' | 'entry'>>,
): Promise<void> {
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    payload[k] = v === undefined ? deleteField() : v
  }
  if (Object.keys(payload).length === 0) return
  await updateDoc(doc(strategiesCol(uid), id), payload)
}

/**
 * Archive rather than delete.
 *
 * Trades reference a strategy by id. Hard-deleting would orphan every trade
 * that used it and silently erase the history the review is built on, so a
 * retired strategy stops appearing in the picker and keeps its past intact.
 */
export async function archiveStrategy(uid: string, id: string): Promise<void> {
  await updateDoc(doc(strategiesCol(uid), id), { archivedAt: Date.now() })
}

export async function restoreStrategy(uid: string, id: string): Promise<void> {
  await updateDoc(doc(strategiesCol(uid), id), { archivedAt: deleteField() })
}

