import { compileBook } from "@/lib/design/book";
import { readSystem } from "@/lib/design/model";
import type { Tokens } from "@/lib/forms/brand";
import { BOOK_CSS } from "./styles";
import { themeOf } from "./theme";

// The kit's look around a booking page: its variables, the booking styles and the brand's design system, scoped to
// .cb-root. No hooks: on a public page it's worked out on the server, so the browser never loads the compilers.

/** A short name for a stylesheet, so React keeps one copy of each. */
const hashText = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
};

export type KitLook = { theme: ReturnType<typeof themeOf> | null; css: string };

/** The kit's theme and its design system's CSS (docs/design-system.md Part 3.5). */
export function kitLook(tokens: Record<string, unknown> | null | undefined, design: unknown): KitLook {
  const theme = tokens !== undefined ? themeOf(tokens) : null;
  const css = design ? compileBook(readSystem(design, (tokens ?? {}) as Partial<Tokens>), (tokens ?? {}) as Partial<Tokens>) : "";
  return { theme, css };
}

/** Wraps children in a worked-out look. */
export function KitFrame({ look, vars, className = "", children }: { look: KitLook; vars?: Record<string, string>; className?: string; children: React.ReactNode }) {
  const { theme, css } = look;
  return (
    <div className={`cb-root ${css ? "cb-ds " : ""}${className}`} style={(theme ? { ...theme.vars, ...vars } : vars) as React.CSSProperties | undefined} data-dark={theme?.dark || undefined}>
      <style href="clr-book" precedence="default">
        {BOOK_CSS}
      </style>
      {css ? (
        <style href={`clr-book-ds-${hashText(css)}`} precedence="default">
          {css}
        </style>
      ) : null}
      {theme?.fontUrl ? <link rel="stylesheet" href={theme.fontUrl} precedence="default" /> : null}
      {children}
    </div>
  );
}

/** Wraps children in the kit's variables and the booking styles. */
export function KitScope({ tokens, design, vars, className, children }: { tokens?: Record<string, unknown> | null; design?: unknown; vars?: Record<string, string>; className?: string; children: React.ReactNode }) {
  return (
    <KitFrame look={kitLook(tokens, design)} vars={vars} className={className}>
      {children}
    </KitFrame>
  );
}
