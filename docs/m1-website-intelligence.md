# M1 Website Intelligence: plan and status

The plan and status record for M1 from `docs/marketing-platform.md`. It covers M1's scope, how the parts fit together, the wire formats, the parts of each spec M1 uses, the screens, the files, jobs and tests as they are, and what is built (Part 12).

Rules come from three specs, and this plan doesn't repeat them:

| Spec | What it settles |
|---|---|
| `docs/identity.md` | Device ids, cookies, install modes, evidence levels, stitching rules, account resolution, erasure |
| `docs/account-intelligence.md` Part 3 | Region policy, GPC, never-collect list, retention, data requests |
| `docs/account-intelligence.md` Parts 5, 7, 8 | Company resolution, website signals, fit, intent, stage, priority |

---

## Part 1. Scope

### 1.1 What a customer can do at the end of M1

1. Add a site in Settings, choose an install mode, paste one tag (or set the proxy path), and see "Receiving events" within a minute.
2. Watch **Visitors**: live visits with company, country, pages and time, plus "Unknown" for unmatched visits.
3. Open **Accounts**: every company that visited, with fit, intent, temperature, stage, people and last signal.
4. Open an **Account page**: why-now line, timeline of sessions and pages, known people, firmographics, and score details.
5. Open a **Person page**: identifiers with levels, devices, evidence, sessions, plus Unmerge, Unlink and Erase.
6. Get a **Slack alert** when a target account heats up.
7. See hot accounts **pushed to Omniscient** as an activity on the account (once the Omniscient API from `docs/marketing-platform.md` 7.1 is live).
8. Handle privacy requests from the **Privacy** screen and the API.

### 1.2 In and out

| In M1 | Later |
|---|---|
| Script, collect, sessions, bots, region policy, GPC, consent, cookieless mode | ClickHouse (Growth) |
| Install modes A to D, proxy recipes, health check | WordPress plugin (week 9) |
| Identity: evidence, stitching, backfill, undo, rebuild, erasure | Calendly and Typeform adapters (with M6) |
| Signed and unsigned identify, form capture, HubSpot and Marketo form adapters | `hubspotutk` lookup (with the HubSpot sync in M2) |
| Company match: IPinfo, IP cache, learned networks, domain aliases, redirects | Snitcher fallback, bring your own key for 6sense and Demandbase |
| Enrichment: Coresignal company data | People suggestions, tech scan, job boards, news |
| Website signals, fit v0 (ICP rules), intent, stage, temperature, priority | Fit v1 (learned), backtests (M7) |
| Visitors, Accounts, Account, Person, Sites, Identity, ICP, Privacy screens | Reports (M8) |
| Slack alerts, basic Omniscient push | Full routing and handoff (M7) |
| REST and MCP read endpoints | Webhooks out |

### 1.3 Dependencies

| Need | From | When |
|---|---|---|
| Jobs queue (`claim_job`), nav, audit and privacy tables | M0, week 1 | Before M1 starts (week 2) |
| IPinfo Business token | Founder | Week 3 |
| Coresignal plan with enough credits (Mini to start) | Founder | Week 4 |
| Omniscient API (`POST /api/v1/activities`, accounts upsert) | Omniscient repo | Week 6 |
| Slack alerts app (exists, migration 014) | Built | — |

---

## Part 2. System design

### 2.1 Components

```
 Browser                      Fly: claritia-collect            Supabase Postgres            Fly: claritia-intel
 ───────                      ─────────────────────            ─────────────────            ───────────────────
 claritia.js ──/_clr/*──►     /s.js  (script)                  sites, devices, sessions     claim_job loop:
  (or direct)                 /e     (events)  ─insert─►       events (daily partitions)     stitch, ip_lookup,
                              /i     (identity) ─insert─►      identity_evidence ─┐          enrich, signal, score,
                              /x     (hop token)                jobs ◄─────────────┘          alert, push, rollup,
                              /reset /opt /health               ip_cache, accounts…          retention, checks
                                                                       ▲                          │
 Next.js app (claritia-web) ── RPCs + RLS ─────────────────────────────┘ ◄────────────────────────┘
 Visitors · Accounts · Account · Person · Settings · Privacy           Slack, Omniscient, IPinfo, Coresignal
```

**New Fly apps:**

| App | Size | Why separate |
|---|---|---|
| `claritia-collect` | 1 × shared-cpu-1x, 512 MB, always on, in nrt (`fly.collect.toml`). Scale to two before customer traffic. | Public, high volume, must stay up and fast |
| `claritia-intel` | 1 × shared-cpu-1x, 1 GB, always on, in nrt (`fly.intel.toml`) | Fast jobs with no browser (stitch, lookups, scores). It also runs imports, source syncs and segment refreshes, and big imports need the 1 GB. The runner stays a separate app that sleeps when idle and keeps Chromium for Funnel QA. |

### 2.2 Life of one visit

| Step | Where | Time budget |
|---|---|---|
| 1. The page loads `/_clr/s.js` (proxy) or `collect.tryclaritia.com/s.js` | Browser | Script ≤ 6 KB gzipped, loaded with `defer` |
| 2. The script queues `view`, and sends a batch after 5 s, at 20 events, or on page hide | Browser | — |
| 3. Collect checks site key, origin, size and rate. Works out policy from geo, GPC and consent. Reads or sets `_clr_id`. Finds or starts the session. Drops bots. | collect | p99 ≤ 50 ms |
| 4. Collect writes new sessions and devices at once, and buffers event rows. It writes them every 1 s or at 500 rows, in one `insert … select from unnest(…)` statement (5.5). | collect → Postgres | ≤ 1 s |
| 5. New network: queue `ip_lookup`. New evidence: queue `stitch`. | collect → jobs | — |
| 6. Intel runs the jobs: stitch (≤ 5 s), IP lookup (≤ 10 s). Every 30 s the signals sweep saves signals for visits quiet for 2 minutes and queues `score_account` (≤ 30 s). | intel | — |
| 7. Score crosses an alert rule: queue `account_alert` (`omniscient_push` is not built yet) | intel | Signal to Slack ≤ 2 min p95 |
| 8. Hourly rollups feed Visitors and Accounts. Not built yet: the screens read sessions directly. | pg_cron | — |

