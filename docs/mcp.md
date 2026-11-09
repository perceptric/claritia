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

Next: forms made from chat before signing up (with Claim this form), chat-sized tools, and the Claude and ChatGPT
directory listings.

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
