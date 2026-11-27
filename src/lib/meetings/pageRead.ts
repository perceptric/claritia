// How a public booking page reads its data (src/app/book, src/app/booking). A read that comes back empty means the
// address names nothing ("This page isn't here"). A read that fails (the database is down, a timeout, the server
// isn't set up) is DOWN, and the page says it didn't load, with Try again: a guest is never told a real link is gone.

export const DOWN = "down" as const;
export type Down = typeof DOWN;

/** The page's value, null when nothing is there, or DOWN when the read failed or there's no database to read. */
export async function pageRead<T>(load: (() => Promise<T | null>) | null): Promise<T | null | Down> {
  if (!load) return DOWN;
  try {
    return await load();
  } catch (e) {
    console.error("[book] page read failed", e);
    return DOWN;
  }
}
