import { useState } from 'react'
import { Check, Loader2, Plus, Trash2, Wallet } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Field, Input, NumberInput } from '#/components/ui/field'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Badge, Card, CardBody, CardHeader, CardTitle } from '#/components/ui/primitives'
import { toast } from '#/components/ui/toast'
import { useAuth } from '#/lib/auth'
import { useJournals } from '#/lib/use-journals'
import { createJournal, deleteJournal, updateJournal } from '#/lib/repo'
import { today } from '#/lib/dates'
import {
  DEFAULT_JOURNAL_ID,
  JOURNAL_KINDS,
  compactAmount,
  kindLabel,
  resolveJournal,
} from '#/lib/journals'
import { CURRENCIES } from '#/lib/currencies'
import { cn } from '#/components/ui/cn'

/**
 * Accounts (§10 "multiple journals").
 *
 * Each account is a separate calendar *and* a separate balance — a 50k prop
 * evaluation and a 100k personal account both risking "1%" are risking very
 * different money, so the size lives here rather than once on the user.
 */
export function AccountsCard() {
  const { user, profile } = useAuth()
  const { journals, active, switchTo, reload } = useJournals()
  const [adding, setAdding] = useState(false)

  return (
    <Card id="accounts">
      <CardHeader>
        <div>
          <CardTitle>Accounts</CardTitle>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            One calendar each, with its own balance and rules. Switch between them from
            the header.
          </p>
        </div>
        <Wallet className="size-4 shrink-0 text-ink-faint" aria-hidden />
      </CardHeader>

      <CardBody className="flex flex-col gap-2.5">
        {journals.map((j) => (
          <AccountRow
            key={j.id}
            journal={resolveJournal(j, profile?.prefs)}
            isActive={j.id === active.id}
            canDelete={j.id !== DEFAULT_JOURNAL_ID && journals.length > 1}
            onSwitch={() => void switchTo(j.id)}
            onSaved={reload}
            uid={user?.uid}
          />
        ))}

        <Button variant="outline" size="sm" className="self-start" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          Add an account
        </Button>
      </CardBody>

      <AccountDialog
        open={adding}
        onOpenChange={setAdding}
        uid={user?.uid}
        onSaved={reload}
      />
    </Card>
  )
}

