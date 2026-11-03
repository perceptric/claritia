// The booking calendar as a guest uses it, with a stand-in booking, for scripts/book-guest-check.ts.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingCalendar, KitScope } from "../../src/components/book/BookingCalendar";
import { sampleSlots, type GuestType } from "../../src/lib/meetings/guest";

const type: GuestType = { slug: "intro", name: "Intro call", description: "Bring your numbers.\nWe'll look at pricing together.", kind: "one", lengths: [30], location: { kind: "google_meet" }, questions: [], price: null, seats: null, hosts: [{ name: "Alex Kim", photo: null }] };

function App() {
  const [now] = useState(() => Date.now());
  return (
    <KitScope tokens={{}} className="cb-page cb-embed">
      <div className="cb-wrap">
        <main className="cb-card">
          <BookingCalendar
            type={type}
            load={async (l) => sampleSlots(l, "UTC", now, 21)}
            book={async (r) => ({ ok: true, start: r.start, end: r.start + r.length * 60_000, manage: "https://app.test/book/m/tok123", hosts: type.hosts, confirmation: { kind: "message" } })}
          />
        </main>
      </div>
    </KitScope>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
