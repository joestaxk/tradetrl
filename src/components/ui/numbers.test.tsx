import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Money, RMultiple, Stat, toneOf } from './numbers'

describe('tone derivation', () => {
  it('maps sign to tone and treats non-numbers as neutral', () => {
    expect(toneOf(10)).toBe('win')
    expect(toneOf(-10)).toBe('loss')
    expect(toneOf(0)).toBe('flat')
    expect(toneOf(null)).toBe('neutral')
    expect(toneOf(NaN)).toBe('neutral')
  })
})

describe('Money', () => {
  it('renders a signed, tabular figure', () => {
    const { container } = render(<Money value={1240.5} />)
    expect(container.textContent).toContain('+$1,240.50')
    expect(container.querySelector('.tnum')).toBeInTheDocument()
  })

  it('announces the settled value to assistive tech, not the tween', () => {
    render(<Money value={-320} animate />)
    // The visible text may be mid-animation; the label is always the truth.
    expect(screen.getByLabelText('−$320.00')).toBeInTheDocument()
  })

  it('colours by sign', () => {
    const win = render(<Money value={100} />)
    expect(win.container.querySelector('.text-win-bright')).toBeInTheDocument()
    const loss = render(<Money value={-100} />)
    expect(loss.container.querySelector('.text-loss-bright')).toBeInTheDocument()
  })

  it('can render uncoloured for neutral contexts', () => {
    const { container } = render(<Money value={100} colored={false} />)
    expect(container.querySelector('.text-win-bright')).not.toBeInTheDocument()
  })
})

describe('RMultiple', () => {
  it('formats R with the same sign convention as money', () => {
    expect(render(<RMultiple value={2} />).container.textContent).toBe('+2.00R')
    expect(render(<RMultiple value={-1.5} />).container.textContent).toBe('−1.50R')
  })
})

describe('Stat tile', () => {
  it('renders label, value and sub-line', () => {
    render(<Stat label="Win rate" value="62.5%" sub="8 of 13" />)
    expect(screen.getByText('Win rate')).toBeInTheDocument()
    expect(screen.getByText('62.5%')).toBeInTheDocument()
    expect(screen.getByText('8 of 13')).toBeInTheDocument()
  })

  it('carries a stagger index for the reveal', () => {
    const { container } = render(<Stat label="PnL" value="$0" index={3} />)
    expect(container.firstElementChild).toHaveStyle({ '--i': '3' })
  })
})
