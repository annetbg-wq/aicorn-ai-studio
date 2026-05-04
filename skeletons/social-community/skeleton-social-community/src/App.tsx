import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BottomTabs } from '@/components/BottomTabs';

const Feed = lazy(() => import('@/pages/Feed'));
const Explore = lazy(() => import('@/pages/Explore'));
const Create = lazy(() => import('@/pages/Create'));
const Notifications = lazy(() => import('@/pages/Notifications'));
const Profile = lazy(() => import('@/pages/Profile'));
const PostDetail = lazy(() => import('@/pages/PostDetail'));

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-background">
      <main className="flex-1">{children}</main>
      <BottomTabs />
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <Suspense fallback={<LoadingScreen />}>
            <AppShell>
              <Routes>
                <Route path={ROUTES.feed} element={<Feed />} />
                <Route path={ROUTES.explore} element={<Explore />} />
                <Route path={ROUTES.create} element={<Create />} />
                <Route path={ROUTES.notifications} element={<Notifications />} />
                <Route path={ROUTES.myProfile} element={<Profile />} />
                <Route path={ROUTES.profile} element={<Profile />} />
                <Route path={ROUTES.postDetail} element={<PostDetail />} />
                <Route path="*" element={<Navigate to={ROUTES.feed} replace />} />
              </Routes>
            </AppShell>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
