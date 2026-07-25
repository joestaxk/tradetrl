# tradetrl

A trading journal that stays out of your way. Nothing is mandatory except the
trade outcome; everything else — size, risk, screenshots, why you took it — is
optional, forever. Rules are observed and reported in the weekly review, never
enforced mid-trade.

TanStack Start · Firebase (Auth + Firestore) · Tailwind v4 · Radix · Vercel.

---

## Getting started

```bash
npm install
cp .env.example .env    # fill in the six VITE_FIREBASE_* values
npm run dev             # http://localhost:3000
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` | Production build |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |
| `npm run typecheck` | `tsc --noEmit` |

### Firebase setup

The app needs two services switched on, and neither is enabled by default on a
new project:

1. **Authentication** — console → Authentication → *Get started* → Sign-in
   method → enable **Google** and set a support email. Without this, sign-in
   fails with `auth/configuration-not-found`.
2. **Firestore** — console → Firestore Database → *Create database*, pick a
   region, start in production mode. Then paste [`firestore.rules`](firestore.rules)
   into the Rules tab and publish.

Add your deployed domain under **Authentication → Settings → Authorized
domains** when you ship.

---

## Architecture

```
src/
  lib/            pure domain logic — no React, no Firestore imports
    types.ts        the Firestore schema, mirrored in TypeScript
    dates.ts        UTC-anchored day maths, periods, sessions, durations
    calc.ts         P&L, R-multiple, formatting
    risk.ts         the live risk / lot-size calculator
    instruments.ts  curated instrument reference data (static, not a table)
    violations.ts   silent rule-break computation
    aggregate.ts    rollups, stats, equity curve, heatmap
    patterns.ts     discipline score, behavioural flags, streak, plan-vs-actual
    export.ts       CSV
    repo.ts         the only module that talks to Firestore
    server/         admin SDK + email template (server-only)
  components/     UI, all hand-skinned on Radix primitives
  routes/         file-based routes, including two server routes
  store/app.ts    Zustand — UI state only, never server state
```

**The domain layer is pure and heavily tested.** The calendar, the review
screen, the Pro analytics and the end-of-day email all compute their numbers
from the same functions, so they can never disagree.

### Things worth knowing

- **Day strings, not timestamps.** A trade's `date` is `'YYYY-MM-DD'` and all
  arithmetic happens UTC-anchored, so a trader in UTC−11 and one in UTC+13
  both see the day they actually traded.
- **Open trades are excluded from every statistic.** `computeStats` filters on
  `status` in one place rather than at each call site, because an open trade
  carries a placeholder P&L of `0` that would otherwise invent break-evens.
- **Risk figures are snapshotted.** `pipValueUsed` and `calcMode` are stored on
  the trade. If a contract-size default is corrected later, historical trades
  keep the number the trader actually saw.
- **Pip values are never pre-rounded.** XRPUSD's is `0.0001`; rounding it to two
  decimals would zero every XRP risk figure. Rounding happens at display only.
- **The conversion rate is derived from the price where possible.** For a USD
  account on USDJPY the JPY→USD rate is exactly `1 / price` — no network call,
  no staleness. Only true crosses hit the FX endpoint.
- **The 30-day session expiry is ours, not Firebase's.** `browserLocalPersistence`
  never expires; `lib/session.ts` implements the rule explicitly against
  `lastActiveAt`.
- **The `devtools()` Vite plugin is deliberately absent** — it bridges the SSR
  console into the client and back, and the loop can write a multi-GB log.

### Design system

Dark only, one palette, computationally validated for colour-vision separation
and contrast against the panel surface:

| Token | Hex | Role |
|---|---|---|
| `win` | `#35A38C` | jade — profit |
| `loss` | `#DE6E52` | clay — loss |
| `accent` | `#7C83F0` | periwinkle — interactive only |

Profit, loss and "click me" never visually compete. Every select, checkbox,
switch, dialog and toast is a hand-skinned Radix primitive; there is no native
form control anywhere in the app. Tap targets are held at 44px by a single
`(pointer: coarse)` rule so a control added later cannot quietly miss it.

---

## Development-only preview

`/preview` mounts the real screens against fixture data, so the dense views can
be checked without signing in. It renders the 404 page in production.

```
/preview?screen=journal|review|insights|settings|onboarding
/preview?sheet=new          opens the trade entry form
```

---

## Deploying to Vercel

Push the repo and import it; the TanStack Start preset is detected
automatically. Set every variable from `.env.example` in the project settings —
the `VITE_`-prefixed ones ship to the browser, the rest stay server-side.

[`vercel.json`](vercel.json) registers the weekday-evening cron that drives the
optional check-in email. That feature is off unless `VITE_ENABLE_EMAIL_CHECKIN`
is `true` **and** the individual user has opted in.
