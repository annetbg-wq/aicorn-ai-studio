import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LoadingScreen } from '@/components/LoadingScreen';

interface RouteGuardProps {
  children: React.ReactNode;
}

export function RouteGuard({ children }: RouteGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const onboardingComplete = localStorage.getItem('onboarding_complete');
    if (onboardingComplete !== 'true' && location.pathname !== '/onboarding') {
      navigate('/onboarding', { replace: true });
    } else {
      setChecking(false);
    }
  }, [navigate, location.pathname]);

  if (checking) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
}
<!--END-->