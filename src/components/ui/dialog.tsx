import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { forwardRef } from 'react'
import { cn } from './cn'

/**
 * Dialog. On mobile this becomes a bottom sheet rather than a shrunken
 * desktop modal — the day-detail view is the densest screen in the app (§12)
 * and needs the full width plus a thumb-reachable close.
 */

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export const DialogOverlay = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-void/80 backdrop-blur-[3px]',
        'data-[state=open]:animate-[fade_0.2s_var(--ease-out-quint)]',
        className,
      )}
      {...props}
    />
  )
})

export const DialogContent = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: 'sm' | 'md' | 'lg'
    hideClose?: boolean
  }
>(function DialogContent({ className, children, size = 'md', hideClose, ...props }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed z-50 flex flex-col border border-line-strong bg-panel',
          'shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9)]',
          'focus:outline-none',
          // Mobile: full-width bottom sheet, capped so the page behind stays visible.
          'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl',
          'data-[state=open]:animate-[sheet-up_0.32s_var(--ease-out-quint)]',
          // Desktop: centred dialog.
          'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2',
          'sm:-translate-x-1/2 sm:-translate-y-1/2',
          'sm:max-h-[88dvh] sm:w-[calc(100vw-3rem)] sm:rounded-2xl',
          'sm:data-[state=open]:animate-[scale-in_0.22s_var(--ease-out-quint)]',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
          className,
        )}
        {...props}
      >
        {/* Grab handle: reads as a sheet on touch, invisible on desktop. */}
        <div className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-line-strong sm:hidden" />
        {children}
        {!hideClose && (
          <DialogPrimitive.Close
            className={cn(
              'absolute right-3 top-3 flex size-9 items-center justify-center rounded-lg',
              'text-ink-muted transition-colors duration-200',
              'hover:bg-raised hover:text-ink focus-visible:outline-none',
              'focus-visible:shadow-[0_0_0_2px_var(--color-accent-wash)]',
            )}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
})

export function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-1 border-b border-line px-4 py-4 pr-14 sm:px-6 sm:py-5',
        className,
      )}
      {...props}
    />
  )
}

export function DialogBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5', className)}
      {...props}
    />
  )
}

export function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col-reverse gap-2 border-t border-line px-4 py-3.5 sm:px-6',
        'sm:flex-row sm:justify-end',
        // Respect the iOS home indicator so the primary action is never under it.
        'pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:pb-3.5',
        className,
      )}
      {...props}
    />
  )
}

export const DialogTitle = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn('font-display text-xl leading-tight text-ink sm:text-2xl', className)}
      {...props}
    />
  )
})

export const DialogDescription = forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn('text-sm text-ink-muted', className)}
      {...props}
    />
  )
})
