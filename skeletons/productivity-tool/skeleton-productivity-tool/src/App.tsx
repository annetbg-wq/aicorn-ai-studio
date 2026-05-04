import { lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { Sidebar } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { CommandPalette } from '@/components/CommandPalette';
import { ItemDetailSheet } from '@/components/ItemDetailSheet';
import { useKeyboard } from '@/hooks/useKeyboard';

const Workspace = lazy(() => import('@/pages/Workspace'));

function AppShell({ children }: { children: ReactNode }): JSX.Element {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useKeyboard([
    { key: 'k', meta: true, handler: openPalette },
    {
      key: 'escape',
      handler: () => {
        if (paletteOpen) closePalette();
      },
    },
  ]);

  return (
    <div className="flex h-screen w-full bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar onOpenCommand={openPalette} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ItemDetailSheet />
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
                <Route path={ROUTES.workspace} element={<Workspace />} />
                <Route path={ROUTES.workspaceById} element={<Workspace />} />
                <Route path="*" element={<Navigate to={ROUTES.workspace} replace />} />
              </Routes>
            </AppShell>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
