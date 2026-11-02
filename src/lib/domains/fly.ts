// Certificates for custom link domains on Fly (docs/sharing-plan.md step 4), through Fly's GraphQL API: add one when
// a team adds its domain, ask whether it's ready, and remove it with the domain. Needs FLY_API_TOKEN on the web app
// (`fly tokens create deploy`); FLY_APP_NAME is set by Fly on its machines. Endpoint and fields: check.

const API = "https://api.fly.io/graphql";

export type Fly = { token: string; app: string; fetcher?: typeof fetch };
export type Cert = { configured: boolean; status: string };

export const flyFromEnv = (): Fly | null => {
  const token = process.env.FLY_API_TOKEN?.trim();
  const app = process.env.FLY_APP_NAME?.trim() || "claritia-web";
  return token ? { token, app } : null;
};

/** The address a custom domain's CNAME points at. */
export const linkTarget = () => process.env.LINK_DOMAIN_TARGET?.trim() || `${process.env.FLY_APP_NAME?.trim() || "claritia-web"}.fly.dev`;

async function gql<T>(f: Fly, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await (f.fetcher ?? fetch)(API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${f.token}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] };
  if (!res.ok || j.errors?.length) throw new Error(j.errors?.[0]?.message || `Fly answered ${res.status}`);
  return j.data as T;
}

const read = (c: { configured?: boolean; clientStatus?: string } | null | undefined): Cert | null => (c ? { configured: c.configured === true, status: String(c.clientStatus ?? "") } : null);

export async function addCert(f: Fly, hostname: string): Promise<Cert | null> {
  const d = await gql<{ addCertificate?: { certificate?: { configured?: boolean; clientStatus?: string } } }>(
    f,
    "mutation($appId: ID!, $hostname: String!) { addCertificate(appId: $appId, hostname: $hostname) { certificate { configured clientStatus } } }",
    { appId: f.app, hostname },
  );
  return read(d.addCertificate?.certificate);
}

export async function checkCert(f: Fly, hostname: string): Promise<Cert | null> {
  const d = await gql<{ app?: { certificate?: { configured?: boolean; clientStatus?: string } | null } }>(
    f,
    "query($app: String!, $hostname: String!) { app(name: $app) { certificate(hostname: $hostname) { configured clientStatus } } }",
    { app: f.app, hostname },
  );
  return read(d.app?.certificate);
}

export async function removeCert(f: Fly, hostname: string): Promise<void> {
  await gql(f, "mutation($appId: ID!, $hostname: String!) { deleteCertificate(appId: $appId, hostname: $hostname) { app { name } } }", { appId: f.app, hostname });
}

/** Ready to serve: Fly has the certificate issued. */
export const certReady = (c: Cert | null) => !!c && c.configured && /^(ready|issued|active)$/i.test(c.status || "ready");
