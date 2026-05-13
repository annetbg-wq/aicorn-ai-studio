import React from 'react';

interface OnboardingStepProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  illustration?: React.ReactNode;
  primaryAction: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export function OnboardingStep({
  step, totalSteps, title, description,
  illustration, primaryAction, secondaryAction, className = '',
}: OnboardingStepProps) {
  return (
    <div className={[
      'flex flex-col items-center text-center px-6 py-8 min-h-screen justify-between',
      className,
    ].join(' ')}>
      <div className="flex gap-1.5 self-start">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={[
              'h-1 rounded-full transition-all duration-200',
              i < step ? 'bg-[--vb-accent] w-8' : i === step ? 'bg-[--vb-accent] w-8' : 'bg-[--vb-border] w-4',
            ].join(' ')}
          />
        ))}
      </div>
      <div className="flex flex-col items-center gap-6 py-8 flex-1 justify-center max-w-xs">
        {illustration && (
          <div className="w-48 h-48 flex items-center justify-center text-[--vb-accent]">
            {illustration}
          </div>
        )}
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-[--vb-text] leading-tight">{title}</h2>
          <p className="text-sm text-[--vb-text-muted] leading-relaxed">{description}</p>
        </div>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={primaryAction.onClick}
          className="w-full py-3 px-6 rounded-[--vb-radius-lg] bg-[--vb-accent] text-[--vb-accent-fg] font-semibold text-base transition-opacity hover:opacity-90"
        >
          {primaryAction.label}
        </button>
        {secondaryAction && (
          <button
            onClick={secondaryAction.onClick}
            className="w-full py-3 px-6 rounded-[--vb-radius-lg] text-[--vb-text-muted] font-medium text-sm hover:text-[--vb-text] transition-colors"
          >
            {secondaryAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
