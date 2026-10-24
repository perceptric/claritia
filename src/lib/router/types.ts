// The router (docs/router.md, docs/router-ux.md): the shapes shared by the engine, the checks, the server, the jobs
// and the screens. A router body is one version: its steps, rules, queues and territories. Runs in the browser and on
// the server.

/** A condition's test. "between" takes [low, high]; "one_of" and "not_one_of" take a list. */
export type Op = "is" | "is_not" | "one_of" | "not_one_of" | "contains" | "starts_with" | "filled" | "empty" | "gt" | "lt" | "between";

export const OPS: { value: Op; label: string }[] = [
  { value: "is", label: "is" },
  { value: "is_not", label: "is not" },
  { value: "one_of", label: "is one of" },
  { value: "not_one_of", label: "is not one of" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "filled", label: "is filled" },
  { value: "empty", label: "is empty" },
  { value: "gt", label: "is more than" },
  { value: "lt", label: "is less than" },
  { value: "between", label: "is between" },
];

/**
 * A test on one value of the lead. `field` names a fact (`contact.country`, `company.size`, `answer.q.budget`,
 * `utm.source`, `lead.score`, `lead.form`...). A list value can hold `t:<territory id>`, which stands for that
 * territory's countries.
 */
export type Cond = { field: string; op: Op; value?: string | number | (string | number)[] };

export type Rule = { id: string; name: string; match: "all" | "any"; conds: Cond[]; queue: string; on?: boolean };

export type Method = "rr" | "weighted" | "load";

export const METHODS: { value: Method; label: string }[] = [
  { value: "rr", label: "Round robin" },
  { value: "weighted", label: "Weighted" },
  { value: "load", label: "By load" },
];

export type Member = { user: string; weight: number };

/**
 * A queue shares leads between its members. Flexible skips a rep outside their working hours (when `hoursOnly`);
 * strict keeps the turn order and only skips reps who can't take leads at all (paused, out, over a cap).
 */
export type Queue = { id: string; name: string; method: Method; strict: boolean; hoursOnly: boolean; members: Member[] };

export type Territory = { id: string; name: string; countries: string[] };

export type WhenOut = "keep" | "backup" | "route";

export type RouterBody = {
  v: 1;
  spam: { on: boolean; disposable: boolean; fakeName: boolean; tooMany: boolean; freeMail: boolean; maxPerHour: number };
  account: { on: boolean; oppFirst: boolean; setCompanyOwner: boolean };
  keep: { on: boolean; whenOut: WhenOut };
  rules: { on: boolean; list: Rule[] };
  queues: Queue[];
  fallback: { kind: "user" | "queue"; id: string } | null;
  territories: Territory[];
};

export const emptyBody = (): RouterBody => ({
  v: 1,
  spam: { on: true, disposable: true, fakeName: true, tooMany: true, freeMail: false, maxPerHour: 5 },
  account: { on: true, oppFirst: true, setCompanyOwner: false },
  keep: { on: true, whenOut: "backup" },
  rules: { on: true, list: [] },
  queues: [],
  fallback: null,
  territories: [],
});

// Facts --------------------------------------------------------------------------------------------------------

/** One rep as the router sees them right now. Counts are of leads routed to them, in their own time zone's day and week. */
export type RepFacts = {
  name: string;
  member: boolean;
  tz: string;
  /** Paused until (epoch ms); Infinity is "until I turn it back on". */
  pausedUntil: number | null;
  /** Out of office until (epoch ms), from the calendar or dates set on Reps. */
  outUntil: number | null;
  backup: string | null;
  capDay: number | null;
  capWeek: number | null;
  today: number;
  week: number;
  meetingsWeek: number;
  /** Inside their working hours now (from their meeting hours); null when they have none set. */
  inHours: boolean | null;
};

export type Facts = {
  now: number;
  lead: {
    id: string;
    name: string;
    email: string | null;
    /** The email's class (work, free, role...) and domain. */
    emailClass: string | null;
    domain: string | null;
    firstName: string | null;
    lastName: string | null;
    /** Fills from this email in the last hour. */
    recent: number;
    /** Throwaway email domain (the identity cleaner's list). */
    disposable: boolean;
  };
  /** Every value a rule can test, by field name (see `Cond`). */
  values: Record<string, unknown>;
  /** The contact's owner: a Claritia user (a CRM owner is mapped through CRM owners). */
  owner: { user: string | null; crm: string | null } | null;
  company: { id: string; name: string; domain: string | null; owner: string | null; ownerCrm: string | null; oppOwner: string | null; oppName: string | null } | null;
  reps: Record<string, RepFacts>;
  /** Leads each rep got from each queue in the last 30 days, and when they last got one. */
  counts: Record<string, Record<string, { n: number; last: number }>>;
  lists: { allow: string[]; block: string[] };
};

// Results ------------------------------------------------------------------------------------------------------

/** Why a rep can't take a lead now. */
export type Why = "not_member" | "paused" | "out" | "cap_day" | "cap_week" | "hours";

export type SpamSignal = "disposable" | "blocked" | "fake_name" | "too_many" | "free_mail";

export type StepResult =
  | { step: "spam"; ok: boolean; off?: boolean; allowed?: boolean; checks: number; signals: SpamSignal[] }
  | {
      step: "account";
      ok: boolean;
      off?: boolean;
      company?: { id: string; name: string; domain: string | null };
      owner?: string;
      via?: "opp" | "company";
      opp?: string | null;
      miss?: "no_email" | "free_mail" | "no_company" | "no_owner" | "unmapped";
      unavailable?: { user: string; why: Why; until?: number | null };
      action?: WhenOut;
      backup?: string;
    }
  | {
      step: "keep";
      ok: boolean;
      off?: boolean;
      owner?: string;
      miss?: "no_owner" | "unmapped";
      unavailable?: { user: string; why: Why; until?: number | null };
      action?: WhenOut;
      backup?: string;
    }
  | { step: "rules"; ok: boolean; off?: boolean; rule?: { id: string; name: string; queue: string }; skipped: { id: string; name: string; failed: { cond: Cond; actual: unknown } | null }[] }
  | {
      step: "queue";
      ok: boolean;
      queue: { id: string; name: string; method: Method; strict: boolean };
      picked?: string;
      others: { user: string; n: number; why?: Why; until?: number | null }[];
      pickedN?: number;
      window: number;
    }
  | { step: "fallback"; ok: boolean; picked?: string; queue?: { id: string; name: string }; why?: Why | "none" }
  /** Assigned by hand from Unassigned (router_assign). */
  | { step: "hand"; ok: true; user: string; by_user: string | null };

export type Result =
  | { kind: "owner"; user: string; by: "account" | "keep" | "queue" | "fallback" | "hand"; queue?: string; rule?: string }
  | { kind: "held"; signals: SpamSignal[] }
  | { kind: "unassigned" };

export type Decision = { result: Result; steps: StepResult[] };

/** A saved run, as the log and Replay read it. */
export type Run = {
  id: string;
  contact_id: string | null;
  key: string;
  reason: Reason;
  version: number;
  result: Result;
  steps: StepResult[];
  facts: Facts;
  ms: number;
  created_at: string;
};

export type Reason = "form" | "import" | "crm" | "api" | "again" | "let_through" | "score" | "manual";

export const REASONS: Record<Reason, string> = {
  form: "Form",
  import: "Import",
  crm: "CRM",
  api: "API",
  again: "Route again",
  let_through: "Let through",
  score: "Lead score",
  manual: "By hand",
};
