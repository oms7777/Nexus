(function(){"use strict";const j={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},B=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,V=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let d=null,l=null,n=null,t=null,a=null,b=!1,L=!1,k=!1,E=!1,z="",S=null,p=j.DEFAULT_POSITION,o=null,c=null,H=!1,A="",D=0,$=null,I=!1;const X={passive:!0};let O=!1;const q=document.currentScript;if(q)S=q.getAttribute("data-organization-id"),p=q.getAttribute("data-position")??j.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),i=Array.from(e).find(r=>r.hasAttribute("data-organization-id"));i&&(S=i.getAttribute("data-organization-id"),p=i.getAttribute("data-position")??j.DEFAULT_POSITION)}if(!S){console.error("Nexus Widget: data-organization-id attribute is required");return}function K(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Q,{once:!0}):Q()}function Q(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=B,n.style.cssText=`
      all: unset;
      position: fixed;
      ${p==="bottom-right"?"right: 20px;":"left: 20px;"}
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
    `,n.addEventListener("click",()=>{if(b){W();return}P()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
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
    `,d=document.createElement("iframe"),d.src=ae(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{E=!0,z=new URL(d.src).origin,C({type:"nexus:embed-ready"}),R(!0),T()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",Z),window.addEventListener("resize",h),window.addEventListener("scroll",h,X),window.addEventListener("pagehide",M,{once:!0}),window.addEventListener("beforeunload",M,{once:!0})}function ae(){const e=new URLSearchParams;return e.append("organizationId",S),`${j.WIDGET_URL}?${e.toString()}`}function Z(e){const{type:i,payload:r}=e.data||{};if(!(E&&z&&e.origin!==z))switch(i){case"close":W();break;case"resize":r!=null&&r.height&&l&&(l.style.height=`${r.height}px`);break;case"nexus:theme":{const s=r;o=(s==null?void 0:s.theme)||null,c=(s==null?void 0:s.brandLogoUrl)||null,T();break}case"nexus:suggestions":{const s=r;L=!0,o=s.theme||o||null,c=s.brandLogoUrl||c||null,T(),de(s);break}case"nexus:promo":{const s=r;L=!0,o=s.theme||o||null,c=s.brandLogoUrl||c||null,T(),ce(s);break}}}function C(e){!E||!(d!=null&&d.contentWindow)||d.contentWindow.postMessage(e,z||"*")}function R(e=!1){if(!E)return;const i=location.href;!e&&i===A||(I=I||e,!$&&($=window.setTimeout(()=>{$=null;const r=location.href,s=Date.now(),m=I||r!==A;I=!1,m&&(s-D<250&&r===A||(A=r,D=s,C({type:"nexus:parent-location",href:r})))},350)))}function le(){n&&(H||!o&&!c&&!L||(H=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function T(){if(!n)return;const e=(o==null?void 0:o.chatBubbleColor)||(o==null?void 0:o.primaryColor)||"#3b82f6",i=(o==null?void 0:o.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=i,le(),b){n.innerHTML=V;return}if(c){const r=_(c);n.innerHTML=`
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
      `}else n.innerHTML=B}function de(e){var x;const i=e.theme||o||{},r=i.primaryColor||"#0ea5e9",s=i.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${s};
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
        background: ${s};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(a));const w=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((g,v)=>`
          <button data-sugg-index="${v}"
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
              ${w}
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
    `,(x=t.querySelector("#nexus-close"))==null||x.addEventListener("click",()=>{k=!0,F()}),t.querySelectorAll("button[data-sugg-index]").forEach(g=>g.addEventListener("click",()=>P())),h(),!b&&!k&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function ce(e){var ie,re,se;const i=e.theme||o||{},r=i.primaryColor||"#0ea5e9",s=i.primaryTextColor||"#ffffff",m=i.secondaryColor||"#ffffff",w=i.nudgeBackgroundColor||"#ffffff",x=i.secondaryTextColor||"#111827",g=i.chatBubbleColor||i.primaryColor||"#3b82f6",v=i.primaryTextColor||"#ffffff",J=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${w};
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
        background: ${w};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(a));const ee=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],te=Array.isArray(e.ctaList)?e.ctaList:[],ne=te.length>0,N=e.identityMode||"auto";let Y="";N==="logo"||N==="auto"&&c?c&&(Y=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${_(c)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):(N==="avatars"||N==="auto"&&ee.length)&&(Y=ee.map((u,y)=>`
          <img src="${_(u)}" alt="avatar ${y+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${y?`margin-left:-10px; z-index:${10-y};`:"z-index:10;"}
            " />`).join(""));const ge=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${f(e.badgeText)}
         </span>`:"",ye=e.title||"Discover the right solution for your business project.",be=e.body||"Chat with our assistant or book a 15-min demo.",he=ne?`
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${te.map((u,y)=>{const G=y===0,we=G?r:m,ve=G?s:x,ke=G?"":"border:1px solid #e5e7eb;",$e=u.label&&u.label.trim().length?u.label:pe(u.kind);return`
                <button data-cta-index="${y}"
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
                  ${f($e)}
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
              color:${s};
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
                    background:${m};
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
      `,me=J?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${g};
              color:${v};
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
              ${f(ye)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${f(be)}
            </div>

            ${me}
            ${he}

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
    `,(ie=t.querySelector("#nexus-close"))==null||ie.addEventListener("click",()=>{k=!0,F()});const oe=t.querySelector("#nexus-voice");J&&oe&&oe.addEventListener("click",()=>{U(),setTimeout(()=>C({type:"nexus:open-voice"}),50)}),ne?t.querySelectorAll("button[data-cta-index]").forEach(u=>{const y=Number(u.getAttribute("data-cta-index")||"0");u.addEventListener("click",()=>ue(y))}):((re=t.querySelector("#nexus-primary"))==null||re.addEventListener("click",()=>P()),(se=t.querySelector("#nexus-secondary"))==null||se.addEventListener("click",()=>fe())),h(),!b&&!k&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function ue(e){U(),setTimeout(()=>C({type:"nexus:run-cta",index:e}),50)}function pe(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function h(){if(!n||!t||!a)return;const e=n.getBoundingClientRect(),i=12,r=12,s=window.innerHeight-e.top;t.style.bottom=`${s+i}px`,p==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const m=e.left+e.width/2;a.style.left=`${m-r/2}px`,a.style.bottom=`${s+(i-r/2)}px`,a.style.transform="rotate(45deg)";const w=t.getBoundingClientRect(),x=w.right-window.innerWidth,g=-w.left;if(x>0&&p==="bottom-right"){const v=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,v+x)}px`}else if(g>0&&p==="bottom-left"){const v=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,v+g)}px`}}function F(){t&&(t.remove(),t=null),a&&(a.remove(),a=null)}function f(e){return e.replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}function _(e){return e.replace(/"/g,"&quot;")}function U(){!l||!n||(b=!0,t&&(t.style.display="none"),a&&(a.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),n.innerHTML=V,T(),R(!1))}function W(){!l||!n||(b=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),n.innerHTML=B,T(),!k&&L&&t&&a&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",a.style.display="block",a.style.opacity="1",h(),R(!1)))}function P(){U(),setTimeout(()=>C({type:"nexus:open-chat"}),50)}function fe(){U(),setTimeout(()=>C({type:"nexus:run-secondary-cta"}),50)}function M(){if(!O){O=!0;try{window.removeEventListener("message",Z),window.removeEventListener("resize",h),window.removeEventListener("scroll",h,X)}catch{}if($)try{window.clearTimeout($)}catch{}$=null,I=!1,F(),l&&(l.remove(),l=null,d=null),n&&(n.remove(),n=null),b=!1,E=!1,z="",o=null,c=null,H=!1,L=!1,k=!1,A="",D=0}}function xe(e){M(),O=!1,e.organizationId&&(S=e.organizationId),e.position&&(p=e.position),K()}window.NexusWidget={init:xe,show:U,hide:W,destroy:M},K()})()})();
