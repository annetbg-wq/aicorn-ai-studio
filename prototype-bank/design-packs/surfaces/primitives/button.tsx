import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:   'bg-[--vb-accent] text-[--vb-accent-fg] hover:bg-[--vb-accent-hover] border-transparent',
  secondary: 'bg-[--vb-surface-alt] text-[--vb-text] hover:bg-[--vb-border] border-transparent',
  ghost:     'bg-transparent text-[--vb-text] hover:bg-[--vb-surface-alt] border-transparent',
  danger:    'bg-[--vb-danger] text-[--vb-danger-fg] hover:opacity-90 border-transparent',
  outline:   'bg-transparent text-[--vb-text] border-[--vb-border-strong] hover:bg-[--vb-surface-alt]',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center justify-center font-medium',
        'rounded-[--vb-radius-md] border transition-all duration-[--vb-duration-base]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[--vb-border-focus]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        sizeStyles[size],
        className,
      ].join(' ')}
    >
      {loading ? (
        <span className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}
