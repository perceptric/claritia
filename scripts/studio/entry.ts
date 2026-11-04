// Form Studio with a stand-in server (scripts/studio-check.ts): the real screen (studio.ts), fake brands and chats, a
// fake site read, and canned Tia answers streamed in small pieces (the first builds, the second changes a built form).
import { mountStudio, STUDIO_CSS, STUDIO_HTML, type StudioApi, type StudioChat, type StudioState } from "../../src/components/app/forms/studio/studio.ts";
import fx from "./fixtures.json";
import { studioTemplates, templatePreview } from "../../src/lib/forms/gallery/studioList.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const calls: { mode: string; body: unknown }[] = [];
const w = window as unknown as { calls: typeof calls; saved: Record<string, StudioChat>; studioState: StudioState | null };
w.calls = calls;
w.saved = {};
let tiaCalls = 0;
const sends: { id: string; kind: string; name: string; domain: string | null }[] = [];
const api: StudioApi = {
  start: {},
  brands: async () => {
    await wait(400);
    return [];
  },
  meetings: async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Intro call", length: 15 },
    { id: "22222222-2222-4222-8222-222222222222", name: "Product demo", length: 30, dynamic: true, who: "Locations is at least 50 → Enterprise, otherwise anyone on the team" },
  ],
  readSite: async (host) => {
    calls.push({ mode: "site", body: host });
    await wait(300);
    if (host === "nope.dev") throw Object.assign(new Error("Couldn't open nope.dev. Check the address and try again."), { browser: true });
    return { url: `https://${host}/`, site: host, name: host === "acme.dev" ? "Acme" : "Finch", logo: fx.logo, logoUrl: `https://${host}/logo.png`, logoSvg: null };
  },
  scan: async () => ({ kitId: "kit-scan" }),
  kit: async () => null,
  confirm: async (b) => {
    calls.push({ mode: "confirm", body: b });
    await wait(200);
    return { kitId: (b as { name: string }).name === "Acme" ? "55555555-5555-4555-8555-555555555555" : "44444444-4444-4444-8444-444444444444" };
  },
  look: async (kitId, fresh) => {
    calls.push({ mode: "look", body: { kitId, fresh } });
    await wait(600);
    return { css: fx.brand, say: "Finch uses a soft green and rounded buttons.", profile: { industry: "health", language: "en", country: "US", languages: ["en", "es"] } };
  },
  keepCss: (id) => void calls.push({ mode: "keepCss", body: id }),
  keepProfile: (id, profile) => void calls.push({ mode: "keepProfile", body: { id, profile } }),
  deleteBrand: async (id) => void calls.push({ mode: "delete", body: id }),
  templates: async () => {
    await wait(50);
    return studioTemplates();
  },
  templatePage: (id, css) => templatePreview(id, css),
  useTemplate: async (id, look) => {
    calls.push({ mode: "useTemplate", body: { id, look } });
    await wait(150);
    return { id: "77777777-7777-4777-8777-777777777777" };
  },
  openForm: (id) => void calls.push({ mode: "openForm", body: id }),
  chats: async () => Object.values(w.saved),
  chat: async (id) => w.saved[id] ?? null,
  fromForm: async () => null,
  saveChat: async (c) => {
    calls.push({ mode: "saveChat", body: JSON.parse(JSON.stringify(c)) });
    w.saved[c.id] = JSON.parse(JSON.stringify(c));
  },
  deleteChat: async (id) => {
    calls.push({ mode: "deleteChat", body: id });
    delete w.saved[id];
  },
  times: async (typeId) => {
    calls.push({ mode: "times", body: typeId });
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return { starts: [0, 1, 2, 26, 27].map((h) => d.getTime() + h * 3_600_000), length: typeId.startsWith("1111") ? 15 : 30 };
  },
  translate: async (texts, lang) => {
    calls.push({ mode: "translate", body: { texts, lang } });
    const fr = lang.includes("(fr)");
    const words: Record<string, string> = fr
      ? { "How was today?": "Comment était ta journée ?", "Your name": "Ton prénom", Next: "Suivant", Email: "E-mail", "Start my day": "Commencer ma journée" }
      : { "How was today?": "كيف كان يومك؟", "Your name": "اسمك", Next: "التالي", Email: "البريد الإلكتروني", "Start my day": "ابدأ يومي" };
    await wait(100);
    return texts.map((t) => words[t.trim()] ?? t);
  },
  tia: async (turns, onText, signal, o) => {
    calls.push({ mode: "tia", body: turns });
    calls.push({ mode: "tiaOpts", body: o ?? {} });
    const reply = tiaCalls++ === 0 ? fx.reply : fx.reply2;
    let all = "";
    for (let i = 0; i < reply.length; i += 400) {
      if (signal.aborted) throw Object.assign(new DOMException("stop", "AbortError"), { text: all });
      all += reply.slice(i, i + 400);
      onText(all);
      await wait(40);
    }
    return { text: all, cut: false };
  },
  publish: async (p) => {
    calls.push({ mode: "publish", body: p });
    await wait(200);
    return { formId: "33333333-3333-4333-8333-333333333333" };
  },
  formUrl: (id) => `/f/${id}`,
  openMeetings: () => void calls.push({ mode: "openMeetings", body: null }),
  openMeeting: (id) => void calls.push({ mode: "openMeeting", body: id }),
  saveDraft: async (p) => {
    calls.push({ mode: "saveDraft", body: p });
    return { formId: "33333333-3333-4333-8333-333333333333" };
  },
  sends: async () => sends,
  tools: async () => [{ id: "src-1", kind: "hubspot", name: "HubSpot", domain: "hubspot.com" }],
  addSend: async (id, to) => {
    calls.push({ mode: "addSend", body: { id, to } });
    sends.push(to === "webhook" ? { id: `d${sends.length}`, kind: "webhook", name: "hooks.acme.dev", domain: null } : { ...to, id: `d${sends.length}` });
    return true;
  },
  removeSend: async (d) => {
    calls.push({ mode: "removeSend", body: d.id });
    sends.splice(sends.findIndex((x) => x.id === d.id), 1);
    return true;
  },
  followUps: async () => [{ id: "wf-1", name: "Form follow-up", status: "draft" }],
  newFollowUp: (id, when) => void calls.push({ mode: "newFollowUp", body: { id, when } }),
  openWorkflow: (id) => void calls.push({ mode: "openWorkflow", body: id }),
  onState: (st) => {
    w.studioState = st;
    drawHeader();
  },
};
const el = document.getElementById("studio")!;
const shell = el.attachShadow({ mode: "open" });
shell.innerHTML = `<style>${STUDIO_CSS}</style>${STUDIO_HTML}`;

