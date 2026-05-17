import React from 'react';
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return <div className="app-shell"><section className="card pad"><h1>Preview recovered</h1><p className="subtitle">This skeleton caught a render error so the studio can keep the preview alive.</p></section></div>;
    return this.props.children;
  }
}