function AccountRow({
  journal,
  isActive,
  canDelete,
  onSwitch,
  onSaved,
  uid,
}: {
  journal: ReturnType<typeof resolveJournal>
  isActive: boolean
  canDelete: boolean
  onSwitch: () => void
  onSaved: () => Promise<void>
  uid: string | undefined
}) {
  const [editing, setEditing] = useState(false)
  const label = kindLabel(journal.kind)

  return (
    <>
      <div
        className={cn(
          'flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-2.5',
          isActive ? 'border-accent-edge bg-accent-wash' : 'border-line bg-raised',
        )}
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <span className="truncate text-[13px] font-medium text-ink">{journal.name}</span>
            {label && <Badge tone="neutral">{label}</Badge>}
            {isActive && (
              <Badge tone="accent">
                <Check aria-hidden />
                Active
              </Badge>
            )}
          </span>
          <span className="mt-0.5 text-[11px] text-ink-faint tnum">
            {typeof journal.startingBalance === 'number' && journal.startingBalance > 0
              ? `${compactAmount(journal.startingBalance, journal.currency)} · ${journal.currency}`
              : `No balance set · ${journal.currency}`}
            {typeof journal.riskRules.maxRiskPerTradePct === 'number' &&
              ` · max ${journal.riskRules.maxRiskPerTradePct}% per trade`}
          </span>
        </span>

        <span className="ml-auto flex shrink-0 items-center gap-1">
          {!isActive && (
            <Button size="sm" variant="ghost" onClick={onSwitch}>
              Switch
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </span>
      </div>

      <AccountDialog
        open={editing}
        onOpenChange={setEditing}
        uid={uid}
        journal={journal}
        canDelete={canDelete}
        onSaved={onSaved}
      />
    </>
  )
}

function AccountDialog({
  open,
  onOpenChange,
  uid,
  journal,
  canDelete,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  uid: string | undefined
  journal?: ReturnType<typeof resolveJournal>
  canDelete?: boolean
  onSaved: () => Promise<void>
}) {
  const isEdit = Boolean(journal)
  const [name, setName] = useState(journal?.name ?? '')
  const [kind, setKind] = useState(journal?.kind ?? 'personal')
  const [size, setSize] = useState(journal?.startingBalance?.toString() ?? '')
  const [currency, setCurrency] = useState(journal?.currency ?? 'USD')
  const [maxRisk, setMaxRisk] = useState(
    journal?.riskRules.maxRiskPerTradePct?.toString() ?? '',
  )
  const [riskBasis, setRiskBasis] = useState<'starting' | 'current'>(
    journal?.riskBasis ?? 'starting',
  )
  const [startedOn, setStartedOn] = useState(journal?.startedOn ?? today())
  // Deleting an account destroys every trade in it, so the name has to be
  // typed out. A misplaced tap must not be able to erase a year of journalling.
  const [confirmName, setConfirmName] = useState('')
  const [busy, setBusy] = useState(false)

  // Re-seed each time it opens, so a cancelled edit never leaks into the next.
  const reseed = (v: boolean) => {
    if (v) {
      setName(journal?.name ?? '')
      setKind(journal?.kind ?? 'personal')
      setSize(journal?.startingBalance?.toString() ?? '')
      setCurrency(journal?.currency ?? 'USD')
      setMaxRisk(journal?.riskRules.maxRiskPerTradePct?.toString() ?? '')
      setRiskBasis(journal?.riskBasis ?? 'starting')
      setStartedOn(journal?.startedOn ?? today())
      setConfirmName('')
    }
    onOpenChange(v)
  }

  const save = async () => {
    if (!uid || !name.trim()) return
    setBusy(true)
    try {
      const parsedSize = Number.parseFloat(size)
      const parsedRisk = Number.parseFloat(maxRisk)
      const payload = {
        name: name.trim(),
        kind,
        startingBalance:
          Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : undefined,
        startedOn,
        riskBasis,
        currency,
        riskRules: {
          ...(journal?.riskRules ?? {}),
          maxRiskPerTradePct:
            Number.isFinite(parsedRisk) && parsedRisk > 0 ? parsedRisk : undefined,
        },
      }

      if (journal) await updateJournal(uid, journal.id, payload)
      else await createJournal(uid, payload)

      await onSaved()
      toast.success(journal ? 'Account updated' : 'Account added')
      onOpenChange(false)
    } catch (e) {
      console.error('[accounts] save failed:', e)
      toast.error("Couldn't save that account")
    } finally {
      setBusy(false)
    }
  }

  const confirmMatches =
    Boolean(journal) &&
    confirmName.trim().toLowerCase() === (journal?.name ?? '').trim().toLowerCase()

  const remove = async () => {
    if (!uid || !journal || !confirmMatches) return
    setBusy(true)
    try {
      await deleteJournal(uid, journal.id)
      await onSaved()
      toast.success('Account removed')
      onOpenChange(false)
    } catch (e) {
      console.error('[accounts] delete failed:', e)
      toast.error("Couldn't remove that account")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={reseed}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit account' : 'New account'}</DialogTitle>
          <p className="text-[13px] text-ink-muted">
            Only a name is required. The balance is what turns risk into a percentage.
          </p>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <Field label="Name">
            {(id) => (
              <Input
                id={id}
                placeholder="FTMO 50k"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            )}
          </Field>

          <Field label="Type" optional>
            {(id) => (
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id={id}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOURNAL_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {kindLabel(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Balance" optional hint="Turns risk into a percentage.">
              {(id) => (
                <NumberInput
                  id={id}
                  placeholder="50000"
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              )}
            </Field>
            <Field label="Currency" optional>
              {(id) => (
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger id={id}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

          <Field
            label="Max risk per trade"
            optional
            hint="Prop firms often cap this. Leave blank to use your default."
          >
            {(id) => (
              <NumberInput
                id={id}
                affix="%"
                placeholder="1"
                value={maxRisk}
                onChange={(e) => setMaxRisk(e.target.value)}
              />
            )}
          </Field>

          {isEdit && canDelete && (
            <p className="text-[12px] leading-relaxed text-ink-faint">
              Deleting <span className="text-ink">{journal?.name}</span> also deletes
              every trade logged in it, and its whole balance history. There's no undo.
            </p>
          )}

          {/*
            Type-to-confirm, because this is the one action in the app that
            destroys data a trader cannot rebuild. A mis-tap must not be able
            to erase a year of journalling.
          */}
          {isEdit && canDelete && (
            <Field
              label="Type the account name to delete it"
              hint="Leave blank if you're just editing."
            >
              {(id) => (
                <Input
                  id={id}
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={journal?.name}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
              )}
            </Field>
          )}
          {/*
            Said once, before they commit, in plain words. Every one of these
            has caused a "why isn't this working" moment, and each is far
            easier to explain here than to discover later.
          */}
          {!isEdit && (
            <div className="flex flex-col gap-2.5 rounded-xl border border-line bg-raised p-3.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Before you add it
              </span>
              <ul className="flex flex-col gap-2 text-[13px] leading-relaxed text-ink-dim">
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                  <span>
                    <span className="text-ink">Each account is its own journal.</span> Trades,
                    balance, rules and stats are kept apart. A trade you log goes to whichever
                    account is selected at the top of the screen — nowhere else.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                  <span>
                    <span className="text-ink">The starting balance is the anchor.</span> Every
                    closed trade adds to or subtracts from it, so you can see what the account
                    is actually worth — not just a P&L number floating on its own.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                  <span>
                    <span className="text-ink">Risk is measured against your choice above.</span>{' '}
                    On a prop evaluation, 1% usually means 1% of the deposit forever. Compounding
                    means 1% of whatever the account is worth today. Pick the one your firm or
                    your plan actually uses.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                  <span>
                    <span className="text-ink">Rules lock once you trade.</span> Set them freely
                    any time before this account's first trade of the week. After that they hold
                    until Monday, so you can't break a rule and then quietly rewrite it. Your
                    strategies stay editable all week.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                  <span>
                    <span className="text-ink">Deleting is permanent.</span> Removing an account
                    takes every trade in it with it, and there's no undo. Export first if you
                    might want the history.
                  </span>
                </li>
              </ul>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          {isEdit && canDelete && (
            <Button
              variant="danger"
              onClick={remove}
              disabled={busy || !confirmMatches}
              className="sm:mr-auto"
            >
              <Trash2 aria-hidden />
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            {isEdit ? 'Save' : 'Add account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
