import { Outlet } from 'react-router-dom';
import TabBar from './TabBar';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-md mx-auto px-4 pb-24 pt-6">
        <Outlet />
      </main>
      <TabBar />
    </div>
  );
}
