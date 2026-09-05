import { Component, type ReactNode } from 'react';

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen grid place-items-center p-6 bg-[var(--bg)]">
          <div className="card p-8 max-w-md text-center flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[var(--danger-soft)] border border-[var(--danger-border)] grid place-items-center text-xl text-[var(--danger-strong)]">!</div>
            <h1 className="text-lg font-semibold text-[var(--text)]">Terjadi kesalahan</h1>
            <p className="text-sm text-[var(--text-2)] break-words">{this.state.error.message || 'Kesalahan tidak diketahui.'}</p>
            <button className="btn-primary" onClick={() => location.reload()}>Muat Ulang</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}