"use client";

// New form (docs/forms.md Part 1). A full page: the steps on the left, the live preview on the right.
//   1. Describe and Styling: what the form is for, and its look (a saved brand, Claritia's, or a website to learn).
//   2. Layout: Claude thinks about one page or steps (its thinking shows as it goes), then the decision, why, and the
//      rough sketch. A switch flips it.
//   3. The form: built whole, checked, and shown live. Then a few more questions, each answer a small change.
//   4. Submission: contacts, the CRM, a team alert, the spam guard and the consent box.
//   5. End: a thank-you, a page or a meeting. Then Create form, or Publish.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tokens } from "@/lib/forms/brand";
import { baseForm, defaultSubmission, PAGE_URL, planLayout, type End, type Submission } from "@/lib/forms/newForm";
import { layoutOf, placeholderSpec, questionCount, toForm, toOnePage, toSteps, type Spec } from "@/lib/forms/spec";
import type { Brief, FollowUp, Plan, Thanks } from "@/lib/forms/specAi";
import { isCrmVendor } from "@/lib/sources/properties";
import { skinForKit } from "@/lib/brand/skin";
import { AiMark } from "../../Ai";
import { Select, type Option } from "../../Select";
import { ErrorNote, errorText, invalidate, must, postJson, useQuery, type ViewProps } from "../../ui";
import { useMeetingTypes } from "../../meetings/TypesList";
import { Ic } from "../ic";
import { BTN, EYEBROW, GHOST, GHOST_SM, IB, IN, Seg, Tg } from "../parts";
import { FormPreview } from "../shared";
import { Throbber } from "./Throbber";
import { Wireframe } from "./Wireframe";

export type KitLite = { id: string; tokens?: Partial<Tokens> | null; source_url: string | null; scan_status: string | null; logo_url?: string | null; logo_svg?: string | null; skin?: unknown };

/** A brand's logo as a picture address: its https logo, or its SVG drawn as a picture (no scripts run in one). */
export const logoOf = (k: KitLite | null | undefined): string | null =>
  k?.logo_url && /^https:\/\//.test(k.logo_url) ? k.logo_url : k?.logo_svg && /^\s*<svg[\s>]/i.test(k.logo_svg) ? `data:image/svg+xml;utf8,${encodeURIComponent(k.logo_svg)}` : null;

