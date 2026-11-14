import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) return <main className="state-screen"><div className="state-card" role="alert"><span className="eyebrow">DASHBOARD ERROR</span><h1>The dashboard could not render</h1><p>{this.state.error.message || 'An unexpected interface error occurred.'}</p><button className="retry-button" onClick={() => window.location.reload()}>Reload dashboard</button></div></main>;
    return this.props.children;
  }
}
