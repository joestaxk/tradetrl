import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from './cn'

/* -------------------------------------------------------------------- Card */

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function Card({ className, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-[14px] border border-line bg-panel',
          // Elevation by border + a whisper of inset light, never color blocking.
          'shadow-[0_1px_0_0_rgba(255,255,255,0.025)_inset]',
          className,
        )}
        {...props}
      />
    )
  },
)

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex items-start justify-between gap-3 px-4 py-3.5 sm:px-5', className)}
      {...props}
    />
  )
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('text-[13px] font-medium uppercase tracking-wider text-ink-muted', className)}
      {...props}
    />
  )
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', className)} {...props} />
}

/* ------------------------------------------------------------------- Badge */

const badge = cva(
  'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-line-strong bg-raised text-ink-dim',
        win: 'border-win-edge bg-win-wash text-win-bright',
        loss: 'border-loss-edge bg-loss-wash text-loss-bright',
        flat: 'border-line-strong bg-flat-wash text-ink-muted',
        accent: 'border-accent-edge bg-accent-wash text-accent-bright',
        caution: 'border-caution/25 bg-caution-wash text-caution',
      },
      size: {
        sm: 'h-5 px-2 text-[11px]',
        md: 'h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'sm' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badge> {}

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badge({ tone, size }), className)} {...props} />
}

/* --------------------------------------------------------------- Separator */

export function Divider({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} {...props} />
}

/* ---------------------------------------------------------------- Skeleton */

/** Skeletons, never spinners (§8). Shaped like the content they replace. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton', className)} {...props} />
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-3.5"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- Empty state */

/**
 * Empty states read as intentional, never as a bug (§7). Each one names what
 * would fill it and offers the single action that does so.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: string
  body?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-xl border border-line bg-raised text-ink-faint [&_svg]:size-5">
          {icon}
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <p className="font-display text-lg text-ink">{title}</p>
        {body && <p className="max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- Page title */

export function PageTitle({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow?: string
  title: string
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint">
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl leading-none text-ink sm:text-[28px]">{title}</h1>
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  )
}
