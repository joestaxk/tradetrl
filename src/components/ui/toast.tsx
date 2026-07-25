import { Toaster as Sonner, toast as sonnerToast } from 'sonner'
import { AlertTriangle, Check, Info } from 'lucide-react'

/**
 * Sonner, skinned to the design system. Nothing here uses sonner's default
 * light card, its default icons or its default success green — those are the
 * three things that would make it read as a library default (§8).
 */
export function Toaster() {
  return (
    <Sonner
      position="bottom-center"
      offset={16}
      duration={3200}
      gap={8}
      visibleToasts={3}
      icons={{
        success: <Check className="size-4 text-win-bright" aria-hidden />,
        error: <AlertTriangle className="size-4 text-loss-bright" aria-hidden />,
        info: <Info className="size-4 text-accent-bright" aria-hidden />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: [
            'group pointer-events-auto flex w-full items-center gap-3',
            'rounded-xl border border-line-strong bg-overlay px-3.5 py-3',
            'shadow-[0_16px_48px_-12px_rgba(0,0,0,0.85)]',
            'font-sans text-sm text-ink',
          ].join(' '),
          title: 'font-medium text-ink text-[13px] leading-snug',
          description: 'text-[12px] text-ink-muted leading-relaxed mt-0.5',
          actionButton:
            'ml-auto shrink-0 rounded-lg bg-accent px-2.5 h-8 text-[12px] font-medium text-void hover:bg-accent-bright transition-colors',
          cancelButton:
            'shrink-0 rounded-lg border border-line-strong px-2.5 h-8 text-[12px] text-ink-dim hover:bg-raised transition-colors',
          icon: 'shrink-0',
        },
      }}
      style={
        {
          // Keep toasts clear of the mobile home indicator.
          '--offset-bottom': 'max(1rem, env(safe-area-inset-bottom))',
        } as React.CSSProperties
      }
    />
  )
}

export const toast = sonnerToast