// A stand-in for the page's header (FormHeader): the one button, its problem count, the form check and the message,
// driven the same way, through the Studio's state and control.
const hdr = document.createElement("div");
hdr.id = "hdr";
hdr.innerHTML = `<button id="hdrPreview">Preview</button><button id="hdrAction"></button><span id="hdrMsg"></span><div id="hdrCheck" hidden></div>`;
el.before(hdr);
function drawHeader() {
  const st = w.studioState;
  const b = document.getElementById("hdrAction") as HTMLButtonElement;
  const errs = st?.issues.filter((i) => i.level === "error").length ?? 0;
  b.textContent = st?.publishing ? "Publishing" : st?.state === "live" ? "Share" : st?.state === "changed" ? "Publish changes" : "Publish";
  b.dataset.problems = String(errs);
  b.disabled = !!st?.publishing || (st?.state !== "live" && !st?.canPublish);
  document.getElementById("hdrMsg")!.textContent = st?.msg ?? "";
}
function drawCheck() {
  const box = document.getElementById("hdrCheck")!;
  box.hidden = false;
  box.innerHTML = "";
  for (const i of w.studioState?.issues ?? []) {
    const row = document.createElement("div");
    row.className = `issue ${i.level}`;
    row.textContent = i.text;
    if (i.fix) {
      const f = document.createElement("button");
      f.textContent = "Fix";
      f.onclick = () => ((box.hidden = true), ctl.fix([i.fix!]));
      row.append(f);
    }
    box.append(row);
  }
}
const ctl = mountStudio(shell, api);
document.getElementById("hdrPreview")!.onclick = () => ctl.preview();
document.getElementById("hdrAction")!.onclick = async () => {
  if (w.studioState?.state === "live") return void calls.push({ mode: "openShare", body: w.studioState.formId });
  const r = await ctl.publish();
  if (r === "blocked") drawCheck();
};
