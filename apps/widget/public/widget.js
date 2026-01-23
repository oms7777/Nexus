(function(){"use strict";const _={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},D=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,V=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let d=null,l=null,n=null,t=null,a=null,m=!1,E=!1,$=!1,S=!1,w="",z=null,x=_.DEFAULT_POSITION,r=null,p=null,q=!1,A=null,U="",j=!1,v=null;const O=document.currentScript;if(O)z=O.getAttribute("data-organization-id"),x=O.getAttribute("data-position")??_.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),o=Array.from(e).find(i=>i.hasAttribute("data-organization-id"));o&&(z=o.getAttribute("data-organization-id"),x=o.getAttribute("data-position")??_.DEFAULT_POSITION)}if(!z){console.error("Nexus Widget: data-organization-id attribute is required");return}function X(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Q,{once:!0}):Q()}function re(e){const o=history.pushState,i=history.replaceState,c=()=>{Promise.resolve().then(e)};return history.pushState=function(...u){const s=o.apply(this,u);return c(),s},history.replaceState=function(...u){const s=i.apply(this,u);return c(),s},window.addEventListener("popstate",c),window.addEventListener("hashchange",c),()=>{history.pushState=o,history.replaceState=i,window.removeEventListener("popstate",c),window.removeEventListener("hashchange",c)}}function Q(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=D,n.style.cssText=`
      all: unset;
      position: fixed;
      ${x==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(r==null?void 0:r.chatBubbleColor)||(r==null?void 0:r.primaryColor)||"#3b82f6"};
      color: ${(r==null?void 0:r.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,n.addEventListener("click",()=>{if(m){F();return}W()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
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
    `,d=document.createElement("iframe"),d.src=se(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{S=!0,w=new URL(d.src).origin,T({type:"nexus:embed-ready"}),N(!0),A||(A=re(()=>N())),C()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",K),window.addEventListener("resize",k),window.addEventListener("scroll",k,{passive:!0}),window.addEventListener("pagehide",B,{once:!0}),window.addEventListener("beforeunload",B,{once:!0})}function se(){const e=new URLSearchParams;return e.append("organizationId",z),`${_.WIDGET_URL}?${e.toString()}`}function K(e){var c,u;const{type:o,payload:i}=e.data||{};if(!(S&&w&&e.origin!==w))switch(o){case"close":F();break;case"resize":i!=null&&i.height&&l&&(l.style.height=`${i.height}px`);break;case"nexus:theme":{const s=i;r=(s==null?void 0:s.theme)||null,p=(s==null?void 0:s.brandLogoUrl)||null,C();break}case"nexus:suggestions":{const s=i;E=!0,r=s.theme||r||null,p=s.brandLogoUrl||p||null,C(),le(s);break}case"nexus:promo":{const s=i;(c=d==null?void 0:d.contentWindow)==null||c.postMessage({type:"nexus:host-ack"},w||"*"),(u=d==null?void 0:d.contentWindow)==null||u.postMessage({type:"nexus:hide-internal-promo"},w||"*"),E=!0,r=s.theme||r||null,p=s.brandLogoUrl||p||null,C(),de(s);break}}}function T(e){!S||!(d!=null&&d.contentWindow)||d.contentWindow.postMessage(e,w||"*")}function N(e=!1){if(!S)return;const o=location.href;!e&&o===U||j||(j=!0,v&&window.clearTimeout(v),v=window.setTimeout(()=>{j=!1,v=null;const i=location.href;!e&&i===U||(U=i,T({type:"nexus:parent-location",href:i}))},200))}function ae(){n&&(q||!r&&!p&&!E||(q=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function C(){if(!n)return;const e=(r==null?void 0:r.chatBubbleColor)||(r==null?void 0:r.primaryColor)||"#3b82f6",o=(r==null?void 0:r.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=o,ae(),m){n.innerHTML=V;return}if(p){const i=I(p);n.innerHTML=`
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
      `}else n.innerHTML=D}function le(e){var h;const o=e.theme||r||{},i=o.primaryColor||"#0ea5e9",c=o.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(t),a=document.createElement("div"),a.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${c};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(a));const s=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((y,L)=>`
          <button data-sugg-index="${L}"
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
            ${g(y)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${g("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${s}
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
    `,(h=t.querySelector("#nexus-close"))==null||h.addEventListener("click",()=>{$=!0,R()}),t.querySelectorAll("button[data-sugg-index]").forEach(y=>{y.addEventListener("click",()=>W())}),k(),!m&&!$&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function de(e){var oe,ie;const o=e.theme||r||{},i=o.primaryColor||"#0ea5e9",c=o.primaryTextColor||"#ffffff",u=o.secondaryColor||"#ffffff",s=o.nudgeBackgroundColor||"#ffffff",h=o.secondaryTextColor||"#111827",y=o.chatBubbleColor||o.primaryColor||"#3b82f6",L=o.primaryTextColor||"#ffffff",Z=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(a));const J=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],ee=Array.isArray(e.ctaList)?e.ctaList:[],te=ee.length>0,H=e.identityMode||"auto";let P="";H==="logo"||H==="auto"&&p?p&&(P=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${I(p)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):(H==="avatars"||H==="auto"&&J.length)&&(P=J.map((f,b)=>`
          <img src="${I(f)}" alt="avatar ${b+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${b?`margin-left:-10px; z-index:${10-b};`:"z-index:10;"}
            " />`).join(""));const xe=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${g(e.badgeText)}
         </span>`:"",ge=e.title||"Discover the right solution for your business project.",he=e.body||"Chat with our assistant or book a 15-min demo.",ye=te?`
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ee.map((f,b)=>{const G=b===0,me=G?i:u,we=G?c:h,ve=G?"":"border:1px solid #e5e7eb;",ke=f.label&&f.label.trim().length?f.label:pe(f.kind);return`
                <button data-cta-index="${b}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${me};
                    color:${we};
                    ${ve}
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
                  ${g(ke)}
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
                    background:${u};
                    color:${h};
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
      `,be=Z?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${y};
              color:${L};
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
        ${xe}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${P}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${g(ge)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${g(he)}
            </div>

            ${be}
            ${ye}

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
    `;const Y=t.querySelector("#nexus-close");Y==null||Y.addEventListener("click",()=>{$=!0,R()});const ne=t.querySelector("#nexus-voice");Z&&ne&&ne.addEventListener("click",()=>{M(),setTimeout(()=>T({type:"nexus:open-voice"}),50)}),te?t.querySelectorAll("button[data-cta-index]").forEach(f=>{const b=Number(f.getAttribute("data-cta-index")||"0");f.addEventListener("click",()=>ce(b))}):((oe=t.querySelector("#nexus-primary"))==null||oe.addEventListener("click",()=>W()),(ie=t.querySelector("#nexus-secondary"))==null||ie.addEventListener("click",()=>ue())),k(),!m&&!$&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function ce(e){M(),setTimeout(()=>T({type:"nexus:run-cta",index:e}),50)}function pe(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function k(){if(!n||!t||!a)return;const e=n.getBoundingClientRect(),o=12,i=12,c=window.innerHeight-e.top;t.style.bottom=`${c+o}px`,x==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const u=e.left+e.width/2;a.style.left=`${u-i/2}px`,a.style.bottom=`${c+(o-i/2)}px`,a.style.transform="rotate(45deg)";const s=t.getBoundingClientRect(),h=s.right-window.innerWidth,y=-s.left;if(h>0&&x==="bottom-right"){const L=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,L+h)}px`}else if(y>0&&x==="bottom-left"){const L=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,L+y)}px`}}function R(){t&&(t.remove(),t=null),a&&(a.remove(),a=null)}function g(e){return e.replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}function I(e){return e.replace(/"/g,"&quot;")}function M(){!l||!n||(m=!0,t&&(t.style.display="none"),a&&(a.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),n.innerHTML=V,C(),N())}function F(){!l||!n||(m=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),n.innerHTML=D,C(),!$&&E&&t&&a&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",a.style.display="block",a.style.opacity="1",k(),N()))}function W(){M(),setTimeout(()=>T({type:"nexus:open-chat"}),50)}function ue(){M(),setTimeout(()=>T({type:"nexus:run-secondary-cta"}),50)}function B(){try{window.removeEventListener("message",K),window.removeEventListener("resize",k),window.removeEventListener("scroll",k)}catch{}if(A)try{A()}catch{}if(A=null,v)try{window.clearTimeout(v)}catch{}v=null,j=!1,R(),l&&(l.remove(),l=null,d=null),n&&(n.remove(),n=null),m=!1,S=!1,w="",r=null,p=null,q=!1,E=!1,$=!1,U=""}function fe(e){B(),e.organizationId&&(z=e.organizationId),e.position&&(x=e.position),X()}window.NexusWidget={init:fe,show:M,hide:F,destroy:B},X()})()})();