### 2.3 Environment

| Var | App | Purpose |
|---|---|---|
| `DATABASE_URL` (Supabase pooler, session mode) | collect, intel | Direct Postgres for fast writes |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | intel | Storage and RPC calls |
| `CLR_ID_SECRET` | collect | Signs device ids (one per site is derived as HMAC(CLR_ID_SECRET, site_id)) |
| `CLR_SALT_SECRET` | — | Not used: the daily cookieless salt is a random row in `salts` (4.1) |
| `IPINFO_TOKEN` | collect, intel | Company, geo and privacy lookups (intel). Downloads IPinfo's free geo file (collect). |
| `GEO_DB_PATH` | collect | Local geo file for country and region at intake (IPinfo's free country-ASN download, or MaxMind GeoLite2; check license) |
| `CORESIGNAL_API_KEY` | intel | Enrichment. In this cloud session the proxy injects it. |
| `SECRETS_KEY` | intel | Unseal Slack and Omniscient tokens |
| `ANTHROPIC_API_KEY` | intel | Score reason text (Haiku) |

---

## Part 3. Files

The files as built. Tests are in Part 11.

```
collect/
  server.ts            starts the routes on PORT, flushes the write buffer every second, stops cleanly on SIGTERM
  app.ts               routes (/s.js, /e, /i, /x, /reset, /opt, /health) and the middleware order (5.4)
  store.ts             every Postgres read and write, and the event insert (5.5)
  buffer.ts            the event write buffer: flush, retry, backpressure (5.5)
  sessions.ts          find or start a visit: memory first, then Postgres
  geo.ts               country, region, city and network from a local MaxMind-format file
  bots.ts              crawler user agents, cloud networks, automation, visits with no input
  attribution.ts       UTM tags, click ids and the referrer's kind
  ua.ts                device type, browser and OS
  limits.ts            per-instance token buckets
  Dockerfile           (fly.collect.toml is at the repo root)
collect/script/
  index.ts             claritia.js: config, queue, batching, views, engage, clicks, identify, reset, opt-out (5.1)
  consent.ts           Google Consent Mode v2, OneTrust, Cookiebot, claritia.consent
  forms.ts             submit capture, email field finder, never-read rules
  hop.ts               cross-domain link decoration
  adapters/hubspot.ts  hsFormCallback
  adapters/marketo.ts  MktoForms2
  util.ts              guarded storage and small helpers
  build.mts            esbuild into collect/dist (s.js and s.<hash>.js), fails over 6 KB gzipped
src/lib/web/
  policy.ts            the region policy (used by collect and the app)
  ids.ts               device ids, hop tokens, cookieless keys, uuid v7
  scrub.ts             URL, text and prop scrubbing (browser and server)
  proxy.ts             the Next.js proxy recipe (mode A)
  signals.ts           website signal rules
  scores.ts            fit v0, intent, stage, temperature, priority, why-now
  accountAlerts.ts     account alert rules and the Slack message
  names.ts             a stable name for each visitor, from the device id
src/lib/identity/
  clean.ts             email and identifier cleaning (docs/identity.md Part 6)
  stitch.ts            the stitch algorithm (docs/identity.md Part 7)
  devices.ts           device states, backfill, session split
  rebuild.ts           workspace rebuild (docs/identity.md 7.9)
  erase.ts             erasure and export
  mx.ts                the MX check, cached 7 days
  db.ts                shared types and the one-transaction helper
  domainList.ts        the domain lists in Settings › Identity
  lists/disposable.txt the disposable list (the free list is the free-email-domains package)
src/lib/company/
  domains.ts           cleaning, PSL, hosting list, redirects
  ipinfo.ts            network lookups, kinds and confidence
  coresignal.ts        company data by domain
  accounts.ts          the account order (docs/identity.md 8.1)
worker-intel/
  index.ts             claim loops, the signals sweep, health port
  jobs/stitch.ts       stitch, device_reset, stitch_evidence, rebuild, privacy
  jobs/company.ts      ip_lookup, enrich_company, identity_changed
  jobs/signals.ts      the signals sweep, score_account, account_alert
  jobs/imports.ts, sources.ts, segments.ts   jobs for other modules
  rpc.ts               the jobs queue over a direct Postgres connection
  settings.ts          a workspace's own and partner domains and identify secrets
  Dockerfile           (fly.intel.toml is at the repo root)
src/app/%5Fclr/[...path]/route.ts      /_clr/* on tryclaritia.com, forwarded to collect (mode A)
src/app/api/identity-secret/route.ts   seals and rotates the identify secret
src/app/api/account-alerts/route.ts    account alert rules, with the Slack address sealed
src/components/app/views/
  VisitorsView.tsx     Visitors (8.4)
  AccountsView.tsx     Accounts and the Account page (8.5, 8.6)
  SitesPanel.tsx       Settings › Sites and ICP (8.1, 8.3)
  IdentityPanel.tsx    Settings › Identity (8.2)
  AccountAlertsPanel.tsx   Settings › Account alerts (8.3)
supabase/migrations/021_web.sql … 032_visitor_path.sql   (Part 4)
```

---

## Part 4. Database

The tables are in migrations 021 to 032. They follow the existing pattern from `001_base.sql`:
- RLS on every table, with `is_member(workspace_id)` for reads.
- No client writes. Writes go through security definer RPCs or the service role.
- A leak test for every table in `tests/db/leaks.sql`.

### 4.1 `021_web.sql`: sites, devices, sessions, events

`supabase/migrations/021_web.sql` is the schema for:
- `sites` (keys, install mode, policy overrides, private paths, URL params kept, city, DNT, event retention, paused), with `add_site`, `update_site` and `remove_site`;
- `devices` and `sessions`. Later migrations add `sessions.split_to` (023) and `sessions.signaled_at` (026);
- `events`, one table per day, made 7 days ahead by `make_event_partitions()` and dropped after 180 days by `drop_old_event_partitions()`;
- `page_groups`, with `set_page_groups`;
- the server-only `salts`, `opt_outs` and `hop_nonces`;
- the rollups `site_daily` (no person data) and `account_daily`. Nothing fills them yet (4.4);
- `web_daily()`, the daily upkeep (4.4).

### 4.2 Identity, accounts, signals and scores (`022_evidence.sql` to `030_person.sql`)

- **Identity:** `022_evidence.sql`, `023_identity.sql`, `024_identity_ops.sql`, `029_identity_settings.sql` and `030_person.sql`. Where each table lives is in `docs/identity.md` Part 11. The erasure record is `erasures`.
- **Accounts, signals and scores:** `025_accounts.sql`: `accounts`, `account_domains`, `domain_aliases`, `company_cache`, `network_flags`, `signal_types`, `signals`, `icp`, `account_scores`, `intent_params`, `account_feedback`, `account_alert_rules` and `account_alert_log`. `026_signals.sql` adds `sessions.signaled_at` for the signals sweep. `028_account_alerts.sql` adds the sealed Slack address.
- **Screens:** `027_screens.sql` and `032_visitor_path.sql` (4.3).

### 4.3 RPCs the app uses

All are security definer, check `is_member`, and return only what the screen needs.

| RPC | Returns |
|---|---|
| `visitors_live(ws, site, since)` | Last 30 min of sessions: account or country, pages, time, person level |
| `accounts_list(ws, filters jsonb, sort, page)` | Account rows for the table |
| `account_detail(ws, id)` | Header, why-now, firmographics, people, score details |
| `account_timeline(ws, id, before, limit)` | Sessions with pages, forms and signals, newest first |
| `person_detail(ws, id)` | Identifiers, devices, links, evidence, sessions |
| `site_health(ws, site)` | Last event, install mode, Safari cookie survival, identified share |
| `identity_health(ws)` | The metrics from `docs/identity.md` Part 16 |
| `unmerge(ws, person, identifier_ids)`, `unlink(ws, device, person)`, `mark_kiosk(ws, device)` | Write an undo and queue a rebuild |
| `privacy_find(ws, email)`, `privacy_erase(ws, person)`, `privacy_export(ws, person)` | Privacy screen |
| `set_page_groups`, `set_icp`, `set_signal_types`, `set_alert_rule`, `add_site`, `update_site` | Settings |

### 4.4 pg_cron jobs

**Built:** `web_daily()` at 00:05 UTC (`021_web.sql`, when pg_cron is on). It makes the next week's event tables, drops tables older than 180 days, adds today's salt, deletes older salts, and deletes hop nonces older than 10 minutes.

**Not built yet:**

| Schedule | Function |
|---|---|
| Hourly at :05 | `rollup_hour(now() - 3h, now())`: site_daily and account_daily |
| 01:10 UTC | Queue `retention`, `learned_networks`, `identity_rebuild_check`, `untaint`, `intent_refit` (weekly) |
| Every minute | Queue `script_health` per site with no events in 24 h (sends one alert per day) |

---

## Part 5. The script and collect

### 5.1 Script API

```html
<script defer src="/_clr/s.js" data-site="SITE_KEY"></script>          <!-- mode A: proxy -->
<script defer src="https://collect.tryclaritia.com/s.js" data-site="SITE_KEY"></script>   <!-- mode D -->
```

```js
claritia.identify({ userId, email, iat, token })   // signed is Verified, unsigned is Asserted
claritia.track(name, props)                         // props ≤ 2 KB, scrubbed
claritia.form(email)                                // for fetch-only forms
claritia.consent(true | false)
claritia.optOut()
claritia.reset()                                    // call on logout
```

Data attributes: `data-site`, `data-consent="auto|wait|on"`, `data-domains="acme.io,acme.dev"`, `data-private="/account,/checkout/*"` (also enforced by collect), `data-api` (endpoint override).

Calls made before the script loads are queued by a one-line stub and replayed: `window.claritia=window.claritia||function(){(claritia.q=claritia.q||[]).push(arguments)}`.

**Built (week 2):** `src/lib/web/scrub.ts` (shared), `collect/script/*`, `npm run build:script` (gate: 6 KB gzipped, now 5.7 KB), `tests/scrub.test.ts`, `tests/script.test.ts`, and `scripts/script-check.ts` (34 checks in Chromium against a fake collect).

### 5.2 Event batch (POST /e)

```json
{
  "v": 1, "site": "SITE_KEY", "did": "only in modes C and D",
  "consent": {"state": "granted|denied|unknown", "tool": "gcm|onetrust|cookiebot|api"},
  "gpc": false, "hutk": null, "clr": null, "hop": null,
  "human": {"pointer": 12, "scroll": 3, "keys": 0, "first_input_ms": 1840},
  "events": [
    {"id": "uuidv7", "k": "view", "t": 1760000000123, "u": "/pricing?utm_source=x", "ti": "Pricing", "r": "https://www.google.com/"},
    {"id": "uuidv7", "k": "engage", "t": 1760000015123, "u": "/pricing", "d": {"active_s": 14, "scroll": 75}},
    {"id": "uuidv7", "k": "click", "t": 1760000020000, "u": "/pricing", "d": {"text": "Book a demo", "href": "/demo", "out": false}}
  ]
}
```

Collect answers `200 {"p": "full|cookieless|off"}`, plus `"did"` in modes C and D when a new id was made. The script sends nothing that names a person (forms, identify, `hutk`, hop requests) and stores nothing until a batch has come back with `"p": "full"`. That's why the first batch goes at once. `"off"` stops the script for the page.

A batch that fails (network, `429`, `5xx`) is sent once more with the next batch, with the same event ids. A hidden tab sends with `fetch` so it can retry. Leaving the page uses `sendBeacon`. Errors: `400` (bad shape), `403` (key or origin), `413` (too big), `429` (rate).

### 5.3 Identity batch (POST /i)

```json
{ "v": 1, "site": "SITE_KEY", "did": "modes C/D only", "session_hint": "uuid",
  "kind": "form|identify|adapter", "source": "native|hubspot|marketo",
  "email": "jane@acme.com", "userId": null, "iat": null, "token": null, "page": "/demo", "form": "demo-form" }
```

The kind and source map to evidence levels per `docs/identity.md` 5.10. Signed `identify` tokens are checked by the stitch job, which holds the secrets. Collect stores the token with the evidence.

### 5.4 Middleware order in collect

1. Size limit (64 KB), then parse JSON.
2. Site lookup by key (in-memory cache for 60 s), then origin check against domain and extra domains.
3. Client IP: `X-Clr-Client-IP` only with a matching `X-Clr-Proxy` secret, otherwise the socket IP.
4. Rate limits: 50 requests a second per IP, 2,000 a second per site (in-memory buckets per instance). A per-site count in Postgres catches abuse across instances.
5. Geo lookup (local file), then the `/24` or `/48` network. The full IP is kept in memory only.
6. **Policy** (`docs/account-intelligence.md` 3.2): region, then site overrides, then GPC, then consent, then opt-out cookie.
7. **Device:** verify `_clr_id`, or issue one if policy allows. The script says how it's installed (`m`: `a` proxy, `s` subdomain, `d` direct). Collect sets the HttpOnly cookie for `a` and `s`, or returns `did` for `d`. A request in mode `a` without the proxy secret has the proxy's IP, so its network isn't kept and it gets no company lookup.
8. **Bot score:**
   - `isbot` user agent: drop. Only crawler user agents are dropped.
   - Cloud networks, matched by ASN from the geo file: mark bot, and unmark when the visit shows real input (people on cloud desktops are buyers).
   - `webdriver` true, or no input after 30 s with more than 10 views: mark bot.
9. **Session:** in-memory LRU of device to session (30 min), with Postgres as the source of truth. Split rules from `docs/identity.md` 4.6.
10. Scrub URLs and props (`scrub.ts`). Drop events on `private_paths`.
11. Buffer the rows. Queue jobs: `ip_lookup` if the network isn't in a 1-hour local seen-set, `signal` for page-group hits, `stitch` for evidence.
12. Reply.

### 5.5 Write path

- New sessions and devices are written at once, in one transaction, so a second instance finds them. Only events wait in the buffer (`collect/buffer.ts`).
- Flush every 1 s or at 500 rows, with one `insert … select from unnest(…) on conflict do nothing` statement (`collect/store.ts`). The same statement adds the rows it really inserted to the sessions' `pageviews`, `engaged_s` and `ended_at`, so a retry can't double a count. There is no COPY and no temp table: at our sizes it's just as fast.
- An event's day comes from its uuid v7 time, so a batch retried after midnight lands in the same day table. If that day's table doesn't exist yet, collect makes the tables and tries once more.
- A failed write keeps its rows and waits 1, 2, 4 … up to 30 s before the next try. A bad row (a data error) is found by halving the batch and is dropped alone.
- **Backpressure:** if the buffer passes 20,000 rows (the database is slow), collect answers `503` with `Retry-After: 5`, and the script keeps the batch in `sessionStorage` and retries once.
- **On shutdown** (SIGTERM from Fly), flush and then exit. Fly's kill timeout is set to 30 s.

### 5.6 `fly.collect.toml`

The parts that matter (the file is at the repo root):

```toml
app = "claritia-collect"
primary_region = "nrt"
kill_timeout = 30
[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1
  [http_service.concurrency]
    type = "requests"
    soft_limit = 800
    hard_limit = 1000
[[http_service.checks]]
  path = "/health"
  interval = "15s"
  timeout = "2s"
[[vm]]
  size = "shared-cpu-1x"
  memory = "512mb"
```

`claritia-collect` deploys with the others and stays idle (health says what's missing, everything else is 503) until `DATABASE_URL` and `CLR_ID_SECRET` are set. One machine for now; scale to two before customer traffic.

Custom domains: `collect.tryclaritia.com`, and per-customer mode B and C subdomains through Fly certificates.

---

## Part 6. Intel jobs

All jobs run in `claritia-intel` (`worker-intel/index.ts`) through `claim_job(kinds)`, with 4 claim loops by default (`CONCURRENCY`). Each one can be run twice with the same result. Every job here gets 5 tries, the `enqueue_job` default. A job that shares a key with a waiting one is merged into it.

### Built

| Job | Key | Queued by | What it does | Target time |
|---|---|---|---|---|
| `stitch` | device | collect, on new evidence | Every waiting evidence row for the device, per `docs/identity.md` 7.7, with the MX check inline (`src/lib/identity/mx.ts`, cached 7 days). Queues `identity_changed`. | ≤ 5 s p95 |
| `device_reset` | old device | collect, on `claritia.reset()` | Closes the old device's open link at that moment (`docs/identity.md` 4.5) | — |
| `stitch_evidence` | evidence id | `decide_merge`, when a merge proposal is approved | Stitches one evidence row that has no device | — |
| `rebuild` | workspace | `unmerge_person`, `unlink_device`, `mark_kiosk` | Replays the workspace's evidence (`docs/identity.md` 7.9) | — |
| `privacy` | request id | `privacy_request` | Erasure or export (`docs/identity.md` 15.1, 15.2) | — |
| `identity_changed` | person | `stitch` | Sets the account again on the person's sessions in the last 90 days (`docs/identity.md` 8.1). Queues `score_account` for accounts that changed. | ≤ 60 s |
| `ip_lookup` | network | collect, for a network it hasn't queued in the last hour | IPinfo lookup, saved in `ip_cache` (`docs/identity.md` 8.2). Sets the account on that network's sessions in the last hour. Queues `score_account`. | ≤ 10 s |
| `enrich_company` | domain | a new account | Redirect alias, `company_cache` (30 days), Coresignal company data, written to `accounts.firmo` and the name | — |
| `score_account` | account, run 60 s later | the signals sweep, `identity_changed`, `ip_lookup`, `set_icp` | Fit v0, intent, stage, temperature, priority, why-now. Saves `account_scores`. Checks alert rules and queues `account_alert`. | ≤ 30 s |
| `account_alert` | rule + account | `score_account` | Posts the account to the rule's Slack, at most once a day per rule and account, within the daily cap | — |

**The signals sweep** takes the place of a `signal` job. Every 30 seconds one intel instance (it holds an advisory lock) finds visits with an account that have been quiet for 2 minutes and weren't checked since they last grew. It applies the website signal rules (`src/lib/web/signals.ts`), writes `signals` with dedupe keys, and queues `score_account`.

The same app also runs `import_file`, `import_undo`, `source_pull`, `crm_push`, `source_hook` and `segment_refresh` for other modules, and clears old import files once an hour.

### Not built yet

| Job | Key | What it's for | Target time |
|---|---|---|---|
| `omniscient_push` | account | Upsert the account and log a "Hot on website" activity in Omniscient | — |
| `learned_networks` | workspace | Nightly, `docs/identity.md` 8.3 | Minutes |
| `identity_rebuild_check` | workspace | Nightly: rebuild 200 random groups in a scratch schema and compare | Minutes |
| `retention` | — | Nightly: delete past retention (`docs/account-intelligence.md` 3.4, `docs/identity.md` 15.4: unknown devices, old nonces and caches). Write counts to `audit_log`. | Minutes |
| `untaint` | — | Nightly: end 30-day taints. The stitch job already treats a taint past `tainted_until` as over; only the stored state stays `tainted`. | Minutes |
| `intent_refit` | workspace | Weekly fit of `k` so the 95th percentile account is about 90. Until then `k` is 60 unless `intent_params` has a row. | Minutes |
| `script_health` | site | Alert once a day when no events arrive for 24 h | — |
| `suggest_page_groups` | site | Explorer crawl (runner job) of up to 200 pages, rules first, then Haiku for leftovers. Suggestions go to Settings for approval. | — |
| `hutk_lookup` | `hutk` | The first `hutk` in a session (`docs/identity.md` 5.5) | ≤ 30 s |
| `token_confirm` | token | An email or page token, 30 s after landing (`docs/identity.md` 5.6) | 30–40 s |
| `calendly_invitee` | invitee URI | A booking event | ≤ 30 s |

**Later modules** (planned in `docs/account-intelligence.md` for after M1):

| Job | Trigger | Runs |
|---|---|---|
| `hubspot_inbox` | Webhook batch | Seconds |
| `hubspot_catchup` | Every 15 min per portal | Minutes |
| `hubspot_writeback` | Every 15 min | Minutes |
| `hubspot_timeline` | Hourly | Minutes |
| `tech_scan` | Monthly per active account | Minutes |
| `jobs_scan` | Weekly per active account | Minutes |
| `news_watch` | Weekly per active account (top 200) | Minutes |
| `brief` | Weekly top 50, plus on Evaluating, demo request or Refresh | Batch API weekly, direct on trigger |
| `digest` | 8:00 rep local time | Minutes |
| `fit_refit` | Monthly | Minutes |
| `backtest` | On demand, and monthly | Minutes |
| `quality_report` | Nightly | Minutes |

**Throughput targets (one intel machine):**
- 500 stitch rows a second.
- 50 IP lookups a second, within the IPinfo plan limit (check).
- 200 score recomputes a second.

The intel app scales by machine count, since jobs are claimed with `skip locked`.

---

## Part 7. Company resolution and scoring in M1

### 7.1 IPinfo use

- **Call:** one IPinfo API call per uncached network (check the current endpoint and field names on the Business plan: company name, domain and type, ASN type, and privacy flags for VPN, proxy, hosting and relay).
- **Network kind:**

| IPinfo says | Kind |
|---|---|
| Company type business, or ASN type business | `business` |
| ASN type isp | `isp` |
| Hosting flag, or ASN type hosting | `hosting` |
| VPN, proxy or relay flag | `vpn` |
| Mobile carrier | `mobile` |
| Education | `education` |
| Government | `government` |

- **Confidence:**
  - 90 when the company domain matches the ASN owner domain;
  - 75 when the company type is business but the ASN is an ISP (business on a broadband line);
  - 60 otherwise.
  - Only 70+ sets an account (`docs/identity.md` 8.1).
- **Cache:** see `docs/identity.md` 8.2.

### 7.2 Domain and account

Domain cleaning is in `docs/account-intelligence.md` 5.1 (code: `src/lib/company/domains.ts`, with the `psl` package). The account order, and what a new domain does, are in `docs/identity.md` 8.1.

### 7.3 Coresignal

- **What's used:** company enrichment by domain. Fields: name, logo, size band, industry, HQ country, founded, 6- and 12-month headcount growth.
- **When:**
  - only for accounts with 1+ non-bot, non-internal session that scored above zero;
  - or accounts that are linked to a CRM record.
- **Cache:** `company_cache` holds company data only and is shared across workspaces (check the license), with a 30-day TTL.
- **Endpoint:** check the current company enrich endpoint and its credit cost (10 credits for a base record, 20 for multi-source, per the pricing seen).

### 7.4 Signals in M1

The website set from `docs/account-intelligence.md` 7.1:
- `page_pricing`, `page_demo`, `page_compare`, `page_security`, `page_integrations`
- `docs_depth`, `case_study`, `return_visit`, `multi_person`
- `review_site_ref`, `ai_assistant_ref`
- `engaged_session` (`spike` is not built yet)
- `form_submit` and `demo_request` (from evidence)
- `new_person`

Defaults are seeded into `signal_types` for each new workspace.

### 7.5 Scores in M1

| Score | Rule |
|---|---|
| Fit v0 | ICP rules from Settings (`docs/account-intelligence.md` 8.1 version 0) |
| Intent | Decay sum, per-person cap 40%, breadth bonus up to 1.6×, `1 − e^(−raw/k)` (8.2) |
| Stage | Unknown, Engaged, Researching, Evaluating (8.3, without deal stages until M2 syncs) |
| Temperature | 7-day vs 28-day |
| Priority | intent × (0.4 + 0.6 × fit/100) × stage factor × owner factor |
| Why-now | The top 2 signal contributions in the last 7 days, as plain text built from templates (no AI) |
| Reason | Haiku 5.5, only when the stage or the intent band (0–39, 40–69, 70+) changes. Plain-math fallback if the call fails. Not built yet. |

---

## Part 8. Screens

All screens:
- Load through the RPCs in 4.3.
- Use `ListTable` with column filters and saved views (the same pattern as Omniscient).
- Use square tags for states and the app's `Select` and dialogs.
- Show a `ToolIntro` until there's data.

### 8.1 Settings › Sites

**Empty state** (`ToolIntro`): "See which companies visit your site". Short lead. Feature cards: Visitors, Accounts, Alerts. Add site button.

**Add site** (a dialog): domain, then extra domains.

**Install** (a tab per mode, with Proxy first and marked "Best"):
- A copy row for the script tag.
- Proxy recipes per platform (`docs/identity.md` 4.3), as copy blocks with the site's `proxy_secret` filled in.
- DNS records for modes B and C, with a live check tag.

**Verify:** a "Waiting for events" tag that turns into "Receiving events" (polls `site_health` every 5 s while open). It shows the detected mode, and warns on C and D about Safari.

**Settings per site:**
- Extra domains, private paths and URL parameters kept.
- City on or off, DNT.
- Region overrides (`Select` list of countries: strict or off).
- Page groups: suggested list with Accept and Edit, plus the add pattern form.

### 8.2 Settings › Identity

As in `docs/identity.md` Part 13:
- Identify secret (show, rotate) with Node, Python, Ruby, PHP and Go snippets.
- Own domains, partner domains, office IPs, and "This is me" links.
- Health tiles.

### 8.3 Settings › ICP and Signals

- **ICP:** industries (multi-select), size bands, countries, revenue bands, each with a weight, and must-haves. A live count of matching accounts.
- **Signals:** a table of signal kinds with weight, half-life and on or off. Reset to defaults.
- **Alerts:** rule builder. When stage becomes X, or intent crosses N, or a signal of kind K happens, for accounts with fit ≥ F, notify Slack or email, with quiet hours and a daily cap.

### 8.4 Visitors

- **Live list**, refreshed every 10 s: time, account (logo and name) or "Unknown · Country", person (name with level tag, if known), pages (the first 3 and a count), active time, source, and ref class tag.
- **Filters:** site, account known or unknown, ref class, country, page group.
- **Click** opens the account or person.

### 8.5 Accounts

**Table columns:**
- Account, with a fit bar and number.
- Intent, with a number and a temperature arrow.
- Stage tag, priority, people, sessions (7 d), last signal, and why-now (truncated).
- Owner, once M2 syncs owners.

**Saved views:**
- "Hot this week" (temperature hot)
- "Evaluating"
- "New this week"
- "High fit, no visit in 30 days"

**Row buttons:** Good pick, Wrong company, Not a fit (feedback table).

### 8.6 Account page

| Section | Content |
|---|---|
| Header | Logo, name, domain, fit, intent, priority, stage, temperature, flags, Open in Omniscient (when linked) |
| Why now | Contributions with links to the sessions |
| Timeline | Sessions grouped by day: who (person or "Unknown visitor"), pages with time, forms, signals |
| People | Known people with level tags, last seen and pages. "Unknown visitors: N devices, N sessions". |
| Company | Firmographics with the source and date. Networks seen, with the "by network" tag and a Wrong company button. |
| Score details | Fit rules matched, and intent signals with weight × decay = contribution |

### 8.7 Person page

As in `docs/identity.md` Part 13, with the plain-language decision lines from Part 14.

### 8.8 Privacy

- **Search by email:** results with Export and Erase (each erase asks through `askConfirm`).
- **Request log:** kind, subject hash, status, counts, and finish time.
- **Retention settings:** a table of data kinds and days.

---

## Part 9. API and MCP

| Endpoint | Returns |
|---|---|
| `GET /api/v1/visitors?site&since` | Live sessions |
| `GET /api/v1/accounts?filter&sort&page` | Accounts |
| `GET /api/v1/accounts/:id` | Account detail, scores, why-now |
| `GET /api/v1/accounts/:id/timeline` | Sessions and signals |
| `GET /api/v1/people/:id` | Person with identifiers and levels |
| `POST /api/v1/privacy/requests` | `{kind: export|erase, email}` |

MCP tools on `/api/mcp`: `list_accounts`, `get_account`, `get_account_timeline`, `list_visitors`. All are read-only and use the existing `clr_` API keys.

---

## Part 10. Compliance checklist (each item has a test)

| Item | Where in code | Test |
|---|---|---|
| Region policy decides cookie, identity and lookups | `src/lib/web/policy.ts` | Consent matrix (48 cases) |
| GPC honored everywhere | `src/lib/web/policy.ts` | Matrix |
| No cookie before consent in `strict` | `collect/app.ts`, `src/lib/web/ids.ts` + `src/lib/web/policy.ts` | Matrix |
| Cookieless salt rotates and old salts are deleted | `web_daily()` in `021_web.sql` + `salts` | Unit, plus a check that no salt older than 24 h exists |
| Full IP never stored | `collect/geo.ts`, `collect/app.ts` (only the network is kept and queued) | A scan of all tables for IP patterns after the full suite |
| URL scrubbing | `src/lib/web/scrub.ts` (shared) | 200 URL cases |
| Form fields: email only, never passwords or cards | `collect/script/forms.ts` | Network capture in a real browser |
| Private paths send nothing | `collect/app.ts` (5.4 step 10) | Browser check |
| Opt-out works per site | `/opt` in `collect/app.ts`, `opt_outs` | Browser check |
| Erasure removes everything | `src/lib/identity/erase.ts` | Search every table after erase |
| Retention deletes on time | `retention` job (not built yet) | Clock-moved test |
| No person data across workspaces | RLS | `tests/db/leaks.sql` |
| Shared caches hold company data only | `company_cache`, `ip_cache` schemas | Schema test: no email, name or person columns |
| Audit log on exports, erasures and setting changes | RPCs | Unit |

---

## Part 11. Tests

`npm test` runs `tests/*.test.ts`. `npm run test:db` builds a database from every migration and runs `tests/db/*.sql`, `tests/pg/*.ts`, and, when `CHROMIUM_PATH` is set, the three browser checks that need Postgres. CI runs both (`.github/workflows/ci.yml`), in Chromium only. `npm run test:browser` runs `scripts/script-check.ts` with the other browser checks that need no database.

| File | Covers |
|---|---|
| `tests/scrub.test.ts` | URL, text and prop scrubbing, and private path patterns |
| `tests/script.test.ts` | Consent readers, the HubSpot form message, hop links |
| `tests/collect.test.ts` | Regions and the 144-case policy matrix, device ids, uuid v7, hop tokens, cookieless keys, networks, geo, bots, attribution, token buckets, session split rules, the buffer, and every collect route |
| `tests/proxy.test.ts` | The Next.js proxy recipe |
| `tests/clean.test.ts` | Email cleaning and classes, user and HubSpot ids, hashes, merge guards, signed identify tokens |
| `tests/domainList.test.ts` | The domain lists in Settings › Identity |
| `tests/domains.test.ts` | Domain cleaning on 100 labeled inputs |
| `tests/company.test.ts` | IPinfo kinds and confidence, a network's sample address, a Coresignal response |
| `tests/scores.test.ts` | Decay, intent by hand, fit v0, stage, temperature, priority, why-now, page groups, visit and account signals, alert rules |
| `tests/pg/collect.pg.ts` | collect's Postgres writes: retries don't double, a killed write rolls back whole, shutdown loses nothing |
| `tests/pg/stitch.pg.ts` | States, backfill, split, taint, signed merge, guards, internal, role, disposable, policy, erasure, an 8-way race, a job killed midway |
| `tests/pg/intel.pg.ts` | The claim loop: queued stitch jobs run once and finish |
| `tests/pg/rebuild.pg.ts` | Rebuild equals incremental (1,500 random rows, 80 devices, 50 identifiers), each undo, erasure and export |
| `tests/pg/accounts.pg.ts` | Accounts from work emails and networks, IP lookups and company data |
| `tests/pg/signals.pg.ts` | The signals sweep and `score_account` |
| `tests/pg/alerts.pg.ts` | A hot account fires one Slack message per rule per day |
| `tests/pg/screens.pg.ts` | The screens' read functions return the fields the screens use |
| `tests/pg/person.pg.ts` | `person_detail` and `privacy_find` |
| `tests/db/leaks.sql` | RLS on every table |
| `scripts/script-check.ts` | 34 checks of claritia.js in Chromium against a fake collect |
| `scripts/collect-check.ts` | Chromium → script → proxy → collect → Postgres |
| `scripts/identity-check.ts` | 27 of the 38 cases in `docs/identity.md` 17.1, in Chromium |
| `scripts/consent-check.ts` | All 48 consent cases, in Chromium |

Not built yet: `scripts/load-collect.ts` (10,000 events a second for 60 s: no loss, p99 ≤ 50 ms), `scripts/load-intel.ts` (500 stitch rows a second, p95 ≤ 5 s), and the WebKit and Firefox runs.

**Reliability rule:** collect, stitch and scores don't ship without their flaky-case tests passing:
- the database slow or down during flush;
- events arriving late;
- retried batches;
- a job killed midway.

---

## Part 12. Status

What is built and what is left, checked against the code. The day-by-day schedule that was here is in git.

### 12.1 Built

- **Database:** migrations `021_web.sql` to `032_visitor_path.sql` (Part 4).
- **Script:** `collect/script` (5.1): views, SPA, bfcache, prerender, engage, clicks, consent readers, GPC, opt-out, forms with the HubSpot and Marketo adapters, hop links, `identify`, `track`, `form` and `reset`. 5.7 KB gzipped.
- **Collect:** `collect/` (5.2 to 5.6), on one machine.
- **Identity** (`src/lib/identity`): cleaning with the free and disposable lists, the MX check, stitching, device states, backfill, session split, taint, merge guards, internal devices from own-domain emails, rebuild, undo (`unmerge_person`, `unlink_device`, `mark_kiosk`, `decide_merge`), erasure and export.
- **Companies** (`src/lib/company`): domain cleaning and redirect aliases, IPinfo lookups with `ip_cache`, Coresignal company data with `company_cache`, and the account order (`docs/identity.md` 8.1).
- **Signals and scores** (`src/lib/web`): every website signal in 7.4 except `spike`, fit v0, intent, stage, temperature, priority and why-now, run by the signals sweep and `score_account`.
- **Alerts:** account alert rules to Slack (`028_account_alerts.sql`, `account_alert`).
- **Intel:** `claritia-intel` with the jobs built in Part 6.
- **Screens:**
  - Visitors (8.4).
  - Accounts and the Account page, with the feedback buttons (8.5, 8.6).
  - Settings › Sites: add a site, the install recipes (script tag, Next.js, Nginx), and ICP (8.1, 8.3).
  - Settings › Identity: own and partner domains, and the identify secret with a Node snippet (8.2).
  - Settings › Account alerts (8.3).
- **Read functions ready for screens not built yet:** `person_detail` and `privacy_find` (`030_person.sql`).
- **Tests:** Part 11.

### 12.2 Not built yet

- The `spike` signal (7.4).
- Jobs: `suggest_page_groups`, `omniscient_push`, `learned_networks`, `intent_refit`, `script_health`, `retention`, `untaint` and `identity_rebuild_check` (Part 6). Without `learned_networks`, accounts by learned network never match.
- Internal traffic from office IPs and "this is me" links (`docs/identity.md` Part 9). Today only an own-domain email marks a device internal.
- Screens: the Person page (8.7) and Privacy (8.8). Per-site settings and page groups on Settings › Sites (8.1). Signals on Settings › ICP and Signals (8.3). Office IPs, "this is me" links, the other server snippets and the health tiles on Settings › Identity (8.2).
- Haiku reasons (7.5).
- The hourly rollups (4.4).
- REST and MCP (Part 9).
- The load tests, and WebKit and Firefox runs (Part 11).

### 12.3 Browser cases deferred

`scripts/identity-check.ts` runs 27 of the 38 cases in `docs/identity.md` 17.1:
- Cases 7–15 (email links) come with M6.
- Cases 22–23 (Safari storage, in WebKit) need WebKit and aren't written yet.

The `hutk` lookup waits for the HubSpot sync (1.2). The evidence row for `hutk` is already stored.

---

## Part 13. Rollout

| Step | When | Gate |
|---|---|---|
| Our own site (tryclaritia.com), proxy mode | After week 3 (collect) | Load test passed |
| Perceptric's site | After week 4 (identity) | Identity and consent suites green |
| 2 design partners | After week 6 (screens) | All tests green, privacy docs ready |
| 5 design partners | Week 7 | 1 week of clean metrics (no policy breaches, drift 0, unmerges < 2 per 1,000) |

- **Feature flag:** the screens show for workspaces whose `workspaces.features` includes `marketing` (`src/lib/nav.ts`).
- **Kill switch:** `sites.paused`. While it's set, collect answers `{"p": "off"}`, which stops the script for the page. A global switch (`app_config.collect_paused`) is not built yet.

---

## Part 14. Operations

### 14.1 Metrics (on the internal quality page)

| Metric | Alert |
|---|---|
| Collect p99, 5xx rate, buffer depth, flush lag | p99 > 100 ms, 5xx > 0.5%, flush lag > 10 s |
| Jobs waiting by kind, oldest waiting | `stitch` oldest > 30 s, any kind > 10 min |
| IPinfo errors and spend | Error rate > 5%, spend > 80% of plan |
| Coresignal credits used | > 80% of plan |
| Identity metrics (`docs/identity.md` Part 16) | As listed there |
| Policy breach audit query | > 0, alert at once |

### 14.2 Runbooks

| Problem | Steps |
|---|---|
| Database slow, collect backpressure | Check Supabase load. Scale collect machines to keep connections steady. Raise flush batch size. If it lasts more than 15 min, pause the noisiest site. |
| IPinfo down or over limit | `ip_lookup` jobs retry with backoff. Accounts by network are delayed, while person and email accounts still work. |
| A customer's proxy broke (events stopped) | `script_health` alerts the customer once a day. The Sites screen shows the last event and mode. |
| Bad deploy of the script | Versioned script paths: `/s.js` points to the last good hash. Roll back by switching the pointer in `app_config.script_version`. |
| Wrong merges reported | Unmerge in the UI. Check the nightly rebuild report. Add a test case for the pattern. |

### 14.3 Backups and replay

- **Raw events:** kept 90 days. `scripts/replay-signals.ts` (not built yet) rebuilds signals and scores for a workspace from events, for use after a rule change.
- **Identity:** rebuilt from evidence at any time with `rebuild(workspace)`.

---

## Part 15. Monthly cost of M1

### 15.1 Assumptions per team

| Item | Amount |
|---|---|
| Page views | 50,000 |
| Events | 200,000 |
| IP lookups after caching | about 10,000 |
| Accounts enriched | about 300 |
| Haiku reasons | on band changes only |

### 15.2 Totals

| Line | Beta (50 teams) | Growth (500 teams) |
|---|---|---|
| IPinfo Business (check limits) | $249 | $1,000 |
| Coresignal company enrichment (about 3,000 credits per team, shared cache) | Starter to Pro plan, $199–$499 (check) | Premium, $1,500 (check) |
| Haiku reasons ($7 per team, often less) | $350 | $3,500 |
| Fly `claritia-collect` (2 × 256 MB, then 3 × 512 MB) | $4 (check) | $15 (check) |
| Fly `claritia-intel` (1 × 512 MB, then 3 × 1 GB) | $4 (check) | $25 (check) |
| Supabase compute for events (Medium, then Large) | $60 (check) | $110 (check) |
| ClickHouse (raw events at Growth) | — | $300 (check) |
| Geo file (IPinfo free country-ASN, or MaxMind GeoLite2) | $0 (check terms) | $0 (check terms) |
| **M1 total** | **About $866–$1,166** | **About $6,450** |

This is part of the platform total in `docs/marketing-platform.md` 15.2. There, the Coresignal line also covers people and briefs in later modules.

---

## Part 16. Open checks before day 1

| Check | Owner |
|---|---|
| IPinfo Business: exact fields for company type, ASN type and privacy flags, and the monthly request cap | Founder, with a test token |
| Coresignal: company enrich endpoint, credit cost per call, license for a shared company cache | Founder |
| Geo file license for commercial use in a product (IPinfo free download vs MaxMind GeoLite2) | Founder |
| PSL package license and update method | Build |
| Supabase pooler limits for writes from 2–3 collect machines | Build, in week 3 |
| Omniscient API ready by week 6 (or ship the stub) | Omniscient repo |
| WebKit and Firefox Playwright browsers in CI (download size and time) | Build |

---

## Part 17. Definition of done

- Every item in 1.1 works on a design partner's live site.
- All tests in Part 11 pass in CI, including Chromium, WebKit and Firefox for the browser suites.
- The policy breach audit query returns 0, and nightly rebuild drift is 0, for 7 days on live traffic.
- The privacy documents for customers are published: the privacy snippet, the cookie table, and the sub-processor list.
- The monthly cost tracking in `ai_calls` and vendor usage matches Part 15 within 20%.
