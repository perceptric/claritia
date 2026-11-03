// What cleaning a lead needs from its workspace: its custom contact fields and its own and partner domains.

import type pg from "pg";
import type { Ctx } from "../../src/lib/contacts/import.ts";
import type { CustomField } from "../../src/lib/records/fields.ts";

export async function ctxFor(pool: pg.Pool, ws: string): Promise<Ctx> {
  const [fields, settings] = await Promise.all([
    pool.query(`select key, label, type, options from fields where workspace_id = $1 and object = 'contact'`, [ws]),
    pool.query(`select own_domains, partner_domains from identity_settings where workspace_id = $1`, [ws]),
  ]);
  return { custom: fields.rows as CustomField[], own_domains: settings.rows[0]?.own_domains ?? [], partner_domains: settings.rows[0]?.partner_domains ?? [] };
}
