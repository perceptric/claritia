# MCP server: Claritia inside coding agents

Claude Code, Cursor and other MCP clients can write, run and read Claritia tests. The server is
`https://app.tryclaritia.com/api/mcp` (Streamable HTTP, plain JSON answers), signed in with a workspace API key.

## Set up

Make a key in Settings → API keys. The new key's panel shows the Claude Code command ready to copy.

**Claude Code**

```bash
claude mcp add --transport http claritia https://app.tryclaritia.com/api/mcp --header "Authorization: Bearer clr_..."
```

Then add the skill so Claude knows when and how to use it:

```bash
mkdir -p ~/.claude/skills/claritia && curl -s https://app.tryclaritia.com/skill.md -o ~/.claude/skills/claritia/SKILL.md
```

**Cursor** (`.cursor/mcp.json` or Settings → MCP):

```json
{ "mcpServers": { "claritia": { "url": "https://app.tryclaritia.com/api/mcp", "headers": { "Authorization": "Bearer clr_..." } } } }
```

## Connect from ChatGPT or Claude

ChatGPT, Claude and other MCP apps connect with one click: add `https://app.tryclaritia.com/api/mcp` as a connector,
click Connect, and approve on Claritia's page (it shows the app's name and the site it returns to). No key to paste.

How it works (`supabase/migrations/141_mcp_oauth_clients.sql`, `src/lib/oauth/`):
- `/api/mcp` without a key answers 401 with `WWW-Authenticate: Bearer resource_metadata=...`.
- `/.well-known/oauth-protected-resource` (RFC 9728) names the sign-in server; `/.well-known/oauth-authorization-server`
  (RFC 8414, also at `/.well-known/openid-configuration`) lists its addresses.
- `/api/oauth/register` (RFC 7591): the app registers its name and return addresses (https, or http on localhost) and
  gets an `mcp_...` client id with no secret. Ten a minute per address. Apps that never sign in go after 7 days.
- `/oauth/authorize` is the same approve page Zapier uses. These apps must send a PKCE check (S256) and may only return
  to an address they registered.
- `/api/oauth/token` turns the code into an API key named after the app. Revoking it in Settings › API keys signs the
  app out.

## Forms before sign-up

Without a key, `/api/mcp` is the guest server (`src/lib/forms/guestMcp.ts`, `supabase/migrations/142_guest_forms.sql`).
Someone asks ChatGPT or Claude for a form, and it goes live at once, before they have an account:

| Tool | Does |
|---|---|
| `find_form_template` | Searches the 740 templates; rare words count most ("yoga" over "class") |
| `create_form` | From a template id or the page the app wrote, in one of the 18 styles. Returns the live link, the claim link, the embed code and a key |
| `update_form` | Changes it by its key, until it's claimed |
| `list_forms`, `get_answers` | Listed so apps know they exist; calling one answers 401, which starts the sign-in |

- The form lives in a workspace of its own with no members, on the Free plan, so it carries the Claritia badge.
- The claim link (`/claim/<key>`) signs the person in (sign-up opens first) and makes them the workspace's owner. An
  empty workspace their sign-in just made is dropped, so a new account opens on the form. A claim works once.
- Unclaimed, it closes after 14 days: the public read shows it closed and sends get 410. Claiming opens it again.
- One address makes at most 20 a day. Only the key's hash is stored.
- A form nobody owns can't ask for a password, sign-in, card or bank details, or codes (`guestRisk` in
  `src/lib/forms/guest.ts`), checked on the page as written and on each question's name.

Next: the Claude and ChatGPT directory listings.

## Tools

| Tool | Does |
|---|---|
| `list_projects` | Projects and their environments |
| `list_tests` | A project's tests by use case, with each one's last result |
| `get_test` | A test as YAML, its Playwright code, and its last 5 results |
| `save_test` | Create or update a test from YAML (same format as `.claritia/tests/*.yaml`) |
| `verify_change` | Run tests (all, a use case, or picked) on an environment or a preview `base_url`, and wait up to 45 seconds. Failures come back sorted: app bug, flaky or setup, with the step and the error |
| `get_results` | Wait for runs still going |
| `list_fixes` | Fixes from the Healer waiting for approval (approving stays with a person, in Claritia) |

Agent runs are marked `mcp`, count toward the plan's cloud minutes like any run, and share the 50-at-once limit with
the REST API. Runs can't reach localhost or private addresses: verify on a preview deploy or staging.

`/skill.md` is the agent skill (`src/lib/skill.ts`): when to verify, how to read each kind of failure, and how to
write steps.

## Running cost

$0 added at Beta (50 teams) and Growth (500 teams): it runs on the existing web app on the VPS, and agent runs use the
same runner, cloud minutes and Claude calls as any other run.

One-click sign-in adds $0 at Beta and Growth: a few small rows per connected app in the database the app already runs
on, and no AI calls (ChatGPT or Claude does the writing on its side).

Forms before sign-up add $0 at Beta and Growth: a workspace, a form and its versions per guest form in the same
database, closed after 14 days unless claimed, and no AI calls (the app writes the page on its side).
