// What identity's modules share: the database they're given, one-transaction work, the evidence row, the
// policy and time constants, and following a merged person to the one it became.

export type Db = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, any>[]; rowCount: number | null }> }; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Client = Db & { release: () => void };

export type Pool = { connect: () => Promise<Client> };

/** Runs fn in one transaction on its own connection: committed when it returns, rolled back when it throws. */
export async function withTx<T>(pool: Pool, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const DAY = 86400_000;

export const BACKFILL_DAYS = 90;

export const TAINT_DAYS = 30;

export const IDENTITY_POLICIES = ["strict", "notice"];

export type Evidence = {
  id: string;
  workspace_id: string;
  site_id: string | null;
  device_id: string | null;
  session_id: string | null;
  source: string;
  level: "verified" | "asserted" | "inferred";
  identifiers: { kind: string; value: string }[];
  hard_edge: boolean;
  extra: Record<string, unknown> | null;
  server_at: Date;
};

/** Follows merges to the person that holds the identifiers now. */
export async function resolve(db: Db, id: string | null): Promise<string | null> {
  let cur = id;
  for (let i = 0; cur && i < 20; i++) {
    const r = await db.query(`select merged_into from persons where id = $1`, [cur]);
    const next = r.rows[0]?.merged_into ?? null;
    if (!next) return cur;
    cur = next;
  }
  return cur;
}
