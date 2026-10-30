// The booking pages' styles. Everything reads the brand kit's variables (--clr-*, from theme.ts), so a kit restyles
// the whole page; shades are mixed from the kit's own text and accent. Container queries lay the calendar out by
// the space it has, so the same markup works on a page, in an embed and in the type editor's preview.
// Motion: quick (140ms) for hover and press, calm (320ms) for steps, ease-out; none under reduced motion. The
// layout follows Claritia's look (docs/brand.md): mono eyebrows, two-tone titles, pill times, dots on open days.

export const BOOK_CSS = `
.cb-root{font-family:var(--clr-font);font-size:var(--clr-size);color:var(--clr-text);line-height:1.45;-webkit-font-smoothing:antialiased;container-type:inline-size;
  --cb-line:color-mix(in srgb,var(--clr-text) 11%,transparent);--cb-soft:color-mix(in srgb,var(--clr-text) 4%,var(--clr-bg));
  --cb-tint:color-mix(in srgb,var(--clr-accent) 11%,var(--clr-bg));--cb-tint2:color-mix(in srgb,var(--clr-accent) 20%,var(--clr-bg));
  --cb-line2:color-mix(in srgb,var(--clr-text) 20%,transparent);--cb-fill:color-mix(in srgb,var(--clr-text) 6%,var(--clr-bg));
  --cb-dot-wash:color-mix(in srgb,var(--cb-dot,#059669) 11%,var(--clr-bg));--cb-mono:"Geist Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --cb-card-r:min(16px,calc(var(--clr-radius)*2 + 6px));--cb-ease:cubic-bezier(.2,.8,.2,1)}
:where(.cb-root) *{box-sizing:border-box}
:where(.cb-root) button{font:inherit;color:inherit;cursor:pointer;background:none;border:0;padding:0}
.cb-root button:focus-visible,.cb-root a:focus-visible,.cb-root input:focus-visible,.cb-root textarea:focus-visible{outline:2px solid var(--clr-accent);outline-offset:2px}
:where(.cb-root) a{color:inherit}
.cb-h{font-family:var(--clr-heading-font);font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0}
.cb-muted{color:var(--clr-muted)}
.cb-small{font-size:.85em}
.cb-label{font-size:12px;font-weight:500;color:var(--clr-muted)}
.cb-eyebrow{font-family:var(--cb-mono);font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--clr-muted);font-weight:400}
.cb-two{font-family:var(--clr-heading-font);font-weight:600;letter-spacing:-.025em;line-height:1.15;margin:0;text-wrap:balance}
.cb-two .cb-gray{display:block;color:color-mix(in srgb,var(--clr-text) 42%,var(--clr-bg))}

/* The page around the card */
.cb-page{min-height:100vh;min-height:100dvh;background:var(--cb-soft);display:flex;flex-direction:column;align-items:center;padding:40px 16px 24px}
.cb-page.cb-embed{min-height:0;background:var(--clr-bg);padding:0}
.cb-wrap{width:100%;max-width:1060px;display:flex;flex-direction:column;gap:16px}
.cb-wrap.cb-narrow{max-width:640px}
.cb-card{container-type:inline-size;background:var(--clr-bg);border:1px solid var(--cb-line);border-radius:var(--cb-card-r);overflow:hidden;box-shadow:0 1px 2px color-mix(in srgb,var(--clr-text) 4%,transparent),0 16px 40px -16px color-mix(in srgb,var(--clr-text) 14%,transparent)}
.cb-wrap.cb-narrow .cb-card{box-shadow:none;border:0;background:transparent;overflow:visible}
.cb-embed .cb-card{border:0;border-radius:0}
.cb-foot{display:flex;justify-content:center;padding:12px 0 4px;font-size:12px;color:var(--clr-muted)}
.cb-foot a{text-decoration:none;display:inline-flex;align-items:center;gap:6px}.cb-foot a:hover{color:var(--clr-text)}
.cb-logo{height:28px;width:auto;max-width:180px;object-fit:contain;display:block}

/* Booking: info | calendar | times */
.cb-grid{display:grid;grid-template-columns:minmax(0,1fr)}
.cb-info{padding:24px;display:flex;flex-direction:column;gap:14px;border-bottom:1px solid var(--cb-line)}
.cb-main{padding:20px 16px 24px;min-width:0}
.cb-pick{display:grid;grid-template-columns:minmax(0,1fr);gap:24px}
@container (min-width:700px){
  .cb-grid{grid-template-columns:280px minmax(0,1fr)}
  .cb-info{border-bottom:0;border-right:1px solid var(--cb-line);padding:28px}
  .cb-main{padding:28px}
  .cb-pick.cb-open{grid-template-columns:minmax(0,1fr) 200px}
}
@container (min-width:1000px){.cb-grid{grid-template-columns:300px minmax(0,1fr)}.cb-pick.cb-open{grid-template-columns:minmax(0,1fr) 220px}}
.cb-hosts{display:flex;align-items:center;gap:10px}
.cb-av{width:40px;height:40px;border-radius:999px;object-fit:cover;flex:none;background:var(--clr-text);color:var(--clr-bg);display:inline-flex;align-items:center;justify-content:center;font-weight:600;font-size:15px;border:2px solid var(--clr-bg)}
.cb-av.cb-lg{width:64px;height:64px;font-size:22px}
.cb-stack{display:flex}.cb-stack>*+*{margin-left:-10px}
.cb-meta{display:flex;flex-direction:column;gap:10px;color:var(--clr-muted);font-weight:500}
.cb-row{display:flex;align-items:flex-start;gap:10px}
.cb-row svg{margin-top:2px}
.cb-pills{display:inline-flex;flex-wrap:wrap;gap:4px;padding:3px;border-radius:999px;background:var(--cb-soft);border:1px solid var(--cb-line)}
.cb-pill{padding:5px 12px;border-radius:999px;font-size:.88em;font-weight:500;color:var(--clr-muted);transition:background-color 140ms var(--cb-ease),color 140ms var(--cb-ease)}
.cb-pill[aria-pressed=true],.cb-pill[aria-checked=true]{background:var(--clr-bg);color:var(--clr-text);box-shadow:0 1px 2px color-mix(in srgb,var(--clr-text) 12%,transparent)}

/* Month */
.cb-mhead{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:12px}
.cb-nav{display:flex;gap:4px}
.cb-icon{width:36px;height:36px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:var(--clr-text);transition:background-color 140ms var(--cb-ease)}
.cb-icon:hover:not(:disabled){background:var(--cb-tint)}
.cb-icon:disabled{opacity:.3;cursor:default}
.cb-week,.cb-days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;text-align:center}
.cb-week{font-family:var(--cb-mono);font-size:10.5px;color:var(--clr-muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em;container-type:inline-size}
@container (max-width:280px){.cb-week span{font-size:0}.cb-week span::after{content:attr(data-short);font-size:11px}}
.cb-day{position:relative;aspect-ratio:1;max-width:48px;width:100%;margin:0 auto;border-radius:999px;display:flex;align-items:center;justify-content:center;font-weight:500;font-variant-numeric:tabular-nums;color:var(--clr-muted);transition:background-color 140ms var(--cb-ease),color 140ms var(--cb-ease),transform 140ms var(--cb-ease)}
.cb-day:disabled{cursor:default;opacity:.5}
.cb-day.cb-has{background:var(--cb-fill);color:var(--clr-text);font-weight:600}
.cb-day.cb-has::after{content:"";position:absolute;bottom:16%;left:50%;width:4px;height:4px;margin-left:-2px;border-radius:999px;background:var(--cb-dot,#059669)}
.cb-day.cb-has:hover{background:var(--cb-line2)}
.cb-day.cb-has:active{transform:scale(.94)}
.cb-day[aria-pressed=true]{background:var(--clr-accent);color:var(--clr-btn-text)}
.cb-day[aria-pressed=true]::after{background:var(--clr-btn-text)}
.cb-day.cb-today::before{content:"";position:absolute;top:14%;left:50%;width:6px;height:1.5px;margin-left:-3px;border-radius:2px;background:currentColor;opacity:.6}
.cb-zone{margin-top:18px;padding-top:14px;border-top:1px solid var(--cb-line);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.cb-zone>*{min-width:0;max-width:100%}
.cb-zbtn{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;margin-left:-10px;border-radius:999px;font-weight:500;max-width:100%}
.cb-zbtn:hover{background:var(--cb-soft)}
.cb-zbtn span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Times */
.cb-times{display:flex;flex-direction:column;gap:8px;min-width:0}
.cb-tlist{display:flex;flex-direction:column;gap:8px}
@container (min-width:700px){.cb-tlist{max-height:440px;overflow:auto;padding:2px 4px 2px 2px;margin:-2px -4px -2px -2px;scrollbar-width:thin}}
.cb-tpair{display:flex;gap:6px}
.cb-time{flex:1;min-height:var(--clr-input-h);border:1px solid var(--cb-line2);border-radius:999px;color:var(--clr-text);font-weight:500;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:background-color 140ms var(--cb-ease),border-color 140ms var(--cb-ease)}
.cb-time:hover{border-color:var(--clr-text);background:var(--cb-soft)}
.cb-time.cb-on{background:var(--cb-fill);border-color:transparent}
.cb-group{font-size:11.5px;color:var(--clr-muted);padding:6px 2px 0}
.cb-group:first-child{padding-top:0}
.cb-tpair .cb-btn{border-radius:999px}
@media (prefers-reduced-motion:no-preference){.cb-tpair .cb-btn{animation:cb-side 220ms var(--cb-ease) both}}
.cb-phead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.cb-soon{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:18px}
.cb-sc{display:inline-flex;align-items:baseline;gap:6px;min-height:32px;padding:6px 12px;border-radius:999px;border:1px solid var(--cb-line);color:var(--clr-muted);font-size:.9em;transition:border-color 140ms var(--cb-ease),background-color 140ms var(--cb-ease)}
.cb-sc b{color:var(--clr-text);font-weight:600;font-variant-numeric:tabular-nums}
.cb-sc:hover{border-color:var(--clr-text);background:var(--cb-soft)}
.cb-seats{font-size:11px;font-weight:500;opacity:.8}
.cb-btn{min-height:var(--clr-input-h);padding:0 22px;border-radius:var(--clr-btn-radius);background:var(--clr-btn-bg);color:var(--clr-btn-text);font-weight:var(--clr-btn-weight);text-transform:var(--clr-btn-case);display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:opacity 140ms var(--cb-ease),transform 140ms var(--cb-ease)}
.cb-btn:hover:not(:disabled){opacity:.92}
.cb-btn:active:not(:disabled){transform:scale(.98)}
.cb-btn:disabled{opacity:.55;cursor:default}
.cb-btn.cb-ghost{background:transparent;color:var(--clr-text);border:1px solid var(--cb-line)}
.cb-btn.cb-danger{background:var(--clr-error);color:var(--clr-bg)}
.cb-tpair .cb-btn{flex:1;padding:0 8px}
.cb-empty{padding:28px 8px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px}
.cb-sk{height:var(--clr-input-h);border-radius:var(--clr-btn-radius);background:var(--cb-soft)}
.cb-note{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:var(--clr-radius);background:color-mix(in srgb,var(--clr-error) 10%,var(--clr-bg));color:var(--clr-error);font-weight:500;margin-bottom:16px}

/* Details */
.cb-form{display:flex;flex-direction:column;gap:16px;max-width:460px}
.cb-field{display:flex;flex-direction:column;gap:6px}
.cb-field>span{font-size:var(--clr-label-size);font-weight:var(--clr-label-weight)}
.cb-in{width:100%;min-height:var(--clr-input-h);padding:0 12px;background:var(--clr-input-bg);color:var(--clr-text);border:var(--clr-border-w) solid var(--clr-border);border-radius:var(--clr-radius);font:inherit;outline:none;transition:border-color 140ms var(--cb-ease),box-shadow 140ms var(--cb-ease)}
textarea.cb-in{min-height:96px;padding:10px 12px;resize:vertical}
.cb-in:focus{border-color:var(--clr-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--clr-accent) 20%,transparent)}
.cb-in[aria-invalid=true]{border-color:var(--clr-error)}
.cb-err{color:var(--clr-error);font-size:.85em;margin:0}
.cb-choices{display:flex;flex-wrap:wrap;gap:6px}
.cb-choice{padding:7px 14px;border-radius:999px;border:1px solid var(--cb-line);font-weight:500;transition:background-color 140ms var(--cb-ease),border-color 140ms var(--cb-ease)}
.cb-choice[aria-checked=true]{border-color:var(--clr-accent);background:var(--cb-tint);color:var(--clr-accent)}
.cb-back{display:inline-flex;align-items:center;gap:6px;font-weight:500;color:var(--clr-muted);margin-bottom:14px}
.cb-back:hover{color:var(--clr-text)}
.cb-when{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:calc(var(--clr-radius) + 4px);background:var(--cb-dot-wash);font-weight:500}
.cb-when b{font-weight:600}
@media (prefers-reduced-motion:no-preference){.cb-when{animation:cb-in 220ms var(--cb-ease) both}}

/* Done, manage, poll, lists */
.cb-done{padding:40px 24px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px}
.cb-done .cb-sum{position:relative;text-align:left;width:100%;max-width:420px;border:1px solid var(--cb-line);border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:10px}
.cb-sum::before,.cb-sum::after{content:"";position:absolute;width:14px;height:14px;border:1.5px solid var(--clr-text);pointer-events:none}
.cb-sum::before{top:-1px;left:-1px;border-right:0;border-bottom:0;border-top-left-radius:10px}
.cb-sum::after{bottom:-1px;right:-1px;border-left:0;border-top:0;border-bottom-right-radius:10px}
.cb-tick{width:52px;height:52px;border-radius:999px;background:var(--cb-dot-wash);color:var(--cb-dot,#059669);display:flex;align-items:center;justify-content:center}
.cb-add{display:flex;flex-direction:column;align-items:center;gap:8px}
.cb-add .cb-chips{justify-content:center}
.cb-add a{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 14px;border-radius:999px;border:1px solid var(--cb-line);font-weight:500;font-size:.9em;text-decoration:none;transition:border-color 140ms var(--cb-ease)}
.cb-add a:hover{border-color:var(--clr-text)}
@media (prefers-reduced-motion:no-preference){.cb-tick{animation:cb-pop 360ms var(--cb-ease) both}}
.cb-tag{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:500;background:var(--cb-soft);color:var(--clr-muted);border:1px solid var(--cb-line)}
.cb-tag.cb-warn{background:color-mix(in srgb,var(--clr-error) 10%,var(--clr-bg));color:var(--clr-error);border-color:transparent}
.cb-tag.cb-ok{background:var(--cb-tint);color:var(--clr-accent);border-color:transparent}
.cb-head{padding:8px 4px 24px;display:flex;align-items:flex-start;gap:20px}
.cb-head .cb-logo{margin-bottom:4px}
.cb-head-t{display:flex;flex-direction:column;gap:10px;min-width:0}
@container (max-width:520px){.cb-head{flex-direction:column;gap:14px}}
.cb-types{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
@container (min-width:560px){.cb-types{grid-template-columns:repeat(2,minmax(0,1fr))}}
.cb-type{display:flex;flex-direction:column;gap:8px;padding:20px;background:var(--clr-bg);border:1px solid var(--cb-line);border-radius:10px;text-decoration:none;transition:transform 220ms var(--cb-ease),box-shadow 220ms var(--cb-ease),border-color 140ms var(--cb-ease)}
.cb-type:hover{transform:translateY(-2px);border-color:var(--clr-text);box-shadow:0 10px 24px -10px color-mix(in srgb,var(--clr-text) 22%,transparent)}
.cb-type .cb-go{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--clr-muted);font-weight:500;margin-top:auto;padding-top:6px}
.cb-arr{width:28px;height:28px;border-radius:999px;background:var(--cb-fill);color:var(--clr-text);display:inline-flex;align-items:center;justify-content:center;flex:none;transition:background-color 140ms var(--cb-ease),color 140ms var(--cb-ease)}
.cb-type:hover .cb-arr{background:var(--clr-accent);color:var(--clr-btn-text)}
.cb-chips{display:flex;flex-wrap:wrap;gap:6px}
.cb-vote{display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid var(--cb-line);border-radius:var(--clr-radius);text-align:left;width:100%;transition:background-color 140ms var(--cb-ease),border-color 140ms var(--cb-ease)}
.cb-vote[aria-checked=true]{border-color:var(--clr-accent);background:var(--cb-tint)}
.cb-box{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--cb-line);display:flex;align-items:center;justify-content:center;flex:none;color:var(--clr-btn-text)}
.cb-vote[aria-checked=true] .cb-box{background:var(--clr-accent);border-color:var(--clr-accent)}
.cb-section{padding:24px;display:flex;flex-direction:column;gap:14px}
.cb-section+.cb-section{border-top:1px solid var(--cb-line)}

/* Time zone list */
.cb-pop{position:relative}
.cb-menu{position:absolute;z-index:20;left:-10px;bottom:calc(100% + 6px);width:min(340px,86vw);background:var(--clr-bg);border:1px solid var(--cb-line);border-radius:calc(var(--clr-radius) + 4px);box-shadow:0 16px 40px -12px color-mix(in srgb,var(--clr-text) 30%,transparent);padding:6px}
.cb-menu input{margin-bottom:6px}
.cb-opts{max-height:260px;overflow:auto;margin:0;padding:0;list-style:none}
.cb-opt{display:flex;justify-content:space-between;gap:12px;padding:8px 10px;border-radius:calc(var(--clr-radius) * .7);cursor:pointer}
.cb-opt.cb-act{background:var(--cb-soft)}
.cb-opt[aria-selected=true]{color:var(--clr-accent);font-weight:600}
.cb-opt small{color:var(--clr-muted);font-variant-numeric:tabular-nums;white-space:nowrap}
.cb-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

@media (prefers-reduced-motion:no-preference){
  .cb-step{animation:cb-in 320ms var(--cb-ease) both}
  .cb-step.cb-rev{animation-name:cb-out}
  .cb-times{animation:cb-in 320ms var(--cb-ease) both}
  .cb-menu{animation:cb-up 140ms var(--cb-ease) both}
}
@keyframes cb-in{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
@keyframes cb-out{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
@keyframes cb-side{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
@keyframes cb-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes cb-up{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.cb-root *{transition:none!important;animation:none!important}}
`;
