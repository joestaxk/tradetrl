import * as LabelPrimitive from '@radix-ui/react-label'
import { forwardRef, useId } from 'react'
import { Tip } from './overlays'
import { cn } from './cn'

/**
 * A small "?" that explains a field in one plain sentence.
 *
 * Trading UIs are full of jargon a beginner has no way to guess. Rather than
 * padding every label with a paragraph, the explanation hides behind this and
 * is written for someone who has never heard the word "pip".
 */
export function InfoTip({ label }: { label: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button
        type="button"
        // Not a submit button, and not a tab stop that fights the form — but
        // still focusable, so keyboard users can read it too.
        className={cn(
          'inline-flex size-4 shrink-0 items-center justify-center rounded-full',
          'border border-line-strong text-[9px] font-bold leading-none text-ink-faint',
          'transition-colors duration-150 hover:border-accent hover:text-accent-bright',
          'focus-visible:outline-none focus-visible:border-accent focus-visible:text-accent-bright',
        )}
        aria-label="What is this?"
      >
        ?
      </button>
    </Tip>
  )
}

export const Label = forwardRef<
  React.ComponentRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & {
    optional?: boolean
    tip?: React.ReactNode
  }
>(function Label({ className, children, optional, tip, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'flex items-center gap-2 text-[13px] font-medium text-ink-dim',
        'peer-disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      {tip && <InfoTip label={tip} />}
      {/*
        Optionality is a first-class visual signal in this product: the whole
        premise is that almost nothing is required, and the form should say so
        out loud rather than leaving the trader to guess.
      */}
      {optional && (
        <span className="text-[11px] font-normal tracking-wide text-ink-faint uppercase">
          optional
        </span>
      )}
    </LabelPrimitive.Root>
  )
})

export const inputClasses = cn(
  'w-full min-w-0 h-11 rounded-[10px] px-3',
  'bg-raised border border-line text-ink text-sm',
  'placeholder:text-ink-faint',
  'transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]',
  'hover:border-line-strong',
  'focus:outline-none focus:border-accent focus:bg-overlay',
  'focus:shadow-[0_0_0_3px_var(--color-accent-wash)]',
  'disabled:opacity-50 disabled:cursor-not-allowed',
  // iOS zooms the viewport on focus for any input under 16px. That is a
  // horizontal-scroll bug in disguise, so data inputs stay at 16px on mobile.
  'text-base sm:text-sm',
)

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClasses, className)} {...props} />
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(inputClasses, 'h-auto min-h-24 py-2.5 leading-relaxed resize-y', className)}
      {...props}
    />
  )
})

/** Numeric input that keeps figures tabular and shows a unit affix. */
export const NumberInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { affix?: string; prefix?: string }
>(function NumberInput({ className, affix, prefix, ...props }, ref) {
  return (
    <div className="relative flex items-center">
      {prefix && (
        <span className="pointer-events-none absolute left-3 text-sm text-ink-muted tnum">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(
          inputClasses,
          'tnum',
          prefix && 'pl-7',
          affix && 'pr-10',
          className,
        )}
        {...props}
      />
      {affix && (
        <span className="pointer-events-none absolute right-3 text-xs text-ink-muted">
          {affix}
        </span>
      )}
    </div>
  )
})

export interface FieldProps {
  label: React.ReactNode
  optional?: boolean
  /** One plain sentence, written for someone new to trading. */
  tip?: React.ReactNode
  hint?: React.ReactNode
  error?: string | null
  children: (id: string) => React.ReactNode
  className?: string
}

/** Label + control + hint, wired with a generated id so the label always hits. */
export function Field({ label, optional, tip, hint, error, children, className }: FieldProps) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} optional={optional} tip={tip}>
        {label}
      </Label>
      {children(id)}
      {error ? (
        <p className="text-xs text-loss">{error}</p>
      ) : hint ? (
        <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>
      ) : null}
    </div>
  )
}
