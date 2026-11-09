// One-click sign-in for ChatGPT, Claude and other MCP apps (docs/mcp.md, 141_mcp_oauth_clients.sql): what an app may
// register, that it returns only to an address it registered, that it must send a PKCE check, and that its approve
// screen shows where it returns to. Under the reliability rule: a wrong link is worse than no link, so the flaky
// cases are the made-up ones (a look-alike host, a fragment, plain http, a name pretending to be another app).
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkAuthorize, checkRegistration, dynamicClient, findClient, newClientId, redirectAllowed, DYNAMIC_ID } from "../src/lib/oauth/clients.ts";
import { mcpSignIn, resourceMeta, serverMeta } from "../src/lib/oauth/meta.ts";

const CHALLENGE = "a".repeat(43);

test("an app may register https return addresses, or http on this computer", () => {
  assert.ok(redirectAllowed("https://chatgpt.com/connector_platform_oauth_redirect"));
  assert.ok(redirectAllowed("https://claude.ai/api/mcp/auth_callback"));
  assert.ok(redirectAllowed("http://localhost:6274/oauth/callback"));
  assert.ok(redirectAllowed("http://127.0.0.1:33418/callback"));
  assert.ok(!redirectAllowed("http://chatgpt.com/callback"), "plain http on the internet");
  assert.ok(!redirectAllowed("http://localhost.evil.io/callback"), "a look-alike of localhost");
  assert.ok(!redirectAllowed("https://claude.ai/cb#x"), "a fragment");
  assert.ok(!redirectAllowed("https://user:pw@claude.ai/cb"), "a login in the address");
  assert.ok(!redirectAllowed("javascript:alert(1)"));
  assert.ok(!redirectAllowed("not a url"));
  assert.ok(!redirectAllowed(42));
});

test("a registration is checked: addresses, a public client, the code grant, a clean name", () => {
  const ok = checkRegistration({ client_name: "ChatGPT", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect", "https://chatgpt.com/connector_platform_oauth_redirect"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"], response_types: ["code"] });
  assert.deepEqual(ok, { name: "ChatGPT", redirects: ["https://chatgpt.com/connector_platform_oauth_redirect"] });
  assert.deepEqual(checkRegistration({ redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] }), { name: "AI app", redirects: ["https://claude.ai/api/mcp/auth_callback"] });
  assert.equal((checkRegistration({ client_name: "Bad\u0000\nName" + "x".repeat(100), redirect_uris: ["https://a.io/cb"] }) as { name: string }).name, `BadName${"x".repeat(53)}`);
  assert.equal((checkRegistration({ redirect_uris: [] }) as { error: string }).error, "invalid_redirect_uri");
  assert.equal((checkRegistration({ redirect_uris: "https://a.io/cb" }) as { error: string }).error, "invalid_redirect_uri");
  assert.equal((checkRegistration({ redirect_uris: Array.from({ length: 11 }, (_, i) => `https://a.io/${i}`) }) as { error: string }).error, "invalid_redirect_uri");
  assert.equal((checkRegistration({ redirect_uris: ["http://a.io/cb"] }) as { error: string }).error, "invalid_redirect_uri");
  assert.equal((checkRegistration({ redirect_uris: ["https://a.io/cb"], token_endpoint_auth_method: "client_secret_basic" }) as { error: string }).error, "invalid_client_metadata");
  assert.equal((checkRegistration({ redirect_uris: ["https://a.io/cb"], grant_types: ["client_credentials"] }) as { error: string }).error, "invalid_client_metadata");
  assert.equal((checkRegistration({ redirect_uris: ["https://a.io/cb"], response_types: ["token"] }) as { error: string }).error, "invalid_client_metadata");
});

test("client ids are long and random", () => {
  const a = newClientId(), b = newClientId();
  assert.ok(DYNAMIC_ID.test(a) && DYNAMIC_ID.test(b));
  assert.notEqual(a, b);
});

test("a registered app returns only to what it registered, must send a code check, and shows where it returns to", () => {
  const app = dynamicClient("mcp_" + "x".repeat(32), { name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"] });
  const q = { client_id: app.id, redirect_uri: "https://claude.ai/api/mcp/auth_callback", response_type: "code", state: "s", code_challenge: CHALLENGE, code_challenge_method: "S256" };
  const ok = checkAuthorize(q, app);
  assert.ok(!("error" in ok));
  if (!("error" in ok)) assert.equal(ok.client.domain, "claude.ai");
  assert.ok("error" in checkAuthorize({ ...q, redirect_uri: "https://claude.ai/api/mcp/auth_callback/../evil" }, app));
  assert.ok("error" in checkAuthorize({ ...q, redirect_uri: "https://evil.io/api/mcp/auth_callback" }, app));
  assert.ok("error" in checkAuthorize({ ...q, code_challenge: undefined, code_challenge_method: undefined }, app), "no code check");
  assert.ok("error" in checkAuthorize({ ...q, code_challenge_method: "plain" }, app));
  assert.ok("error" in checkAuthorize(q, null));
  // Calling itself "ChatGPT" from someone else's address still shows that address.
  const fake = dynamicClient("mcp_" + "y".repeat(32), { name: "ChatGPT", redirect_uris: ["https://www.evil.io/cb"] });
  const shown = checkAuthorize({ ...q, client_id: fake.id, redirect_uri: "https://www.evil.io/cb" }, fake);
  assert.ok(!("error" in shown) && shown.client.domain === "evil.io");
});

test("findClient: the fixed apps without a read, registered ids by a read, anything else never read", async () => {
  let reads = 0;
  const load = async (id: string) => (reads++, id.endsWith("k".repeat(24)) ? { name: "Claude", redirect_uris: ["https://claude.ai/cb"] } : null);
  assert.equal((await findClient("zapier", load))?.name, "Zapier");
  assert.equal(reads, 0);
  assert.equal((await findClient("mcp_" + "k".repeat(24), load))?.public, true);
  assert.equal(await findClient("mcp_" + "z".repeat(24), load), null);
  assert.equal(reads, 2);
  for (const id of ["mcp_short", "toString", "__proto__", "constructor", 7, null]) assert.equal(await findClient(id, load), null);
  assert.equal(reads, 2);
});

test("the MCP server points to its sign-in, and the sign-in lists its addresses", async () => {
  const r = mcpSignIn();
  assert.equal(r.status, 401);
  assert.match(r.headers.get("www-authenticate") ?? "", /^Bearer resource_metadata="https:\/\/app\.tryclaritia\.com\/\.well-known\/oauth-protected-resource"/);
  assert.equal(resourceMeta().resource, "https://app.tryclaritia.com/api/mcp");
  const s = serverMeta();
  assert.deepEqual(s.code_challenge_methods_supported, ["S256"]);
  assert.ok(s.token_endpoint_auth_methods_supported.includes("none"));
  assert.equal(s.registration_endpoint, "https://app.tryclaritia.com/api/oauth/register");
  assert.equal(s.authorization_endpoint, "https://app.tryclaritia.com/oauth/authorize");
});
