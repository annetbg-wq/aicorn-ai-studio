import { Button } from "@/components/ui/button";
import React from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Settings = React.lazy(() => import('./pages/Settings'));

class RouteGuard extends React.Component<
  { name: string; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
          <div className="max-w-md text-center space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-lg font-semibold text-foreground">
              {this.props.name} failed to load
            </h2>
            <p className="text-sm text-muted-foreground">
              {this.state.error.message}
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => this.setState({ error: null })}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                Retry
              </Button>
              <Link to="/" className="px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium">
                Go Home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <HashRouter>
      <React.Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>}>
      <Routes>
        <Route path="/" element={<RouteGuard name="Dashboard"><Dashboard /></RouteGuard>} />
        <Route path="/settings" element={<RouteGuard name="Settings"><Settings /></RouteGuard>} />
      </Routes>
      </React.Suspense>
    </HashRouter>
  );
}
