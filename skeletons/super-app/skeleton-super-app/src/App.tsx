import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BottomTabs } from '@/components/BottomTabs';

const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Home = lazy(() => import('@/pages/Home'));
const Finance = lazy(() => import('@/pages/Finance'));
const Wellness = lazy(() => import('@/pages/Wellness'));
const Learning = lazy(() => import('@/pages/Learning'));
const Profile = lazy(() => import('@/pages/Profile'));

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <main className="flex-1">{children}</main>
      <BottomTabs />
    </div>
  );
}

function OnboardingGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isOnboarded } = useApp();
  const location = useLocation();
  if (!isOnboarded) return <Navigate to={ROUTES.onboarding} replace state={{ from: location }} />;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isOnboarded } = useApp();
  if (isOnboarded) return <Navigate to={ROUTES.home} replace />;
  return <>{children}</>;
}

function ProtectedPage({ children }: { children: ReactNode }): JSX.Element {
  return <OnboardingGuard><AppShell>{children}</AppShell></OnboardingGuard>;
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route path={ROUTES.onboarding} element={<GuestGuard><Onboarding /></GuestGuard>} />
              <Route path={ROUTES.home} element={<ProtectedPage><Home /></ProtectedPage>} />
              <Route path={ROUTES.finance} element={<ProtectedPage><Finance /></ProtectedPage>} />
              <Route path={ROUTES.wellness} element={<ProtectedPage><Wellness /></ProtectedPage>} />
              <Route path={ROUTES.learning} element={<ProtectedPage><Learning /></ProtectedPage>} />
              <Route path={ROUTES.profile} element={<ProtectedPage><Profile /></ProtectedPage>} />
              <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
