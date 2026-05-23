import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; children: ReactNode }) {
  const variantClass = variant === 'primary' ? 'btn' : variant === 'secondary' ? 'btn secondary' : 'btn ghost';
  return <button className={`${variantClass} ${className}`.trim()} {...props}>{children}</button>;
}
