// App addresses that a route file would catch first. /forms/<file> is the form script's route (v1.js and its hashed
// copies, src/app/forms/[file]), so a form's own page, /forms/<id> and below, would answer "Not found" on reload.
// The proxy rewrites those to the app's catch-all page; the address in the browser stays the same, and the app reads
// it from there (src/components/app/ClientApp.tsx).

export const APP_SHELL = "/app-shell";

/** Where the proxy sends an app address that a route would catch, or null to leave it alone. */
export function appShellPath(pathname: string): string | null {
  const m = pathname.match(/^\/forms\/([^/]+)(\/.*)?$/);
  if (!m) return null;
  // The script itself: v1.js and v1.<hash>.js.
  if (!m[2] && /\.js$/.test(m[1]!)) return null;
  return `${APP_SHELL}${pathname}`;
}
