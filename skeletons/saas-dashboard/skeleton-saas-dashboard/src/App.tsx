import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const DataView = lazy(() => import('@/pages/DataView'));
const Settings = lazy(() => import('@/pages/Settings'));

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
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
                <Route path={ROUTES.dashboard} element={<Dashboard />} />
                <Route path={ROUTES.data} element={<DataView />} />
                <Route path={ROUTES.settings} element={<Settings />} />
                <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
              </Routes>
            </AppShell>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
