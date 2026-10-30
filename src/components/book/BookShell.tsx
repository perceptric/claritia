import { EmbedHeight } from "./EmbedHeight";
import { KitScope } from "./kit";

// The frame around every booking page: the kit's look, the card, and "Booked with Claritia" (unless the page hides it). In an embed
// (<claritia-book>, ?embed=1) it sits flush and tells the page around it its height, so the frame fits. No hooks:
// on the public pages the look is worked out on the server, and only the embed's height runs in the browser.

/** `vars`: the page look's overrides (src/lib/meetings/look.ts). `badge`: show "Booked with Claritia". */
export function BookShell({ tokens, design, embed, narrow, vars, badge = true, children }: { tokens: Record<string, unknown> | null; design?: unknown; embed?: boolean; narrow?: boolean; vars?: Record<string, string>; badge?: boolean; children: React.ReactNode }) {
  return (
    <KitScope tokens={tokens ?? {}} design={design} vars={vars} className={`cb-page ${embed ? "cb-embed" : ""}`}>
      {embed ? <EmbedHeight /> : null}
      <div className={`cb-wrap ${narrow ? "cb-narrow" : ""}`}>
        <main className="cb-card">{children}</main>
        {badge ? (
          <footer className="cb-foot">
            <a href="https://tryclaritia.com" target="_blank" rel="noopener">
              Booked with Claritia
            </a>
          </footer>
        ) : null}
      </div>
    </KitScope>
  );
}

export function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="cb-done cb-step">
      <h1 className="cb-h" style={{ fontSize: "1.4em" }}>
        {title}
      </h1>
      {children}
    </div>
  );
}
