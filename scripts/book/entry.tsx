// The booking calendar alone, in a brand kit with booking styles, for scripts/book-design-check.ts.

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingCalendar, KitScope } from "../../src/components/book/BookingCalendar";
import { sampleSlots, type GuestType } from "../../src/lib/meetings/guest";

const type: GuestType = { slug: "intro", name: "Intro call", kind: "one", lengths: [30], location: { kind: "google_meet" }, questions: [], price: null, seats: null, hosts: [{ name: "Alex Kim", photo: null }] };
const design = {
  variables: [{ id: "brand", name: "Brand", kind: "color", value: "#aa0000" }],
  book: { globals: { day: { base: { color: "$brand" }, "base:checked": { "background-color": "#00aa55" } }, heading: { base: { "letter-spacing": "2px" } }, time: { phone: { "font-size": "20px" } } } },
};

function App() {
  const [now] = useState(() => Date.now());
  return (
    <KitScope tokens={{}} design={(window as unknown as { NO_DESIGN?: boolean }).NO_DESIGN ? undefined : design} className="cb-page cb-embed">
      <div className="cb-wrap">
        <main className="cb-card">
          <BookingCalendar type={type} load={async (l) => sampleSlots(l, "UTC", now, 21)} />
        </main>
      </div>
    </KitScope>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
