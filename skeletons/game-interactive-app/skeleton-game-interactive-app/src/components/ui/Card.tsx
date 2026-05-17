import type { HTMLAttributes, ReactNode } from 'react';
export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <section className={`card pad ${className}`.trim()} {...props}>{children}</section>;
}
export function HeroCard({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <section className={`card hero ${className}`.trim()} {...props}>{children}</section>;
}
