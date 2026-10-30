import { BookFlow } from "@/components/book/BookFlow";
import { BookShell } from "@/components/book/BookShell";
import type { Rpc } from "@/lib/jobs";
import { guestTypeOf, preferredSlots, type Target } from "@/lib/meetings/public";
import { turnstileFor } from "./load";
import { shellOf, type Opts } from "./views";

// One type's booking calendar on /book/<ws>/<type> and /booking/<handle>/<type>: the only booking page that runs the
// calendar in the browser.

/** One type's booking calendar, with the first times ready. */
export async function TypeView({ t, o, rpc }: { t: Target; o: Opts; rpc: Rpc }) {
  const type = guestTypeOf(t.type!, t.profiles, t.pay);
  const first = await preferredSlots(rpc, { ws: t.ws.id, type: t.type!, length: type.lengths[0]!, host: o.link?.host, profiles: t.profiles }).catch(() => undefined);
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
      />
    </BookShell>
  );
}
