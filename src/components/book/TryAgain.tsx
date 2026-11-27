"use client";

// Try again on a booking page that didn't load (src/app/book/views.tsx Down): reloads this same address.
export function TryAgain() {
  return (
    <button type="button" className="cb-btn" onClick={() => window.location.reload()}>
      Try again
    </button>
  );
}
