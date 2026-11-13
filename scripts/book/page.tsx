// The booking page as a guest sees it, with stand-in times and a stand-in booking, for scripts/booking-page-check.ts
// (docs/booking-page-plan.md). ?who=known starts as a guest the page already knows (a form fill or an earlier
// booking); ?q=1 adds a required question and ?known=1 answers it from a "form fill"; ?taken=1 makes every hold
// fail (someone else is booking it).

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingCalendar, KitScope } from "../../src/components/book/BookingCalendar";
import { sampleSlots, type GuestType } from "../../src/lib/meetings/guest";

const sp = new URLSearchParams(location.search);
const type: GuestType = {
  slug: "intro",
  name: "Intro call",
  description: "A short call to see if we're a fit.",
  agenda: ["Your goals for the quarter", "A quick tour of Claritia", "Next steps"],
  prep: ["Bring your numbers", "Invite your team"],
  kind: "one",
  lengths: [30],
  location: { kind: "google_meet" },
  questions: sp.get("q") ? [{ id: "size", label: "Team size", type: "choice", required: true, options: ["1-10", "11-50", "51+"] }] : [],
  price: null,
  seats: null,
  hosts: [{ name: "Vincent Nguyen", photo: null, tz: "Asia/Ho_Chi_Minh", headline: "Founder, Perceptric" }],
};
(window as unknown as { booked: unknown[] }).booked = [];
(window as unknown as { holds: number[] }).holds = [];

function App() {
  const [now] = useState(() => Date.now());
  return (
    <KitScope tokens={{}} className="cb-page">
      <div className="cb-wrap">
        <div className="cb-cardwrap">
          <main className="cb-card">
            <BookingCalendar
              type={type}
              prefill={sp.get("who") === "known" ? { name: "Lee Park", email: "lee@acme.com" } : undefined}
              known={sp.get("known") ? { size: "11-50" } : undefined}
              hold={async (start) => {
                (window as unknown as { holds: number[] }).holds.push(start);
                return !sp.get("taken");
              }}
              overlay
              load={async (l) => sampleSlots(l, "UTC", now, 21)}
              book={async (r) => {
                (window as unknown as { booked: unknown[] }).booked.push(r);
                return { ok: true, start: r.start, end: r.start + r.length * 60_000, manage: "https://app.test/book/m/tok123", hosts: type.hosts, confirmation: { kind: "message" } };
              }}
            />
          </main>
        </div>
      </div>
    </KitScope>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
