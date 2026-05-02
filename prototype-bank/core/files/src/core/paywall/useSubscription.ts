import { useState } from 'react';

export function useSubscription() {
  const [isPremium, setIsPremium] = useState(() => localStorage.getItem('is_premium') === 'true');
  const [usageCount, setUsageCount] = useState(() => parseInt(localStorage.getItem('usage_count') ?? '0', 10));
  const FREE_LIMIT = 3;

  const upgrade = () => {
    localStorage.setItem('is_premium', 'true');
    setIsPremium(true);
    window.dispatchEvent(new CustomEvent('subscription-upgraded'));
  };

  const trackUsage = () => {
    const next = usageCount + 1;
    localStorage.setItem('usage_count', String(next));
    setUsageCount(next);
    return next;
  };

  const shouldShowPaywall = () => !isPremium && usageCount >= FREE_LIMIT;

  return { isPremium, usageCount, FREE_LIMIT, upgrade, trackUsage, shouldShowPaywall };
}
