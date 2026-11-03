import { gh, githubConfig, installationToken } from "@/lib/githubApp";
import { requireUser } from "@/lib/serverAuth";

type Repo = { id: number; full_name: string; private: boolean };

/** The repositories the workspace's GitHub installations can reach, to link to a project. */
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  if (!githubConfig()) return Response.json({ configured: false, repos: [] });
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown };
  if (typeof body.workspaceId !== "string") return Response.json({ error: "Missing workspace." }, { status: 400 });
  // Row level security: only the caller's own workspace's installations come back.
  const { data: installs, error } = await auth.sb.from("github_installations").select("id, account_login").eq("workspace_id", body.workspaceId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let repos: { id: number; full_name: string; installation_id: number }[] = [];
  try {
    // Every installation at once (each GitHub call has its own 10 s limit in gh); pages within one stay in order.
    const per = await Promise.all(
      ((installs ?? []) as { id: number }[]).map(async (inst) => {
        const token = await installationToken(inst.id);
        const out: { id: number; full_name: string; installation_id: number }[] = [];
        for (let page = 1; page <= 5; page++) {
          const data = await gh<{ repositories: Repo[] }>("GET", `/installation/repositories?per_page=100&page=${page}`, token);
          out.push(...data.repositories.map((r) => ({ id: r.id, full_name: r.full_name, installation_id: inst.id })));
          if (data.repositories.length < 100) break;
        }
        return out;
      }),
    );
    repos = per.flat();
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
  return Response.json({ configured: true, repos: repos.sort((a, b) => a.full_name.localeCompare(b.full_name)) });
}
