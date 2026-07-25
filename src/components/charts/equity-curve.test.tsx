import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EquityCurve, Sparkline } from './equity-curve'
import { equityCurve } from '#/lib/aggregate'
import { makeTrades } from '#/test/factories'

describe('EquityCurve', () => {
  it('shows an intentional message rather than an empty box when there is nothing to draw', () => {
    render(<EquityCurve points={equityCurve([])} />)
    expect(screen.getByText(/not enough trades/i)).toBeInTheDocument()
  })

  it('describes the curve to assistive tech instead of leaving a bare graphic', () => {
    render(<EquityCurve points={equityCurve(makeTrades([100, -30, 50]))} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAccessibleName(/ends at \+\$120\.00 over 3 trades/i)
  })

  it('colours the curve by the final result, not the first move', () => {
    // Starts up, ends down — must read as a loss.
    const { container } = render(<EquityCurve points={equityCurve(makeTrades([500, -800]))} />)
    const path = container.querySelector('path[stroke]')
    expect(path).toHaveAttribute('stroke', 'var(--color-loss)')
  })

  it('draws a flat curve without collapsing the scale', () => {
    const { container } = render(<EquityCurve points={equityCurve(makeTrades([0, 0, 0]))} />)
    const path = container.querySelector('path[stroke]')
    // A degenerate min===max range would produce NaN coordinates.
    expect(path?.getAttribute('d')).not.toContain('NaN')
  })

  it('never emits NaN geometry for real data', () => {
    const { container } = render(
      <EquityCurve points={equityCurve(makeTrades([120, -45.5, 800, -12.25]))} />,
    )
    for (const p of container.querySelectorAll('path')) {
      expect(p.getAttribute('d') ?? '').not.toContain('NaN')
    }
  })
})

describe('Sparkline', () => {
  it('renders nothing for a single point — one value is not a trend', () => {
    const { container } = render(<Sparkline values={[1]} />)
    expect(container.firstChild).toBeNull()
  })

  it('is decorative, so it stays out of the accessibility tree', () => {
    const { container } = render(<Sparkline values={[1, 5, 3]} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('reads its tone from the direction of travel', () => {
    const up = render(<Sparkline values={[1, 2, 3]} />)
    expect(up.container.querySelector('path')).toHaveAttribute('stroke', 'var(--color-win)')
    const down = render(<Sparkline values={[3, 2, 1]} />)
    expect(down.container.querySelector('path')).toHaveAttribute('stroke', 'var(--color-loss)')
  })

  it('does not divide by zero on a flat series', () => {
    const { container } = render(<Sparkline values={[5, 5, 5]} />)
    expect(container.querySelector('path')?.getAttribute('d')).not.toContain('NaN')
  })
})
