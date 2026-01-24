(function(){"use strict";const k={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},S=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,W=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){let i=null,n=null,o=null,t=null,r=null,y=!1,A=!1,T=!1,m=!1,d="",E=!1,f=null,c=k.DEFAULT_POSITION;const $=document.currentScript;if($)f=$.getAttribute("data-organization-id"),c=$.getAttribute("data-position")??k.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),a=Array.from(e).find(s=>s.hasAttribute("data-organization-id"));a&&(f=a.getAttribute("data-organization-id"),c=a.getAttribute("data-position")??k.DEFAULT_POSITION)}if(!f){console.error("Nexus Widget: data-organization-id attribute is required");return}function C(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",M,{once:!0}):M()}function M(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=S,o.style.cssText=`
      position: fixed;
      ${c==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `,o.addEventListener("click",()=>{if(y){I();return}H()}),o.addEventListener("mouseenter",()=>o.style.transform="scale(1.05)"),o.addEventListener("mouseleave",()=>o.style.transform="scale(1)"),document.body.appendChild(o),n=document.createElement("div"),n.id="nexus-widget-container",n.style.cssText=`
      position: fixed;
      ${c==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
    `,i=document.createElement("iframe"),i.src=D(),i.allow="microphone; clipboard-read; clipboard-write",i.style.cssText="width:100%;height:100%;border:none;",i.onload=()=>{m=!0,d=new URL(i.src).origin,b({type:"nexus:embed-ready"}),w()},n.appendChild(i),document.body.appendChild(n),window.addEventListener("message",N),F(),window.addEventListener("popstate",w),window.addEventListener("resize",x),window.addEventListener("scroll",x,{passive:!0})}function D(){const e=new URLSearchParams;return e.append("organizationId",f),`${k.WIDGET_URL}?${e.toString()}`}function N(e){var l,p;if(!m||!d||e.origin!==d)return;const{type:a,payload:s}=e.data||{};switch(a){case"close":I();break;case"resize":s!=null&&s.height&&n&&(n.style.height=`${s.height}px`);break;case"nexus:promo":{(l=i==null?void 0:i.contentWindow)==null||l.postMessage({type:"nexus:host-ack"},d),(p=i==null?void 0:i.contentWindow)==null||p.postMessage({type:"nexus:hide-internal-promo"},d),A=!0,_(s);break}case"nexus:session-ready":{if(!f||!s||typeof s.sessionId!="string"||E)return;E=!0,s.sessionId;break}}}function b(e){!m||!(i!=null&&i.contentWindow)||!d||i.contentWindow.postMessage(e,d)}function w(){b({type:"nexus:parent-location",href:location.href})}function F(){["pushState","replaceState"].forEach(e=>{const a=history[e];history[e]=function(...s){const l=a.apply(this,s);return m&&w(),l}})}function _(e){t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
      `,document.body.appendChild(t),r=document.createElement("div"),r.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: #ffffff;
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(r));const s=(Array.isArray(e.avatars)?e.avatars.slice(0,3):[]).map((L,u)=>`
      <img src="${O(L)}" alt="avatar ${u+1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${u?`margin-left:-10px; z-index:${10-u};`:"z-index:10;"}
        " />`).join(""),l=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${v(e.badgeText)}
         </span>`:"";t.innerHTML=`
      <div style="position:relative">
        ${l}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:2px">${s}</div>
          <div style="flex:1">
            <div style="font-weight:700">${v(e.title||"Discover the right solution for your business project.")}</div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4">${v(e.body||"Chat with our assistant or book a 15-min demo.")}</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button id="nexus-primary"
                style="flex:1;height:36px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;cursor:pointer;font-weight:600">
                ${v(e.primary||"Chat with AI Assistant")}
              </button>
              ${e.secondary!==void 0?`<button id="nexus-secondary"
                      style="flex:1;height:36px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#111827;cursor:pointer;font-weight:600">
                      ${v(e.secondary||"Book a meeting")}
                    </button>`:""}
            </div>
            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${O(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`:""}
          </div>
          <button id="nexus-close" title="Close"
            style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
        </div>
      </div>
    `;const p=t.querySelector("#nexus-primary"),g=t.querySelector("#nexus-secondary"),h=t.querySelector("#nexus-close");p==null||p.addEventListener("click",()=>H()),g==null||g.addEventListener("click",()=>q()),h==null||h.addEventListener("click",()=>{T=!0,U()}),x(),!y&&!T&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),r&&(r.style.opacity="1")})}function x(){if(!o||!t||!r)return;const e=o.getBoundingClientRect(),a=12,s=12,l=window.innerHeight-e.top;t.style.bottom=`${l+a}px`,c==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const p=e.left+e.width/2;r.style.left=`${p-s/2}px`,r.style.bottom=`${l+(a-s/2)}px`,r.style.transform="rotate(45deg)";const g=t.getBoundingClientRect(),h=g.right-window.innerWidth,L=-g.left;if(h>0&&c==="bottom-right"){const u=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,u+h)}px`}else if(L>0&&c==="bottom-left"){const u=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,u+L)}px`}}function U(){t&&(t.remove(),t=null),r&&(r.remove(),r=null)}function v(e){return e.replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a])}function O(e){return e.replace(/"/g,"&quot;")}function z(){!n||!o||(y=!0,t&&(t.style.display="none"),r&&(r.style.display="none"),n.style.display="block",setTimeout(()=>{n&&(n.style.opacity="1",n.style.transform="translateY(0)")},10),o.innerHTML=W,w())}function I(){!n||!o||(y=!1,n.style.opacity="0",n.style.transform="translateY(10px)",setTimeout(()=>n&&(n.style.display="none"),300),o.innerHTML=S,o.style.background="#3b82f6",!T&&A&&t&&r&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",r.style.display="block",r.style.opacity="1",x(),b({type:"nexus:parent-location",href:location.href})))}function H(){z(),setTimeout(()=>b({type:"nexus:open-chat"}),50)}function q(){z(),setTimeout(()=>b({type:"nexus:run-secondary-cta"}),50)}function R(){window.removeEventListener("message",N),window.removeEventListener("popstate",w),window.removeEventListener("resize",x),window.removeEventListener("scroll",x),U(),n&&(n.remove(),n=null,i=null),o&&(o.remove(),o=null),y=!1,m=!1,d="",E=!1}function P(e){R(),e.organizationId&&(f=e.organizationId),e.position&&(c=e.position),C()}window.NexusWidget={init:P,show:z,hide:I,destroy:R},C()})()})();
