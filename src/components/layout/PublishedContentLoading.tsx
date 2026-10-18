import type { ReactNode } from "react";

/** A stable loading layout; the published HTML remains available without JavaScript. */
export function PublishedContentLoading({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="published-loading" role="status" aria-live="polite">
        <span className="sr-only">Loading saved measurements…</span>
        <div className="published-loading-heading" aria-hidden="true" />
        <div className="published-loading-description" aria-hidden="true" />
        <div className="published-loading-cards" aria-hidden="true">
          <div />
          <div />
          <div />
          <div />
        </div>
        <div className="published-loading-content" aria-hidden="true" />
      </div>
      <noscript>
        <style>{".published-loading { display: none; }"}</style>
        {children}
      </noscript>
    </>
  );
}
