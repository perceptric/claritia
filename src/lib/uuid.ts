/** Whether v is a uuid, the shape of every row id. Checked before an id from outside reaches a query. */
export function isUuid(v: string): boolean;
export function isUuid(v: unknown): v is string;
export function isUuid(v: unknown): boolean {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
