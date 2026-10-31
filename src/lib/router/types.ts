// The router (docs/router.md, docs/router-ux.md): the shapes shared by the engine, the checks, the server, the jobs
// and the screens. A router body is one version: its steps, rules, queues and territories. Runs in the browser and on
// the server.

/** A condition's test. "between" takes [low, high]; "one_of" and "not_one_of" take a list. */
export type Op = "is" | "is_not" | "one_of" | "not_one_of" | "contains" | "starts_with" | "filled" | "empty" | "gt" | "gte" | "lt" | "lte" | "between";

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
  { value: "gte", label: "is at least" },
  { value: "lt", label: "is less than" },
  { value: "lte", label: "is at most" },
  { value: "between", label: "is between" },
];

/**
 * A test on one value of the lead. `field` names a fact (`contact.country`, `company.size`, `answer.q.budget`,
 * `utm.source`, `lead.score`, `lead.form`...). A list value can hold `t:<territory id>`, which stands for that
 * territory's countries.
 */
export type Cond = { field: string; op: Op; value?: string | number | (string | number)[] };

/**
 * What a matching rule does (docs/routing-chat-plan.md Part 3.3): send to its queue (the default, and what older
 * versions without `then` mean), send to the company's owner (the rep on its open deal first when the account step
 * says so, else the company's owner, else the contact's owner), or hold the lead for review.
 */
export type Then = "queue" | "owner" | "hold" | "user";

/**
 * `meet`: the meeting type a form offers the lead this rule routes (docs/scheduling-plan.md 12.5), else the form's own.
 * `then: "user"` (v2): straight to one person, `user`.
 */
export type Rule = { id: string; name: string; match: "all" | "any"; conds: Cond[]; queue: string; on?: boolean; then?: Then; meet?: string; user?: string };

export type Method = "rr" | "weighted" | "load";

export const METHODS: { value: Method; label: string }[] = [
  { value: "rr", label: "Take turns" },
  { value: "weighted", label: "Some get more" },
  { value: "load", label: "Fewest meetings first" },
];

export type Member = { user: string; weight: number };

/**
 * A queue shares leads between its members. Flexible skips a rep outside their working hours (when `hoursOnly`);
 * strict keeps the turn order and only skips reps who can't take leads at all (paused, out, over a cap).
 */
export type Queue = { id: string; name: string; method: Method; strict: boolean; hoursOnly: boolean; members: Member[] };

export type Territory = { id: string; name: string; countries: string[] };

/**
 * A company type (docs/app-structure.md Part 5): a named kind of company, like "Enterprise: over 1,000 people". The
 * engine works out which types a lead's company is before the rules run, as the value of `company.type`, so a rule can
 * say "Company type is Enterprise". Rules use the name.
 */
export type Segment = { id: string; name: string; match: "all" | "any"; conds: Cond[] };

export type WhenOut = "keep" | "backup" | "route";

/**
 * Response time (docs/router.md Part 17): after a lead is routed, the rep has `minutes` to act (a note, a finished
 * task, a meeting, or Mark contacted). They're nudged at `nudge` minutes; at the deadline the lead is routed again
 * without them, given to `manager`, or only the rep is told.
 */
export type Sla = { on: boolean; minutes: number; nudge: number | null; next: "route" | "manager" | "nudge"; manager: string | null };

export const SLA_MINUTES = [5, 15, 30, 60, 120, 240, 480, 1440, 2880];

export const defaultSla = (): Sla => ({ on: false, minutes: 60, nudge: 30, next: "route", manager: null });

/** Whose ownership is kept first (docs/routing-workflow.md Section 10). */
export type OwnerKind = "company" | "contact";

/**
 * The unavailable-recipient fallback (docs/routing-workflow.md Section 7): what happens when a rule or Everyone else
 * chose a destination that has nobody who can take the lead. One hop, then review. `default`: Everyone else's
 * destination (how v1 bodies have always worked).
 */
