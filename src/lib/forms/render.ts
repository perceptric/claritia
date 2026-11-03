// The embed made before the form builder: one script tag that finds its form's spot. Sites that pasted it keep
// working. It now places <claritia-form> right in the page and loads the form script once (`script`, the versioned
// address), so the form loads as fast as a pasted element; the element keeps the visitor's UTMs, hands the email to
// Claritia's site script and opens a redirect itself (src/lib/forms/element.ts). A site that needs the form walled
// off adds data-claritia-iframe to the tag: then the form's own page (/f/<id>) is framed, as before, lazy only when
// it starts below the fold. Either way `claritia:submit` bubbles from the form's spot after a fill.

/** The embed: one script tag finds its form's spot, keeps the visitor's first and latest UTMs, and places the form. */
export function embedScript(appBase: string, script = "/forms/v1.js"): string {
  return `(function(){
var B=${JSON.stringify(appBase)};var S=B+${JSON.stringify(script)};var K=["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","li_fat_id","msclkid"];
function st(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
var q=new URLSearchParams(location.search);var now={};K.forEach(function(k){var v=q.get(k);if(v)now[k]=v.slice(0,300)});
if(Object.keys(now).length){st("_clr_utm",now);if(!st("_clr_utm1"))st("_clr_utm1",now)}
function ctx(){return{utm:st("_clr_utm")||{},first:st("_clr_utm1")||{},page:location.href.split("#")[0].split("?")[0],referrer:document.referrer||null}}
function b64(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
function load(){if(window.customElements&&customElements.get("claritia-form"))return;if(document.querySelector('script[data-claritia-forms]'))return;
var s=document.createElement("script");s.src=S;s.async=true;s.setAttribute("data-claritia-forms","1");(document.head||document.documentElement).appendChild(s)}
function below(el){try{return el.getBoundingClientRect().top>(window.innerHeight||document.documentElement.clientHeight)}catch(e){return false}}
function frame(el,id){var fr=document.createElement("iframe");fr.src=B+"/f/"+id+"?c="+b64(ctx());fr.title="Form";if(below(el))fr.loading="lazy";fr.style.cssText="width:100%;border:0;display:block;min-height:120px";fr.setAttribute("data-claritia-frame",id);el.appendChild(fr)}
function inline(el,id){var f=document.createElement("claritia-form");f.setAttribute("form-id",id);
f.addEventListener("claritia:submitted",function(){try{f.dispatchEvent(new CustomEvent("claritia:submit",{bubbles:true,detail:{form:id}}))}catch(x){}});el.appendChild(f);load()}
function mount(el,iso){if(el.__clr)return;el.__clr=1;var id=el.getAttribute("data-claritia-form");if(!/^[0-9a-f-]{36}$/.test(id||""))return;if(iso)frame(el,id);else inline(el,id)}
function scan(){document.querySelectorAll("[data-claritia-form]").forEach(function(el){var iso=el.hasAttribute("data-claritia-iframe");if(el.tagName==="SCRIPT"){var d=document.createElement("div");d.setAttribute("data-claritia-form",el.getAttribute("data-claritia-form"));el.parentNode.insertBefore(d,el);el.removeAttribute("data-claritia-form");mount(d,iso)}else mount(el,iso)})}
window.addEventListener("message",function(e){if(e.origin!==B||!e.data||typeof e.data!=="object")return;var d=e.data;
document.querySelectorAll('iframe[data-claritia-frame="'+d.id+'"]').forEach(function(fr){if(fr.contentWindow!==e.source)return;
if(d.type==="claritia-form"&&d.height)fr.style.height=Math.min(d.height+8,5000)+"px";
if(d.type==="claritia-form-done"){if(d.email&&typeof window.claritia==="function")try{window.claritia("form",d.email)}catch(x){}
try{fr.dispatchEvent(new CustomEvent("claritia:submit",{bubbles:true,detail:{form:d.id}}))}catch(x){}
if(d.redirect&&/^https:\\/\\//.test(d.redirect))location.href=d.redirect}})});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();
})();`;
}
