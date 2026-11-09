import { APP_URL } from "../site.ts";

// What MCP apps (ChatGPT, Claude) read before signing in (docs/mcp.md): the MCP server names its sign-in server
// (RFC 9728), and the sign-in server lists its addresses (RFC 8414). Both answer on any origin.

export const MCP_URL = `${APP_URL}/api/mcp`;
export const RESOURCE_META_URL = `${APP_URL}/.well-known/oauth-protected-resource`;

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version",
  "Access-Control-Max-Age": "86400",
};

export const resourceMeta = () => ({
  resource: MCP_URL,
  authorization_servers: [APP_URL],
  scopes_supported: ["forms"],
  bearer_methods_supported: ["header"],
  resource_name: "Claritia",
});

export const serverMeta = () => ({
  issuer: APP_URL,
  authorization_endpoint: `${APP_URL}/oauth/authorize`,
  token_endpoint: `${APP_URL}/api/oauth/token`,
  registration_endpoint: `${APP_URL}/api/oauth/register`,
  scopes_supported: ["forms"],
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
});

/** The 401 an MCP app reads to find the sign-in. */
export const mcpSignIn = () =>
  Response.json(
    { error: "Sign in to Claritia, or send an API key as 'Authorization: Bearer clr_...'." },
    { status: 401, headers: { "WWW-Authenticate": `Bearer resource_metadata="${RESOURCE_META_URL}", scope="forms"`, ...CORS } },
  );