export type Backup = { kind: "review" } | { kind: "user"; id: string } | { kind: "queue"; id: string } | { kind: "default" };

/**
 * Who this policy may assign to (docs/routing-workflow.md Section 10): `everyone` is every workspace member (every v1
 * body); otherwise the people named and the current members of the teams named.
 */
export type Scope = { everyone: boolean; people: string[]; teams: string[] };

export type RouterBody = {
  /**
   * 1: every body made before policies, with its exact live semantics kept (docs/routing-current-to-target.md Part 3).
   * 2: the spec's semantics: "is not" is false on unknown, ranges are ranges, ownership follows `ownership.order` and
   * `scope`, and a destination with nobody goes to `backup` once, then review.
   */
  v: 1 | 2;
  spam: { on: boolean; disposable: boolean; fakeName: boolean; tooMany: boolean; freeMail: boolean; maxPerHour: number };
  account: { on: boolean; oppFirst: boolean; setCompanyOwner: boolean };
  keep: { on: boolean; whenOut: WhenOut };
  rules: { on: boolean; list: Rule[] };
  queues: Queue[];
  fallback: { kind: "user" | "queue"; id: string; meet?: string } | null;
  territories: Territory[];
  /** Left out by versions made before company types. */
  segments?: Segment[];
  /** Left out by versions made before response times. */
  sla?: Sla;
  /**
   * Left out by versions made before Routing's Safeguards. `noTimes`: when the lead's rep has no free times, the lead
   * sees the form's message and gets the rep's times by email once there are some (meeting_book_later), for every
   * form, as a form's own "Email times later" does.
   */
  notify?: { noTimes: boolean };
  /** v2. Left out: every member (v1). */
  scope?: Scope;
  /** v2. The order existing owners are kept in; empty keeps none. `capBlocksNew`: a member at their cap can't become a new owner. */
  ownership?: { order: OwnerKind[]; capBlocksNew: boolean };
  /** v2. Left out: review (v2), Everyone else then Unassigned (v1). */
  backup?: Backup;
  /** The person responsible for this policy's review items; left out, a workspace owner. */
  review?: { owner: string | null };
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
  sla: defaultSla(),
  notify: { noTimes: true },
});

