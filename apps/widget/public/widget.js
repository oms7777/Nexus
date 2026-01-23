(function(){"use strict";const U={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},O=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,K=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let d=null,l=null,n=null,t=null,a=null,y=!1,E=!1,v=!1,z=!1,S="",A=null,p=U.DEFAULT_POSITION,s=null,c=null,R=!1,j="",k=null,_=!1,L=null;const X={passive:!0};let q=!1;const F=document.currentScript;if(F)A=F.getAttribute("data-organization-id"),p=F.getAttribute("data-position")??U.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),o=Array.from(e).find(i=>i.hasAttribute("data-organization-id"));o&&(A=o.getAttribute("data-organization-id"),p=o.getAttribute("data-position")??U.DEFAULT_POSITION)}if(!A){console.error("Nexus Widget: data-organization-id attribute is required");return}function Q(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Z,{once:!0}):Z()}function Z(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=O,n.style.cssText=`
      all: unset;
      position: fixed;
      ${p==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(s==null?void 0:s.chatBubbleColor)||(s==null?void 0:s.primaryColor)||"#3b82f6"};
      color: ${(s==null?void 0:s.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,n.addEventListener("click",()=>{if(y){W();return}Y()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
      position: fixed;
      ${p==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `,d=document.createElement("iframe"),d.src=ce(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{z=!0,S=new URL(d.src).origin,C({type:"nexus:embed-ready"}),M(!0),T()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",J),window.addEventListener("resize",b),window.addEventListener("scroll",b,X),window.addEventListener("popstate",B),window.addEventListener("hashchange",B),window.addEventListener("pageshow",ee),document.addEventListener("click",te,!0),window.addEventListener("pagehide",D,{once:!0}),window.addEventListener("beforeunload",D,{once:!0})}function ce(){const e=new URLSearchParams;return e.append("organizationId",A),`${U.WIDGET_URL}?${e.toString()}`}function J(e){const{type:o,payload:i}=e.data||{};if(!(z&&S&&e.origin!==S))switch(o){case"close":W();break;case"resize":i!=null&&i.height&&l&&(l.style.height=`${i.height}px`);break;case"nexus:theme":{const r=i;s=(r==null?void 0:r.theme)||null,c=(r==null?void 0:r.brandLogoUrl)||null,T();break}case"nexus:suggestions":{const r=i;E=!0,s=r.theme||s||null,c=r.brandLogoUrl||c||null,T(),pe(r);break}case"nexus:promo":{const r=i;E=!0,s=r.theme||s||null,c=r.brandLogoUrl||c||null,T(),fe(r);break}}}function C(e){!z||!(d!=null&&d.contentWindow)||d.contentWindow.postMessage(e,S||"*")}function M(e=!1){if(!z)return;const o=location.href;!e&&o===j||(_=_||e,!k&&(k=window.setTimeout(()=>{k=null;const i=location.href,r=_||i!==j;_=!1,r&&(j=i,C({type:"nexus:parent-location",href:i}))},350)))}function B(){M(!1)}function ee(){M(!0)}function te(e){var r;if(e.defaultPrevented||e.button!==0)return;const o=e.target,i=(r=o==null?void 0:o.closest)==null?void 0:r.call(o,"a");if(i&&i.target!=="_blank"&&!(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)&&!i.download){try{if(new URL(i.href,location.href).origin!==location.origin)return}catch{return}setTimeout(()=>M(!1),0)}}function b(){L||(L=window.requestAnimationFrame(()=>{L=null,he()}))}function ue(){n&&(R||!s&&!c&&!E||(R=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function T(){if(!n)return;const e=(s==null?void 0:s.chatBubbleColor)||(s==null?void 0:s.primaryColor)||"#3b82f6",o=(s==null?void 0:s.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=o,ue(),y){n.innerHTML=K;return}if(c){const i=I(c);n.innerHTML=`
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${i}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `}else n.innerHTML=O}function pe(e){var x;const o=e.theme||s||{},i=o.primaryColor||"#0ea5e9",r=o.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${r};
        border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        font-size: 14px;
        line-height: 1.4;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        background-clip: padding-box;
      `,document.body.appendChild(t),a=document.createElement("div"),a.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${r};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(a));const m=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((g,w)=>`
          <button data-sugg-index="${w}"
            style="
              all: unset;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:8px 10px;
              border-radius:9999px;
              border:1px solid ${i}59;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
              line-height:1;
              color:${i};
              background:${i}14;
              white-space:nowrap;
              max-width:100%;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
            ${f(g)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${f("Quick questions")}
            </div>
            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${m}
            </div>
            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${I(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      View our privacy policy.
                    </a>
                  </div>`:""}
          </div>

          <button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:20px;height:20px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;
            ">×</button>
        </div>
      </div>
    `,(x=t.querySelector("#nexus-close"))==null||x.addEventListener("click",()=>{v=!0,P()}),t.querySelectorAll("button[data-sugg-index]").forEach(g=>g.addEventListener("click",()=>Y())),b(),!y&&!v&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function fe(e){var ae,le,de;const o=e.theme||s||{},i=o.primaryColor||"#0ea5e9",r=o.primaryTextColor||"#ffffff",$=o.secondaryColor||"#ffffff",m=o.nudgeBackgroundColor||"#ffffff",x=o.secondaryTextColor||"#111827",g=o.chatBubbleColor||o.primaryColor||"#3b82f6",w=o.primaryTextColor||"#ffffff",ne=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${m};
        border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        padding: 12px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
        font-size: 14px;
        line-height: 1.4;
        opacity: 0; transform: translateY(6px);
        transition: opacity .18s ease, transform .18s ease;
        pointer-events: auto;
        background-clip: padding-box;
      `,document.body.appendChild(t),a=document.createElement("div"),a.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${m};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(a));const oe=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],ie=Array.isArray(e.ctaList)?e.ctaList:[],re=ie.length>0,H=e.identityMode||"auto";let G="";H==="logo"||H==="auto"&&c?c&&(G=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${I(c)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):(H==="avatars"||H==="auto"&&oe.length)&&(G=oe.map((u,h)=>`
          <img src="${I(u)}" alt="avatar ${h+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${h?`margin-left:-10px; z-index:${10-h};`:"z-index:10;"}
            " />`).join(""));const me=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${f(e.badgeText)}
         </span>`:"",we=e.title||"Discover the right solution for your business project.",ve=e.body||"Chat with our assistant or book a 15-min demo.",ke=re?`
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ie.map((u,h)=>{const V=h===0,Ce=V?i:$,Te=V?r:x,$e=V?"":"border:1px solid #e5e7eb;",Ee=u.label&&u.label.trim().length?u.label:ge(u.kind);return`
                <button data-cta-index="${h}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${Ce};
                    color:${Te};
                    ${$e}
                    cursor:pointer;
                    font-weight:600;
                    font-size:13px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    box-sizing:border-box;
                    white-space:normal;
                  ">
                  ${f(Ee)}
                </button>
              `}).join("")}
        </div>
      `:`
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          <button id="nexus-primary"
            style="
              all: unset;
              width:100%;
              min-height:36px;
              padding:0 12px;
              border-radius:8px;
              background:${i};
              color:${r};
              cursor:pointer;
              font-weight:600;
              font-size:13px;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              box-sizing:border-box;
              white-space:normal;
            ">
            ${f(e.primary||"Chat with AI Assistant")}
          </button>
          ${e.secondary!==void 0?`<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${$};
                    color:${x};
                    border:1px solid #e5e7eb;
                    cursor:pointer;
                    font-weight:600;
                    font-size:13px;
                    display:inline-flex;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    box-sizing:border-box;
                    white-space:normal;
                  ">
                  ${f(e.secondary||"Book a meeting")}
                </button>`:""}
        </div>
      `,Le=ne?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${g};
              color:${w};
              cursor:pointer;
              display:flex;
              align-items:center;
              justify-content:center;
              box-shadow:0 6px 18px rgba(0,0,0,.18);
              transition: transform .15s ease, box-shadow .15s ease, opacity .15s ease;
            ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
              xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 18v3" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M8 21h8" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `:"";t.innerHTML=`
      <div style="position:relative">
        ${me}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${G}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${f(we)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${f(ve)}
            </div>

            ${Le}
            ${ke}

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${I(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                      style="color:#6b7280;font-size:11px;text-decoration:underline">
                      This chat may be recorded. View our privacy policy.
                    </a>
                  </div>`:""}
          </div>
          <button id="nexus-close" title="Close"
            style="
              all: unset;
              border-radius:9999px;
              width:20px;height:20px;
              display:flex;align-items:center;justify-content:center;
              color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;
            ">×</button>
        </div>
      </div>
    `,(ae=t.querySelector("#nexus-close"))==null||ae.addEventListener("click",()=>{v=!0,P()});const se=t.querySelector("#nexus-voice");ne&&se&&se.addEventListener("click",()=>{N(),setTimeout(()=>C({type:"nexus:open-voice"}),50)}),re?t.querySelectorAll("button[data-cta-index]").forEach(u=>{const h=Number(u.getAttribute("data-cta-index")||"0");u.addEventListener("click",()=>xe(h))}):((le=t.querySelector("#nexus-primary"))==null||le.addEventListener("click",()=>Y()),(de=t.querySelector("#nexus-secondary"))==null||de.addEventListener("click",()=>ye())),b(),!y&&!v&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function xe(e){N(),setTimeout(()=>C({type:"nexus:run-cta",index:e}),50)}function ge(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function he(){if(!n||!t||!a)return;const e=n.getBoundingClientRect(),o=12,i=12,r=window.innerHeight-e.top;t.style.bottom=`${r+o}px`,p==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const $=e.left+e.width/2;a.style.left=`${$-i/2}px`,a.style.bottom=`${r+(o-i/2)}px`,a.style.transform="rotate(45deg)";const m=t.getBoundingClientRect(),x=m.right-window.innerWidth,g=-m.left;if(x>0&&p==="bottom-right"){const w=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,w+x)}px`}else if(g>0&&p==="bottom-left"){const w=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,w+g)}px`}}function P(){t&&(t.remove(),t=null),a&&(a.remove(),a=null)}function f(e){return e.replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}function I(e){return e.replace(/"/g,"&quot;")}function N(){!l||!n||(y=!0,t&&(t.style.display="none"),a&&(a.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),n.innerHTML=K,T())}function W(){!l||!n||(y=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),n.innerHTML=O,T(),!v&&E&&t&&a&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",a.style.display="block",a.style.opacity="1",b()))}function Y(){N(),setTimeout(()=>C({type:"nexus:open-chat"}),50)}function ye(){N(),setTimeout(()=>C({type:"nexus:run-secondary-cta"}),50)}function D(){if(!q){q=!0;try{window.removeEventListener("message",J),window.removeEventListener("resize",b),window.removeEventListener("scroll",b,X),window.removeEventListener("popstate",B),window.removeEventListener("hashchange",B),window.removeEventListener("pageshow",ee),document.removeEventListener("click",te,!0)}catch{}if(L)try{window.cancelAnimationFrame(L)}catch{}if(L=null,k)try{window.clearTimeout(k)}catch{}k=null,_=!1,P(),l&&(l.remove(),l=null,d=null),n&&(n.remove(),n=null),y=!1,z=!1,S="",s=null,c=null,R=!1,E=!1,v=!1,j=""}}function be(e){D(),q=!1,e.organizationId&&(A=e.organizationId),e.position&&(p=e.position),Q()}window.NexusWidget={init:be,show:N,hide:W,destroy:D},Q()})()})();
