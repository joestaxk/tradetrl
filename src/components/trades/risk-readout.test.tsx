import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RiskReadout } from './risk-readout'
import { PairCombobox } from './pair-combobox'
import { TooltipProvider } from '#/components/ui/overlays'
import { computeRisk, type RiskResult } from '#/lib/risk'

const wrap = (ui: React.ReactNode) =>
  render(<TooltipProvider delayDuration={0}>{ui}</TooltipProvider>)

type RiskInput = Parameters<typeof computeRisk>[0]

/** A complete, in-limit EURUSD trade; override any field per test. */
const risk = (over: Partial<RiskInput> = {}) =>
  computeRisk({
    pair: 'EURUSD',
    entryPrice: 1.085,
    stopPrice: 1.083,
    lotSize: 0.5,
    accountCurrency: 'USD',
    accountSize: 10_000,
    ...over,
  })

describe('RiskReadout — the figure', () => {
  it('states the money at risk and the share of the account', () => {
    wrap(<RiskReadout result={risk()} />)
    expect(screen.getByLabelText('$100.00')).toBeInTheDocument()
    expect(screen.getByText('1.00% of your account')).toBeInTheDocument()
  })

  it('shows the working, so the number is checkable', () => {
    wrap(<RiskReadout result={risk()} />)
    expect(screen.getByText('20 pips stop')).toBeInTheDocument()
    expect(screen.getByText(/\$10\.00 per pip per lot/)).toBeInTheDocument()
  })

  it('labels points rather than pips for a metal', () => {
    wrap(
      <RiskReadout
        result={risk({ pair: 'XAUUSD', entryPrice: 2400, stopPrice: 2395, lotSize: 0.2 })}
      />,
    )
    expect(screen.getByText(/pts stop/)).toBeInTheDocument()
  })
})

describe('RiskReadout — §6, observe never gate', () => {
  it('stays neutral when there is no rule to compare against', () => {
    const { container } = wrap(<RiskReadout result={risk()} />)
    expect(container.querySelector('.text-caution')).not.toBeInTheDocument()
  })

  it('stays neutral at exactly the limit', () => {
    // 1.00% against a 1% rule is adherence, not a breach.
    const { container } = wrap(<RiskReadout result={risk()} maxRiskPct={1} />)
    expect(container.querySelector('.text-caution')).not.toBeInTheDocument()
  })

  it('warms up once the trader passes their own limit', () => {
    wrap(<RiskReadout result={risk({ lotSize: 2 })} maxRiskPct={1} />)
    expect(screen.getByText(/more than the 1% you set for yourself/)).toBeInTheDocument()
  })

  it('names the size that would keep them inside it', () => {
    wrap(<RiskReadout result={risk({ lotSize: 2 })} maxRiskPct={1} suggestedLots={0.5} />)
    expect(screen.getByText(/use 0\.5 lots to stay inside it/i)).toBeInTheDocument()
  })

  it('offers the fix as one tap, and never as a block', () => {
    const onUse = vi.fn()
    wrap(
      <RiskReadout
        result={risk({ lotSize: 2 })}
        maxRiskPct={1}
        suggestedLots={0.5}
        onUseSuggested={onUse}
      />,
    )
    // Nothing in the readout is disabled — it is a suggestion, not a gate.
    for (const b of screen.getAllByRole('button')) expect(b).not.toBeDisabled()
    return userEvent.click(screen.getByRole('button', { name: /use 0\.5 lots instead/i })).then(() => {
      expect(onUse).toHaveBeenCalledWith(0.5)
    })
  })

  it('never shouts, even when over the limit', () => {
    const { container } = wrap(<RiskReadout result={risk({ lotSize: 5 })} maxRiskPct={1} />)
    const text = (container.textContent ?? '').toLowerCase()
    expect(text).not.toMatch(/!/)
    // Scolding vocabulary only — "20 pips stop" is a stop-loss, not a rebuke.
    for (const word of [
      'danger',
      'warning',
      'too much',
      'reckless',
      'careful',
      'you should',
      "don't",
      'excessive',
    ]) {
      expect(text).not.toContain(word)
    }
  })
})

describe('RiskReadout — honest blank states', () => {
  it('asks for a pair before anything else', () => {
    wrap(<RiskReadout result={computeRisk({ pair: '' })} />)
    expect(screen.getByText(/pick a pair/i)).toBeInTheDocument()
    // It must not claim we lack specs for an instrument never chosen.
    expect(screen.queryByText(/don.t know this one yet/i)).not.toBeInTheDocument()
  })

  it('asks for the levels once a pair is chosen', () => {
    wrap(<RiskReadout result={computeRisk({ pair: 'EURUSD' })} />)
    expect(screen.getByText(/where you get in and where your stop goes/i)).toBeInTheDocument()
  })

  it('points at the missing balance when it cannot size the trade for them', () => {
    wrap(<RiskReadout result={risk({ lotSize: undefined })} />)
    expect(screen.getByText(/account balance in settings/i)).toBeInTheDocument()
  })

  it('explains manual mode for an uncurated symbol', () => {
    wrap(<RiskReadout result={computeRisk({ pair: 'US30', entryPrice: 39_000, stopPrice: 38_900 })} />)
    expect(screen.getByText(/don.t know this one yet/i)).toBeInTheDocument()
  })

  it('says the trade still saves when a rate is missing', () => {
    wrap(
      <RiskReadout
        result={risk({ pair: 'EURGBP', entryPrice: 0.855, stopPrice: 0.853, lotSize: 1 })}
      />,
    )
    expect(screen.getByText(/still saves without it/i)).toBeInTheDocument()
  })
})

