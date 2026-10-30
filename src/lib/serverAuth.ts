import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { roles } from "./roleCache.ts";
import { askAuth, verifyJwt, type Claims, type VerifyEnv } from "./verifyJwt.ts";

export const supabaseUrl = () => process.env.SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";

export type Auth = { sb: SupabaseClient; user: User; token: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const env = (): VerifyEnv | null => {
  const url = supabaseUrl();
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  return { url, apiKey: key, jwtSecret: process.env.SUPABASE_JWT_SECRET?.trim() || null };
};

// One client per token (a person's tabs share it), made only when a route reads through row level security.
const clients = new Map<string, { sb: SupabaseClient; until: number }>();

function userClient(url: string, key: string, token: string, exp: number): SupabaseClient {
  const now = Date.now();
  const hit = clients.get(token);
  if (hit && hit.until > now) return hit.sb;
  const sb = createClient(url, key, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (clients.size >= 500) {
    for (const [k, v] of clients) if (v.until <= now) clients.delete(k);
    while (clients.size >= 500) clients.delete(clients.keys().next().value!);
  }
  clients.set(token, { sb, until: exp * 1000 });
  return sb;
}

const userOf = (c: Claims): User =>
  ({
    id: c.sub,
    aud: typeof c.aud === "string" ? c.aud : "authenticated",
    role: c.role,
    email: c.email,
    phone: c.phone,
    is_anonymous: c.is_anonymous,
    app_metadata: c.app_metadata ?? {},
    user_metadata: c.user_metadata ?? {},
    created_at: "",
  }) as User;

/**
 * Check the caller is signed in: the access token is verified on this server (the project's signing keys, or the
 * HS256 secret), falling back to Supabase Auth only when it can't be. `fresh` always asks Supabase Auth, for the
 * few actions that must see a revoked session at once (billing). Returns the person and a Supabase client that acts
 * as them (made on first use), so row level security decides what they can reach; or a Response to send back.
 */
export async function requireUser(request: Request, o: { fresh?: boolean } = {}): Promise<Auth | { denied: Response }> {
  const e = env();
  const deny = (error: string, status: number) => ({ denied: Response.json({ error }, { status }) });
  if (!e) return deny("Supabase is not set up on the server.", 500);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return deny("Please sign in again.", 401);
  const v = o.fresh ? await askAuth(e, token, { fresh: true }) : await verifyJwt(e, token);
  if (!v.ok) return deny("Please sign in again.", 401);
  const user = userOf(v.claims);
  let sb: SupabaseClient | null = null;
  return {
    get sb() {
      return (sb ??= userClient(e.url, e.apiKey, token, v.claims.exp));
    },
    user,
    token,
  };
}

/**
 * The caller's role in a workspace ("owner", "member"), or null when they aren't in it or the id isn't one.
 * Kept for up to 60 s per person and workspace (src/lib/roleCache.ts). Read with the service client when the server
 * has it (the person is already verified), else through the person's own client.
 */
export async function roleIn(auth: { user: { id: string }; sb: SupabaseClient }, workspaceId: unknown, o: { fresh?: boolean } = {}): Promise<"owner" | "member" | null> {
  if (typeof workspaceId !== "string" || !UUID.test(workspaceId)) return null;
  const read = async () => {
    const { serviceClient } = await import("./serviceClient.ts");
    const db = serviceClient() ?? auth.sb;
    const { data, error } = await db.from("workspace_members").select("role").eq("workspace_id", workspaceId).eq("user_id", auth.user.id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { role?: string } | null)?.role ?? null;
  };
  // A failed read counts as "not in it" (as before) and isn't kept. `fresh` (billing) reads past the cache.
  const role = await (o.fresh ? read() : roles.get(workspaceId, auth.user.id, read)).catch(() => null);
  return role === "owner" ? "owner" : role ? "member" : null;
}
