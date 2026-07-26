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

## Support: Telegram

Feedback and ideas go to Telegram, not email. It needs no domain, no DNS, no
verification wait and no spam folder — it arrives as a push notification on
your phone. Email remains a fallback if Telegram is unconfigured or fails.

### What you need

1. **Bot token.** Open Telegram, message **@BotFather**, send `/newbot`, follow
   the two prompts (a display name and a username ending in `bot`). It replies
   with a token like `8123456789:AAH...`. That is `TELEGRAM_BOT_TOKEN`.

2. **Your chat id.** Send your new bot any message — *"hi"* is fine. A bot
   cannot message someone who hasn't messaged it first, so this step is what
   opens the channel. Then visit:

   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```

   Find `"chat":{"id":123456789` in the response. That number is
   `TELEGRAM_CHAT_ID`.

3. **Your public username**, e.g. `joestaxk` — set as `VITE_TELEGRAM_HANDLE`
   without the `@`. This powers the "Message me on Telegram" link that lets a
   trader start a real conversation with you.

```
TELEGRAM_BOT_TOKEN=8123456789:AAH...
TELEGRAM_CHAT_ID=123456789
VITE_TELEGRAM_HANDLE=joestaxk
```

The first two are server-only. The third is deliberately `VITE_`-prefixed
because a public username is meant to be public — it's the same handle anyone
can already search for.

### Replying

The bot delivers *to* you; it cannot reply *for* you, because Telegram forbids
a bot from opening a chat with someone who hasn't messaged it. So:

- the feedback form asks for the sender's Telegram handle (optional), and the
  message you receive shows it — one tap to open that chat and reply;
- if they'd rather just talk, the "Message me on Telegram" link starts a direct
  conversation with you, no bot involved.

When someone sends anonymously, the message says so explicitly rather than
leaving you wondering why there's no contact.

### Checking it works

Send yourself a test straight from the terminal:

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
  -H 'Content-Type: application/json' \
  -d "{\"chat_id\":\"$TELEGRAM_CHAT_ID\",\"text\":\"tradetrl is wired up\"}"
```

`{"ok":true,...}` means done. `chat not found` means step 2 was skipped — message
the bot first.

---

## Email

The evening check-in still uses email. It is optional and off by default.

| What                | Goes to           | Trigger                     |
| ------------------- | ----------------- | --------------------------- |
| Evening check-in    | the trader        | Vercel Cron, weekday evenings |
| Feedback and ideas  | Telegram          | whenever someone sends one  |

### Resend needs a domain you own

Resend's docs are explicit: *"You must add and verify at least one domain to
send and receive emails with Resend."* There is one exception, and it is
narrow.

**The testing sender.** `onboarding@resend.dev` works with no DNS at all, but
per Resend's own knowledge base it *"can only send emails to the email address
associated with your Resend account"* — anything else returns 403.

That splits the two features cleanly:

| | Works on `resend.dev`? | Why |
| --- | --- | --- |
| Feedback → `ADMIN_EMAIL` | **Yes** | It is your own address, which is exactly what the testing sender allows |
| Evening check-in → traders | **No** | Every recipient other than you is a 403 |

So with `RESEND_FROM="tradetrl <onboarding@resend.dev>"` — the default — user
feedback reaches you immediately with zero setup, provided `ADMIN_EMAIL` is the
address you signed up to Resend with. The check-in email stays off until you
own a domain, and the cron route refuses to run for real with a `resend.dev`
sender rather than generating a wall of 403s.

**A Vercel subdomain cannot be used.** `something.vercel.app` is not yours,
has no DNS panel you control, and sits on the Public Suffix List. Resend will
not verify it. Sending to anyone but yourself needs a domain you actually
registered — a cheap one used only for mail is fine, it never has to serve the
app.

Once you have one:

1. Resend → **Domains** → **Add Domain**.
2. Add the three records it shows you at whichever provider runs your DNS:
   - **MX** on `send` → `feedback-smtp.<region>.amazonses.com`, priority 10
   - **TXT** on `send` → `v=spf1 include:amazonses.com ~all`
   - **TXT** on `resend._domainkey` → the long `p=…` public key
3. Hit **Verify**, then set `RESEND_FROM` to an address on that domain.

If your DNS is on Vercel, note that its **Name** field takes the prefix only —
the docs put it as *"For www.example.com, the name argument would be www."* So
`resend._domainkey.yourdomain.com` is entered as `resend._domainkey`. Pasting
the full hostname yields `resend._domainkey.yourdomain.com.yourdomain.com`,
which never verifies and gives no clue why. Vercel's DNS panel only applies if
the domain uses Vercel's nameservers — check with `dig NS yourdomain.com
+short`; if it is not `ns1.vercel-dns.com`, the records belong at whoever is
listed instead.

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
