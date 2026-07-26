/**
 * Wipe every user's journal data so the app starts from nothing.
 *
 * ── Read this before running it ───────────────────────────────────────────
 * This is irreversible. Firestore has no undo and no recycle bin. Anything
 * deleted here is gone unless the project has scheduled backups enabled
 * (Firestore PITR is off by default and is a paid feature).
 *
 * Two deliberate safety properties:
 *
 *   1. **Dry run is the default.** Running with no flags only ever counts and
 *      reports. Deletion requires `--confirm`, and the confirmation is a typed
 *      phrase rather than a flag that could be shell-history'd by accident.
 *   2. **It reports before it acts.** You see exactly how many users, trades,
 *      accounts, strategies and plans are about to go, so a surprise ("wait,
 *      there are 40 users?") stops you before the damage, not after.
 *
 * Usage:
 *   node scripts/reset-db.mjs                 # dry run — counts only
 *   node scripts/reset-db.mjs --confirm       # asks you to type the phrase
 *   node scripts/reset-db.mjs --keep-users    # wipe trades, keep accounts/logins
 */

import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PHRASE = 'DELETE EVERYTHING'

/** Subcollections under users/{uid} that hold journal data. */
const SUBCOLLECTIONS = ['trades', 'journals', 'strategies', 'periodPlans', 'reviews']

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (!m) continue
      let v = m[2].trim()
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1)
      }
      if (!process.env[m[1]]) process.env[m[1]] = v
    }
  } catch {
    // Env may come from the shell instead; that's fine.
  }
}

function db() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      'Missing Admin credentials. Need FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.',
    )
    process.exit(1)
  }
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId })
  console.log(`project: ${projectId}\n`)
  return getFirestore()
}

/** Delete a collection in batches — Firestore caps a batch at 500 writes. */
async function deleteAll(ref, label, counters) {
  let removed = 0
  for (;;) {
    const snap = await ref.limit(400).get()
    if (snap.empty) break
    const batch = ref.firestore.batch()
    for (const doc of snap.docs) batch.delete(doc.ref)
    await batch.commit()
    removed += snap.size
  }
  if (removed > 0) counters[label] = (counters[label] ?? 0) + removed
  return removed
}

async function main() {
  loadEnv()
  const args = process.argv.slice(2)
  const confirm = args.includes('--confirm')
  const keepUsers = args.includes('--keep-users')
  const store = db()

  const users = await store.collection('users').get()

  // ---- survey first, always ----
  const totals = { users: users.size }
  for (const sub of SUBCOLLECTIONS) totals[sub] = 0

  for (const user of users.docs) {
    for (const sub of SUBCOLLECTIONS) {
      const snap = await user.ref.collection(sub).count().get()
      totals[sub] += snap.data().count
    }
  }

  console.log('Currently in the database:')
  console.log(`  users          ${totals.users}`)
  for (const sub of SUBCOLLECTIONS) {
    console.log(`  ${sub.padEnd(14)} ${totals[sub]}`)
  }
  console.log()

  if (!confirm) {
    console.log('DRY RUN — nothing was deleted.')
    console.log('Re-run with --confirm to delete. You will be asked to type a phrase.')
    console.log(
      keepUsers
        ? 'Mode: --keep-users (logins and accounts survive, trades do not)'
        : 'Mode: full wipe (user documents go too; people re-onboard on next sign-in)',
    )
    process.exit(0)
  }

  if (totals.users === 0) {
    console.log('Nothing to delete.')
    process.exit(0)
  }

  // ---- typed confirmation ----
  const rl = createInterface({ input: stdin, output: stdout })
  console.log('This cannot be undone. Firestore has no undo and no recycle bin.')
  const answer = await rl.question(`Type ${PHRASE} to proceed: `)
  await rl.close()

  if (answer.trim() !== PHRASE) {
    console.log('\nAborted — nothing was deleted.')
    process.exit(1)
  }

  // ---- delete ----
  console.log('\nDeleting…')
  const counters = {}

  for (const user of users.docs) {
    for (const sub of SUBCOLLECTIONS) {
      await deleteAll(user.ref.collection(sub), sub, counters)
    }
    if (!keepUsers) {
      await user.ref.delete()
      counters.users = (counters.users ?? 0) + 1
    }
  }

  console.log('\nDone. Removed:')
  for (const [k, v] of Object.entries(counters)) console.log(`  ${k.padEnd(14)} ${v}`)

  console.log(
    keepUsers
      ? '\nLogins kept. Everyone keeps their account and re-starts with an empty journal.'
      : '\nUser documents removed. Firebase Auth logins still exist, so everyone signs in as normal and goes through onboarding again.',
  )
  console.log('Auth users are untouched — delete those in the Firebase console if you want to.')
}

main().catch((e) => {
  console.error('\nFailed:', e.message)
  process.exit(1)
})
