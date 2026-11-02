// Form Studio with a stand-in server (scripts/studio-check.ts): the real screen (studio.ts), fake brands, a fake site
// read and a canned Claude answer streamed in small pieces.
import { mountStudio, STUDIO_CSS, STUDIO_HTML, type StudioApi } from "../../src/components/app/forms/studio/studio.ts";
import fx from "./fixtures.json";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const calls: { mode: string; body: unknown }[] = [];
(window as unknown as { calls: typeof calls }).calls = calls;
let kits = 0;
const api: StudioApi = {
  key: "clr-form-studio:test",
  brands: async () => [],
  meetings: async () => [
    { id: "11111111-1111-4111-8111-111111111111", name: "Intro call", length: 15, host: "the host" },
    { id: "22222222-2222-4222-8222-222222222222", name: "Product demo", length: 30, host: "the team, round robin" },
  ],
  readSite: async (host) => {
    calls.push({ mode: "site", body: host });
    await wait(300);
    if (host === "nope.dev") throw Object.assign(new Error("Couldn't open nope.dev. Check the address and try again."), { browser: true });
    return { url: `https://${host}/`, site: host, name: "Finch", logo: fx.logo, logoUrl: `https://${host}/logo.png`, logoSvg: null };
  },
  scan: async () => ({ kitId: "kit-scan" }),
  kit: async () => null,
  confirm: async (b) => {
    calls.push({ mode: "confirm", body: b });
    await wait(200);
    return { kitId: `kit-${++kits}` };
  },
  look: async (kitId, fresh) => {
    calls.push({ mode: "look", body: { kitId, fresh } });
    await wait(600);
    return { css: fx.brand, say: "Finch uses a soft green and rounded buttons." };
  },
  chat: async (turns, onText, signal) => {
    calls.push({ mode: "chat", body: turns });
    let all = "";
    for (let i = 0; i < fx.reply.length; i += 400) {
      if (signal.aborted) throw Object.assign(new DOMException("stop", "AbortError"), { text: all });
      all += fx.reply.slice(i, i + 400);
      onText(all);
      await wait(40);
    }
    return { text: all, cut: false };
  },
  form: async () => null,
  publish: async (p) => {
    calls.push({ mode: "publish", body: p });
    await wait(200);
    return { formId: "33333333-3333-4333-8333-333333333333" };
  },
  formUrl: (id) => `/f/${id}`,
  started: () => undefined,
  deleteBrand: async (id) => void calls.push({ mode: "delete", body: id }),
  openMeetings: () => void calls.push({ mode: "openMeetings", body: null }),
  back: () => void calls.push({ mode: "back", body: null }),
};
const el = document.getElementById("studio")!;
const shell = el.attachShadow({ mode: "open" });
shell.innerHTML = `<style>${STUDIO_CSS}</style>${STUDIO_HTML}`;
mountStudio(shell, api);
