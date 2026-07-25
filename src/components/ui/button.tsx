import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from './cn'

/**
 * Every interactive surface uses the brand accent — never win or loss colour.
 * "Profit", "loss" and "click me" must never visually compete (§8).
 *
 * Heights are floored at 44px on the `md` size and above because §12 makes
 * that a hard requirement, not a guideline.
 */
const button = cva(
  [
    'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium select-none',
    'transition-[background-color,border-color,color,transform,box-shadow] duration-200',
    'ease-[var(--ease-out-quint)]',
    'active:scale-[0.985]',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:shrink-0 [&_svg]:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-accent text-void border border-accent',
          'hover:bg-accent-bright hover:border-accent-bright',
          'shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_6px_16px_-8px_rgba(124,131,240,0.7)]',
        ],
        secondary: [
          'bg-raised text-ink border border-line-strong',
          'hover:bg-overlay hover:border-ink-faint',
        ],
        ghost: ['bg-transparent text-ink-dim border border-transparent', 'hover:bg-raised hover:text-ink'],
        outline: [
          'bg-transparent text-ink border border-line-strong',
          'hover:border-accent-edge hover:text-ink hover:bg-accent-wash',
        ],
        danger: [
          'bg-transparent text-loss border border-loss-edge',
          'hover:bg-loss-wash hover:border-loss',
        ],
        link: ['bg-transparent text-accent underline-offset-4 hover:underline p-0 h-auto'],
      },
      size: {
        sm: 'h-9 px-3 text-[13px] rounded-lg [&_svg]:size-4',
        md: 'h-11 px-4 text-sm rounded-[10px] [&_svg]:size-4',
        lg: 'h-12 px-6 text-[15px] rounded-xl [&_svg]:size-[18px]',
        icon: 'size-11 rounded-[10px] [&_svg]:size-[18px]',
        'icon-sm': 'size-9 rounded-lg [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return <Comp ref={ref} className={cn(button({ variant, size }), className)} {...props} />
})

export { button as buttonVariants }
