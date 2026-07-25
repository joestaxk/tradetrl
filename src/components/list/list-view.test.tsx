import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListView, groupDays } from './list-view'
import { summarizeDays } from '#/lib/aggregate'
import { makeTrade } from '#/test/factories'
import type { Trade } from '#/lib/types'

const buckets = (trades: Trade[]) => summarizeDays(trades)

describe('groupDays', () => {
  // 2026-07-14 is a Tuesday; that week runs Mon 13 → Sun 19.
  const NOW = '2026-07-14'

  it('returns nothing when there is nothing logged', () => {
    expect(groupDays(buckets([]), NOW)).toEqual([])
  })

  it('groups the current week under "This week"', () => {
    const g = groupDays(buckets([makeTrade({ date: '2026-07-13' })]), NOW)
    expect(g[0].label).toBe('This week')
  })

  it('separates last week from this week', () => {
    const g = groupDays(
      buckets([makeTrade({ date: '2026-07-14' }), makeTrade({ date: '2026-07-08' })]),
      NOW,
    )
    expect(g.map((x) => x.label)).toEqual(['This week', 'Last week'])
  })

  it('falls back to month names further back', () => {
    const g = groupDays(buckets([makeTrade({ date: '2026-05-20' })]), NOW)
    expect(g[0].label).toBe('May')
  })

  it('adds the year once it is no longer the current one', () => {
    const g = groupDays(buckets([makeTrade({ date: '2025-11-20' })]), NOW)
    expect(g[0].label).toBe('November 2025')
  })

  it('orders days newest first', () => {
    const g = groupDays(
      buckets([
        makeTrade({ date: '2026-07-13' }),
        makeTrade({ date: '2026-07-15' }),
        makeTrade({ date: '2026-07-14' }),
      ]),
      NOW,
    )
    expect(g[0].days.map((d) => d.date)).toEqual(['2026-07-15', '2026-07-14', '2026-07-13'])
  })

  it('collapses a day’s trades into one row', () => {
    const g = groupDays(
      buckets([
        makeTrade({ date: '2026-07-14', pnl: 100 }),
        makeTrade({ date: '2026-07-14', pnl: -40 }),
      ]),
      NOW,
    )
    expect(g[0].days).toHaveLength(1)
    expect(g[0].days[0].stats.trades).toBe(2)
  })

  it('does not merge non-adjacent groups back together', () => {
    const g = groupDays(
      buckets([
        makeTrade({ date: '2026-07-14' }),
        makeTrade({ date: '2026-06-20' }),
        makeTrade({ date: '2026-05-20' }),
      ]),
      NOW,
    )
    expect(g.map((x) => x.label)).toEqual(['This week', 'June', 'May'])
  })
})

describe('ListView', () => {
  const noop = () => {}

  it('shows an intentional empty state, not a blank panel', () => {
    render(<ListView byDay={buckets([])} onSelectDay={noop} onNewTrade={noop} />)
    expect(screen.getByText(/nothing logged yet/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log your first trade/i })).toBeInTheDocument()
  })

  it('summarises a day in words as well as colour', () => {
    render(
      <ListView
        byDay={buckets([
          makeTrade({ date: '2026-07-14', pnl: 200, pair: 'XAUUSD' }),
          makeTrade({ date: '2026-07-14', pnl: -50, pair: 'EURUSD' }),
        ])}
        onSelectDay={noop}
        onNewTrade={noop}
      />,
    )
    expect(screen.getByText(/2 trades, 1 win, 1 loss/)).toBeInTheDocument()
    expect(screen.getByText('XAUUSD')).toBeInTheDocument()
    expect(screen.getByText('EURUSD')).toBeInTheDocument()
  })

  it('opens the same day-detail modal on tap as the calendar does', async () => {
    const onSelectDay = vi.fn()
    render(
      <ListView
        byDay={buckets([makeTrade({ date: '2026-07-14' })])}
        onSelectDay={onSelectDay}
        onNewTrade={noop}
      />,
    )
    await userEvent.click(screen.getAllByRole('button')[0])
    expect(onSelectDay).toHaveBeenCalledWith('2026-07-14')
  })

  it('truncates a busy day rather than growing an unbounded row', () => {
    const trades = Array.from({ length: 7 }, (_, i) =>
      makeTrade({ date: '2026-07-14', pair: `PAIR${i}` }),
    )
    render(<ListView byDay={buckets(trades)} onSelectDay={noop} onNewTrade={noop} />)
    expect(screen.getByText('+3 more')).toBeInTheDocument()
  })
})
