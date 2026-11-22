import { isChunkLoadErrorMessage, resolveHttpErrorDefinition } from '@fnb/shared';
import * as React from 'react';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level fallback protecting the entire React tree before/outside React Router.
 */
export class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    const isChunk = isChunkLoadErrorMessage(this.state.error.message || '');
    const def = resolveHttpErrorDefinition({
      isChunkError: isChunk,
      isRuntimeError: !isChunk,
    });
    const isGuest =
      typeof window !== 'undefined' && window.location.pathname.startsWith('/qr');

    return (
      <div
        data-testid="app-fatal-error-boundary"
        className="flex min-h-screen w-full items-center justify-center bg-background p-4 text-foreground"
      >
        <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-md space-y-4">
          <div className="inline-flex rounded-full border border-rose-500/35 bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
            {def.statusLabel}
          </div>
          <h1 className="text-lg font-bold">
            {isGuest ? def.guestTitle : def.defaultTitle}
          </h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {isGuest ? def.guestDescription : def.defaultDescription}
          </p>
          <p className="text-xs text-muted-foreground">
            {isGuest ? def.guestRecoveryHint : def.recoveryHint}
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Tải lại trang
            </button>
            {!isGuest ? (
              <button
                type="button"
                onClick={() => {
                  window.location.href = '/pos';
                }}
                className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
              >
                Về trang chính POS
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}
