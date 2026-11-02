// Form Studio with a stand-in server (scripts/studio-check.ts): the real screen (studio.ts), fake brands and chats, a
// fake site read, and canned Tia answers streamed in small pieces (the first builds, the second changes a built form).
import { mountStudio, STUDIO_CSS, STUDIO_HTML, type StudioApi, type StudioChat } from "../../src/components/app/forms/studio/studio.ts";
import fx from "./fixtures.json";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const calls: { mode: string; body: unknown }[] = [];
const w = window as unknown as { calls: typeof calls; saved: Record<string, StudioChat> };
w.calls = calls;
w.saved = {};
let tiaCalls = 0;
const api: StudioApi = {
  start: {},
  brands: async () => [],
  meetings: async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Intro call", length: 15 },
    { id: "22222222-2222-4222-8222-222222222222", name: "Product demo", length: 30 },
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
  tia: async (turns, onText, signal) => {
    calls.push({ mode: "tia", body: turns });
    // A translation: the same page with its words in French or Arabic.
    const ask = turns.at(-1)!.content;
    if (ask.startsWith("Translate the whole form into")) {
      const fr = ask.includes("(fr)");
      const page = /<form_html>([\s\S]*)<\/form_html>/.exec(ask)![1]!;
      const words: [string, string][] = fr
        ? [["How was today?", "Comment était ta journée ?"], ["Your name", "Ton prénom"], ["Next", "Suivant"], ["Email", "E-mail"], ["Start my day", "Commencer ma journée"]]
        : [["How was today?", "كيف كان يومك؟"], ["Your name", "اسمك"], ["Next", "التالي"], ["Email", "البريد الإلكتروني"], ["Start my day", "ابدأ يومي"]];
      let out = page;
      for (const [a, b] of words) out = out.split(`>${a}<`).join(`>${b}<`);
      await wait(100);
      return { text: `<say>Done.</say><form_html>${out}</form_html>`, cut: false };
    }
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
  back: () => void calls.push({ mode: "back", body: null }),
};
const el = document.getElementById("studio")!;
const shell = el.attachShadow({ mode: "open" });
shell.innerHTML = `<style>${STUDIO_CSS}</style>${STUDIO_HTML}`;
mountStudio(shell, api);