describe('RiskReadout — provenance', () => {
  it('discloses the broker-variance caveat for metals', () => {
    wrap(
      <RiskReadout
        result={risk({ pair: 'XAUUSD', entryPrice: 2400, stopPrice: 2395, lotSize: 0.2 })}
      />,
    )
    expect(screen.getByText(/check it matches your broker/i)).toBeInTheDocument()
  })

  it('does not caveat forex, whose contract sizes are standard', () => {
    wrap(<RiskReadout result={risk()} />)
    expect(screen.queryByText(/check it matches your broker/i)).not.toBeInTheDocument()
  })

  it('says when the rate came from the price itself', () => {
    wrap(
      <RiskReadout
        result={risk({ pair: 'USDJPY', entryPrice: 157, stopPrice: 156.8, lotSize: 1 })}
      />,
    )
    expect(screen.getByText(/converted from price/i)).toBeInTheDocument()
  })

  it('timestamps a fetched rate rather than implying it is live', () => {
    wrap(
      <RiskReadout
        result={risk({
          pair: 'EURGBP',
          entryPrice: 0.855,
          stopPrice: 0.853,
          lotSize: 1,
          fxRate: 1.27,
        })}
        rateFetchedAt={new Date(2026, 6, 14, 14, 32).getTime()}
      />,
    )
    expect(screen.getByText('rate as of 14:32')).toBeInTheDocument()
  })
})

describe('PairCombobox', () => {
  const setup = (value = '') => {
    const onChange = vi.fn()
    const onCustom = vi.fn()
    wrap(<PairCombobox value={value} onChange={onChange} onCustom={onCustom} />)
    return { onChange, onCustom }
  }

  it('prompts before anything is chosen', () => {
    setup()
    expect(screen.getByText('Pick a pair')).toBeInTheDocument()
  })

  it('shows the symbol and its full name once chosen', () => {
    setup('EURUSD')
    expect(screen.getByText('EURUSD')).toBeInTheDocument()
    expect(screen.getByText('Euro / US Dollar')).toBeInTheDocument()
  })

  it('marks an uncurated symbol as custom rather than hiding it', () => {
    setup('US30')
    expect(screen.getByText('US30')).toBeInTheDocument()
    expect(screen.getByText('custom')).toBeInTheDocument()
  })

  it('opens a grouped, searchable list', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox'))
    expect(screen.getByRole('option', { name: /EURUSD/ })).toBeInTheDocument()
    expect(screen.getByText('Forex')).toBeInTheDocument()
    expect(screen.getByText('Metals')).toBeInTheDocument()
  })

  it('filters as you type, across every group', async () => {
    setup()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('Search pairs'), 'gold')
    expect(screen.getByRole('option', { name: /XAUUSD/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /EURUSD/ })).not.toBeInTheDocument()
  })

  it('reports the chosen symbol', async () => {
    const { onChange } = setup()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('Search pairs'), 'eurusd')
    await userEvent.click(screen.getByRole('option', { name: /EURUSD/ }))
    expect(onChange).toHaveBeenCalledWith('EURUSD')
  })

  it('always offers the custom escape hatch, even with no matches', async () => {
    const { onCustom } = setup()
    await userEvent.click(screen.getByRole('combobox'))
    await userEvent.type(screen.getByLabelText('Search pairs'), 'zzzzz')
    const custom = screen.getByRole('option', { name: /other \/ custom pair/i })
    expect(custom).toBeInTheDocument()
    await userEvent.click(custom)
    expect(onCustom).toHaveBeenCalled()
  })
})

describe('RiskReadout — sizing the trade for them', () => {
  /**
   * The behaviour this file previously got wrong: with a stop but no lot size
   * the readout said nothing, so the calculator only worked once you had
   * already done the hard part yourself.
   */
  it('names the size to trade once it knows the stop, before any lot size', () => {
    render(
      <RiskReadout
        result={blank({ pair: 'EURUSD' })}
        currency="USD"
        maxRiskPct={1}
        suggestedLots={0.5}
        suggestedRisk={100}
      />,
    )
    expect(screen.getByText('0.5')).toBeInTheDocument()
    expect(screen.getByText(/lots/i)).toBeInTheDocument()
  })

  it('says in money what that size would cost if the stop is hit', () => {
    render(
      <RiskReadout
        result={blank({ pair: 'EURUSD' })}
        currency="USD"
        maxRiskPct={1}
        suggestedLots={0.5}
        suggestedRisk={100}
      />,
    )
    expect(screen.getByText(/if your stop is hit you lose/i)).toBeInTheDocument()
    expect(screen.getByText('$100.00')).toBeInTheDocument()
  })

  it('offers the size as one tap, never as a requirement', async () => {
    const onUse = vi.fn()
    render(
      <RiskReadout
        result={blank({ pair: 'EURUSD' })}
        currency="USD"
        maxRiskPct={1}
        suggestedLots={0.5}
        suggestedRisk={100}
        onUseSuggested={onUse}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /use 0\.5 lots/i }))
    expect(onUse).toHaveBeenCalledWith(0.5)
  })

  it('falls back to asking for the levels when it has nothing to suggest', () => {
    render(<RiskReadout result={blank({ pair: 'EURUSD' })} currency="USD" />)
    expect(
      screen.getByText(/where you get in and where your stop goes/i),
    ).toBeInTheDocument()
  })
})

/** A result with no risk computed yet — the state before a lot size exists. */
function blank(over: Partial<RiskResult> = {}): RiskResult {
  return {
    pair: '',
    mode: 'curated',
    instrument: null,
    pipValuePerLot: null,
    stopDistancePips: null,
    riskAmount: null,
    riskPct: null,
    needsConversion: false,
    missingRate: false,
    rateSource: 'none',
    pipValueUsed: null,
    ...over,
  }
}
