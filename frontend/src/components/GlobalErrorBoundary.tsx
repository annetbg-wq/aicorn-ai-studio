import React from 'react';
import { metricsService } from '../services/MetricsService';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error:    Error | null;
}

export class GlobalErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[GlobalErrorBoundary]', error, info);
    metricsService.recordError('orchestrator', error.message, {
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
    });
    console.error('[GlobalErrorBoundary]', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        background: '#050505', flexDirection: 'column', gap: 20,
      }}>
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 14, padding: '32px 40px', maxWidth: 500, textAlign: 'center',
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>💥</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>
            Unexpected Error
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, fontFamily: 'monospace', wordBreak: 'break-all' }}>
            {this.state.error?.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '9px 22px', borderRadius: 8,
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Reload Studio
          </button>
        </div>
      </div>
    );
  }
}
