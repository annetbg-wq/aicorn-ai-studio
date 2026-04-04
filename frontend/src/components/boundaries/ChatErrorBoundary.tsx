import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ChatErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ChatErrorBoundary] Chat panel crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: 24,
          background: '#0d0d14',
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'system-ui, sans-serif',
          gap: 12,
        }}>
          <div style={{ fontSize: 28, opacity: 0.5 }}>💬</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
            Chat panel crashed
          </div>
          <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 260, lineHeight: 1.6, opacity: 0.6 }}>
            A React render error occurred in the chat panel.
            The preview is still running.
          </div>
          {this.state.errorMessage && (
            <div style={{
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 6,
              padding: '8px 12px',
              maxWidth: 280,
              color: '#f87171',
              wordBreak: 'break-all',
            }}>
              {this.state.errorMessage.slice(0, 200)}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: '' })}
            style={{
              marginTop: 4,
              padding: '8px 20px',
              borderRadius: 8,
              border: '1px solid rgba(99,102,241,0.4)',
              background: 'rgba(99,102,241,0.12)',
              color: '#818cf8',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