export const hostOf = (u: string | null | undefined) => {
  try {
    return u?.trim() ? new URL(/^https?:\/\//.test(u.trim()) ? u.trim() : `https://${u.trim()}`).hostname.replace(/^www\./, "") : "";
  } catch {
    return "";
  }
};
const hasLook = (k: KitLite) => Object.keys(k.tokens ?? {}).length > 0;

type Stage = "describe" | "planning" | "plan" | "building" | "questions" | "submission" | "end" | "saving";
const SCREENS = ["Describe", "Layout", "Form", "Submission", "End"] as const;
const screenOf = (s: Stage) => (s === "describe" ? 0 : s === "planning" || s === "plan" ? 1 : s === "building" || s === "questions" ? 2 : s === "submission" ? 3 : 4);

/** The plan stream: { thinking } lines while Claude thinks, then { plan } or { error }. */
async function streamPlan(token: string, body: object, onThinking: (t: string) => void): Promise<Plan> {
  const res = await fetch("/api/forms/new", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Something went wrong.");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    let at: number;
    while ((at = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, at).trim();
      buf = buf.slice(at + 1);
      if (!line) continue;
      const m = JSON.parse(line) as { thinking?: string; plan?: Plan; error?: string };
      if (m.thinking) onThinking(m.thinking);
      if (m.error) throw new Error(m.error);
      if (m.plan) return m.plan;
    }
    if (done) break;
  }
  throw new Error("The builder stopped before it was done. Try again.");
}

export function NewForm({ sb, session, ws, navigate, site, kits: start, onClose, note: initialNote = "" }: Pick<ViewProps, "sb" | "session" | "ws" | "navigate"> & { site: string; kits: KitLite[]; onClose: () => void; note?: string }) {
  const [kits, setKits] = useState<KitLite[]>(start);
  const usable = kits.filter((k) => hasLook(k) || k.scan_status === "scanning");
  const [stage, setStage] = useState<Stage>("describe");
  const [error, setError] = useState("");
  // 1. Describe and Styling
  const [note, setNote] = useState(initialNote);
  const [style, setStyle] = useState<string>(() => usable[0]?.id ?? "learn");
  const [url, setUrl] = useState(usable.length ? "" : site);
  const [learning, setLearning] = useState(false);
  // 2. Layout
  const [brief, setBrief] = useState<Brief | null>(null);
  const [reading, setReading] = useState(false);
  const [thinking, setThinking] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  // 3. The form
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<Spec | null>(null);
  const [thanks, setThanks] = useState<Thanks>({ title: "Thanks, we got it.", text: "" });
  const [changed, setChanged] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FollowUp[]>([]);
  const [at, setAt] = useState(0);
  const [answer, setAnswer] = useState<string | string[]>("");
  const [said, setSaid] = useState<{ q: string; a: string; note?: string }[]>([]);
  const [editing, setEditing] = useState(false);
  const [run, setRun] = useState(0);
  // 4 and 5
  const [submission, setSubmission] = useState<Submission>(() => defaultSubmission(session.user.email));
  const [addTo, setAddTo] = useState("");
  const [end, setEnd] = useState<End>({ kind: "thanks", title: "Thanks, we got it.", text: "" });
  const types = useMeetingTypes(sb, ws.id).data ?? [];
  const crmList = useQuery(`forms:${ws.id}:new-crms`, async () => ((must(await sb.from("sources").select("id, kind, name, status").eq("workspace_id", ws.id).order("name")) ?? []) as { id: string; kind: string; name: string; status: string }[]).filter((s) => isCrmVendor(s.kind) && s.status !== "disconnected")).data;
  const crms = useMemo(() => crmList ?? [], [crmList]);
  const crmsOn = useRef(false);
  useEffect(() => {
    // Every connected CRM gets the leads unless it's turned off here.
    if (crmsOn.current || !crms.length) return;
    crmsOn.current = true;
    setSubmission((s) => ({ ...s, crms: crms.map((c) => c.id) }));
  }, [crms]);

  const kit = kits.find((k) => k.id === style) ?? null;
  const skin = useMemo(() => skinForKit(kit, typeof window === "undefined" ? "" : window.location.origin), [kit]);
  const tokens: Partial<Tokens> = (kit?.tokens as Partial<Tokens> | null) ?? {};
  const accent = (tokens.buttonBg || tokens.accent || "") as string;
  const siteUrl = kit ? (kit.source_url ?? "") : style === "learn" ? url.trim() : "";
  const known = style === "learn" && hostOf(url) ? kits.find((k) => hostOf(k.source_url) === hostOf(url) && (hasLook(k) || k.scan_status === "scanning")) : undefined;
  // The site's look (/api/forms/skin): the page-source copy at once, and the browser's measured read on its way. Asked
  // once per brand while New form is open, or again with Try again or Copy again.
  type Look = { state: "copying" | "done" | "error"; error?: string; measuring?: boolean };
  const [looks, setLooks] = useState<Record<string, Look>>({});
  const asked = useRef(new Set<string>());
  const measuredSkin = (k: KitLite | null) => !!k?.skin && (k.skin as { via?: string }).via !== "source";
  const copyLook = useCallback(
    (id: string, fresh = false) => {
      asked.current.add(id);
      setLooks((l) => ({ ...l, [id]: { state: "copying", measuring: l[id]?.measuring } }));
      fetch("/api/forms/skin", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ workspaceId: ws.id, kitId: id, ...(fresh ? { fresh: true } : {}) }) })
        .then(async (res) => {
          const r = (await res.json().catch(() => ({}))) as { skin?: unknown; measuring?: boolean; error?: string };
          if (r.skin) setKits((ks) => ks.map((k) => (k.id === id ? { ...k, skin: r.skin } : k)));
          setLooks((l) => ({ ...l, [id]: r.skin ? { state: "done", measuring: !!r.measuring } : { state: "error", error: r.error ?? "Couldn't copy that site's look.", measuring: !!r.measuring } }));
        })
        .catch(() => setLooks((l) => ({ ...l, [id]: { state: "error", error: "Couldn't reach Claritia. Try again." } })));
    },
    [session.access_token, ws.id],
  );
  const kitId = kit?.id;
  const kitSite = kit?.source_url;
  const kitMeasured = measuredSkin(kit);
  useEffect(() => {
    if (!kitId || !kitSite || kitMeasured || asked.current.has(kitId)) return;
    copyLook(kitId);
  }, [kitId, kitSite, kitMeasured, copyLook]);
  const look = kit ? looks[kit.id] : undefined;
  const brandLoading = learning || (!!kit && (!hasLook(kit) || (look?.state === "copying" && !kit.skin)));

  // While a brand is being read or measured, check back so the preview takes it as soon as it lands: the quick look,
  // then the browser's measured look over the page-source one.
  const waiting = !!kit && (!hasLook(kit) || (!kitMeasured && (kit.scan_status === "scanning" || !!look?.measuring)));
  useEffect(() => {
    if (!kit || !waiting) return;
    let n = 0;
    const t = setInterval(async () => {
      if (++n > 60) return clearInterval(t);
      const { data } = await sb.from("brand_kits").select("*").eq("id", kit.id).maybeSingle();
      if (!data) return;
      const row = data as KitLite;
      // A page-source look in hand stays until a measured one replaces it.
      setKits((ks) => ks.map((k) => (k.id === kit.id ? { ...row, skin: row.skin ?? k.skin } : k)));
      if (row.scan_status !== "scanning") setLooks((l) => (l[kit.id]?.measuring ? { ...l, [kit.id]: { ...l[kit.id]!, measuring: false } } : l));
    }, 3000);
    return () => clearInterval(t);
  }, [sb, kit, waiting]);

  const learn = async () => {
    if (!hostOf(url) || learning) return;
    setLearning(true);
    setError("");
    try {
      const r = await postJson<{ kitId: string; tokens?: Partial<Tokens>; logo?: string }>(session, "/api/forms/scan", { workspaceId: ws.id, url: url.trim() });
      setKits((ks) => [{ id: r.kitId, tokens: r.tokens ?? {}, source_url: url.trim(), scan_status: r.tokens ? "done" : "scanning", logo_url: r.logo ?? null }, ...ks.filter((k) => k.id !== r.kitId)]);
      setStyle(r.kitId);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLearning(false);
    }
  };

  // 1 → 2: read the site, then plan with the thinking streaming in.
  const startPlan = async () => {
    if (!note.trim()) return;
    setError("");
    setStage("planning");
    setThinking("");
    setPlan(null);
    let b = brief;
    try {
      if (siteUrl && !b) {
        setReading(true);
        b = (await postJson<{ brief: Brief | null }>(session, "/api/forms/new", { workspaceId: ws.id, mode: "brief", url: siteUrl }).catch(() => ({ brief: null }))).brief;
        setBrief(b);
        setReading(false);
      }
      const p = await streamPlan(session.access_token, { workspaceId: ws.id, mode: "plan", note: note.trim(), brief: b, kitId: kit?.id ?? null }, (t) => setThinking((x) => x + t));
      setPlan(p);
      setName(p.name);
      setStage("plan");
    } catch (e) {
      setReading(false);
      setError(errorText(e));
      setStage("describe");
    }
  };

  // 2 → 3: the whole form.
  const build = async () => {
    if (!plan) return;
    setError("");
    setStage("building");
    try {
      const r = await postJson<{ name: string; spec: Spec; thanks: Thanks; questions: FollowUp[]; changed: string | null }>(session, "/api/forms/new", { workspaceId: ws.id, mode: "build", note: note.trim(), brief, plan, kitId: kit?.id ?? null });
      setSpec(r.spec);
      setName(r.name || plan.name);
      setThanks(r.thanks);
      setEnd({ kind: "thanks", title: r.thanks.title, text: r.thanks.text });
      setChanged(r.changed);
      setQuestions(r.questions);
      setAt(0);
      setSaid([]);
      setAnswer("");
      setStage(r.questions.length ? "questions" : "submission");
    } catch (e) {
      setError(errorText(e));
      setStage("plan");
    }
  };

  const q = questions[at];
  const nextQuestion = () => {
    setAnswer("");
    if (at + 1 < questions.length) setAt(at + 1);
    else setStage("submission");
  };
  const reply = async () => {
    if (!q || !spec || editing) return;
    const a = Array.isArray(answer) ? answer.join(", ") : answer.trim();
    if (!a) return;
    setEditing(true);
    setError("");
    try {
      const r = await postJson<{ spec: Spec; reply: string; changed: number }>(session, "/api/forms/new", { workspaceId: ws.id, mode: "edit", spec, ask: `${q.question} ${a}`, brief, needEmail: plan?.needsEmail !== false });
      setSpec(r.spec);
      setSaid((s) => [...s, { q: q.question, a }]);
      nextQuestion();
    } catch (e) {
      // The form stays as it was; the answer is listed with the reason, and the questions go on.
      setSaid((s) => [...s, { q: q.question, a, note: errorText(e) }]);
      nextQuestion();
    } finally {
      setEditing(false);
    }
  };
  const pick = (v: string) => {
    if (!q) return;
    if (q.kind === "multi") {
      const cur = Array.isArray(answer) ? answer : [];
      setAnswer(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
    } else setAnswer(v);
  };
  const on = (v: string) => (Array.isArray(answer) ? answer.includes(v) : answer === v);

  const needEmail = plan?.needsEmail !== false;
  const base = useMemo(() => baseForm({ submission, end, needEmail, thanks }), [submission, end, needEmail, thanks]);
  const shownSpec = spec ?? placeholderSpec(note.trim() ? note.trim().replace(/^./, (c) => c.toUpperCase()).slice(0, 120) : "Your form");
  const preview = useMemo(() => toForm(shownSpec, base), [shownSpec, base]);
  const endProblem = end.kind === "page" && !PAGE_URL.test(end.url) ? "Enter the page's full address, starting with https://." : "";

  const create = async (publish: boolean) => {
    if (!spec || endProblem) return setError(endProblem);
    setError("");
    setStage("saving");
    try {
      const id = must(await sb.rpc("form_create", { p_ws: ws.id, p_name: (name || "New form").slice(0, 120), p_draft: toForm(spec, base), p_brand_kit: kit?.id ?? null, p_kind: "built" })) as string;
      // Each CRM picked gets the leads (with the safe sync rules a new destination starts with).
      const picked = crms.filter((c) => submission.crms.includes(c.id));
      await Promise.all(picked.map((c) => postJson(session, "/api/forms/destination", { workspaceId: ws.id, formId: id, kind: "source", sourceId: c.id, name: c.name }).catch(() => null)));
      if (publish) await postJson(session, "/api/forms/publish", { workspaceId: ws.id, id });
      invalidate(`forms:${ws.id}`);
      invalidate("app_counts");
      // A meeting still to make: the form opens on its submission settings, where it's made.
      navigate("forms", id, end.kind === "meeting" && !end.typeId ? "open=submission" : publish ? "tab=share" : undefined);
    } catch (e) {
      setError(errorText(e));
      setStage("end");
    }
  };

  const styleOptions: Option<string>[] = [
    ...usable.map((k) => ({ value: k.id, label: hostOf(k.source_url) || "Your brand", group: "Your brands" })),
    { value: "claritia", label: "Claritia", group: "More" },
    { value: "learn", label: "Learn from a website", group: "More" },
  ];
  const screen = screenOf(stage);
  const busy = stage === "planning" || stage === "building" || editing || stage === "saving";
  const layout = spec ? layoutOf(spec) : null;
  const flip = (to: "page" | "steps") => {
    if (!spec) return;
    if (to === "page") {
      const one = toOnePage(spec);
      if (!one) return setError("This form's logic needs steps.");
      setSpec(one);
    } else setSpec(toSteps(spec));
    setError("");
    setRun((r) => r + 1);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New form" className="anim-fade absolute inset-0 z-[60] grid grid-cols-[minmax(340px,440px)_minmax(0,1fr)] bg-card max-[860px]:grid-cols-1 max-[860px]:grid-rows-[auto_minmax(420px,1fr)] max-[860px]:overflow-y-auto">
      <section className="flex min-h-0 flex-col border-r border-line max-[860px]:border-r-0 max-[860px]:border-b">
        <div className="flex h-[48px] shrink-0 items-center gap-[8px] border-b border-line px-[16px]">
          <span className={EYEBROW}>New form</span>
          <span className="flex-1" />
          <button type="button" className={IB} onClick={onClose} aria-label="Close" title="Close" disabled={stage === "saving"}>
            <Ic n="x" />
          </button>
        </div>
        <ol aria-label="Steps" className="flex shrink-0 items-center gap-[6px] border-b border-line px-[16px] py-[10px]">
          {SCREENS.map((s, i) => (
            <li key={s} aria-current={i === screen ? "step" : undefined} className="flex min-w-0 flex-1 flex-col gap-[5px]">
              <span className={`h-[3px] rounded-full transition-colors duration-[200ms] ${i <= screen ? "bg-ink" : "bg-paper-deep"}`} />
              <span className={`truncate text-[11px] ${i === screen ? "text-ink" : "text-muted"}`}>{s}</span>
            </li>
          ))}
        </ol>
        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[20px] py-[20px]">
          {screen === 0 ? (
            <>
              <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">
                Let&apos;s build something <span className="text-faint">exciting.</span>
              </h2>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-muted">Describe your form</span>
                <textarea autoFocus className={`${IN} h-[96px] py-[8px]`} placeholder="A demo request that asks team size and tools, and books a call for bigger teams" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Describe your form" disabled={busy} />
              </label>
              <div className="flex flex-col gap-[6px]">
                <span className="text-[12px] text-muted">Styling</span>
                <Select value={style} options={styleOptions} onChange={(v) => setStyle(v)} ariaLabel="Styling" disabled={busy} />
                {kit ? (
                  <div className="anim-rise-sm flex items-center gap-[10px] rounded-[10px] border border-line px-[12px] py-[10px]">
                    {logoOf(kit) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logoOf(kit)!} alt="" className="h-[22px] w-auto max-w-[120px] object-contain" />
                    ) : (
                      <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-muted uppercase">{(hostOf(kit.source_url) || "B").slice(0, 1)}</span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{hostOf(kit.source_url) || "Your brand"}</span>
                    {[tokens.buttonBg, tokens.accent, tokens.text, tokens.background]
                      .filter((c, i, a): c is string => !!c && a.indexOf(c) === i)
                      .map((c) => (
                        <span key={c} className="size-[14px] rounded-full border border-line" style={{ background: c }} title={c} />
                      ))}
                    {kit.source_url ? (
                      <button type="button" className={IB} aria-label="Copy the look again" title="Copy the look again" disabled={look?.state === "copying"} onClick={() => copyLook(kit.id, true)}>
                        <Ic n="undo" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {kit && look?.state === "copying" ? (
                  <span role="status" className="flex items-center gap-[6px] text-[12.5px] text-muted">
                    <AiMark size={12} working />
                    {`Copying ${hostOf(kit.source_url) || "the site"}'s look`}
                  </span>
                ) : kit && !kitMeasured && (look?.measuring || kit.scan_status === "scanning") ? (
                  <span role="status" className="flex items-center gap-[6px] text-[12.5px] text-muted">
                    <AiMark size={12} working />
                    Measuring the site in a browser
                  </span>
                ) : null}
                {kit && look?.state === "error" ? (
                  <span role="alert" className="flex items-center gap-[8px] text-[12.5px] text-rose">
                    {look.error}
                    <button type="button" className={GHOST_SM} onClick={() => copyLook(kit.id)}>
                      Try again
                    </button>
                  </span>
                ) : null}
                {style === "learn" ? (
                  <form
                    className="flex flex-col gap-[6px]"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (known) setStyle(known.id);
                      else void learn();
                    }}
                  >
                    <div className="flex gap-[6px]">
                      <input className={IN} placeholder="yourcompany.com" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Website to learn from" disabled={busy} />
                      <button type="submit" className={GHOST} disabled={!hostOf(url) || learning || busy}>
                        <AiMark size={13} working={learning} />
                        {learning ? "Reading" : "Learn"}
                      </button>
                    </div>
                    {known ? (
                      <button type="button" className={`${GHOST_SM} self-start`} onClick={() => setStyle(known.id)}>
                        <Ic n="check" />
                        {hostOf(known.source_url)}
                      </button>
                    ) : null}
                  </form>
                ) : null}
              </div>
              <button type="button" className={`${BTN} self-start`} disabled={!note.trim() || learning || busy} onClick={() => void startPlan()}>
                <AiMark size={13} />
                Continue
              </button>
            </>
          ) : null}

          {screen === 1 ? (
            <>
              <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">
                One page <span className="text-faint">or steps?</span>
              </h2>
              <Thinking text={thinking} live={stage === "planning"} reading={reading} />
              {plan ? (
                <div className="anim-rise-sm flex flex-col gap-[12px]">
                  <Seg label="Layout" value={plan.layout} onChange={(v) => setPlan(planLayout(plan, v))} options={[{ value: "page", label: "One page" }, { value: "steps", label: "Steps" }]} />
                  {plan.why ? <p className="text-[13px] text-body">{plan.why}</p> : null}
                  {plan.changed ? <p className="text-[12.5px] text-muted">{plan.changed}</p> : null}
                  <div className="flex flex-col gap-[6px]">
                    <b className="font-medium text-ink">Here&apos;s the rough sketch</b>
                    <ol className="flex flex-col gap-[6px]">
                      {plan.steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-[8px] text-[13px] text-ink">
                          <span className="mt-[1px] inline-flex size-[20px] shrink-0 items-center justify-center rounded-full border border-line-strong text-[11px] text-muted tabular-nums">{i + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{s.title || plan.name}</span>
                            <span className="block text-[12.5px] text-muted">{s.items.join(", ")}</span>
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div className="flex gap-[6px]">
                    <button type="button" className={BTN} onClick={() => void build()}>
                      <AiMark size={13} />
                      Build the form
                    </button>
                    <button type="button" className={GHOST} onClick={() => setStage("describe")}>
                      Back
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {screen === 2 ? (
            <>
              <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">
                {name || "Your form"}
                <span className="text-faint">{spec ? ` ${questionCount(spec)} questions.` : ""}</span>
              </h2>
              {stage === "building" ? <Throbber color={accent} label="Writing every question" /> : null}
              {spec ? (
                <div className="flex flex-col gap-[10px]">
                  <Seg label="Layout" value={layout ?? "page"} onChange={flip} options={[{ value: "page", label: "One page" }, { value: "steps", label: "Steps" }]} />
                  {changed ? <p className="text-[12.5px] text-muted">{changed}</p> : null}
                </div>
              ) : null}
              {spec && (said.length || q) ? (
                <div className="flex flex-col gap-[10px] border-t border-line pt-[16px]">
                  <b className="font-medium text-ink">A few more questions</b>
                  {said.map((x, i) => (
                    <div key={i} className="flex flex-col gap-[2px]">
                      <span className="text-[12px] text-muted">{x.q}</span>
                      <span className="text-[13px] text-ink">{x.a}</span>
                      {x.note ? <span className="text-[12px] text-rose">{x.note}</span> : null}
                    </div>
                  ))}
                  {stage === "questions" && q ? (
                    <div key={q.id} className="anim-rise-sm flex flex-col gap-[8px]">
                      <span className="text-ink">{q.question}</span>
                      {q.kind === "text" ? (
                        <textarea className={`${IN} h-[64px] py-[8px]`} aria-label={q.question} value={typeof answer === "string" ? answer : ""} onChange={(e) => setAnswer(e.target.value)} disabled={editing} />
                      ) : (
                        <div className="flex flex-wrap gap-[6px]">
                          {q.options.map((o) => (
                            <button key={o} type="button" aria-pressed={on(o)} disabled={editing} onClick={() => pick(o)} className={on(o) ? `${GHOST_SM} border-ink bg-ink text-card hover:text-card` : GHOST_SM}>
                              {o}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-[6px]">
                        <button type="button" className={BTN} disabled={editing || (Array.isArray(answer) ? !answer.length : !answer.trim())} onClick={() => void reply()}>
                          {editing ? "Changing the form" : "Next"}
                        </button>
                        <button type="button" className={GHOST} disabled={editing} onClick={nextQuestion}>
                          Skip
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {stage === "questions" && spec && !q ? (
                <button type="button" className={`${BTN} self-start`} onClick={() => setStage("submission")}>
                  Continue
                </button>
              ) : null}
            </>
          ) : null}

          {screen === 3 ? (
            <>
              <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">
                Where answers <span className="text-faint">go.</span>
              </h2>
              <div className="flex flex-col rounded-[10px] border border-line">
                <Row title="Contacts in Claritia">
                  <Tg label="Contacts in Claritia" on onChange={() => undefined} disabled />
                </Row>
                {crms.map((c) => (
                  <Row key={c.id} title={c.name}>
                    <Tg label={`Send to ${c.name}`} on={submission.crms.includes(c.id)} onChange={(v) => setSubmission((s) => ({ ...s, crms: v ? [...s.crms, c.id] : s.crms.filter((x) => x !== c.id) }))} />
                  </Row>
                ))}
                <Row title="Email the team">
                  <Tg label="Email the team" on={submission.alert} onChange={(v) => setSubmission((s) => ({ ...s, alert: v }))} />
                </Row>
                {submission.alert ? (
                  <div className="flex flex-wrap items-center gap-[6px] border-t border-line px-[14px] py-[10px]">
                    {submission.to.map((e) => (
                      <span key={e} className="inline-flex h-[26px] max-w-full items-center gap-[4px] rounded-full bg-paper-deep pr-[4px] pl-[10px] text-[12.5px]">
                        {e}
                        <button type="button" aria-label={`Remove ${e}`} onClick={() => setSubmission((s) => ({ ...s, to: s.to.filter((x) => x !== e) }))} className="inline-flex size-[18px] items-center justify-center rounded-full text-muted hover:bg-card hover:text-ink">
                          <Ic n="x" s={11} />
                        </button>
                      </span>
                    ))}
                    <input
                      className={`${IN} h-[28px] w-[200px]`}
                      placeholder="Add an email"
                      aria-label="Add an email"
                      value={addTo}
                      onChange={(e) => setAddTo(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        const v = addTo.trim().toLowerCase();
                        if (!/^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v)) return setError("That isn't an email address.");
                        setError("");
                        setSubmission((s) => ({ ...s, to: s.to.includes(v) ? s.to : [...s.to, v].slice(0, 10) }));
                        setAddTo("");
                      }}
                    />
                  </div>
                ) : null}
                <Row title="Spam guard">
                  <Tg label="Spam guard" on={submission.spam} onChange={(v) => setSubmission((s) => ({ ...s, spam: v }))} />
                </Row>
                <Row title="Consent checkbox">
                  <Tg label="Consent checkbox" on={submission.consent} onChange={(v) => setSubmission((s) => ({ ...s, consent: v }))} />
                </Row>
              </div>
              <div className="flex gap-[6px]">
                <button type="button" className={BTN} onClick={() => setStage("end")}>
                  Continue
                </button>
                <button type="button" className={GHOST} onClick={() => setStage(questions.length ? "questions" : "plan")}>
                  Back
                </button>
              </div>
            </>
          ) : null}

          {screen === 4 ? (
            <>
              <h2 className="text-[22px] leading-[1.2] font-semibold tracking-[-0.02em] text-ink">
                After they <span className="text-faint">send it.</span>
              </h2>
              <Seg
                label="After the send"
                value={end.kind}
                onChange={(k) => setEnd(k === "thanks" ? { kind: "thanks", title: thanks.title, text: thanks.text } : k === "page" ? { kind: "page", url: "" } : { kind: "meeting", typeId: types.find((t) => t.active)?.id ?? null })}
                options={[
                  { value: "thanks", label: "Thank-you" },
                  { value: "page", label: "Go to a page" },
                  { value: "meeting", label: "Book a meeting" },
                ]}
              />
              {end.kind === "thanks" ? (
                <div className="flex flex-col gap-[8px]">
                  <input className={IN} aria-label="Thank-you title" value={end.title} onChange={(e) => setEnd({ ...end, title: e.target.value })} />
                  <textarea className={`${IN} h-[64px] py-[8px]`} aria-label="Thank-you text" value={end.text} onChange={(e) => setEnd({ ...end, text: e.target.value })} />
                </div>
              ) : end.kind === "page" ? (
                <input className={IN} placeholder="https://yourcompany.com/thanks" aria-label="Page to open" value={end.url} onChange={(e) => setEnd({ kind: "page", url: e.target.value.trim() })} />
              ) : (
                <Select value={end.typeId ?? "new"} options={[...types.filter((t) => t.active).map((t) => ({ value: t.id, label: t.name })), { value: "new", label: "A new meeting" }]} onChange={(v) => setEnd({ kind: "meeting", typeId: v === "new" ? null : v })} ariaLabel="Meeting" />
              )}
              <div className="flex gap-[6px]">
                <button type="button" className={BTN} disabled={stage === "saving" || !!endProblem} onClick={() => void create(true)}>
                  {stage === "saving" ? "Saving" : "Publish"}
                </button>
                <button type="button" className={GHOST} disabled={stage === "saving" || !!endProblem} onClick={() => void create(false)}>
                  Create form
                </button>
                <button type="button" className={GHOST} disabled={stage === "saving"} onClick={() => setStage("submission")}>
                  Back
                </button>
              </div>
            </>
          ) : null}
          <ErrorNote message={error} />
        </div>
      </section>

      <section aria-label="Live preview" className="relative flex min-h-0 flex-col bg-paper">
        <div className="flex h-[48px] shrink-0 items-center border-b border-line bg-card px-[16px]">
          <span className={EYEBROW}>Live preview</span>
          <span className="flex-1" />
          {spec ? (
            <button type="button" className={GHOST_SM} onClick={() => setRun((r) => r + 1)}>
              Start over
            </button>
          ) : null}
        </div>
        <div className="relative flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-[16px] py-[28px]">
          {brandLoading && stage === "describe" ? (
            <div className="self-center">
              <Throbber color={accent} label={learning ? "Reading the website's brand" : look?.state === "copying" ? `Copying ${hostOf(kit?.source_url) || "the site"}'s look` : "Getting the brand"} />
            </div>
          ) : stage === "planning" ? (
            <div className="self-center">
              <Throbber color={accent} label={reading ? "Reading your website" : "Thinking about the layout"} />
            </div>
          ) : (stage === "plan" || stage === "building") && plan ? (
            <div className={`flex w-full justify-center transition-opacity duration-[200ms] ${stage === "building" ? "opacity-40" : ""}`}>
              <Wireframe plan={plan} accent={accent} background={(tokens as { background?: string }).background} />
            </div>
          ) : (
            <div className={`keep-light w-full max-w-[1040px] transition-opacity duration-[200ms] ${editing ? "opacity-40" : ""}`}>
              <div className="rounded-[14px] p-[24px] shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.06)]" style={{ background: (tokens as { background?: string }).background }}>
                <FormPreview key={run} form={preview} tokens={tokens} logo={logoOf(kit)} skin={skin} />
              </div>
            </div>
          )}
          {stage === "building" || editing ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Throbber color={accent} label={editing ? "Changing the form" : "Writing every question"} />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-[12px] border-t border-line px-[14px] py-[10px] first:border-t-0">
      <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{title}</span>
      {children}
    </div>
  );
}

/** Claude's thinking as it streams in: the newest lines in view, the whole of it on open. */
function Thinking({ text, live, reading }: { text: string; live: boolean; reading: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text, live]);
  if (!text && !live) return null;
  return (
    <div className="flex flex-col gap-[6px] rounded-[10px] border border-line px-[12px] py-[10px]">
      <button type="button" className="flex items-center gap-[8px] text-left text-[12.5px] font-medium text-ink" onClick={() => setOpen(!open)} aria-expanded={open}>
        <AiMark size={13} working={live} />
        <span className="flex-1">{reading ? "Reading your website" : live ? "Thinking" : "Thought it through"}</span>
        {text ? (
          <span className={`inline-flex text-muted transition-transform duration-[200ms] ${open ? "rotate-180" : ""}`}>
            <Ic n="chev" s={12} />
          </span>
        ) : null}
      </button>
      {text ? (
        <div ref={box} className={`overflow-y-auto text-[12.5px] leading-[1.5] whitespace-pre-wrap text-muted ${open ? "max-h-[320px]" : live ? "max-h-[96px]" : "hidden"}`}>
          {text}
        </div>
      ) : null}
    </div>
  );
}
