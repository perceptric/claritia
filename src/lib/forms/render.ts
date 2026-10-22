// The embed made before the form builder: one script tag that frames the form's own page (/f/<id>). Sites that
// pasted it keep working; the page inside is <claritia-form>, which reads the page context (?c=), resizes the frame
// and hands the email to Claritia's site script (src/lib/forms/element.ts).

/** The embed: one script tag finds its form's spot, keeps the visitor's first and latest UTMs, and frames the form. */
export function embedScript(appBase: string): string {
  return `(function(){
var B=${JSON.stringify(appBase)};var K=["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","li_fat_id","msclkid"];
function st(k,v){try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||"null");localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
var q=new URLSearchParams(location.search);var now={};K.forEach(function(k){var v=q.get(k);if(v)now[k]=v.slice(0,300)});
if(Object.keys(now).length){st("_clr_utm",now);if(!st("_clr_utm1"))st("_clr_utm1",now)}
function ctx(){return{utm:st("_clr_utm")||{},first:st("_clr_utm1")||{},page:location.href.split("#")[0].split("?")[0],referrer:document.referrer||null}}
function b64(o){return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
function mount(el){if(el.__clr)return;el.__clr=1;var id=el.getAttribute("data-claritia-form");if(!/^[0-9a-f-]{36}$/.test(id||""))return;
var fr=document.createElement("iframe");fr.src=B+"/f/"+id+"?c="+b64(ctx());fr.title="Form";fr.loading="lazy";fr.style.cssText="width:100%;border:0;display:block;min-height:120px";fr.setAttribute("data-claritia-frame",id);el.appendChild(fr)}
function scan(){document.querySelectorAll("[data-claritia-form]").forEach(function(el){if(el.tagName==="SCRIPT"){var d=document.createElement("div");d.setAttribute("data-claritia-form",el.getAttribute("data-claritia-form"));el.parentNode.insertBefore(d,el);el.removeAttribute("data-claritia-form");mount(d)}else mount(el)})}
window.addEventListener("message",function(e){if(e.origin!==B||!e.data||typeof e.data!=="object")return;var d=e.data;
document.querySelectorAll('iframe[data-claritia-frame="'+d.id+'"]').forEach(function(fr){if(fr.contentWindow!==e.source)return;
if(d.type==="claritia-form"&&d.height)fr.style.height=Math.min(d.height+8,5000)+"px";
if(d.type==="claritia-form-done"){if(d.email&&typeof window.claritia==="function")try{window.claritia("form",d.email)}catch(x){}
try{fr.dispatchEvent(new CustomEvent("claritia:submit",{bubbles:true,detail:{form:d.id}}))}catch(x){}
if(d.redirect&&/^https:\\/\\//.test(d.redirect))location.href=d.redirect}})});
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",scan);else scan();
})();`;
}
