import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

interface CardHeaderProps { children: React.ReactNode; className?: string; }
interface CardBodyProps   { children: React.ReactNode; className?: string; }
interface CardFooterProps { children: React.ReactNode; className?: string; divider?: boolean; }

const paddingMap = { none: '', sm: 'p-4', md: 'p-6', lg: 'p-8' };

export function Card({ children, className = '', padding = 'md', hover = false, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={[
        'bg-[--vb-surface] border border-[--vb-border] rounded-[--vb-radius-lg]',
        'shadow-[--vb-shadow-sm] transition-all duration-200',
        hover ? 'cursor-pointer hover:shadow-[--vb-shadow-md] hover:border-[--vb-border-strong]' : '',
        paddingMap[padding],
        className,
      ].join(' ')}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardHeaderProps) {
  return <div className={`flex items-center justify-between mb-4 ${className}`}>{children}</div>;
}

export function CardBody({ children, className = '' }: CardBodyProps) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '', divider = false }: CardFooterProps) {
  return (
    <div className={[divider ? 'border-t border-[--vb-border] mt-4 pt-4' : 'mt-4', className].join(' ')}>
      {children}
    </div>
  );
}
