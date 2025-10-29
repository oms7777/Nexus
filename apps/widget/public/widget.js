(function(){"use strict";const h={WIDGET_URL:typeof document<"u"&&document.currentScript?new URL(document.currentScript.src).origin:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},$=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,W=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){console.log(`[EchoWidget] embed-1.2.2 | origin=${location.origin}`);let r=null,n=null,o=null,e=null,i=null,y=!1,v=!1,T=!1,m=null,d=h.DEFAULT_POSITION;const S=document.currentScript;if(S)m=S.getAttribute("data-organization-id"),d=S.getAttribute("data-position")??h.DEFAULT_POSITION;else{const t=document.querySelectorAll('script[src*="widget"]'),s=Array.from(t).find(a=>a.hasAttribute("data-organization-id"));s&&(m=s.getAttribute("data-organization-id"),d=s.getAttribute("data-position")??h.DEFAULT_POSITION)}if(!m){console.error("Echo Widget: data-organization-id attribute is required");return}const E=new URL(h.WIDGET_URL).origin;function z(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",A,{once:!0}):A()}function A(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=$,o.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 50%;
      background: #2563EB; color: white; border: none; cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 10px 30px rgba(37, 99, 235, .35);
      transition: transform .18s ease, box-shadow .18s ease;
      -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
    `,o.addEventListener("click",_),o.addEventListener("mouseenter",()=>{o.style.transform="scale(1.06)",o.style.boxShadow="0 14px 36px rgba(37, 99, 235, .4)"}),o.addEventListener("mouseleave",()=>{o.style.transform="scale(1)",o.style.boxShadow="0 10px 30px rgba(37, 99, 235, .35)"}),document.body.appendChild(o),n=document.createElement("div"),n.id="nexus-widget-container",n.style.cssText=`
      position: fixed;
      ${d==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 20px 50px rgba(0,0,0,.18);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .25s ease; background: #fff;
    `,r=document.createElement("iframe"),r.src=M(),r.allow="microphone; clipboard-read; clipboard-write",r.style.cssText="width:100%;height:100%;border:none;",r.onload=()=>{u({type:"nexus:embed-ready"}),b()},n.appendChild(r),document.body.appendChild(n),window.addEventListener("message",C),N(),window.addEventListener("popstate",b),window.addEventListener("resize",f),window.addEventListener("scroll",f,{passive:!0}),window.setTimeout(()=>{!T&&!v&&B(D())},1200)}function M(){const t=new URLSearchParams;return t.append("organizationId",m),`${h.WIDGET_URL}?${t.toString()}`}function C(t){var l,c;if(t.origin!==E)return;const{type:s,payload:a}=t.data||{};switch(s){case"close":I();break;case"resize":a!=null&&a.height&&n&&(n.style.height=`${a.height}px`);break;case"nexus:promo":T=!0,(l=r==null?void 0:r.contentWindow)==null||l.postMessage({type:"nexus:host-ack"},E),B(a),(c=r==null?void 0:r.contentWindow)==null||c.postMessage({type:"nexus:hide-internal-promo"},E);break}}function u(t){var s;(s=r==null?void 0:r.contentWindow)==null||s.postMessage(t,E)}function b(){u({type:"nexus:parent-location",href:location.href})}function N(){["pushState","replaceState"].forEach(t=>{const s=history[t];history[t]=function(...a){const l=s.apply(this,a);return b(),l}})}function D(){return{title:"Get help fast or schedule time",body:"Chat now or book a 15-min demo.",primary:"Chat with AI Assistant",secondary:"Book a meeting",primaryCta:{kind:"open_chat",label:"Chat with AI Assistant"},secondaryCta:{kind:"open_booking",label:"Book a meeting"},avatars:[]}}function B(t){e||(e=document.createElement("div"),e.id="nexus-nudge",e.style.cssText=`
        position: fixed;
        width: 352px; max-width: min(352px, calc(100vw - 96px));
        z-index: 2147483001;
        background: #ffffff; border: 1px solid #E5E7EB; border-radius: 14px;
        box-shadow: 0 16px 40px rgba(0,0,0,.12);
        padding: 14px 14px 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
      `,document.body.appendChild(e),i=document.createElement("div"),i.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: #ffffff;
        border-left: 1px solid #E5E7EB;
        border-top: 1px solid #E5E7EB;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.06);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(i));const a=(Array.isArray(t.avatars)&&t.avatars.length?t.avatars.slice(0,3):[]).map((L,p)=>`
      <img src="${O(L)}" alt="avatar ${p+1}"
        style="
          width:26px;height:26px;border-radius:9999px;object-fit:cover;
          border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
          position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
        " />
    `).join(""),l=t.badgeText?`<span style="
            position:absolute; left:12px; top:10px;
            background:#10b981; color:#fff; font-size:11px; line-height:1;
            padding:4px 6px; border-radius:6px; font-weight:600;">
          ${w(t.badgeText)}
        </span>`:"";e.innerHTML=`
      <div style="position:relative">
        ${l}
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:2px">${a}</div>
          <div style="flex:1">
            <div style="font-weight:700">${w(t.title||"Discover the right solution for your business project.")}</div>
            <div style="margin-top:6px;color:#4B5563;font-size:14px;line-height:1.45">${w(t.body||"Chat with our assistant or book a 15-min demo.")}</div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button id="nexus-primary"
                style="flex:1;height:38px;border:none;border-radius:10px;background:#0EA5E9;color:#fff;cursor:pointer;font-weight:700">
                ${w(t.primary||"Chat with AI Assistant")}
              </button>
              ${t.secondary!==void 0?`<button id="nexus-secondary"
                      style="flex:1;height:38px;border:1px solid #E5E7EB;border-radius:10px;background:#fff;color:#111827;cursor:pointer;font-weight:700">
                      ${w(t.secondary||"Book a meeting")}
                    </button>`:""}
            </div>
            ${t.privacyUrl?`<div style="margin-top:10px">
                    <a href="${O(t.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6B7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`:""}
          </div>
          <button id="nexus-close" title="Close"
            style="border:none;background:transparent;color:#9CA3AF;cursor:pointer;font-size:18px;line-height:18px">×</button>
        </div>
      </div>
    `;const c=e.querySelector("#nexus-primary"),x=e.querySelector("#nexus-secondary"),g=e.querySelector("#nexus-close");c==null||c.addEventListener("click",()=>{u({type:"nexus:run-primary-cta"}),k()}),x==null||x.addEventListener("click",()=>{u({type:"nexus:run-secondary-cta"}),k()}),g==null||g.addEventListener("click",()=>{v=!0,U()}),f(),!y&&!v&&requestAnimationFrame(()=>{e&&(e.style.opacity="1",e.style.transform="translateY(0)"),i&&(i.style.opacity="1")})}function f(){if(!o||!e||!i)return;const t=o.getBoundingClientRect(),s=12,a=12,l=window.innerHeight-t.top;e.style.bottom=`${l+s}px`,d==="bottom-right"?(e.style.right="20px",e.style.left=""):(e.style.left="20px",e.style.right="");const c=t.left+t.width/2;i.style.left=`${c-a/2}px`,i.style.bottom=`${l+(s-a/2)}px`,i.style.transform="rotate(45deg)";const x=e.getBoundingClientRect(),g=x.right-window.innerWidth,L=-x.left;if(g>0&&d==="bottom-right"){const p=parseFloat(getComputedStyle(e).right||"20");e.style.right=`${Math.max(12,p+g)}px`}else if(L>0&&d==="bottom-left"){const p=parseFloat(getComputedStyle(e).left||"20");e.style.left=`${Math.max(12,p+L)}px`}}function U(){e&&(e.remove(),e=null),i&&(i.remove(),i=null)}function w(t){return t.replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[s])}function O(t){return t.replace(/"/g,"&quot;")}function _(){y?I():k()}function k(){!n||!o||(y=!0,e&&(e.style.display="none"),i&&(i.style.display="none"),n.style.display="block",setTimeout(()=>{n&&(n.style.opacity="1",n.style.transform="translateY(0)")},10),o.innerHTML=W,b(),u({type:"nexus:open-chat"}))}function I(){!n||!o||(y=!1,n.style.opacity="0",n.style.transform="translateY(10px)",setTimeout(()=>n&&(n.style.display="none"),250),o.innerHTML=$,o.style.background="#2563EB",T&&!v&&(e&&(e.style.display="block",e.style.opacity="1",e.style.transform="translateY(0)"),i&&(i.style.display="block",i.style.opacity="1"),f(),u({type:"nexus:parent-location",href:location.href})))}function R(){window.removeEventListener("message",C),window.removeEventListener("popstate",b),window.removeEventListener("resize",f),window.removeEventListener("scroll",f),U(),n&&(n.remove(),n=null,r=null),o&&(o.remove(),o=null),y=!1}function F(t){R(),t.organizationId&&(m=t.organizationId),t.position&&(d=t.position),z()}window.EchoWidget={init:F,show:k,hide:I,destroy:R},z()})()})();
