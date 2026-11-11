"use client";

// Inbound › Forms › Studio (/forms/studio, docs/studio-v2-plan.md): every form is one chat with Tia on the left and the
// live form on the right. The screen itself is plain DOM in a shadow root (studio.ts); this part hands it the
// workspace: its brands with their real logos and CSS, its meeting types, its chats (form_chats, 112) and the calls to
// /api/studio. Until 112 is applied, chats and brand CSS are kept in this browser. The app's sidebar folds to icons
// while the Studio is open and comes back as it was after.

import { useEffect, useRef, type MutableRefObject } from "react";
import { logoOf, logosOf, type KitLite } from "./brandKit";
import { styleCssById, styleOf } from "@/lib/studio/styleCss";
import { fetchMeetingTypes } from "../../meetings/TypesList";
import { brandName } from "@/lib/brand/name";
import { readProfile } from "@/lib/studio/industries";
import { alwaysOf } from "@/lib/studio/page";
import { invalidate, must, postJson, type ViewProps } from "../../ui";
import { mountStudio, STUDIO_CSS, STUDIO_HTML, type StudioApi, type StudioControl, type StudioState } from "./studio";
import { readLines as readStream } from "../../streamLines";
import { askConfirm, askText, tell } from "../../Dialogs";
import { rt, type Screen } from "../../routing/rt/api";
import { whoBooks } from "@/lib/meetings/dynamicWords";
import { brandPlan } from "@/lib/meetings/brandPage";
import { entryOf } from "@/lib/sources/catalog";
import { moveForm } from "../folders";

type Line = { t?: string; done?: string; cut?: boolean; css?: string; say?: string; profile?: unknown; error?: string; working?: number; beat?: number };

/** Read a stream of JSON lines from /api/studio, one line at a time. */
const readLines = (res: Response, onLine: (l: Line) => void) => readStream<Line>(res, onLine);

const KIT_COLS = "id, name, source_url, scan_status, logo_url, logo_svg";
type Chat = Awaited<ReturnType<StudioApi["chats"]>>[number];
const read = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const hostOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

/**
 * `formId`: a studio form to open in its chat. `chatId`: one chat. `fresh`: New form, a new chat. The page's header
 * (FormHeader) shows the state from `onState` and publishes through `controlRef`.
 */
