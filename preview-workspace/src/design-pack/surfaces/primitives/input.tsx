import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  icon,
  iconRight,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[--vb-text]"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3 text-[--vb-text-muted] pointer-events-none">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          {...props}
          className={[
            'w-full bg-[--vb-surface] text-[--vb-text] placeholder-[--vb-text-subtle]',
            'border border-[--vb-border] rounded-[--vb-radius-md]',
            'px-3 py-2 text-sm transition-colors duration-150',
            'focus:outline-none focus:border-[--vb-border-focus] focus:ring-1 focus:ring-[--vb-border-focus]',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-[--vb-danger] focus:border-[--vb-danger] focus:ring-[--vb-danger]' : '',
            icon ? 'pl-9' : '',
            iconRight ? 'pr-9' : '',
            className,
          ].join(' ')}
        />
        {iconRight && (
          <span className="absolute right-3 text-[--vb-text-muted]">
            {iconRight}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-[--vb-danger]">{error}</p>}
      {hint && !error && <p className="text-xs text-[--vb-text-muted]">{hint}</p>}
    </div>
  );
}
