/**
 * Curated instrument reference data.
 *
 * Static config, deliberately *not* a Firestore collection: it is reference
 * data, not user data, and shipping it in the bundle means the calculator
 * works instantly and offline.
 *
 * The list is hand-picked rather than exhaustive. Everything outside it routes
 * to manual mode, which is an honest "tell us the value per lot" rather than a
 * guess dressed up as precision.
 */

export type InstrumentClass = 'forex' | 'metal' | 'crypto'

export type Currency =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'JPY'
  | 'CHF'
  | 'CAD'
  | 'AUD'
  | 'NZD'

export interface Instrument {
  symbol: string
  name: string
  class: InstrumentClass
  /** Smallest quoted increment used for pip/point value. */
  pipSize: number
  /** Units per 1.00 standard lot. */
  contractSize: number
  /**
   * The currency the instrument is priced *in*. Holding this lets us derive
   * the conversion rate from the price itself — see `computeRisk`.
   */
  baseCurrency: Currency
  /** The currency a 1-pip move is denominated in, before conversion. */
  quoteCurrency: Currency
  /** Display precision for prices. */
  precision: number
  /**
   * True where broker specs genuinely vary and our default is a convention
   * rather than a standard. Drives a one-line disclaimer in the UI.
   */
  contractSizeVaries?: boolean
}

/** Lot presets. Forex only — metals and crypto are quoted per lot/unit. */
export const LOT_PRESETS = [
  { label: 'Standard', value: 1 },
  { label: 'Mini', value: 0.1 },
  { label: 'Micro', value: 0.01 },
] as const

const MAJORS: Currency[] = ['EUR', 'GBP', 'AUD', 'NZD', 'USD', 'CAD', 'CHF', 'JPY']

const CURRENCY_NAME: Record<Currency, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  JPY: 'Japanese Yen',
  CHF: 'Swiss Franc',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  NZD: 'New Zealand Dollar',
}

/**
 * The 28 crosses between the 8 majors, in conventional base/quote order.
 * MAJORS is listed in market precedence, so the earlier currency is the base —
 * which is why this generates EURUSD and USDJPY rather than USDEUR and JPYUSD.
 */
function buildForex(): Instrument[] {
  const out: Instrument[] = []
  for (let i = 0; i < MAJORS.length; i++) {
    for (let j = i + 1; j < MAJORS.length; j++) {
      const base = MAJORS[i]
      const quote = MAJORS[j]
      const jpy = quote === 'JPY'
      out.push({
        symbol: `${base}${quote}`,
        name: `${CURRENCY_NAME[base]} / ${CURRENCY_NAME[quote]}`,
        class: 'forex',
        // JPY pairs are quoted to 2/3 decimals, so a pip is 0.01, not 0.0001.
        pipSize: jpy ? 0.01 : 0.0001,
        contractSize: 100_000,
        baseCurrency: base,
        quoteCurrency: quote,
        precision: jpy ? 3 : 5,
      })
    }
  }
  return out
}

const METALS: Instrument[] = [
  {
    symbol: 'XAUUSD',
    name: 'Gold',
    class: 'metal',
    pipSize: 0.01,
    // 100 oz per standard lot: a $1 move is $100 per lot.
    contractSize: 100,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    precision: 2,
    contractSizeVaries: true,
  },
  {
    symbol: 'XAGUSD',
    name: 'Silver',
    class: 'metal',
    pipSize: 0.001,
    // 5,000 oz per standard lot: a $1 move is $5,000 per lot.
    contractSize: 5_000,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    precision: 3,
    contractSizeVaries: true,
  },
  {
    symbol: 'XPTUSD',
    name: 'Platinum',
    class: 'metal',
    pipSize: 0.01,
    contractSize: 100,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    precision: 2,
    contractSizeVaries: true,
  },
  {
    symbol: 'XPDUSD',
    name: 'Palladium',
    class: 'metal',
    pipSize: 0.01,
    contractSize: 100,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
    precision: 2,
    contractSizeVaries: true,
  },
]

/**
 * Crypto CFD specs vary more than any other class, so 1 lot = 1 coin is a
 * starting point, not a promise. Every one is flagged as variable.
 */
const CRYPTO: Instrument[] = (
  [
    ['BTCUSD', 'Bitcoin', 0.01, 2],
    ['ETHUSD', 'Ethereum', 0.01, 2],
    ['SOLUSD', 'Solana', 0.01, 2],
    ['XRPUSD', 'Ripple', 0.0001, 4],
    ['LTCUSD', 'Litecoin', 0.01, 2],
  ] as const
).map(([symbol, name, pipSize, precision]) => ({
  symbol,
  name,
  class: 'crypto' as const,
  pipSize,
  contractSize: 1,
  baseCurrency: 'USD' as Currency,
  quoteCurrency: 'USD' as Currency,
  precision,
  contractSizeVaries: true,
}))

export const INSTRUMENTS: Instrument[] = [...buildForex(), ...METALS, ...CRYPTO]

const BY_SYMBOL = new Map(INSTRUMENTS.map((i) => [i.symbol, i]))

/** Normalise 'eur/usd', ' eur-usd ' → 'EURUSD'. */
export function normalizeSymbol(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

/** Curated lookup. Returns null for anything outside the list — manual mode. */
export function findInstrument(input: string): Instrument | null {
  return BY_SYMBOL.get(normalizeSymbol(input)) ?? null
}

export function isCurated(input: string): boolean {
  return findInstrument(input) !== null
}

export const CLASS_LABEL: Record<InstrumentClass, string> = {
  forex: 'Forex',
  metal: 'Metals',
  crypto: 'Crypto',
}

export const CLASS_ORDER: InstrumentClass[] = ['forex', 'metal', 'crypto']

/** Grouped for the combobox, filtered by a free-text query. */
export function groupInstruments(query = ''): {
  class: InstrumentClass
  items: Instrument[]
}[] {
  const q = query.trim().toUpperCase().replace(/[^A-Z0-9 ]/g, '')
  const match = (i: Instrument) =>
    q === '' ||
    i.symbol.includes(q) ||
    i.name.toUpperCase().includes(q) ||
    // 'eur usd' and 'usd eur' both find EURUSD.
    q.split(' ').filter(Boolean).every((part) => i.symbol.includes(part))

  return CLASS_ORDER.map((cls) => ({
    class: cls,
    items: INSTRUMENTS.filter((i) => i.class === cls && match(i)),
  })).filter((g) => g.items.length > 0)
}
