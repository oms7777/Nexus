(function(){"use strict";const k={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},z=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,W=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){console.log(`[EchoWidget] embed-1.2.2 | origin=${location.origin}`);let i=null,o=null,n=null,t=null,r=null,y=!1,E=!1,$=!1,m=null,d=k.DEFAULT_POSITION,c="",b=!1;const I=document.currentScript;if(I)m=I.getAttribute("data-organization-id"),d=I.getAttribute("data-position")??k.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),a=Array.from(e).find(s=>s.hasAttribute("data-organization-id"));a&&(m=a.getAttribute("data-organization-id"),d=a.getAttribute("data-position")??k.DEFAULT_POSITION)}if(!m){console.error("Echo Widget: data-organization-id attribute is required");return}function A(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",C,{once:!0}):C()}function C(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=z,n.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #3b82f6; color: white; border: none; cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(59,130,246,.35); transition: transform .2s ease;
    `,n.addEventListener("click",F),n.addEventListener("mouseenter",()=>n.style.transform="scale(1.05)"),n.addEventListener("mouseleave",()=>n.style.transform="scale(1)"),document.body.appendChild(n),o=document.createElement("div"),o.id="nexus-widget-container",o.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
    `,i=document.createElement("iframe"),i.src=H(),i.allow="microphone; clipboard-read; clipboard-write",i.style.cssText="width:100%;height:100%;border:none;",i.onload=()=>{b=!0,c=new URL(i.src).origin,f({type:"nexus:embed-ready"}),w()},o.appendChild(i),document.body.appendChild(o),window.addEventListener("message",O),_(),window.addEventListener("popstate",w),window.addEventListener("resize",g),window.addEventListener("scroll",g,{passive:!0}),window.setTimeout(()=>{!$&&!E&&M(D())},1200)}function H(){const e=new URLSearchParams;return e.append("organizationId",m),`${k.WIDGET_URL}?${e.toString()}`}function O(e){var l,p;if(!b||!c||e.origin!==c)return;const{type:a,payload:s}=e.data||{};switch(a){case"close":S();break;case"resize":s!=null&&s.height&&o&&(o.style.height=`${s.height}px`);break;case"nexus:promo":$=!0,(l=i==null?void 0:i.contentWindow)==null||l.postMessage({type:"nexus:host-ack"},c),M(s),(p=i==null?void 0:i.contentWindow)==null||p.postMessage({type:"nexus:hide-internal-promo"},c);break}}function f(e){!b||!(i!=null&&i.contentWindow)||!c||i.contentWindow.postMessage(e,c)}function w(){f({type:"nexus:parent-location",href:location.href})}function _(){["pushState","replaceState"].forEach(e=>{const a=history[e];history[e]=function(...s){const l=a.apply(this,s);return b&&w(),l}})}function D(){return{title:"Get help fast or schedule time",body:"Chat now or book a 15-min demo.",primary:"Chat with AI Assistant",secondary:"Book a meeting",primaryCta:{kind:"open_chat",label:"Chat with AI Assistant"},secondaryCta:{kind:"open_booking",label:"Book a meeting"},avatars:[]}}function M(e){t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(r));const s=(Array.isArray(e.avatars)&&e.avatars.length?e.avatars.slice(0,3):[]).map((T,u)=>`
      <img src="${R(T)}" alt="avatar ${u+1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${u?`margin-left:-10px; z-index:${10-u};`:"z-index:10;"}
        " />
    `).join(""),l=e.badgeText?`<span style="
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
    `;const p=t.querySelector("#nexus-primary"),x=t.querySelector("#nexus-secondary"),h=t.querySelector("#nexus-close");p==null||p.addEventListener("click",()=>{f({type:"nexus:run-primary-cta"}),L()}),x==null||x.addEventListener("click",()=>{f({type:"nexus:run-secondary-cta"}),L()}),h==null||h.addEventListener("click",()=>{E=!0,N()}),g(),!y&&!E&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),r&&(r.style.opacity="1")})}function g(){if(!n||!t||!r)return;const e=n.getBoundingClientRect(),a=12,s=12,l=window.innerHeight-e.top;t.style.bottom=`${l+a}px`,d==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const p=e.left+e.width/2;r.style.left=`${p-s/2}px`,r.style.bottom=`${l+(a-s/2)}px`,r.style.transform="rotate(45deg)";const x=t.getBoundingClientRect(),h=x.right-window.innerWidth,T=-x.left;if(h>0&&d==="bottom-right"){const u=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,u+h)}px`}else if(T>0&&d==="bottom-left"){const u=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,u+T)}px`}}function N(){t&&(t.remove(),t=null),r&&(r.remove(),r=null)}function v(e){return e.replace(/[&<>"']/g,a=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[a])}function R(e){return e.replace(/"/g,"&quot;")}function F(){y?S():L()}function L(){!o||!n||(y=!0,t&&(t.style.display="none"),r&&(r.style.display="none"),o.style.display="block",setTimeout(()=>{o&&(o.style.opacity="1",o.style.transform="translateY(0)")},10),n.innerHTML=W,w(),f({type:"nexus:open-chat"}))}function S(){!o||!n||(y=!1,o.style.opacity="0",o.style.transform="translateY(10px)",setTimeout(()=>o&&(o.style.display="none"),300),n.innerHTML=z,n.style.background="#3b82f6",$&&!E&&(t&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)"),r&&(r.style.display="block",r.style.opacity="1"),g(),f({type:"nexus:parent-location",href:location.href})))}function U(){window.removeEventListener("message",O),window.removeEventListener("popstate",w),window.removeEventListener("resize",g),window.removeEventListener("scroll",g),N(),o&&(o.remove(),o=null,i=null),n&&(n.remove(),n=null),y=!1,b=!1,c=""}function q(e){U(),e.organizationId&&(m=e.organizationId),e.position&&(d=e.position),A()}window.EchoWidget={init:q,show:L,hide:S,destroy:U},A()})()})();
