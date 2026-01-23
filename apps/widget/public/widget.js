(function(){"use strict";const m={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},I=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,z=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let r=null,n=null,o=null,p=!1,T=!1,w=!1,g="",h=null,b=m.DEFAULT_POSITION,e=null,a=null,_=!1,L=!1,y="",k=0,u=null,x=!1,C=0,d=null,c=null;const N={passive:!0},D=document.currentScript;if(D)h=D.getAttribute("data-organization-id"),b=D.getAttribute("data-position")??m.DEFAULT_POSITION;else{const t=document.querySelectorAll('script[src*="widget"]'),l=Array.from(t).find(s=>s.hasAttribute("data-organization-id"));l&&(h=l.getAttribute("data-organization-id"),b=l.getAttribute("data-position")??m.DEFAULT_POSITION)}if(!h){console.error("Nexus Widget: data-organization-id attribute is required");return}function O(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",U,{once:!0}):U()}function R(){const t=new URLSearchParams;return t.append("organizationId",h),`${m.WIDGET_URL}?${t.toString()}`}function U(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=I,o.style.cssText=`
      all: unset;
      position: fixed;
      ${b==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(e==null?void 0:e.chatBubbleColor)||(e==null?void 0:e.primaryColor)||"#3b82f6"};
      color: ${(e==null?void 0:e.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,o.addEventListener("click",()=>{p?A():F()}),document.body.appendChild(o),n=document.createElement("div"),n.id="nexus-widget-container",n.style.cssText=`
      position: fixed;
      ${b==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `,r=document.createElement("iframe"),r.src=R(),r.allow="microphone; clipboard-read; clipboard-write",r.style.cssText="width:100%;height:100%;border:none;",r.onload=()=>{w=!0,g=new URL(r.src).origin,S({type:"nexus:embed-ready"}),W(!0),f()},n.appendChild(r),document.body.appendChild(n),window.addEventListener("message",M),window.addEventListener("resize",v),window.addEventListener("scroll",v,N),window.addEventListener("pagehide",E,{once:!0}),window.addEventListener("beforeunload",E,{once:!0})}function M(t){if(L||!(r!=null&&r.contentWindow)||t.source!==r.contentWindow)return;const{type:l,payload:s}=t.data||{};if(!(w&&g&&t.origin!==g))switch(l){case"close":A();break;case"resize":{const i=Number(s==null?void 0:s.height);if(!i||!n)return;P(i);break}case"nexus:theme":{const i=s;e=(i==null?void 0:i.theme)||null,a=(i==null?void 0:i.brandLogoUrl)||null,f();break}case"nexus:suggestions":{const i=s;T=!0,e=i.theme||e||null,a=i.brandLogoUrl||a||null,f();break}case"nexus:promo":{const i=s;T=!0,e=i.theme||e||null,a=i.brandLogoUrl||a||null,f();break}}}function P(t){d=t;const l=Date.now();if(l-C>120){C=l,n&&d&&(n.style.height=`${d}px`),d=null;return}c||(c=window.setTimeout(()=>{c=null,C=Date.now(),n&&d&&(n.style.height=`${d}px`),d=null},140))}function S(t){!w||!(r!=null&&r.contentWindow)||r.contentWindow.postMessage(t,g||"*")}function W(t=!1){if(!w)return;const l=location.href;!t&&l===y||(x=x||t,!u&&(u=window.setTimeout(()=>{u=null;const s=location.href,i=Date.now(),j=x||s!==y;x=!1,j&&(i-k<250&&s===y||(y=s,k=i,S({type:"nexus:parent-location",href:s})))},350)))}function $(){o&&(_||!e&&!a&&!T||(_=!0,o.style.opacity="1",o.style.pointerEvents="auto"))}function f(){if(!o)return;const t=(e==null?void 0:e.chatBubbleColor)||(e==null?void 0:e.primaryColor)||"#3b82f6",l=(e==null?void 0:e.primaryTextColor)||"#ffffff";if(o.style.background=t,o.style.color=l,$(),p){o.innerHTML=z;return}if(a){const s=B(a);o.innerHTML=`
        <div style="width:70%;height:70%;border-radius:9999px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.9);">
          <img src="${s}" alt="Chat" style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `}else o.innerHTML=I}function v(){}function B(t){return t.replace(/"/g,"&quot;")}function H(){!n||!o||(p=!0,n.style.display="block",setTimeout(()=>{n&&(n.style.opacity="1",n.style.transform="translateY(0)")},10),o.innerHTML=z,f(),W(!1))}function A(){!n||!o||(p=!1,n.style.opacity="0",n.style.transform="translateY(10px)",setTimeout(()=>n&&(n.style.display="none"),300),o.innerHTML=I,f())}function F(){H(),setTimeout(()=>S({type:"nexus:open-chat"}),50)}function E(){if(!L){L=!0;try{window.removeEventListener("message",M),window.removeEventListener("resize",v),window.removeEventListener("scroll",v,N)}catch{}if(u)try{window.clearTimeout(u)}catch{}if(u=null,x=!1,c)try{window.clearTimeout(c)}catch{}c=null,d=null,n&&(n.remove(),n=null,r=null),o&&(o.remove(),o=null),p=!1,w=!1,g="",e=null,a=null,_=!1,T=!1,y="",k=0}}function G(t){E(),L=!1,t.organizationId&&(h=t.organizationId),t.position&&(b=t.position),O()}window.NexusWidget={init:G,show:H,hide:A,destroy:E},O()})()})();
