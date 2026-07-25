import * as SelectPrimitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from './cn'

/**
 * Fully skinned select. There is no native <select> anywhere in this app —
 * the OS dropdown is the single loudest "template" tell on a dark UI (§8).
 */

export const Select = SelectPrimitive.Root
export const SelectGroup = SelectPrimitive.Group
export const SelectValue = SelectPrimitive.Value

export const SelectTrigger = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-[10px] px-3',
        'bg-raised border border-line text-sm text-ink text-left',
        'transition-[border-color,background-color,box-shadow] duration-200 ease-[var(--ease-out-quint)]',
        'hover:border-line-strong',
        'focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-wash)]',
        'data-[placeholder]:text-ink-faint',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        '[&>span]:truncate',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          className="size-4 shrink-0 text-ink-muted transition-transform duration-200 ease-[var(--ease-out-quint)] group-data-[state=open]:rotate-180"
          aria-hidden
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
})

export const SelectContent = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, position = 'popper', ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={6}
        className={cn(
          'relative z-50 max-h-72 min-w-[--radix-select-trigger-width] overflow-hidden',
          'rounded-xl border border-line-strong bg-overlay',
          'shadow-[0_16px_48px_-12px_rgba(0,0,0,0.8)]',
          'data-[state=open]:animate-[scale-in_0.16s_var(--ease-out-quint)]',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-ink-muted">
          <ChevronUp className="size-3.5" aria-hidden />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-ink-muted">
          <ChevronDown className="size-3.5" aria-hidden />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
})

export const SelectItem = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'relative flex h-10 w-full cursor-pointer select-none items-center gap-2 rounded-lg pl-3 pr-9',
        'text-sm text-ink-dim outline-none',
        'transition-colors duration-150',
        'data-[highlighted]:bg-raised data-[highlighted]:text-ink',
        'data-[state=checked]:text-ink',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <span className="absolute right-3 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4 text-accent" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
    </SelectPrimitive.Item>
  )
})

export const SelectLabel = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'px-3 py-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint',
        className,
      )}
      {...props}
    />
  )
})

export const SelectSeparator = forwardRef<
  React.ComponentRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn('-mx-1.5 my-1.5 h-px bg-line', className)}
      {...props}
    />
  )
})
