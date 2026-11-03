// The brand stylesheet a studio page wears before a workspace has a brand of its own (a template used before Add a
// brand): plain, calm and readable, in the same classes and variables a brand's own stylesheet has
// (src/lib/studio/prompts.ts BRAND_RULES), so the page takes the real brand's look the moment one is picked.

export const DEFAULT_BRAND_CSS = `@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap");
:root{--brand-primary:#333333;--brand-text:#171717;--brand-muted:#6c6c6d;--brand-bg:#ffffff;--brand-surface:#ffffff;--brand-line:#e5e5e5;--brand-focus:#0c8c5e;--brand-font:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;--brand-radius:8px}
.page{font-family:var(--brand-font);color:var(--brand-text);background:var(--brand-bg);font-size:15px;line-height:1.5}
.heading{font-family:var(--brand-font);color:var(--brand-text);font-weight:600;letter-spacing:-.02em;line-height:1.2;margin:0}
h1.heading{font-size:28px}h2.heading{font-size:20px}
.text{color:var(--brand-muted);margin:0}
.label{display:block;font-size:14px;font-weight:500;color:var(--brand-text)}
.field{box-sizing:border-box;width:100%;min-height:44px;padding:10px 12px;font:inherit;color:var(--brand-text);background:var(--brand-surface);border:1px solid var(--brand-line);border-radius:var(--brand-radius);outline:none}
.field:focus{border-color:var(--brand-focus);box-shadow:0 0 0 3px rgba(12,140,94,.18)}
textarea.field{min-height:110px;resize:vertical}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 20px;font:inherit;font-weight:500;color:#fff;background:var(--brand-primary);border:0;border-radius:999px;cursor:pointer}
.btn:hover{background:#1f1f1f}.btn:active{transform:translateY(1px)}
.btn-secondary{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 20px;font:inherit;font-weight:500;color:var(--brand-text);background:var(--brand-surface);border:1px solid var(--brand-line);border-radius:999px;cursor:pointer}
.card{background:var(--brand-surface);border:1px solid var(--brand-line);border-radius:12px;padding:16px}
.choice{display:flex;align-items:center;gap:10px;min-height:44px;padding:10px 14px;border:1px solid var(--brand-line);border-radius:var(--brand-radius);background:var(--brand-surface);cursor:pointer}
.choice:has(input:checked){border-color:var(--brand-focus);box-shadow:0 0 0 1px var(--brand-focus)}
.check{display:flex;align-items:flex-start;gap:10px;min-height:44px;cursor:pointer}
.link{color:var(--brand-text);text-decoration:underline;text-underline-offset:3px}`;
