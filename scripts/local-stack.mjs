// The app's backend on one machine, for clicking through screens in a real browser: a database built from every
// migration, PostgREST for the data API, and a small stand-in for Supabase Auth that signs one test user in. Next.js
// runs against it like it runs against Supabase.
//   POSTGREST_BIN=… node scripts/local-stack.mjs            builds the database "claritia_local" and serves :54321
//   PG_ADMIN=postgres://postgres@localhost/postgres        where to make the database (the default)
// Prints the env for `next dev` and the session to put in the browser's localStorage (scripts/screens-check.ts does
// both).

import { spawn, execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readdirSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";

const ADMIN = process.env.PG_ADMIN || "postgres://postgres@localhost/postgres";
const DB = process.env.LOCAL_DB || "claritia_local";
const URL_DB = ADMIN.replace(/\/[^/]*$/, `/${DB}`);
const PORT = Number(process.env.LOCAL_PORT || 54321);
const REST_PORT = PORT + 1;
const SECRET = "local-stack-jwt-secret-that-is-at-least-32-chars";
const BIN = process.env.POSTGREST_BIN;
if (!BIN) throw new Error("Set POSTGREST_BIN to the PostgREST binary");

const psql = (url, args) => execFileSync("psql", [url, "-qX", "-v", "ON_ERROR_STOP=1", ...args], { stdio: ["ignore", "ignore", "inherit"] });
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export const sign = (claims) => {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(claims);
  return `${head}.${body}.${createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url")}`;
};
const verify = (token) => {
  const [h, b, s] = String(token).split(".");
  if (!s || createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url") !== s) return null;
  return JSON.parse(Buffer.from(b, "base64url").toString());
};

if (process.env.LOCAL_KEEP !== "1") {
  psql(ADMIN, ["-c", `drop database if exists ${DB} with (force)`, "-c", `create database ${DB}`]);
  psql(URL_DB, ["-f", "tests/db/supabase_stub.sql"]);
  for (const f of readdirSync("supabase/migrations").filter((x) => x.endsWith(".sql")).sort()) psql(URL_DB, ["-f", `supabase/migrations/${f}`]);
}
// What Supabase does for these roles, and the claims PostgREST sets, in the names the stub's auth.uid() reads.
psql(URL_DB, [
  "-c",
  `alter role service_role bypassrls;
   grant all on all tables in schema public to service_role;
   grant all on all sequences in schema public to service_role;
   grant usage on schema storage to service_role;
   create or replace function public.local_pre_request() returns void language sql as $$
     select set_config('request.jwt.claim.sub', coalesce(current_setting('request.jwt.claims', true)::json->>'sub', ''), true),
            set_config('request.jwt.claim.email', coalesce(current_setting('request.jwt.claims', true)::json->>'email', ''), true);
   $$;
   grant execute on function public.local_pre_request() to anon, authenticated, service_role;`,
]);

const user = { id: randomUUID(), email: "you@acme.com" };
psql(URL_DB, ["-c", `insert into auth.users (id, email) values ('${user.id}', '${user.email}')`]);

const rest = spawn(BIN, [], {
  env: {
    ...process.env,
    PGRST_DB_URI: URL_DB,
    PGRST_DB_SCHEMAS: "public",
    PGRST_DB_ANON_ROLE: "anon",
    PGRST_JWT_SECRET: SECRET,
    PGRST_SERVER_PORT: String(REST_PORT),
    PGRST_DB_PRE_REQUEST: "public.local_pre_request",
    PGRST_LOG_LEVEL: "error",
  },
  stdio: "inherit",
});
process.on("exit", () => rest.kill());
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => process.exit(0));

const now = () => Math.floor(Date.now() / 1000);
const anon = sign({ role: "anon", iss: "local", iat: now(), exp: now() + 86400 * 30 });
const service = sign({ role: "service_role", iss: "local", iat: now(), exp: now() + 86400 * 30 });
const authUser = { id: user.id, aud: "authenticated", role: "authenticated", email: user.email, app_metadata: { provider: "email" }, user_metadata: {}, created_at: new Date().toISOString() };
const session = () => {
  const access = sign({ sub: user.id, email: user.email, role: "authenticated", aud: "authenticated", iat: now(), exp: now() + 86400 });
  return { access_token: access, refresh_token: "local-refresh", token_type: "bearer", expires_in: 86400, expires_at: now() + 86400, user: authUser };
};

const gateway = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS", "access-control-expose-headers": "*" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  const json = (status, body) => res.writeHead(status, { ...cors, "content-type": "application/json" }).end(JSON.stringify(body));
  if (url.pathname.startsWith("/auth/v1/")) {
    const path = url.pathname.slice(9);
    if (path === "user") return verify(req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "")?.sub ? json(200, authUser) : json(401, { msg: "Invalid token" });
    if (path === "token") return json(200, session());
    if (path === "logout") return res.writeHead(204, cors).end();
    return json(404, { msg: "Not in the local stack" });
  }
  if (url.pathname.startsWith("/rest/v1/")) {
    const p = httpRequest({ host: "127.0.0.1", port: REST_PORT, method: req.method, path: url.pathname.slice(8) + url.search, headers: { ...req.headers, host: `127.0.0.1:${REST_PORT}` } }, (up) => {
      res.writeHead(up.statusCode ?? 502, { ...up.headers, ...cors });
      up.pipe(res);
    });
    p.on("error", () => json(502, { message: "PostgREST isn't up yet" }));
    return void req.pipe(p);
  }
  json(404, { message: "Not in the local stack" });
});
gateway.listen(PORT, () => {
  const out = { env: { SUPABASE_URL: `http://localhost:${PORT}`, SUPABASE_PUBLISHABLE_KEY: anon, SUPABASE_SECRET_KEY: service }, pg: URL_DB, user, session: session(), storageKey: "sb-localhost-auth-token" };
  if (process.env.LOCAL_OUT) writeFileSync(process.env.LOCAL_OUT, JSON.stringify(out));
  console.log(`local stack on :${PORT} (database ${DB})`);
});
