// The connector contract (docs/contact-sources.md Part 1). Every tool contacts come from is one connector: it
// reads pages of records with a cursor, turns webhooks into records, and (two-way ones) writes changes back.
// The pipeline (sync.ts) does the rest: mapping, cleaning, consent, links, echoes and the sync log.

import type { Target } from "../contacts/fields.ts";

export type Group = "crm" | "email" | "sheets" | "form" | "event" | "product" | "warehouse" | "api" | "ads" | "chat" | "files";
export type ObjectKind = "contacts" | "companies" | "opportunities" | "lists" | "suppressions" | "events" | "records";

/** One record as the tool has it. `id` is the tool's own id; `data` is flat (column → value). */
export type RawRecord = {
  id: string;
  updatedAt?: string | null;
  deleted?: boolean;
  data: Record<string, unknown>;
  /** Lists the record is on, for tools where lists come with their members. */
  lists?: { id: string; name: string }[];
};

/** A page and where to read from next. `more` false means caught up; the cursor is kept for the next run. */
export type Page = { records: RawRecord[]; cursor: string | null; more: boolean };

/** A list and its members by the tool's contact id or by email. */
export type ListPage = { lists: { id: string; name: string; contactIds?: string[]; emails?: string[]; replace: boolean }[]; cursor: string | null; more: boolean };

/** A meeting booked in a scheduling tool; `tracking` is a form fill's id when the booking link carried one. */
export type Booking = { tool: string; id: string; start: string | null; tracking: string | null; email: string | null };
export type HookEvent = { dedupe: string; object: "contacts" | "companies"; id: string; deleted?: boolean; record?: RawRecord; booking?: Booking };

export type PushChange = { localId: string; externalId: string | null; values: Record<string, unknown> };
/**
 * How a form destination's sync rules shape one push (docs/form-builder.md 7.4). owner: "set" writes the owner
 * column as usual, "keep" leaves the owner of a record the tool already has, "none" never writes it (the tool
 * assigns). autoAssign: Salesforce runs its own assignment rules on new records. create: what a new Salesforce record
 * is. optIn: the person ticked the consent box on this submission.
 */
export type PushOptions = {
  owner?: "set" | "keep" | "none";
  autoAssign?: boolean;
  create?: "Lead" | "Contact";
  optIn?: boolean;
  /**
   * Email tools (docs/integrations-plan.md step 1): the list, audience, form or group the person joins, its tags, and
   * whether they may get marketing email (they ticked the consent box, or the destination adds everyone).
   */
  list?: string;
  tags?: string[];
  marketing?: boolean;
};
/** A record in the tool with the same name at the same company domain, found before creating a new one. */
export type Similar = { id: string; email: string | null; name: string };
/** `gone`: the tool no longer has the record (deleted there and the news missed); the link goes, nothing is re-created. */
export type PushResult = { localId: string; externalId?: string; error?: string; gone?: boolean; skipped?: string };

export type Creds =
  | { type: "oauth"; access: string; refresh: string | null; expiresAt: number; extra?: Record<string, string> }
  | { type: "key"; values: Record<string, string> }
  | { type: "hook" };

export type SourceRow = {
  id: string;
  workspace_id: string;
  kind: string;
  name: string;
  account: string | null;
  status: string;
  settings: Settings;
  cursors: Record<string, string>;
  push_cursor: string | null;
};

export type Settings = {
  objects?: Partial<Record<ObjectKind, "both" | "in" | "off">>;
  query?: import("./sql.ts").WhQuery;
  every_min?: number;
  basis?: "opt_in" | "soft_opt_in" | "legitimate_interest" | "none";
  push_new?: "all" | "lifecycle" | "none";
  follow_deletes?: boolean;
  /** Two-way CRMs: write email and form activity to the CRM (on unless false). */
  activity?: boolean;
};

/** A contact event a CRM hears about (supabase/migrations/040_sync.sql activity_candidates). */
export type ActivityItem = { id: string; kind: string; at: string; contact_id: string; external_id: string; data: Record<string, unknown>; subject: string | null };
/** sent: the CRM has it. failed: the CRM said no. unknown: no clear answer, so it isn't sent again. */
export type ActivityResult = { id: string; status: "sent" | "failed" | "unknown"; external_id?: string; error?: string };

export type Ctx = {
  source: SourceRow;
  creds: Creds;
  /** JSON from the tool, with retries on 429 and 5xx, and the token refreshed once on a 401. */
  api<T = unknown>(url: string, init?: RequestInit & { auth?: boolean; timeoutMs?: number }): Promise<T>;
  /** A key the person pasted, or a value saved at connect. */
  secret(name: string): string;
  /** The access token, refreshed when it's about to expire. */
  token(): Promise<string>;
  /**
   * One call answering the Response as it came (file uploads read 308s and headers): the sign-in added unless `auth`
   * is false, refreshed once on a 401, within the call's time limit. No retries: the caller decides.
   */
  raw?(url: string, init?: RequestInit & { auth?: boolean; timeoutMs?: number }): Promise<Response>;
  signal?: AbortSignal;
  /** Tests only: reach local databases without TLS. */
  local?: boolean;
  /** A warehouse source's saved query, while it runs. */
  query?: import("./sql.ts").WhQuery;
};

export type HookRequest = { headers: Headers; body: string; url: string; method: string };

