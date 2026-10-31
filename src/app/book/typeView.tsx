import { BookFlow } from "@/components/book/BookFlow";
import { BookShell } from "@/components/book/BookShell";
import type { Rpc } from "@/lib/jobs";
import { questionsFor } from "@/lib/meetings/dynamicServer";
import { guestTypeOf, preferredSlots, type Target } from "@/lib/meetings/public";
import { serviceClient } from "@/lib/serviceClient";
import { turnstileFor } from "./load";
import { shellOf, type Opts } from "./views";

// One type's booking calendar on /book/<ws>/<type> and /booking/<handle>/<type>: the only booking page that runs the
// calendar in the browser. A Dynamic meeting asks its rules' questions first, then shows the picked reps' times
// (src/lib/meetings/dynamic.ts); a booking link that already names the host skips them.

/** One type's booking calendar, with the first times ready. */
export async function TypeView({ t, o, rpc }: { t: Target; o: Opts; rpc: Rpc }) {
  const type = guestTypeOf(t.type!, t.profiles, t.pay);
  const db = serviceClient();
  const questions = !o.link?.host && db ? await questionsFor(db, t.ws.id, t.type!).catch(() => []) : [];
  // With questions, the times wait for the answers.
  const first = questions.length ? undefined : await preferredSlots(rpc, { ws: t.ws.id, type: t.type!, length: type.lengths[0]!, host: o.link?.host, profiles: t.profiles }).catch(() => undefined);
  const s = shellOf(t);
  return (
    <BookShell tokens={s.tokens} design={s.design} vars={s.vars} badge={s.badge} embed={o.embed}>
      <BookFlow
        endpoint={`/api/book/t/${t.ws.slug}/${t.type!.slug}`}
        type={type}
        initialSlots={first}
        turnstileKey={turnstileFor(t.turnstile)}
        logo={s.logo}
        embed={o.embed}
        prefill={o.prefill}
        link={o.link}
        questions={questions}
      />
    </BookShell>
  );
}
