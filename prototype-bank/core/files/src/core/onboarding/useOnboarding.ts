import { useState, useEffect } from 'react';

export function useOnboarding() {
  const [isComplete, setIsComplete] = useState(() => localStorage.getItem('onboarding_complete') === 'true');

  useEffect(() => {
    const handler = () => setIsComplete(true);
    window.addEventListener('onboarding-complete', handler);
    return () => window.removeEventListener('onboarding-complete', handler);
  }, []);

  const reset = () => {
    localStorage.removeItem('onboarding_complete');
    setIsComplete(false);
  };

  return { isComplete, reset };
}