/** Where a fill's row goes: a spreadsheet (and its tab), a base's table, a database; `url` opens it. */
export type RowTarget = { id: string; name: string; url?: string; sheet?: string };
/** File tools (Next step 9): one upload, and a fill's uploads with the folder they go in. */
export type CopyFile = { name: string; type: string; bytes: Uint8Array };
export type CopyFill = { folder: string; files: CopyFile[] };
/** One form fill as a row: its id, when, the form, then a cell per question (named by its label). */
export type FillRow = { id: string; at: string; form: string; cells: { name: string; value: string }[] };

export type CompanyTarget = "skip" | "name" | "domain" | "industry" | "size" | "country" | `f.${string}`;
export type ContactMap = Record<string, Target | "score" | "score_band" | "owner_crm">;

export type Connector = {
  kind: string;
  /** What it pulls. */
  objects: ObjectKind[];
  /** Writes contact changes back. */
  twoWay?: boolean;
  /** Seconds between calls, to stay under half of the tool's limit. */
  gapMs?: number;
  /** The connected account: its id (for account-wide webhooks) and a label for the card. */
  account(ctx: Ctx): Promise<{ id: string; label: string }>;
  pull?(ctx: Ctx, object: Exclude<ObjectKind, "lists">, cursor: string | null): Promise<Page>;
  /** What it pulls when that depends on the source's settings (a warehouse query's target). */
  objectsFor?(source: SourceRow): ObjectKind[];
  lists?(ctx: Ctx, cursor: string | null): Promise<ListPage>;
  /** Records by id, for hooks that only say which record changed. */
  fetch?(ctx: Ctx, object: "contacts" | "companies", ids: string[]): Promise<RawRecord[]>;
  /** Check a webhook's signature; `secret` is the source's hook secret or the app's client secret. */
  verify?(req: HookRequest, secret: string): boolean;
  /** Webhook body → events. */
  parse?(body: unknown, headers: Headers): HookEvent[];
  /** For one webhook URL shared by every account (HubSpot): which account it's for. */
  hookAccount?(body: unknown): string | null;
  push?(ctx: Ctx, changes: PushChange[], o?: PushOptions): Promise<PushResult[]>;
  /** Email tools: the lists (audiences, forms, groups) a person can join, for the form's Sync tab. */
  audiences?(ctx: Ctx): Promise<{ id: string; name: string }[]>;
  /** Email tools that keep tags on a person. */
  tags?: boolean;
  /**
   * Sheets and databases (docs/integrations-plan.md step 2): one row per form fill in the destination's target (a
   * spreadsheet, a table, a database). Columns the target doesn't have yet are added. With `retry` (the delivery ran
   * before and may have landed), the target is searched for the fill's id first, so a retry never adds a second row.
   */
  append?(ctx: Ctx, target: RowTarget, row: FillRow, o: { retry: boolean }): Promise<{ externalId: string }>;
  /** The targets a fill can go to (Airtable's tables, Notion's databases), for the form's Sync tab. */
  targets?(ctx: Ctx): Promise<RowTarget[]>;
  /** Records with this first and last name and an email at this domain (the duplicate check in sync rules). */
  similar?(ctx: Ctx, p: { first: string; last: string; domain: string }): Promise<Similar[]>;
  /** Write email and form activity to the CRM, one result per item. */
  activity?(ctx: Ctx, items: ActivityItem[]): Promise<ActivityResult[]>;
  /** The CRM's users who can own a contact, for routing rules. */
  owners?(ctx: Ctx): Promise<{ id: string; label: string }[]>;
  /** The tool's columns a push can set, when it takes fewer than it sends us. */
  writable?: string[];
  /** Chat tools (docs/integrations-plan.md, Next step 5): post an alert to the channel (`target` for Teams). */
  alert?(ctx: Ctx, target: RowTarget | null, note: import("../chat/note.ts").ChatNote): Promise<void>;
  /**
   * File tools (docs/integrations-plan.md, Next step 9): copy a fill's uploads into a folder named after the fill,
   * inside `target` (S3: the bucket and prefix the connection names, so `target` may be null). Answers the fill's
   * folder. A run again finds what's there by name first and copies nothing twice.
   */
  copy?(ctx: Ctx, target: RowTarget | null, fill: CopyFill): Promise<{ id: string; url?: string }>;
  /** File tools: make a new folder to copy into, named `name`. */
  makeFolder?(ctx: Ctx, name: string): Promise<RowTarget>;
  /** The record's address in the tool, for the form's Submissions (a link back to what a delivery made). */
  link?(source: SourceRow, externalId: string, secret: (k: string) => string): string | undefined;
  /** Done once after connect: custom properties, webhook subscriptions. */
  setup?(ctx: Ctx, hookUrl: string): Promise<Record<string, string> | void>;
  /** The consent cell for a record: a basis, "unsubscribed" or "bounced", or null when the record doesn't say. */
  consent?(r: RawRecord): string | null;
  defaults: { contact: ContactMap; company?: Record<string, CompanyTarget>; valueMaps?: Record<string, Record<string, string>> };
  /** Guess targets for columns it doesn't know (forms, where every form has its own questions). */
  guess?: boolean;
};

export class AuthError extends Error {}
export class RateLimited extends Error {
  retryAfterS: number;
  constructor(message: string, retryAfterS: number) {
    super(message);
    this.retryAfterS = retryAfterS;
  }
}