export function Studio({ sb, session, ws, navigate, formId = "", chatId = "", fresh = false, text = "", onState, controlRef }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { formId?: string; chatId?: string; fresh?: boolean; text?: string; onState?: (s: StudioState) => void; controlRef?: MutableRefObject<StudioControl | null> }) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The session changes as its token refreshes; the studio always calls with the newest.
  const sessionRef = useRef(session);
  const navRef = useRef(navigate);
  const stateRef = useRef(onState);
  useEffect(() => {
    sessionRef.current = session;
    navRef.current = navigate;
    stateRef.current = onState;
  }, [session, navigate, onState]);

  // The sidebar folds to icons while the Studio is open (Sidebar.tsx listens).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("claritia:studio", { detail: true }));
    return () => void window.dispatchEvent(new CustomEvent("claritia:studio", { detail: false }));
  }, []);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const shell = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    shell.innerHTML = `<style>${STUDIO_CSS}</style>${STUDIO_HTML}`;
    const post = (b: object, signal?: AbortSignal) =>
      fetch("/api/studio", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionRef.current.access_token}` }, body: JSON.stringify({ workspaceId: ws.id, ...b }) });
    const LOCAL = `clr-studio-chats:${ws.id}`;
    const cssKey = (id: string) => `clr-studio-css:${id}`;
    const profileKey = (id: string) => `clr-studio-profile:${id}`;
    // Before 112 the chats live in this browser; the browser copy stays as a backup after.
    let local = false;
    const localChats = () => read<Chat[]>(LOCAL, []);
    const keepLocal = (c: Chat) => write(LOCAL, [c, ...localChats().filter((x) => x.id !== c.id)].slice(0, 40));

    const api: StudioApi = {
      start: { formId, chatId, fresh, text },
      onState: (st) => stateRef.current?.(st),
      brands: async () => {
        // The brand's CSS (112) and industry (113), falling back as the database catches up.
        let res = await sb.from("brand_kits").select(`${KIT_COLS}, studio_css, studio_profile`).eq("workspace_id", ws.id).order("created_at");
        if (res.error) res = (await sb.from("brand_kits").select(`${KIT_COLS}, studio_css`).eq("workspace_id", ws.id).order("created_at")) as typeof res;
        if (res.error) res = (await sb.from("brand_kits").select(KIT_COLS).eq("workspace_id", ws.id).order("created_at")) as typeof res;
        const kits = (must(res) ?? []) as (KitLite & { name?: string | null; studio_css?: string | null; studio_profile?: unknown })[];
        return kits
          .filter((k) => k.source_url)
          .map((k) => ({ id: k.id, name: brandName(k), site: hostOf(k.source_url), logo: logoOf(k), logos: logosOf(k), css: k.studio_css || read<string>(cssKey(k.id), ""), profile: readProfile(k.studio_profile) ?? readProfile(read(profileKey(k.id), null)) }));
      },
      // Paid plans book in the form's own style; Free books in the plain calendar. Unread counts as paid.
      calendarBrand: async () => {
        const r = await sb.from("workspace_billing").select("plan").eq("workspace_id", ws.id).maybeSingle();
        return r.error ? true : brandPlan((r.data as { plan?: string } | null)?.plan ?? "free");
      },
      meetings: async () => {
        const types = (await fetchMeetingTypes(sb, ws.id)).filter((t) => t.active);
        // A Dynamic meeting shows who books it in one line; the names come from the routing screen.
        const dyn = (t: (typeof types)[number]) => !!(t.settings as { dynamic?: unknown; team?: string })?.dynamic || !!(t.settings as { team?: string })?.team;
        const screen = types.some(dyn) ? await rt<Screen>(sessionRef.current, ws.id, "rt_screen").catch(() => null) : null;
        return types.map((t) => ({
          id: t.id,
          name: t.name,
          length: t.settings?.lengths?.[0] ?? 30,
          ...(dyn(t) ? { dynamic: true, who: screen ? whoBooks(t as Parameters<typeof whoBooks>[0], { fields: screen.fields, teams: screen.teams, people: screen.people }) : "" } : {}),
        }));
      },
      chats: async () => {
        const res = await sb.from("form_chats").select("id, name, state, brand_kit_id, form_id, updated_at").eq("workspace_id", ws.id).order("updated_at", { ascending: false }).limit(200);
        if (res.error) {
          local = true;
          return localChats();
        }
        const rows = ((res.data ?? []) as { id: string; name: string; state: Chat["state"]; brand_kit_id: string | null; form_id: string | null; updated_at: string }[]).map((r) => ({ id: r.id, name: r.name, state: r.state, brandId: r.brand_kit_id ?? "", formId: r.form_id ?? "", updatedAt: r.updated_at }));
        // Chats kept in this browser before 112 move to the server.
        const extra = localChats().filter((c) => !rows.some((r) => r.id === c.id) && c.body?.html);
        for (const c of extra) void api.saveChat(c);
        return [...rows, ...extra].sort((a, b) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")));
      },
      chat: async (id) => {
        if (!local) {
          const res = await sb.from("form_chats").select("id, name, state, brand_kit_id, form_id, updated_at, body").eq("id", id).maybeSingle();
          const r = res.data as { id: string; name: string; state: Chat["state"]; brand_kit_id: string | null; form_id: string | null; updated_at: string; body: Chat["body"] } | null;
          if (r && r.form_id) {
            // The form changed on its page after this chat (Settings' team alert, a new name in the header): the chat
            // shows it as it is now.
            const f = (await sb.from("forms").select("name, draft, updated_at").eq("id", r.form_id).maybeSingle()).data as { name?: string; draft?: { notify?: unknown }; updated_at: string } | null;
            if (f && f.updated_at > r.updated_at) {
              if (f.name) r.name = f.name;
              if (f.draft?.notify && r.body?.after) r.body = { ...r.body, after: { ...r.body.after, always: alwaysOf(f.draft.notify) } };
            }
          }
          if (r) return { id: r.id, name: r.name, state: r.state, brandId: r.brand_kit_id ?? "", formId: r.form_id ?? "", updatedAt: r.updated_at, body: r.body };
        }
        return localChats().find((c) => c.id === id) ?? null;
      },
      fromForm: async (id) => {
        const row = must(await sb.from("forms").select("id, name, status, draft, brand_kit_id").eq("id", id).maybeSingle()) as { id: string; name: string; status: string; draft: { page?: { html: string; css: string; brand: string; after?: Record<string, unknown> } } | null; brand_kit_id: string | null } | null;
        const pg = row?.draft?.page;
        if (!row || !pg) return null;
        // A form in one of the website's styles keeps it (src/lib/studio/styleCss.ts), with its own edits to the CSS.
        const style = styleOf(pg.brand);
        if (row.brand_kit_id && pg.brand && !style && !read<string>(cssKey(row.brand_kit_id), "")) write(cssKey(row.brand_kit_id), pg.brand);
        const look = style ? { style, ...(pg.brand !== styleCssById(style) ? { styleCss: pg.brand } : {}) } : {};
        return { id: crypto.randomUUID(), name: row.name, state: row.status === "live" ? "live" : "draft", brandId: row.brand_kit_id ?? "", formId: row.id, brandCss: style ? "" : pg.brand, body: { ...look, html: pg.html, css: pg.css, after: { kind: "thanks", url: "", meeting: "", routes: [], ...(pg.after ?? {}), ...((row.draft as { notify?: unknown }).notify ? { always: alwaysOf((row.draft as { notify?: unknown }).notify) } : {}) }, turns: [], log: [] } };
      },
      saveChat: async (c) => {
        keepLocal(c);
        if (local) return;
        const res = await post({ mode: "chat-save", chat: c });
        if (res.status === 503) local = true;
      },
      deleteChat: async (id) => {
        write(LOCAL, localChats().filter((x) => x.id !== id));
        if (!local) await post({ mode: "chat-delete", id });
      },
      keepProfile: (id, profile) => {
        write(profileKey(id), profile);
        void post({ mode: "brand-profile", kitId: id, profile }).catch(() => undefined);
      },
      keepCss: (id, css) => {
        write(cssKey(id), css);
        void post({ mode: "brand-css", kitId: id, css }).catch(() => undefined);
      },
      publish: async (p) => {
        const { formId: id } = await postJson<{ formId: string }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "save", ...p });
        const r = await postJson<{ routing?: { problems?: string[]; error?: string } }>(sessionRef.current, "/api/forms/publish", { workspaceId: ws.id, id });
        invalidate(`forms:${ws.id}:home`);
        const problem = r.routing?.error || r.routing?.problems?.[0];
        return { formId: id, ...(problem ? { problem } : {}) };
      },
      formUrl: (id) => `${location.origin}/f/${id}`,
      readSite: async (host) => {
        const res = await post({ mode: "site", url: host });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error ?? `Couldn't open ${host}.`), { browser: !!data.browser });
        return data;
      },
      scan: (host) => postJson<{ kitId: string }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "scan", url: host }),
      kit: async (id) => {
        const k = must(await sb.from("brand_kits").select(KIT_COLS).eq("id", id).maybeSingle()) as (KitLite & { name: string | null }) | null;
        return k ? { name: brandName(k), logo: logoOf(k), logoUrl: k.logo_url ?? null, logoSvg: k.logo_svg ?? null, scanStatus: k.scan_status } : null;
      },
      confirm: async (b) => {
        const r = await postJson<{ kitId: string }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "confirm", ...b });
        invalidate((k) => k.startsWith(`forms:${ws.id}`));
        return r;
      },
      look: async (kitId, again) => {
        let out: { css: string; say: string; profile: ReturnType<typeof readProfile> } | null = null;
        let err = "";
        await readLines(await post({ mode: "look", kitId, fresh: again }), (l) => {
          if (l.error) err = l.error;
          if (l.css) out = { css: l.css, say: l.say ?? "", profile: readProfile(l.profile) };
        });
        if (!out) throw new Error(err || "Couldn't read the brand's look. Try again.");
        return out;
      },
      times: (typeId) => postJson<{ starts: number[]; length: number }>(sessionRef.current, "/api/meetings/times", { workspaceId: ws.id, typeId, pick: true }),
      translate: async (texts, lang) => (await postJson<{ texts: string[] }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "translate", texts, lang })).texts,
      tia: async (turns, onText, signal, o) => {
        let all = "";
        let done: { text: string; cut: boolean } | null = null;
        let err = "";
        try {
          await readLines(await post({ mode: "chat", turns, brand: o?.brand ?? "", built: !!o?.built, files: o?.files ?? [] }, signal), (l) => {
            if (l.t) {
              all += l.t;
              onText(all);
            }
            if (l.error) err = l.error;
            if (typeof l.done === "string") done = { text: l.done, cut: !!l.cut };
          });
        } catch (e) {
          // What came before a stop or a dropped line still counts.
          throw Object.assign(e instanceof Error ? e : new Error(String(e)), { text: all });
        }
        if (done) return done;
        throw Object.assign(new Error(err || "Tia didn't finish. Try again."), { text: all });
      },
      deleteBrand: async (id) => {
        must(await sb.rpc("brand_kit_delete", { p_id: id }));
      },
      openMeetings: () => navRef.current("scheduling", "types"),
      openMeeting: (id) => navRef.current("scheduling", `types/${id}`),
      saveDraft: async (p) => {
        const r = await postJson<{ formId: string }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "save", ...p });
        invalidate(`forms:${ws.id}:home`);
        return r;
      },
      sends: async (id) => {
        const [d, src] = await Promise.all([
          sb.from("form_destinations").select("id, kind, source_id, name").eq("form_id", id).order("position"),
          sb.from("sources").select("id, kind").eq("workspace_id", ws.id),
        ]);
        const kinds = new Map(((src.data ?? []) as { id: string; kind: string }[]).map((x) => [x.id, x.kind]));
        return ((must(d) ?? []) as { id: string; kind: string; source_id: string | null; name: string }[])
          .filter((x) => x.kind !== "slack")
          .map((x) => ({ id: x.id, kind: x.kind, name: x.name, domain: x.source_id ? (entryOf(kinds.get(x.source_id) ?? "")?.domain ?? null) : null }));
      },
      tools: async () => {
        const rows = (must(await sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name")) ?? []) as { id: string; kind: string; name: string; status: string }[];
        // Email tools need a list picked and sheets a target: they're set up in the form's Sync tab.
        return rows.filter((x) => x.status !== "disconnected" && (entryOf(x.kind)?.twoWay || entryOf(x.kind)?.pushes) && !entryOf(x.kind)?.lists && !entryOf(x.kind)?.rows).map((x) => ({ id: x.id, kind: x.kind, name: x.name, domain: entryOf(x.kind)?.domain ?? null }));
      },
      addSend: async (id, to) => {
        if (to === "webhook") {
          const url = await askText("Webhook address", { placeholder: "https://", ok: "Add" });
          if (!url) return false;
          let name = "Webhook";
          try {
            name = new URL(url).hostname || name;
          } catch {}
          const r = await postJson<{ secret?: string }>(sessionRef.current, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "webhook", name, url });
          if (r.secret) await tell("Signing secret", `Shown once. It signs the x-claritia-signature header.\n\n${r.secret}`);
          return true;
        }
        await postJson(sessionRef.current, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "source", sourceId: to.id, name: to.name });
        return true;
      },
      removeSend: async (d) => {
        if (!(await askConfirm(`Stop sending to ${d.name}?`, { body: "Sends already made stay there.", ok: "Remove", danger: true }))) return false;
        must(await sb.rpc("form_destination_delete", { p_id: d.id }));
        return true;
      },
      followUps: async (id) => {
        const res = await sb.from("workflows").select("id, name, status").eq("workspace_id", ws.id).contains("draft", { trigger: { forms: [id] } }).order("created_at");
        return ((must(res) ?? []) as { id: string; name: string; status: string }[]).map((x) => ({ id: x.id, name: x.name, status: x.status }));
      },
      newFollowUp: (id, when) => navRef.current("workflows", "new", `template=${when === "not_booked" ? "not_booked" : "form_followup"}&form=${id}`),
      openWorkflow: (id) => navRef.current("workflows", id),
      // Loaded only when an empty canvas shows them, so the catalog stays out of the Studio's first load.
      templates: async () => (await import("@/lib/forms/gallery/studioList")).studioTemplates(),
      templatePage: async (id, css) => (await import("@/lib/forms/gallery/studioList")).templatePreview(id, css),
      useTemplate: async (id, look) => {
        const r = await postJson<{ id: string; workflowError?: string }>(sessionRef.current, "/api/forms/templates", { workspaceId: ws.id, template: id, ...look });
        // New form from a folder's page: it goes in that folder.
        let to = "";
        try {
          to = sessionStorage.getItem("clr-new-form-folder") ?? "";
          sessionStorage.removeItem("clr-new-form-folder");
        } catch {}
        if (to) await moveForm(sb, ws.id, r.id, to).catch(() => undefined);
        invalidate(`forms:${ws.id}:home`);
        invalidate(`form_names:${ws.id}`);
        invalidate("app_counts");
        invalidate(`workflows:${ws.id}`);
        return r;
      },
      openForm: (id) => navRef.current("forms", id),
      // Photos: the workspace's library (/api/assets), the same one the email builder uses.
      pictures: async () => {
        const res = await sb.from("design_assets").select("id, url, name, sizes").eq("workspace_id", ws.id).eq("kind", "image").order("created_at", { ascending: false }).limit(60);
        return (must(res) ?? []) as { id: string; url: string; name: string; sizes: number[] }[];
      },
      uploadPicture: async (file) => {
        const body = new FormData();
        body.set("workspaceId", ws.id);
        body.set("file", file);
        const res = await fetch("/api/assets", { method: "POST", headers: { Authorization: `Bearer ${sessionRef.current.access_token}` }, body });
        const data = (await res.json().catch(() => ({}))) as { url?: string; sizes?: number[]; error?: string };
        if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't upload this photo. Try again.");
        invalidate(`design_assets:${ws.id}`);
        return { url: data.url, sizes: data.sizes ?? [] };
      },
      people: async () => {
        const screen = await rt<Screen>(sessionRef.current, ws.id, "rt_screen").catch(() => null);
        return [...new Set((screen?.people ?? []).map((p) => (p as { name?: string | null; email?: string | null }).name || (p as { email?: string | null }).email || "").filter(Boolean))].slice(0, 200);
      },
    };
    const ctl = mountStudio(shell, api);
    if (controlRef) controlRef.current = ctl;
    return () => {
      ctl.stop();
      if (controlRef?.current === ctl) controlRef.current = null;
      shell.innerHTML = "";
    };
  }, [sb, ws.id, formId, chatId, fresh, text, controlRef]);

  return <div ref={hostRef} data-studio-host="" className="relative flex h-full min-h-0 flex-1 flex-col bg-card" />;
}
