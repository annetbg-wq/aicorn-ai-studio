import { ReactNode } from 'react';
import TabBar from './TabBar';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="pb-20">{children}</main>
      <TabBar />
    </div>
  );
}