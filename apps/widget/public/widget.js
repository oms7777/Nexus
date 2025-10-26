(function(){"use strict";const x={WIDGET_URL:typeof document<"u"&&document.currentScript?new URL(document.currentScript.src).origin:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},$=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,M=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){console.log(`[EchoWidget] embed-1.2.1 | origin=${location.origin}`);let r=null,o=null,n=null,t=null,i=null,y=!1,v=!1,T=!1,m=null,d=x.DEFAULT_POSITION;const I=document.currentScript;if(I)m=I.getAttribute("data-organization-id"),d=I.getAttribute("data-position")??x.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),s=Array.from(e).find(a=>a.hasAttribute("data-organization-id"));s&&(m=s.getAttribute("data-organization-id"),d=s.getAttribute("data-position")??x.DEFAULT_POSITION)}if(!m){console.error("Echo Widget: data-organization-id attribute is required");return}const k=new URL(x.WIDGET_URL).origin;function z(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",A,{once:!0}):A()}function A(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=$,n.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 2147483000;                  /* ⬅ higher than most sites */
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `,n.addEventListener("click",H),n.addEventListener("mouseenter",()=>n.style.transform="scale(1.05)"),n.addEventListener("mouseleave",()=>n.style.transform="scale(1)"),document.body.appendChild(n),o=document.createElement("div"),o.id="nexus-widget-container",o.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;                  /* just under the button */
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
    `,r=document.createElement("iframe"),r.src=N(),r.allow="microphone; clipboard-read; clipboard-write",r.style.cssText="width:100%;height:100%;border:none;",r.onload=()=>{u({type:"nexus:embed-ready"}),b()},o.appendChild(r),document.body.appendChild(o),window.addEventListener("message",C),D(),window.addEventListener("popstate",b),window.addEventListener("resize",f),window.addEventListener("scroll",f,{passive:!0}),window.setTimeout(()=>{!T&&!v&&U(_())},1200)}function N(){const e=new URLSearchParams;return e.append("organizationId",m),`${x.WIDGET_URL}?${e.toString()}`}function C(e){var l,c;if(e.origin!==k)return;const{type:s,payload:a}=e.data||{};switch(s){case"close":S();break;case"resize":a!=null&&a.height&&o&&(o.style.height=`${a.height}px`);break;case"nexus:promo":T=!0,(l=r==null?void 0:r.contentWindow)==null||l.postMessage({type:"nexus:host-ack"},k),U(a),(c=r==null?void 0:r.contentWindow)==null||c.postMessage({type:"nexus:hide-internal-promo"},k);break}}function u(e){var s;(s=r==null?void 0:r.contentWindow)==null||s.postMessage(e,k)}function b(){u({type:"nexus:parent-location",href:location.href})}function D(){["pushState","replaceState"].forEach(e=>{const s=history[e];history[e]=function(...a){const l=s.apply(this,a);return b(),l}})}function _(){return{title:"Get help fast or schedule time",body:"Chat now or book a 15-min demo.",primary:"Chat with AI Assistant",secondary:"Book a meeting",primaryCta:{kind:"open_chat",label:"Chat with AI Assistant"},secondaryCta:{kind:"open_booking",label:"Book a meeting"},avatars:[]}}function U(e){t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 1000001;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
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
        z-index: 2147483002;                  /* above the nudge */
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(i));const a=(Array.isArray(e.avatars)&&e.avatars.length?e.avatars.slice(0,3):[]).map((L,p)=>`
      <img src="${R(L)}" alt="avatar ${p+1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
        " />
    `).join(""),l=e.badgeText?`<span style="
            position:absolute; left:12px; top:10px;
            background:#10b981; color:#fff; font-size:11px; line-height:1;
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
                    <a href="${R(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`:""}
          </div>
          <button id="nexus-close" title="Close"
            style="border:none;background:transparent;color:#9ca3af;cursor:pointer;font-size:18px;line-height:18px">×</button>
        </div>
      </div>
    `;const c=t.querySelector("#nexus-primary"),g=t.querySelector("#nexus-secondary"),h=t.querySelector("#nexus-close");c==null||c.addEventListener("click",()=>{u({type:"nexus:run-primary-cta"}),E()}),g==null||g.addEventListener("click",()=>{u({type:"nexus:run-secondary-cta"}),E()}),h==null||h.addEventListener("click",()=>{v=!0,O()}),f(),!y&&!v&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),i&&(i.style.opacity="1")})}function f(){if(!n||!t||!i)return;const e=n.getBoundingClientRect(),s=12,a=12,l=window.innerHeight-e.top;t.style.bottom=`${l+s}px`,d==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const c=e.left+e.width/2;i.style.left=`${c-a/2}px`,i.style.bottom=`${l+(s-a/2)}px`,i.style.transform="rotate(45deg)";const g=t.getBoundingClientRect(),h=g.right-window.innerWidth,L=-g.left;if(h>0&&d==="bottom-right"){const p=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,p+h)}px`}else if(L>0&&d==="bottom-left"){const p=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,p+L)}px`}}function O(){t&&(t.remove(),t=null),i&&(i.remove(),i=null)}function w(e){return e.replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[s])}function R(e){return e.replace(/"/g,"&quot;")}function H(){y?S():E()}function E(){!o||!n||(y=!0,t&&(t.style.display="none"),i&&(i.style.display="none"),o.style.display="block",setTimeout(()=>{o&&(o.style.opacity="1",o.style.transform="translateY(0)")},10),n.innerHTML=M,b(),u({type:"nexus:open-chat"}))}function S(){!o||!n||(y=!1,o.style.opacity="0",o.style.transform="translateY(10px)",setTimeout(()=>o&&(o.style.display="none"),300),n.innerHTML=$,n.style.background="#3b82f6",T&&!v&&(t&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)"),i&&(i.style.display="block",i.style.opacity="1"),f(),u({type:"nexus:parent-location",href:location.href})))}function W(){window.removeEventListener("message",C),window.removeEventListener("popstate",b),window.removeEventListener("resize",f),window.removeEventListener("scroll",f),O(),o&&(o.remove(),o=null,r=null),n&&(n.remove(),n=null),y=!1}function F(e){W(),e.organizationId&&(m=e.organizationId),e.position&&(d=e.position),z()}window.EchoWidget={init:F,show:E,hide:S,destroy:W},z()})()})();
