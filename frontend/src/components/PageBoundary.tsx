// Suspense + error boundary for lazily-loaded route chunks.
//
// Route-level code splitting (see App.tsx) means a page is a separate network request, and this
// app is served from a host measured stalling mid-transfer on cold requests. Without a boundary a
// failed chunk unmounts the subtree and leaves a blank panel with nothing to click — which is
// exactly the "it just doesn't load" symptom this whole change set exists to remove. The fallback
// keeps the shell (sidebar, header, Copilot) on screen and gives the officer a way out.
//
// Retry is a full reload, deliberately: React.lazy caches a rejected import promise for the life
// of the component, so re-rendering a failed lazy resolves to the same rejection. A reload is the
// one retry that is guaranteed to actually re-request the chunk.
import { Component, Suspense, type ReactNode } from "react";

function PageSkeleton() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
        <span className="text-xs tracking-wide text-slate-500">Loading…</span>
      </div>
    </div>
  );
}

function ChunkError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm rounded-lg border border-slate-800/60 bg-[#0c121e] p-5 text-center">
        <p className="text-sm font-semibold text-slate-200">This screen didn&apos;t finish loading</p>
        <p className="mt-1.5 text-xs text-slate-400">
          The connection dropped while fetching it. Nothing is lost — reload to try again.
        </p>
        <button
          onClick={onRetry}
          className="mt-4 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-medium text-cyan-400 transition-colors hover:bg-cyan-500/20"
        >
          Reload
        </button>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

export default function PageBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={<ChunkError onRetry={() => window.location.reload()} />}>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </ErrorBoundary>
  );
}

// For non-essential floating widgets (the Copilot). Renders nothing while loading and nothing if
// it fails — a widget that can't load must never take the shell down with it or cover the screen
// with an error card the officer didn't ask for.
export function WidgetBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary fallback={null}>
      <Suspense fallback={null}>{children}</Suspense>
    </ErrorBoundary>
  );
}
