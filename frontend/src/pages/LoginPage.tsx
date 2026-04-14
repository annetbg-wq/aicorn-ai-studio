import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const DEV_BYPASS_KEY = 'AIC_DEV_AUTH_BYPASS';

function isLocalDevHost(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export const LoginPage: React.FC = () => {
  const { signInWithGoogle } = useAuth();
  const [busy, setBusy] = React.useState(false);

  const handleGoogle = async () => {
    setBusy(true);
    try { await signInWithGoogle(); }
    catch { setBusy(false); }
  };

  const handleDevBypass = () => {
    try {
      localStorage.setItem(DEV_BYPASS_KEY, '1');
      window.location.reload();
    } catch {
      // ignore storage errors in local dev
    }
  };

  const showDevBypass = isLocalDevHost();

  return (
    <div className="h-screen w-full flex items-center justify-center bg-[#050505] relative overflow-hidden">
      {/* Subtle grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      {/* Glow accent */}
      <div
        className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-8 px-6 max-w-sm w-full">
        {/* Logo / brand */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <line x1="12" y1="22" x2="12" y2="15.5" />
              <polyline points="22 8.5 12 15.5 2 8.5" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white/90 tracking-tight">
              AI Studio
            </h1>
            <p className="text-xs text-white/30 mt-1">
              Sign in to continue
            </p>
          </div>
        </div>

        {/* Sign in card */}
        <div className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] p-6 backdrop-blur-sm">
          <button
            onClick={handleGoogle}
            disabled={busy}
            className="w-full flex items-center justify-center gap-3 h-11 rounded-lg bg-white/[0.06] border border-white/[0.08] text-white/80 text-sm font-medium transition-all hover:bg-white/[0.1] hover:border-white/[0.14] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
          >
            {/* Google icon */}
            <svg width="16" height="16" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 019.5 24c0-1.59.28-3.14.76-4.59l-7.98-6.19A23.998 23.998 0 000 24c0 3.77.9 7.35 2.56 10.53l7.97-5.94z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 5.94C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            {busy ? 'Redirecting…' : 'Continue with Google'}
          </button>

          {showDevBypass && (
            <button
              onClick={handleDevBypass}
              className="mt-3 w-full flex items-center justify-center gap-2 h-10 rounded-lg bg-purple-500/15 border border-purple-400/30 text-purple-300 text-sm font-semibold transition-all hover:bg-purple-500/20 hover:border-purple-300/40 active:scale-[0.98]"
              title="Localhost only test login bypass"
            >
              🧪 Test Login (localhost)
            </button>
          )}
        </div>

        <p className="text-[11px] text-white/15 text-center leading-relaxed">
          By signing in you agree to the terms of service
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
