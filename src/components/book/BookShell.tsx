import { EmbedHeight } from "./EmbedHeight";
import { KitScope, type BrandSheet } from "./kit";
import { Mark } from "../Logo";

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
              <Mark size={16} className="cb-mark" />
              <b>Claritia</b>
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
