import React from 'react';

interface Props {
  children: React.ReactNode;
  onRetry?: () => void;
}

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class PreviewErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, errorMessage: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[PreviewErrorBoundary] Preview render crashed:', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '' });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
          height: '100%',
          padding: 32,
          background: '#080810',
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'system-ui, sans-serif',
          gap: 12,
        }}>
          <div style={{ fontSize: 32, opacity: 0.4 }}>🖼</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
            Preview render crashed
          </div>
          <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300, lineHeight: 1.6, opacity: 0.6 }}>
            A React render error occurred in the preview panel.
            The chat is still available.
          </div>
          {this.state.errorMessage && (
            <div style={{
              fontSize: 11,
              fontFamily: 'monospace',
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.2)',
              borderRadius: 6,
              padding: '8px 12px',
              maxWidth: 320,
              color: '#f87171',
              wordBreak: 'break-all',
            }}>
              {this.state.errorMessage.slice(0, 200)}
            </div>
          )}
          <button
            onClick={this.handleRetry}
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
