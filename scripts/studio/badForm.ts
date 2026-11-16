// A form made wrong on purpose (scripts/studio-check.ts step 9b and scripts/guard-check.ts): fixed calendar cells, two
// fields side by side, a pale eyebrow, fonts that aren't the brand's, radios removed with display:none and a dropdown
// arrow of its own on the browser's.
export const BAD_HTML = `<div class="page" id="page"><div class="form-card" id="card"><p class="eyebrow" id="eb">Get started</p><h1 class="heading title" id="title">Book a call</h1><form id="f">
<div class="row" id="names"><div class="q"><label class="label" for="fn">First name</label><input class="field" id="fn" name="first" required></div><div class="q"><label class="label" for="ln">Last name</label><input class="field" id="ln" name="last"></div></div>
<div class="q"><label class="label" for="em">Work email</label><input class="field" id="em" name="email" type="email" data-cl-save="email" required></div>
<div class="q sel" id="indq"><label class="label" for="ind">Industry</label><select class="field" id="ind" name="industry"><option value="">Choose one</option><option value="saas">SaaS</option><option value="retail">Retail</option></select></div>
<fieldset class="q" id="sizeq"><legend class="label">Team size</legend><div class="opts"><label class="opt"><input type="radio" name="size" value="small"> 1 to 10</label><label class="opt"><input type="radio" name="size" value="big"> 11 or more</label></div></fieldset>
<button type="submit" class="btn" id="send">Send</button></form>
<section data-cl-thanks hidden class="thanks" id="thanks"><h2 class="heading" id="thx">Thanks</h2><div data-cl-book id="book"></div></section></div></div>`;
export const BAD_CSS = `@import url("https://fonts.googleapis.com/css2?family=Lobster&family=Pacifico&display=swap");
.page{background:#ffffff;padding:24px 16px}
.form-card{display:flex;flex-direction:column;gap:16px}
.eyebrow{color:#c4c4c4;font-family:"Lobster",cursive;font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin:0}
.title{font-family:"Pacifico",cursive}
.row{display:grid;grid-template-columns:260px 260px;gap:16px}
.q{display:flex;flex-direction:column;gap:6px;border:0;padding:0;margin:0}
.sel{position:relative}.sel::after{content:"\\25BE";position:absolute;right:14px;bottom:12px}
select.field{appearance:auto;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Cpath d='M0 2l4 4 4-4'/%3E%3C/svg%3E") no-repeat right 30px center/10px}
.opts{display:flex;gap:8px}.opt{display:flex;align-items:center;padding:4px 10px;border:1px solid #ddd;border-radius:8px;font-size:13px}
.opt input{display:none}
.opt:has(input:checked){border-color:#2e6f74}
.cl-cal .cl-days button{width:120px;min-width:120px}
.cl-cal .cl-times{grid-template-columns:repeat(4,130px)!important}
.cl-cal .cl-times button{width:130px;height:34px;padding:0 28px}`;
