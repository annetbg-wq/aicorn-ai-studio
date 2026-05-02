import React, { useEffect, useState } from 'react';
import { OnboardingWizard } from './onboarding/OnboardingWizard';
import { initLocale } from './i18n/i18n';

interface AppShellProps {
  children: React.ReactNode;
  onboardingSteps?: Array<{ title: string; description: string; options?: string[] }>;
}

export function AppShell({ children, onboardingSteps }: AppShellProps) {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    initLocale();
    const done = localStorage.getItem('onboarding_complete');
    if (done !== 'true') setShowOnboarding(true);
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('onboarding_complete', 'true');
    window.dispatchEvent(new CustomEvent('onboarding-complete'));
    setShowOnboarding(false);
  };

  return (
    <>
      {children}
      {showOnboarding && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#07070b' }}>
          <OnboardingWizard steps={onboardingSteps ?? []} onComplete={handleOnboardingComplete} />
        </div>
      )}
    </>
  );
}
