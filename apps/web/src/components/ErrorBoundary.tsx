import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';

export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render error', error, info.componentStack);
  }
  override render() {
    if (this.state.error) {
      return this.props.fallback ?? <Crash onRetry={() => this.setState({ error: null })} />;
    }
    return this.props.children;
  }
}

function Crash({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">That page broke.</h1>
      <p className="mt-2 text-sm text-stone-600">Sorry about that. Reloading usually fixes it.</p>
      <div className="mt-6 flex justify-center gap-3">
        {onRetry && (
          <button className="text-sm font-medium text-brand-700 underline" onClick={onRetry}>
            Try again
          </button>
        )}
        <a className="text-sm font-medium text-stone-700 underline" href="/">
          Go home
        </a>
      </div>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <a className="mt-4 inline-block text-sm text-brand-700 underline" href="/">
        Back to CoopSwap
      </a>
    </div>
  );
}

export function RouteError() {
  const err = useRouteError();
  if (isRouteErrorResponse(err) && err.status === 404) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <a className="mt-4 inline-block text-sm text-brand-700 underline" href="/">
          Back to CoopSwap
        </a>
      </div>
    );
  }
  return <Crash />;
}