/** A new policy with the spec's semantics (v2): company owner then contact owner, a named scope, review as backup. */
export const specBody = (o: { people?: string[]; teams?: string[]; reviewer?: string | null } = {}): RouterBody => ({
  ...emptyBody(),
  v: 2,
  account: { on: true, oppFirst: false, setCompanyOwner: false },
  keep: { on: true, whenOut: "route" },
  scope: { everyone: false, people: [...(o.people ?? [])], teams: [...(o.teams ?? [])] },
  ownership: { order: ["company", "contact"], capBlocksNew: true },
  backup: { kind: "review" },
  review: { owner: o.reviewer ?? null },
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

/** A team as the database has it now (routing_teams): stable member order and the persisted next position. */
export type TeamFacts = {
  id: string;
  name: string;
  method: Method;
  strict: boolean;
  hoursOnly: boolean;
  /** The position the next turn starts from. */
  next: number;
  members: { user: string; weight: number; position: number }[];
};

/** Where a value came from: this submission's answer, the CRM, enrichment, or a test override. */
export type Provenance = { source: "form" | "crm" | "enrichment" | "test" | "handoff" | "review"; field?: string; by?: string; at?: number };

/** Something wrong with the input itself that a person has to look at. */
export type InputIssue = { code: "source_mapping_mismatch"; field: string; detail?: string };

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
  /** Reps who let this lead wait past its response time: routing it again skips them. */
  passed?: string[];
  /** Teams by the body's queue id, as the database has them (members, order, next position). Left out: the body's own. */
  teams?: Record<string, TeamFacts>;
  /** How the company was found: the contact's own link, one domain match, several (ambiguous) or none. */
  companyMatch?: { kind: "linked" | "domain" | "ambiguous" | "none"; count: number };
  /** Where each value came from, by field name. */
  provenance?: Record<string, Provenance>;
  issues?: InputIssue[];
};

// Results ------------------------------------------------------------------------------------------------------

/** Why a rep can't take a lead now. */
export type Why = "not_member" | "paused" | "out" | "cap_day" | "cap_week" | "hours" | "passed" | "out_of_scope";

export type SpamSignal = "disposable" | "blocked" | "fake_name" | "too_many" | "free_mail" | "rule";

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
  | {
      step: "rules";
      ok: boolean;
      off?: boolean;
      rule?: { id: string; name: string; queue: string; then?: Then; user?: string };
      owner?: string;
      unavailable?: { user: string; why: Why; until?: number | null };
      skipped: { id: string; name: string; failed: { cond: Cond; actual: unknown } | null }[];
      /** Rules after the one that matched: never looked at (docs/routing-workflow.md Section 11). */
      notEvaluated?: { id: string; name: string }[];
    }
  | {
      step: "queue";
      ok: boolean;
      queue: { id: string; name: string; method: Method; strict: boolean };
      picked?: string;
      others: { user: string; n: number; why?: Why; until?: number | null }[];
      pickedN?: number;
      window: number;
      /** The team's persisted next position when it takes turns from the database's queue. */
      next?: number;
      /** The picked member already owns the contact: kept, no turn taken. */
      retained?: boolean;
    }
  /** v2: a held input problem (a form value of the wrong type, several companies that could be this one). */
  | { step: "check"; ok: false; reason: HoldReason; field?: string; count?: number }
  /** v2: existing owners in the policy's order, each picked or skipped with a reason. */
  | {
      step: "owners";
      ok: boolean;
      off?: boolean;
      order: OwnerKind[];
      candidates: { kind: OwnerKind; user: string | null; via?: "opp" | "company"; miss?: "no_owner" | "unmapped" | "no_company" | "same_person"; why?: Why; until?: number | null; picked?: boolean }[];
      owner?: string;
    }
  /** v2: the destination had nobody; its one backup hop, or review. */
  | { step: "backup"; ok: boolean; from: { kind: "queue" | "user"; id: string }; to?: { kind: "queue" | "user"; id: string; name: string }; picked?: string; why?: Why | "same_destination" | "review" | "none" }
  | { step: "fallback"; ok: boolean; picked?: string; queue?: { id: string; name: string }; why?: Why | "none" }
  /** The rep before didn't act within the response time; the lead was passed on. */
  | { step: "sla"; ok: false; user: string; minutes: number }
  /** Assigned by hand from Unassigned (router_assign), or to the manager after a missed response time. */
  | { step: "hand"; ok: true; user: string; by_user: string | null };

/** Why a lead waits for a person: junk, a rule that holds, a form value of the wrong type, several possible companies. */
export type HoldReason = "spam" | "rule" | "source_mapping_mismatch" | "multiple_companies";

/**
 * `effect`: a new owner (a quota charge, and a queue turn when a team picked them) or the same owner kept (neither).
 * `by` "rule": a rule's own person (v2); "backup": the unavailable-recipient fallback (v2).
 */
export type Result =
  | { kind: "owner"; user: string; by: "account" | "keep" | "queue" | "fallback" | "hand" | "rule" | "backup"; queue?: string; rule?: string; effect?: "new" | "retained" }
  | { kind: "held"; signals: SpamSignal[]; reason?: HoldReason }
  | { kind: "unassigned"; reason?: "no_eligible_recipient" | "no_default" };

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

export type Reason = "form" | "import" | "crm" | "api" | "again" | "let_through" | "score" | "manual" | "sla" | "booking";

export const REASONS: Record<Reason, string> = {
  form: "Form",
  import: "Import",
  crm: "CRM",
  api: "API",
  again: "Route again",
  let_through: "Let through",
  score: "Lead score",
  manual: "By hand",
  sla: "Response time",
  booking: "Meeting booked",
};
