import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReflectionSheet } from './reflection-sheet'
import { useAppStore } from '#/store/app'
import { makeTrade } from '#/test/factories'

const patchTrade = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))
vi.mock('#/lib/repo', () => ({ patchTrade }))
vi.mock('#/lib/auth', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }))

beforeEach(() => {
  patchTrade.mockClear()
  useAppStore.setState({ reflectTarget: null })
})

// Wrapped in act(): the store lives outside React, so without this the
// resulting re-render never flushes and the dialog is not in the tree yet.
const open = (over: Parameters<typeof makeTrade>[0] = {}) =>
  act(() => {
    useAppStore.getState().openReflection(makeTrade({ id: 't1', ...over }))
  })

describe('when it appears', () => {
  it('stays out of the way until a trade is logged', () => {
    render(<ReflectionSheet />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens for a logged trade', () => {
    render(<ReflectionSheet />)
    open({ outcome: 'loss', pnl: -120 })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('the question it asks', () => {
  it('asks what took them out after a loss', () => {
    render(<ReflectionSheet />)
    open({ outcome: 'loss', pnl: -120 })
    expect(screen.getByText('What took you out?')).toBeInTheDocument()
  })

  it('asks what worked after a win — same weight, not a celebration', () => {
    render(<ReflectionSheet />)
    open({ outcome: 'win', pnl: 240 })
    expect(screen.getByText('What worked?')).toBeInTheDocument()
  })

  it('asks what changed their mind on a break-even', () => {
    render(<ReflectionSheet />)
    open({ outcome: 'flat', pnl: 0 })
    expect(screen.getByText('What changed your mind?')).toBeInTheDocument()
  })
})

describe('tone — the journal has no opinion about the outcome', () => {
  it('never congratulates a win or consoles a loss', () => {
    /*
      A reckless trade that happened to win would collect the praise and a
      disciplined loss the sympathy, teaching that outcome is what matters.
      That is the association this product exists to break.
    */
    for (const outcome of ['win', 'loss', 'flat'] as const) {
      const { unmount } = render(<ReflectionSheet />)
      open({ outcome, pnl: outcome === 'loss' ? -100 : 100 })
      const text = screen.getByRole('dialog').textContent!.toLowerCase()
      for (const word of [
        'congratulations',
        'well done',
        'great',
        'nice one',
        'unlucky',
        'sorry',
        'better luck',
      ]) {
        expect(text).not.toContain(word)
      }
      expect(text).not.toMatch(/!/)
      unmount()
      useAppStore.setState({ reflectTarget: null })
    }
  })
})

describe('it is genuinely optional', () => {
  it('offers a skip that writes nothing', async () => {
    render(<ReflectionSheet />)
    open({ outcome: 'loss', pnl: -120 })
    await userEvent.click(screen.getByRole('button', { name: /skip/i }))
    expect(patchTrade).not.toHaveBeenCalled()
    expect(useAppStore.getState().reflectTarget).toBeNull()
  })

  it('says plainly that skipping costs nothing', () => {
    render(<ReflectionSheet />)
    open({ outcome: 'loss', pnl: -120 })
    expect(screen.getByText(/skip it and nothing is lost/i)).toBeInTheDocument()
  })
})

describe('saving a note', () => {
  it('writes the free text the user came looking for', async () => {
    render(<ReflectionSheet />)
    open({ outcome: 'loss', pnl: -120 })

    await userEvent.type(
      screen.getByRole('textbox'),
      'Chased it after the first one stopped out.',
    )
    await userEvent.click(screen.getByRole('button', { name: /save note/i }))

    expect(patchTrade).toHaveBeenCalledWith('u1', 't1', {
      reason: 'Chased it after the first one stopped out.',
      reasonTags: undefined,
    })
  })

  it('closes once saved', async () => {
    render(<ReflectionSheet />)
    open({ outcome: 'win', pnl: 240 })
    await userEvent.type(screen.getByRole('textbox'), 'Clean setup.')
    await userEvent.click(screen.getByRole('button', { name: /save note/i }))
    expect(useAppStore.getState().reflectTarget).toBeNull()
  })

  it('carries an existing note in rather than starting blank', () => {
    render(<ReflectionSheet />)
    open({ outcome: 'loss', pnl: -120, reason: 'Already written' })
    expect(screen.getByRole('textbox')).toHaveValue('Already written')
  })
})
