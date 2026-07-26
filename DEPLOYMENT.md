# Deploying tradetrl

## Vercel

Nitro writes Vercel's Build Output API format directly, so there is nothing to
configure beyond the defaults:

| Setting          | Value                                    |
| ---------------- | ---------------------------------------- |
| Framework preset | Other (or Vite — it is not used)          |
| Build command    | `npm run build`                          |
| Output directory | **leave empty**                          |
| Install command  | `npm install`                            |

Leaving the output directory empty matters. `VERCEL=1` is set automatically in
Vercel's build environment; Nitro detects it and emits `.vercel/output/`.
Pointing the setting at `dist` makes Vercel serve raw build artefacts instead,
which is what a blank page looks like.

### Environment variables

Set every `VITE_FIREBASE_*` value plus the server-only block from
`.env.example`. The `VITE_`-prefixed ones are public by design — they ship in
the client bundle, which is how Firebase web config is meant to work. Nothing
without that prefix ever reaches the browser.

`FIREBASE_PRIVATE_KEY` must keep its `\n` escapes. Paste it wrapped in double
quotes exactly as it appears in the service-account JSON.

---

## Email

Two things send mail, and both are optional — the app is fully functional with
neither configured.

| What                | Goes to           | Trigger                     |
| ------------------- | ----------------- | --------------------------- |
| Evening check-in    | the trader        | Vercel Cron, weekday evenings |
| Feedback and ideas  | `ADMIN_EMAIL`     | whenever someone sends one  |

### Resend needs a verified domain

This is the part with no way around it. Resend's docs are explicit: *"You must
add and verify at least one domain to send and receive emails with Resend."*
Until a domain is verified, nothing sends — the code degrades quietly and logs
rather than erroring at the user, but no mail leaves.

To verify:

1. Resend → **Domains** → **Add Domain**, and enter a domain you control.
2. Resend shows a set of DNS records. Add them at your registrar:
   - a **TXT** record for SPF — the IPs allowed to send as your domain
   - a **TXT** record for DKIM — the public key that signs your mail
   - an **MX** record so bounces and complaints come back to you
3. Wait for propagation (usually minutes, occasionally hours) and hit
   **Verify**.
4. Set `RESEND_FROM` to an address *on that domain*, e.g.
   `tradetrl <checkin@yourdomain.com>`. The from-address domain must be the
   verified one; the recipient can be anyone.

If you don't own a domain yet, a cheap one used only for sending is enough —
the app never needs to receive mail at it.

Resend also ships an `onboarding@resend.dev` sender used throughout their
examples. Their API reference doesn't document what recipient restrictions
apply to it, so treat it as a way to see one test email arrive and not as a
production sender — verify a real domain before anyone but you is using this.

### CRON_SECRET

A shared password proving a request to `/api/cron/daily-checkin` really came
from Vercel's scheduler. Without it the endpoint is a URL that sends real email
to real people, and anyone who finds it can drain your Resend quota.

Generate one and set it as a project env var:

```
openssl rand -hex 32
```

Vercel attaches it as `Authorization: Bearer <CRON_SECRET>` on cron
invocations automatically. **The route refuses to run at all when the variable
is unset** — it fails closed rather than open.

### Vercel Cron limits on Hobby

Per Vercel's docs, Hobby accounts can run a cron **once per day**, with
**per-hour precision (±59 minutes)**. The configured schedule is:

```
0 21 * * 1-5    # weekday evenings
```

That runs at most once a day, so it deploys fine on Hobby — but 21:00 means
"somewhere between 21:00 and 21:59". For an evening check-in that is fine. Pro
is required for anything more frequent or precisely timed.

### Verifying the setup without emailing anyone

The cron route has a dry run. It does the entire job — reads opted-in users,
loads their trades, builds each email — and reports what it *would* send
without calling Resend:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "https://your-app.vercel.app/api/cron/daily-checkin?dry=1"
```

```jsonc
{
  "ok": true,
  "dryRun": true,
  "date": "2026-07-24",
  "sent": 2,              // would have sent
  "skipped": 5,           // no trades that day, or no email on file
  "resendConfigured": true,
  "from": "tradetrl <checkin@yourdomain.com>",
  "wouldSend": [{ "to": "…", "subject": "Friday, 24 July — +$420.00" }]
}
```

Add `&date=2026-07-24` to test against a day you know has trades, rather than
waiting for one to happen.

### A known limitation: time zones

The cron fires in UTC and the job asks for "today" in UTC. For traders in the
Americas and Europe that lines up with the day they just finished. Someone in
UTC+13 gets the check-in about what UTC still calls today while their local
clock has already rolled over. Fixing it properly means storing each trader's
zone and bucketing per-user, which is worth doing before this ships widely.

---

## Firestore

Deploy the rules in `firestore.rules`. Every document lives under
`users/{uid}` and is readable only by that uid — there is no sharing surface,
so there is no rule granting one. `plan` is excluded from client writes so
nobody can grant themselves Pro.

```bash
firebase deploy --only firestore:rules
```

No composite indexes are required. The trades subscription is deliberately a
single-field query filtered in memory, because a `where` + `orderBy` pair needs
an index that doesn't exist on a fresh database — and until someone clicks the
link in the console error, the journal renders empty with no explanation.
