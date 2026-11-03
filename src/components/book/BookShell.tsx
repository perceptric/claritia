import { EmbedHeight } from "./EmbedHeight";
import { KitScope, type BrandSheet } from "./kit";

// The frame around every booking page: the kit's look, the card centered on the page and "Built with love by Claritia"
// under the card, unless the page hides it. In an embed
// (<claritia-book>, ?embed=1) it sits flush and tells the page around it its height, so the frame fits. No hooks:
// on the public pages the look is worked out on the server, and only the embed's height runs in the browser.

/**
 * `vars`: the page look's overrides (src/lib/meetings/look.ts). `badge`: show "Built with love by Claritia" under
 * the card. `brand`: the brand's own stylesheet, on paid plans (src/lib/meetings/brandPage.ts).
 */
export function BookShell({ tokens, design, embed, narrow, vars, badge = true, brand, children }: { tokens: Record<string, unknown> | null; design?: unknown; embed?: boolean; narrow?: boolean; vars?: Record<string, string>; badge?: boolean; brand?: BrandSheet; children: React.ReactNode }) {
  return (
    <KitScope tokens={tokens ?? {}} design={design} vars={vars} brand={brand} className={`cb-page ${embed ? "cb-embed" : ""}`}>
      {embed ? <EmbedHeight /> : null}
      <div className={`cb-wrap ${narrow ? "cb-narrow" : ""}`}>
        <div className="cb-cardwrap">
          <main className="cb-card">{children}</main>
        </div>
        {badge ? (
          <footer className="cb-foot">
            <a href="https://tryclaritia.com/?ref=booking" target="_blank" rel="noopener">
              Built with love by
              <Mark size={16} />
              <b>Claritia</b>
            </a>
          </footer>
        ) : null}
      </div>
    </KitScope>
  );
}

/** The Claritia mark: four corner brackets and a check on its emerald tile (src/components/Logo.tsx). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="cb-mark">
      <rect width="32" height="32" rx="7" fill="#0C8C5E" />
      <path d="M7 12V7h5M20 7h5v5M25 20v5h-5M12 25H7v-5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.5 16.5l3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
