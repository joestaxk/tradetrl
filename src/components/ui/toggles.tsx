import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group'
import { Check, Minus } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from './cn'

/* ---------------------------------------------------------------- Checkbox */

export const Checkbox = forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        'peer size-5 shrink-0 rounded-[6px] border border-line-strong bg-raised',
        'transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]',
        'hover:border-ink-faint',
        'focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-wash)]',
        'data-[state=checked]:bg-accent data-[state=checked]:border-accent',
        'data-[state=indeterminate]:bg-accent data-[state=indeterminate]:border-accent',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-void">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3.5" strokeWidth={3} aria-hidden />
        ) : (
          <Check className="size-3.5 animate-[scale-in_0.16s_var(--ease-spring)]" strokeWidth={3} aria-hidden />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})

/* ------------------------------------------------------------------ Switch */

export const Switch = forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        // min-w + basis keep the capsule 44px wide when it sits beside a long
        // label; without them flex squeezes it down to a circle on mobile.
        'peer inline-flex h-6 w-11 min-w-11 shrink-0 grow-0 basis-11 self-center',
        'cursor-pointer items-center rounded-full',
        'border border-line-strong bg-raised p-0.5',
        'transition-colors duration-250 ease-[var(--ease-out-quint)]',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--color-accent-wash)]',
        'data-[state=checked]:bg-accent data-[state=checked]:border-accent',
        'disabled:opacity-45 disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-[18px] min-w-[18px] shrink-0 aspect-square rounded-full bg-ink-dim',
          'shadow-[0_1px_3px_rgba(0,0,0,0.5)]',
          'transition-[transform,background-color] duration-250 ease-[var(--ease-out-quint)]',
          'data-[state=checked]:translate-x-[20px] data-[state=checked]:bg-void',
        )}
      />
    </SwitchPrimitive.Root>
  )
})

/* -------------------------------------------------------------- RadioGroup */

export const RadioGroup = RadioGroupPrimitive.Root

export const RadioItem = forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item>
>(function RadioItem({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'size-5 shrink-0 rounded-full border border-line-strong bg-raised',
        'transition-[border-color,box-shadow] duration-200',
        'hover:border-ink-faint',
        'focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-wash)]',
        'data-[state=checked]:border-accent',
        'disabled:opacity-45',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex size-full items-center justify-center">
        <span className="block size-2.5 rounded-full bg-accent animate-[scale-in_0.16s_var(--ease-spring)]" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  )
})

/**
 * A radio rendered as a full selectable card — used for the one onboarding
 * choice that matters (§3), where a 20px dot would undersell the decision.
 */
export const RadioCard = forwardRef<
  React.ComponentRef<typeof RadioGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Item> & {
    title: string
    description: string
    icon?: React.ReactNode
  }
>(function RadioCard({ className, title, description, icon, ...props }, ref) {
  return (
    <RadioGroupPrimitive.Item
      ref={ref}
      className={cn(
        'group relative flex w-full flex-col items-start gap-2 rounded-xl p-4 sm:p-5 text-left',
        'border border-line bg-panel',
        'transition-[border-color,background-color,transform] duration-250 ease-[var(--ease-out-quint)]',
        'hover:border-line-strong hover:bg-raised',
        'focus-visible:outline-none focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-wash)]',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent-wash',
        className,
      )}
      {...props}
    >
      <div className="flex w-full items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon && (
            <span className="text-ink-muted transition-colors duration-200 group-data-[state=checked]:text-accent">
              {icon}
            </span>
          )}
          <span className="font-medium text-ink">{title}</span>
        </div>
        <span
          className={cn(
            'mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full',
            'border border-line-strong transition-colors duration-200',
            'group-data-[state=checked]:border-accent group-data-[state=checked]:bg-accent',
          )}
        >
          <Check
            className="size-3 text-void opacity-0 transition-opacity duration-200 group-data-[state=checked]:opacity-100"
            strokeWidth={3}
            aria-hidden
          />
        </span>
      </div>
      <p className="text-[13px] leading-relaxed text-ink-muted">{description}</p>
    </RadioGroupPrimitive.Item>
  )
})

/* --------------------------------------------------------- Segmented control */

export const SegmentedGroup = ToggleGroupPrimitive.Root

/**
 * The calendar/list view switch (§7) and win/loss picker. A sliding pill would
 * need layout measurement; a bordered active state reads cleaner and never
 * mis-measures on a 320px screen.
 */
export const SegmentedItem = forwardRef<
  React.ComponentRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> & {
    tone?: 'accent' | 'win' | 'loss'
  }
>(function SegmentedItem({ className, tone = 'accent', ...props }, ref) {
  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        'inline-flex h-9 min-w-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 sm:px-3',
        'whitespace-nowrap text-[13px] font-medium text-ink-muted',
        'transition-[background-color,color,box-shadow] duration-200 ease-[var(--ease-out-quint)]',
        'hover:text-ink-dim',
        'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--color-accent-wash)]',
        'disabled:opacity-45',
        tone === 'accent' && 'data-[state=on]:bg-overlay data-[state=on]:text-ink',
        tone === 'win' && 'data-[state=on]:bg-win-wash data-[state=on]:text-win-bright',
        tone === 'loss' && 'data-[state=on]:bg-loss-wash data-[state=on]:text-loss-bright',
        className,
      )}
      {...props}
    />
  )
})

export function SegmentedShell({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-[11px] border border-line bg-panel p-1',
        className,
      )}
      {...props}
    />
  )
}
