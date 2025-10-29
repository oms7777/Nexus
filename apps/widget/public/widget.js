(function(){"use strict";const h={WIDGET_URL:typeof document<"u"&&document.currentScript?new URL(document.currentScript.src).origin:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},$=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,O=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){let r=null,n=null,o=null,t=null,i=null,y=!1,v=!1,T=!1,m=null,d=h.DEFAULT_POSITION;const I=document.currentScript;if(I)m=I.getAttribute("data-organization-id"),d=I.getAttribute("data-position")??h.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),s=Array.from(e).find(a=>a.hasAttribute("data-organization-id"));s&&(m=s.getAttribute("data-organization-id"),d=s.getAttribute("data-position")??h.DEFAULT_POSITION)}if(!m)return;const k=new URL(h.WIDGET_URL).origin;function z(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",A,{once:!0}):A()}function A(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=$,o.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #0ea5e9; color: white; border: none; cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 8px 28px rgba(14,165,233,.35); transition: transform .2s ease;
    `,o.addEventListener("click",H),o.addEventListener("mouseenter",()=>o.style.transform="scale(1.05)"),o.addEventListener("mouseleave",()=>o.style.transform="scale(1)"),document.body.appendChild(o),n=document.createElement("div"),n.id="nexus-widget-container",n.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 8px 28px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
    `,r=document.createElement("iframe"),r.src=R(),r.allow="microphone; clipboard-read; clipboard-write",r.style.cssText="width:100%;height:100%;border:none;",r.onload=()=>{u({type:"nexus:embed-ready"}),b()},n.appendChild(r),document.body.appendChild(n),window.addEventListener("message",C),W(),window.addEventListener("popstate",b),window.addEventListener("resize",f),window.addEventListener("scroll",f,{passive:!0}),window.setTimeout(()=>{!T&&!v&&U(_())},1200)}function R(){const e=new URLSearchParams;return e.append("organizationId",m),`${h.WIDGET_URL}?${e.toString()}`}function C(e){var l,c;if(e.origin!==k)return;const{type:s,payload:a}=e.data||{};switch(s){case"close":S();break;case"resize":a!=null&&a.height&&n&&(n.style.height=`${a.height}px`);break;case"nexus:promo":T=!0,(l=r==null?void 0:r.contentWindow)==null||l.postMessage({type:"nexus:host-ack"},k),U(a),(c=r==null?void 0:r.contentWindow)==null||c.postMessage({type:"nexus:hide-internal-promo"},k);break}}function u(e){var s;(s=r==null?void 0:r.contentWindow)==null||s.postMessage(e,k)}function b(){u({type:"nexus:parent-location",href:location.href})}function W(){["pushState","replaceState"].forEach(e=>{const s=history[e];history[e]=function(...a){const l=s.apply(this,a);return b(),l}})}function _(){return{title:"Get help fast or schedule time",body:"Chat now or book a 15-min demo.",primary:"Chat with AI Assistant",secondary:"Book a meeting",primaryCta:{kind:"open_chat",label:"Chat with AI Assistant"},secondaryCta:{kind:"open_booking",label:"Book a meeting"},avatars:[]}}function U(e){t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 10px 28px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
      `,document.body.appendChild(t),i=document.createElement("div"),i.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: #ffffff;
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(i));const a=(Array.isArray(e.avatars)&&e.avatars.length?e.avatars.slice(0,3):[]).map((E,p)=>`
      <img src="${D(E)}" alt="avatar ${p+1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
        " />
    `).join(""),l=e.badgeText?`<span style="
            position:absolute; left:12px; top:10px;
            background:#0ea5e9; color:#fff; font-size:11px; line-height:1;
            padding:4px 6px; border-radius:6px; font-weight:600;">
          ${w(e.badgeText)}
        </span>`:"";t.innerHTML=`
      <div style="position:relative">
        ${l}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:2px">${a}</div>
          <div style="flex:1">
            <div style="font-weight:700">${w(e.title||"Discover the right solution for your business project.")}</div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4">${w(e.body||"Chat with our assistant or book a 15-min demo.")}</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button id="nexus-primary"
                style="flex:1;height:36px;border:none;border-radius:8px;background:#0ea5e9;color:#fff;cursor:pointer;font-weight:600">
                ${w(e.primary||"Chat with AI Assistant")}
              </button>
              ${e.secondary!==void 0?`<button id="nexus-secondary"
                      style="flex:1;height:36px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;color:#111827;cursor:pointer;font-weight:600">
                      ${w(e.secondary||"Book a meeting")}
                    </button>`:""}
            </div>
            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${D(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`:""}
          </div>
          <button id="nexus-close" title="Close"
            style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
        </div>
      </div>
    `;const c=t.querySelector("#nexus-primary"),x=t.querySelector("#nexus-secondary"),g=t.querySelector("#nexus-close");c==null||c.addEventListener("click",()=>{u({type:"nexus:run-primary-cta"}),L()}),x==null||x.addEventListener("click",()=>{u({type:"nexus:run-secondary-cta"}),L()}),g==null||g.addEventListener("click",()=>{v=!0,M()}),f(),!y&&!v&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),i&&(i.style.opacity="1")})}function f(){if(!o||!t||!i)return;const e=o.getBoundingClientRect(),s=12,a=12,l=window.innerHeight-e.top;t.style.bottom=`${l+s}px`,d==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const c=e.left+e.width/2;i.style.left=`${c-a/2}px`,i.style.bottom=`${l+(s-a/2)}px`,i.style.transform="rotate(45deg)";const x=t.getBoundingClientRect(),g=x.right-window.innerWidth,E=-x.left;if(g>0&&d==="bottom-right"){const p=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,p+g)}px`}else if(E>0&&d==="bottom-left"){const p=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,p+E)}px`}}function M(){t&&(t.remove(),t=null),i&&(i.remove(),i=null)}function w(e){return e.replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[s])}function D(e){return e.replace(/"/g,"&quot;")}function H(){y?S():L()}function L(){!n||!o||(y=!0,t&&(t.style.display="none"),i&&(i.style.display="none"),n.style.display="block",setTimeout(()=>{n&&(n.style.opacity="1",n.style.transform="translateY(0)")},10),o.innerHTML=O,b(),u({type:"nexus:open-chat"}))}function S(){!n||!o||(y=!1,n.style.opacity="0",n.style.transform="translateY(10px)",setTimeout(()=>n&&(n.style.display="none"),300),o.innerHTML=$,o.style.background="#0ea5e9",T&&!v&&(t&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)"),i&&(i.style.display="block",i.style.opacity="1"),f(),u({type:"nexus:parent-location",href:location.href})))}function N(){window.removeEventListener("message",C),window.removeEventListener("popstate",b),window.removeEventListener("resize",f),window.removeEventListener("scroll",f),M(),n&&(n.remove(),n=null,r=null),o&&(o.remove(),o=null),y=!1}function F(e){N(),e.organizationId&&(m=e.organizationId),e.position&&(d=e.position),z()}window.NexusWidget={init:F,show:L,hide:S,destroy:N},z()})()})();
