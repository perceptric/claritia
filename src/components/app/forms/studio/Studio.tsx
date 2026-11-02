"use client";

// Inbound › Forms › Studio (/forms/studio, docs/forms-chat-plan.md): the chat with Claude on the left, the live form on
// the right. The screen itself is plain DOM in a shadow root (studio.ts); this part hands it the workspace: its brands
// with their real logos, its meeting types, and the calls to /api/studio.

import { useEffect, useRef } from "react";
import { logoOf, type KitLite } from "../new/NewForm";
import { fetchMeetingTypes } from "../../meetings/TypesList";
import { must, postJson, type ViewProps } from "../../ui";
import { mountStudio, STUDIO_CSS, STUDIO_HTML, type StudioApi } from "./studio";

type Line = { t?: string; done?: string; cut?: boolean; css?: string; say?: string; error?: string; working?: number; beat?: number };

/** Read a stream of JSON lines from /api/studio, one line at a time. */
async function readLines(res: Response, onLine: (l: Line) => void) {
  if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    let at: number;
    while ((at = buf.indexOf("\n")) >= 0) {
      const raw = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (raw) onLine(JSON.parse(raw) as Line);
    }
    if (done) break;
  }
}

const KIT_COLS = "id, name, source_url, scan_status, logo_url, logo_svg";
const hostOf = (u: string | null | undefined) => {
  try {
    return u ? new URL(/^https?:\/\//.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};

export function Studio({ sb, session, ws, navigate }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate">) {
  const hostRef = useRef<HTMLDivElement>(null);
  // The session changes as its token refreshes; the studio always calls with the newest.
  const sessionRef = useRef(session);
  const navRef = useRef(navigate);
  useEffect(() => {
    sessionRef.current = session;
    navRef.current = navigate;
  }, [session, navigate]);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const shell = el.shadowRoot ?? el.attachShadow({ mode: "open" });
    shell.innerHTML = `<style>${STUDIO_CSS}</style>${STUDIO_HTML}`;
    const post = (body: object, signal?: AbortSignal) =>
      fetch("/api/studio", { method: "POST", signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionRef.current.access_token}` }, body: JSON.stringify({ workspaceId: ws.id, ...body }) });
    const kitOf = (k: KitLite & { name?: string | null }) => ({ id: k.id, name: k.name?.trim() || hostOf(k.source_url) || "Brand", site: hostOf(k.source_url), logo: logoOf(k) });

    const api: StudioApi = {
      key: `clr-form-studio:${ws.id}`,
      brands: async () => ((must(await sb.from("brand_kits").select(KIT_COLS).eq("workspace_id", ws.id).order("created_at")) ?? []) as KitLite[]).filter((k) => k.source_url).map(kitOf),
      meetings: async () =>
        (await fetchMeetingTypes(sb, ws.id))
          .filter((t) => t.active)
          .map((t) => ({ id: t.id, name: t.name, length: t.settings?.lengths?.[0] ?? 30, host: t.kind === "round_robin" ? "the team, round robin" : t.kind === "collective" ? "the team" : (t.hosts?.length ?? 0) > 1 ? "the team" : "the host" })),
      readSite: async (host) => {
        const res = await post({ mode: "site", url: host });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw Object.assign(new Error(data.error ?? `Couldn't open ${host}.`), { browser: !!data.browser });
        return data;
      },
      scan: (host) => postJson<{ kitId: string }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "scan", url: host }),
      kit: async (id) => {
        const k = must(await sb.from("brand_kits").select(KIT_COLS).eq("id", id).maybeSingle()) as (KitLite & { name: string | null }) | null;
        return k ? { name: k.name?.trim() || hostOf(k.source_url), logo: logoOf(k), logoUrl: k.logo_url ?? null, logoSvg: k.logo_svg ?? null, scanStatus: k.scan_status } : null;
      },
      confirm: (b) => postJson<{ kitId: string }>(sessionRef.current, "/api/studio", { workspaceId: ws.id, mode: "confirm", ...b }),
      look: async (kitId, fresh) => {
        let out: { css: string; say: string } | null = null;
        let err = "";
        await readLines(await post({ mode: "look", kitId, fresh }), (l) => {
          if (l.error) err = l.error;
          if (l.css) out = { css: l.css, say: l.say ?? "" };
        });
        if (!out) throw new Error(err || "Couldn't read the brand's look. Try again.");
        return out;
      },
      chat: async (turns, onText, signal) => {
        let all = "";
        let done: { text: string; cut: boolean } | null = null;
        let err = "";
        try {
          await readLines(await post({ mode: "chat", turns }, signal), (l) => {
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
        throw Object.assign(new Error(err || "Claude didn't finish. Try again."), { text: all });
      },
      deleteBrand: async (id) => {
        must(await sb.rpc("brand_kit_delete", { p_id: id }));
      },
      openMeetings: () => navRef.current("meetings"),
      back: () => navRef.current("forms"),
    };
    const stop = mountStudio(shell, api);
    return () => {
      stop();
      shell.innerHTML = "";
    };
  }, [sb, ws.id]);

  return <div ref={hostRef} className="relative flex h-full min-h-0 flex-1 flex-col bg-card" />;
}
