// The booking calendar with a brand's own stylesheet (src/lib/meetings/brandPage.ts), for scripts/book-brand-check.ts.
// ?dark draws a dark brand whose main color can't be seen on its background.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingCalendar, KitScope } from "../../src/components/book/BookingCalendar";
import { sampleSlots, type GuestType } from "../../src/lib/meetings/guest";
import { bookBrandCss } from "../../src/lib/meetings/brandPage";

const type: GuestType = { slug: "intro", name: "Intro call", description: null, kind: "one", lengths: [30], location: { kind: "google_meet" }, questions: [], price: null, seats: null, hosts: [{ name: "Alex Kim", photo: null }] };

const LIGHT = `:root{--brand-primary:#1a56db;--brand-text:#111827;--brand-line:#c0c4cc;--brand-bg:#ffffff;--brand-radius:8px}
body{margin:0;padding:60px;background:#ff0000}
.btn{display:block;width:100%;padding:18px 48px;margin:12px 0;background:var(--brand-primary);color:#fff;border-radius:4px;font-weight:700}
.btn-secondary{display:block;width:100%;padding:18px 48px;margin:12px 0;border:2px solid var(--brand-line);border-radius:4px;background:transparent}
.field{border:2px solid var(--brand-line);border-radius:var(--brand-radius);padding:14px}
.heading{letter-spacing:3px}`;
const DARK = `:root{--brand-primary:#141414;--brand-text:#f5f5f5;--brand-bg:#0a0a0a;--brand-line:#333333}
.btn{background:var(--brand-primary);color:#fff;border:1px solid #444}`;

function App() {
  const [now] = useState(() => Date.now());
  const dark = location.search.includes("dark");
  const brand = bookBrandCss(dark ? DARK : LIGHT);
  return (
    <>
      <div className="cb-time" id="outside">
        outside
      </div>
      <KitScope tokens={dark ? { background: "#0a0a0a", text: "#f5f5f5" } : {}} brand={brand} className="cb-page cb-embed">
        <div className="cb-wrap">
          <main className="cb-card">
            <BookingCalendar type={type} load={async (l) => sampleSlots(l, "UTC", now, 21)} />
          </main>
        </div>
      </KitScope>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
