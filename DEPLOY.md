# Deploying tradetrl app

## Vercel

The build must produce Vercel's Build Output API format. That comes from the
`nitro()` plugin in `vite.config.ts` — **without it the build emits a plain
`dist/client` + `dist/server` pair that Vercel has no idea how to serve, and
you get a blank site.** Nitro detects `VERCEL=1` at build time and writes
`.vercel/output/` instead of `.output/`.

Project settings on Vercel:

| Setting | Value |
|---|---|
| Framework preset | **Other** (do not pick Vite — it overrides the output dir) |
| Build command | `npm run build` |
| Output directory | *leave empty* |
| Install command | `npm install` |
| Node version | 20 or later |

Leaving the output directory empty is the important part: Vercel finds
`.vercel/output` automatically, and setting `dist` here makes it serve the raw
client bundle with no server, which renders a blank page.

### Environment variables

Set these in **Project → Settings → Environment Variables**. The six
`VITE_FIREBASE_*` values are public by design (they ship in the client bundle);
everything else must never be `VITE_`-prefixed.

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_ENABLE_EMAIL_CHECKIN     # 'false' unless Resend is configured

FIREBASE_PROJECT_ID           # server only, for the cron
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY          # keep the \n escapes intact
RESEND_API_KEY
RESEND_FROM
CRON_SECRET                   # any long random string
APP_URL                       # https://your-app.vercel.app
```

`VITE_*` variables are baked in at build time, so **changing one requires a
redeploy**, not just a restart.

### Firebase Auth authorised domains

Firebase rejects sign-in from an unknown origin, which surfaces as
`auth/unauthorized-domain`. Add both to **Firebase console → Authentication →
Settings → Authorised domains**:

- `your-app.vercel.app`
- any custom domain

Vercel preview deployments get a new hostname per commit, so sign-in will fail
on previews unless you add those too. Testing on the production URL is simpler.

## Firestore

### Rules

Deploy `firestore.rules` — the default "test mode" rules expire after 30 days
and then every read fails, which the app surfaces as "We couldn't load your
journal".

```bash
npx firebase-tools deploy --only firestore:rules --project <project-id>
```

### Indexes

None required. The trades subscription is deliberately a single-field query
(`orderBy('date')`) with the journal filter applied in memory — combining
`where('journalId')` with `orderBy('date')` would need a composite index, and
until someone clicked the link in the console error the journal would render
empty with no explanation.

## Cron (evening check-in)

`vercel.json` declares the schedule:

```json
{ "crons": [{ "path": "/api/cron/daily-checkin", "schedule": "0 21 * * 1-5" }] }
```

Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. The route refuses to
run at all when `CRON_SECRET` is unset rather than serving openly — an
unauthenticated endpoint that sends mail is a spam cannon.

Three gates before any email is sent: the caller proves it is the cron, the
deployment has Resend configured, and the individual user has
`prefs.emailCheckInOptIn === true`. A day with no trades gets no email.

Cron jobs on the Hobby plan run once a day at an approximate time.

## Local development

```bash
cp .env.example .env    # fill in the VITE_FIREBASE_* values
npm install
npm run dev             # http://localhost:3000
```

`http://localhost:3000/preview?screen=journal` mounts every real screen against
fixture data — no sign-in needed. Dev-only; in production that route renders
the 404 page. `?sheet=new` opens the entry form, and `&screen=` accepts
`journal`, `review`, `insights`, `settings`, `onboarding`.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
