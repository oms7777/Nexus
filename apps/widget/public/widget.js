(function(){"use strict";const U={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},B=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,V=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let d=null,l=null,n=null,t=null,s=null,m=!1,E=!1,$=!1,z=!1,w="",S=null,x=U.DEFAULT_POSITION,o=null,u=null,H=!1,A="",D=0,C=null,I=!1;const X={passive:!0};let O=!1;const q=document.currentScript;if(q)S=q.getAttribute("data-organization-id"),x=q.getAttribute("data-position")??U.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),i=Array.from(e).find(r=>r.hasAttribute("data-organization-id"));i&&(S=i.getAttribute("data-organization-id"),x=i.getAttribute("data-position")??U.DEFAULT_POSITION)}if(!S){console.error("Nexus Widget: data-organization-id attribute is required");return}function K(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Q,{once:!0}):Q()}function Q(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=B,n.style.cssText=`
      all: unset;
      position: fixed;
      ${x==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(o==null?void 0:o.chatBubbleColor)||(o==null?void 0:o.primaryColor)||"#3b82f6"};
      color: ${(o==null?void 0:o.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,n.addEventListener("click",()=>{if(m){W();return}P()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
      position: fixed;
      ${x==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `,d=document.createElement("iframe"),d.src=ae(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{z=!0,w=new URL(d.src).origin,T({type:"nexus:embed-ready"}),R(!0),L()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",Z),window.addEventListener("resize",v),window.addEventListener("scroll",v,X),window.addEventListener("pagehide",j,{once:!0}),window.addEventListener("beforeunload",j,{once:!0})}function ae(){const e=new URLSearchParams;return e.append("organizationId",S),`${U.WIDGET_URL}?${e.toString()}`}function Z(e){var c,p;const{type:i,payload:r}=e.data||{};if(!(z&&w&&e.origin!==w))switch(i){case"close":W();break;case"resize":r!=null&&r.height&&l&&(l.style.height=`${r.height}px`);break;case"nexus:theme":{const a=r;o=(a==null?void 0:a.theme)||null,u=(a==null?void 0:a.brandLogoUrl)||null,L();break}case"nexus:suggestions":{const a=r;E=!0,o=a.theme||o||null,u=a.brandLogoUrl||u||null,L(),de(a);break}case"nexus:promo":{const a=r;(c=d==null?void 0:d.contentWindow)==null||c.postMessage({type:"nexus:host-ack"},w||"*"),(p=d==null?void 0:d.contentWindow)==null||p.postMessage({type:"nexus:hide-internal-promo"},w||"*"),E=!0,o=a.theme||o||null,u=a.brandLogoUrl||u||null,L(),ce(a);break}}}function T(e){!z||!(d!=null&&d.contentWindow)||d.contentWindow.postMessage(e,w||"*")}function R(e=!1){if(!z)return;const i=location.href;!e&&i===A||(I=I||e,!C&&(C=window.setTimeout(()=>{C=null;const r=location.href,c=Date.now(),p=I||r!==A;I=!1,p&&(c-D<250&&r===A||(A=r,D=c,T({type:"nexus:parent-location",href:r})))},350)))}function le(){n&&(H||!o&&!u&&!E||(H=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function L(){if(!n)return;const e=(o==null?void 0:o.chatBubbleColor)||(o==null?void 0:o.primaryColor)||"#3b82f6",i=(o==null?void 0:o.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=i,le(),m){n.innerHTML=V;return}if(u){const r=_(u);n.innerHTML=`
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${r}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `}else n.innerHTML=B}function de(e){var y;const i=e.theme||o||{},r=i.primaryColor||"#0ea5e9",c=i.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${c};
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
      `,document.body.appendChild(t),s=document.createElement("div"),s.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${c};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(s));const a=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((h,k)=>`
          <button data-sugg-index="${k}"
            style="
              all: unset;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:8px 10px;
              border-radius:9999px;
              border:1px solid ${r}59;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
              line-height:1;
              color:${r};
              background:${r}14;
              white-space:nowrap;
              max-width:100%;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
            ${g(h)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${g("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${a}
            </div>

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${_(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `,(y=t.querySelector("#nexus-close"))==null||y.addEventListener("click",()=>{$=!0,F()}),t.querySelectorAll("button[data-sugg-index]").forEach(h=>h.addEventListener("click",()=>P())),v(),!m&&!$&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),s&&(s.style.opacity="1")})}function ce(e){var ie,re,se;const i=e.theme||o||{},r=i.primaryColor||"#0ea5e9",c=i.primaryTextColor||"#ffffff",p=i.secondaryColor||"#ffffff",a=i.nudgeBackgroundColor||"#ffffff",y=i.secondaryTextColor||"#111827",h=i.chatBubbleColor||i.primaryColor||"#3b82f6",k=i.primaryTextColor||"#ffffff",J=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${a};
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
      `,document.body.appendChild(t),s=document.createElement("div"),s.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${a};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(s));const ee=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],te=Array.isArray(e.ctaList)?e.ctaList:[],ne=te.length>0,N=e.identityMode||"auto";let Y="";N==="logo"||N==="auto"&&u?u&&(Y=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${_(u)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):(N==="avatars"||N==="auto"&&ee.length)&&(Y=ee.map((f,b)=>`
          <img src="${_(f)}" alt="avatar ${b+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${b?`margin-left:-10px; z-index:${10-b};`:"z-index:10;"}
            " />`).join(""));const ge=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${g(e.badgeText)}
         </span>`:"",ye=e.title||"Discover the right solution for your business project.",he=e.body||"Chat with our assistant or book a 15-min demo.",be=ne?`
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${te.map((f,b)=>{const G=b===0,we=G?r:p,ve=G?c:y,ke=G?"":"border:1px solid #e5e7eb;",$e=f.label&&f.label.trim().length?f.label:pe(f.kind);return`
                <button data-cta-index="${b}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${we};
                    color:${ve};
                    ${ke}
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
                  ${g($e)}
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
              background:${r};
              color:${c};
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
            ${g(e.primary||"Chat with AI Assistant")}
          </button>
          ${e.secondary!==void 0?`<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${p};
                    color:${y};
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
                  ${g(e.secondary||"Book a meeting")}
                </button>`:""}
        </div>
      `,me=J?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${h};
              color:${k};
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
        ${ge}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${Y}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${g(ye)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${g(he)}
            </div>

            ${me}
            ${be}

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${_(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `,(ie=t.querySelector("#nexus-close"))==null||ie.addEventListener("click",()=>{$=!0,F()});const oe=t.querySelector("#nexus-voice");J&&oe&&oe.addEventListener("click",()=>{M(),setTimeout(()=>T({type:"nexus:open-voice"}),50)}),ne?t.querySelectorAll("button[data-cta-index]").forEach(f=>{const b=Number(f.getAttribute("data-cta-index")||"0");f.addEventListener("click",()=>ue(b))}):((re=t.querySelector("#nexus-primary"))==null||re.addEventListener("click",()=>P()),(se=t.querySelector("#nexus-secondary"))==null||se.addEventListener("click",()=>fe())),v(),!m&&!$&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),s&&(s.style.opacity="1")})}function ue(e){M(),setTimeout(()=>T({type:"nexus:run-cta",index:e}),50)}function pe(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function v(){if(!n||!t||!s)return;const e=n.getBoundingClientRect(),i=12,r=12,c=window.innerHeight-e.top;t.style.bottom=`${c+i}px`,x==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const p=e.left+e.width/2;s.style.left=`${p-r/2}px`,s.style.bottom=`${c+(i-r/2)}px`,s.style.transform="rotate(45deg)";const a=t.getBoundingClientRect(),y=a.right-window.innerWidth,h=-a.left;if(y>0&&x==="bottom-right"){const k=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,k+y)}px`}else if(h>0&&x==="bottom-left"){const k=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,k+h)}px`}}function F(){t&&(t.remove(),t=null),s&&(s.remove(),s=null)}function g(e){return e.replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}function _(e){return e.replace(/"/g,"&quot;")}function M(){!l||!n||(m=!0,t&&(t.style.display="none"),s&&(s.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),n.innerHTML=V,L(),R(!1))}function W(){!l||!n||(m=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),n.innerHTML=B,L(),!$&&E&&t&&s&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",s.style.display="block",s.style.opacity="1",v(),R(!1)))}function P(){M(),setTimeout(()=>T({type:"nexus:open-chat"}),50)}function fe(){M(),setTimeout(()=>T({type:"nexus:run-secondary-cta"}),50)}function j(){if(!O){O=!0;try{window.removeEventListener("message",Z),window.removeEventListener("resize",v),window.removeEventListener("scroll",v,X)}catch{}if(C)try{window.clearTimeout(C)}catch{}C=null,I=!1,F(),l&&(l.remove(),l=null,d=null),n&&(n.remove(),n=null),m=!1,z=!1,w="",o=null,u=null,H=!1,E=!1,$=!1,A="",D=0}}function xe(e){j(),O=!1,e.organizationId&&(S=e.organizationId),e.position&&(x=e.position),K()}window.NexusWidget={init:xe,show:M,hide:W,destroy:j},K()})()})();
