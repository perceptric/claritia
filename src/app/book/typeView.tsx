import { BookFlow } from "@/components/book/BookFlow";
import { BookShell } from "@/components/book/BookShell";
import type { Rpc } from "@/lib/jobs";
import { questionsFor } from "@/lib/meetings/dynamicServer";
import { guestTypeOf, preferredSlots, type Target } from "@/lib/meetings/public";
import { serviceClient } from "@/lib/serviceClient";
import { turnstileFor } from "./load";
import { fillCtx } from "@/lib/forms/booking";
import { readBookRef } from "@/lib/meetings/links";
import { fillKnown } from "@/lib/meetings/knownServer";
import { shellOf, type Opts } from "./views";

// One type's booking calendar on /book/<ws>/<type> and /booking/<handle>/<type>: the only booking page that runs the
// calendar in the browser. A Dynamic meeting asks its rules' questions first, then shows the picked reps' times
// (src/lib/meetings/dynamic.ts); a booking link that already names the host skips them.

/** One type's booking calendar, with the first times ready. */
export async function TypeView({ t, o, rpc }: { t: Target; o: Opts; rpc: Rpc }) {
  const type = guestTypeOf(t.type!, t.profiles, t.pay);
  const db = serviceClient();
  // From a booking link a form fill sent: the fill's name, email and answers, when it's this workspace's (form_booking_ctx
  // reads the type only inside the fill's workspace). A link that can't be read books like any page. Read alongside
  // the times, so the page is no slower.
  const sub = o.link?.ref ? readBookRef(o.link.ref) : null;
  const fillRead = sub
    ? Promise.all([fillCtx(rpc, sub, t.type!.id).catch(() => null), fillKnown(rpc, sub, type.questions, type.location)])
    : Promise.resolve([null, undefined] as const);
  const questions = !o.link?.host && db ? await questionsFor(db, t.ws.id, t.type!).catch(() => []) : [];
  // With questions, the times wait for the answers.
  const [first, [fill, fillAnswers]] = await Promise.all([
    questions.length ? undefined : preferredSlots(rpc, { ws: t.ws.id, type: t.type!, length: type.lengths[0]!, host: o.link?.host, profiles: t.profiles }).catch(() => undefined),
    fillRead,
  ]);
  const mine = !!fill?.type && fill.workspace_id === t.ws.id;
  const known = mine ? fillAnswers : undefined;
  const fillName = mine ? [fill!.first_name, fill!.last_name].filter(Boolean).join(" ") : "";
  const prefill = o.prefill?.email ? o.prefill : mine && fill!.email ? { name: o.prefill?.name || fillName || undefined, email: fill!.email } : o.prefill;
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} brand={s.brand} embed={o.embed}>
      <BookFlow
        endpoint={`/api/book/t/${t.ws.slug}/${t.type!.slug}`}
        type={type}
        initialSlots={first}
        turnstileKey={turnstileFor(t.turnstile)}
        logo={s.logo}
        embed={o.embed}
        preview={o.preview}
        prefill={prefill}
        known={known}
        link={o.link}
        questions={questions}
      />
    </BookShell>
  );
}
