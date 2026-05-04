import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { ROUTES } from '@/config/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingScreen } from '@/components/LoadingScreen';
import { BottomTabs } from '@/components/BottomTabs';

const Home = lazy(() => import('@/pages/Home'));
const Search = lazy(() => import('@/pages/Search'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const Cart = lazy(() => import('@/pages/Cart'));
const Checkout = lazy(() => import('@/pages/Checkout'));
const Wishlist = lazy(() => import('@/pages/Wishlist'));
const Account = lazy(() => import('@/pages/Account'));

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
                <Route path={ROUTES.home} element={<Home />} />
                <Route path={ROUTES.search} element={<Search />} />
                <Route path={ROUTES.product} element={<ProductDetail />} />
                <Route path={ROUTES.cart} element={<Cart />} />
                <Route path={ROUTES.checkout} element={<Checkout />} />
                <Route path={ROUTES.wishlist} element={<Wishlist />} />
                <Route path={ROUTES.account} element={<Account />} />
                <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
              </Routes>
            </AppShell>
          </Suspense>
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
