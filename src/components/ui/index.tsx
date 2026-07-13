import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
}

export function Button({ variant = 'primary', size = 'md', className = '', children, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-2xl transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-accent text-surface hover:bg-accent-dim',
    secondary: 'bg-surface border border-border text-ink hover:bg-surface-2',
    ghost: 'text-muted hover:text-ink hover:bg-ink/5',
  }
  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
  }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled} {...props}>
      {children}
    </button>
  )
}

interface CardProps {
  selected?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}

export function SelectCard({ selected, onClick, children, className = '' }: CardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
        selected
          ? 'border-accent bg-accent/10 shadow-lg shadow-accent/10 scale-[1.02]'
          : 'border-border bg-surface-2 hover:border-accent/40 hover:bg-surface-2/80'
      } ${className}`}
    >
      {children}
    </button>
  )
}

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / total) * 100
  return (
    <div className="w-full h-1 bg-surface-2 rounded-full overflow-hidden">
      <div
        className="h-full bg-accent transition-all duration-500 ease-out rounded-full"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function StepLayout({
  title,
  subtitle,
  children,
  step,
  totalSteps,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  step: number
  totalSteps: number
}) {
  return (
    <div className="flex flex-col h-full animate-fade-up">
      <div className="mb-8">
        <ProgressBar current={step} total={totalSteps} />
        <p className="text-xs text-muted mt-3">{step + 1} / {totalSteps}</p>
      </div>
      <h2 className="font-serif text-2xl font-medium text-ink mb-2 leading-snug">{title}</h2>
      {subtitle && <p className="text-muted text-sm mb-8 leading-relaxed">{subtitle}</p>}
      {!subtitle && <div className="mb-6" />}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
