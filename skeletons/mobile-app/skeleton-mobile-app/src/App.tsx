import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BottomTabs } from '@/components/BottomTabs';

const Onboarding = lazy(() => import('@/pages/Onboarding'));
const Home = lazy(() => import('@/pages/Home'));
const Detail = lazy(() => import('@/pages/Detail'));
const Create = lazy(() => import('@/pages/Create'));
const Progress = lazy(() => import('@/pages/Progress'));
const Profile = lazy(() => import('@/pages/Profile'));

/**
 * Wraps tab-reachable pages with the bottom-tab shell.
 * Pages use safe-area utilities themselves; this just frames the canvas.
 */
function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <main className="flex-1">{children}</main>
      <BottomTabs />
    </div>
  );
}

/** Redirects to /onboarding when the profile is incomplete. */
function OnboardingGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isOnboarded } = useApp();
  const location = useLocation();
  if (!isOnboarded) {
    return <Navigate to={ROUTES.onboarding} replace state={{ from: location }} />;
  }
  return <>{children}</>;
}

/** Inverse guard — keeps onboarded users out of the wizard. */
function GuestGuard({ children }: { children: ReactNode }): JSX.Element {
  const { isOnboarded } = useApp();
  if (isOnboarded) return <Navigate to={ROUTES.home} replace />;
  return <>{children}</>;
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <Routes>
              <Route
                path={ROUTES.onboarding}
                element={
                  <GuestGuard>
                    <Onboarding />
                  </GuestGuard>
                }
              />

              <Route
                path={ROUTES.home}
                element={
                  <OnboardingGuard>
                    <AppShell>
                      <Home />
                    </AppShell>
                  </OnboardingGuard>
                }
              />

              <Route
                path={ROUTES.detail}
                element={
                  <OnboardingGuard>
                    <AppShell>
                      <Detail />
                    </AppShell>
                  </OnboardingGuard>
                }
              />

              <Route
                path={ROUTES.create}
                element={
                  <OnboardingGuard>
                    <AppShell>
                      <Create />
                    </AppShell>
                  </OnboardingGuard>
                }
              />

              <Route
                path={ROUTES.progress}
                element={
                  <OnboardingGuard>
                    <AppShell>
                      <Progress />
                    </AppShell>
                  </OnboardingGuard>
                }
              />

              <Route
                path={ROUTES.profile}
                element={
                  <OnboardingGuard>
                    <AppShell>
                      <Profile />
                    </AppShell>
                  </OnboardingGuard>
                }
              />

              <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
