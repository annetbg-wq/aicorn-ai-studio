// src/layouts/RootLayout.tsx
// Simple style wrapper — does NOT call useStudio or render panels.
// App.tsx owns the layout and data flow.

import React from 'react';

interface RootLayoutProps {
  children: React.ReactNode;
}

export const RootLayout: React.FC<RootLayoutProps> = ({ children }) => (
  <div
    className="min-h-screen text-white selection:bg-white/20 overflow-hidden flex flex-col relative"
    style={{
      backgroundColor: '#f3f4f6',
      backgroundImage: 'none',
      backgroundSize: '24px 24px',
    }}
  >
    {/* Safe area top (mobile) */}
    <div className="h-[env(safe-area-inset-top)] bg-transparent" />

    <main className="flex-1 flex relative overflow-hidden">
      {children}
    </main>

    {/* Safe area bottom (mobile) */}
    <div className="h-[env(safe-area-inset-bottom)] bg-transparent" />
  </div>
);


