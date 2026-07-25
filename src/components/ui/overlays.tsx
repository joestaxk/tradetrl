import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import { forwardRef } from 'react'
import { cn } from './cn'

const surface = cn(
  'z-50 rounded-xl border border-line-strong bg-overlay',
  'shadow-[0_16px_48px_-12px_rgba(0,0,0,0.8)]',
  'data-[state=open]:animate-[scale-in_0.16s_var(--ease-out-quint)]',
)

/* ----------------------------------------------------------------- Tooltip */

export const TooltipProvider = TooltipPrimitive.Provider
export const TooltipRoot = TooltipPrimitive.Root
export const TooltipTrigger = TooltipPrimitive.Trigger

export const TooltipContent = forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(surface, 'max-w-64 px-2.5 py-1.5 text-xs leading-relaxed text-ink-dim', className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})

/** Tooltip in one line, for the many single-purpose icon buttons. */
export function Tip({
  label,
  children,
  side = 'top',
}: {
  label: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipRoot>
  )
}

/* ----------------------------------------------------------------- Popover */

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor

export const PopoverContent = forwardRef<
  React.ComponentRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = 'center', sideOffset = 6, ...props }, ref) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={cn(surface, 'w-72 max-w-[calc(100vw-2rem)] p-3.5 outline-none', className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
})

/* --------------------------------------------------------------- Dropdown */

export const Dropdown = DropdownPrimitive.Root
export const DropdownTrigger = DropdownPrimitive.Trigger
export const DropdownGroup = DropdownPrimitive.Group

export const DropdownContent = forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>
>(function DropdownContent({ className, sideOffset = 6, align = 'end', ...props }, ref) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        className={cn(surface, 'min-w-52 max-w-[calc(100vw-2rem)] overflow-hidden p-1.5', className)}
        {...props}
      />
    </DropdownPrimitive.Portal>
  )
})

export const DropdownItem = forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { tone?: 'default' | 'danger' }
>(function DropdownItem({ className, tone = 'default', ...props }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        'flex h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5',
        'text-[13px] outline-none transition-colors duration-150',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        tone === 'default' && 'text-ink-dim data-[highlighted]:bg-raised data-[highlighted]:text-ink',
        tone === 'danger' && 'text-loss data-[highlighted]:bg-loss-wash',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
        className,
      )}
      {...props}
    />
  )
})

export const DropdownLabel = forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>
>(function DropdownLabel({ className, ...props }, ref) {
  return (
    <DropdownPrimitive.Label
      ref={ref}
      className={cn('px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-faint', className)}
      {...props}
    />
  )
})

export const DropdownSeparator = forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>
>(function DropdownSeparator({ className, ...props }, ref) {
  return (
    <DropdownPrimitive.Separator
      ref={ref}
      className={cn('-mx-1.5 my-1.5 h-px bg-line', className)}
      {...props}
    />
  )
})
