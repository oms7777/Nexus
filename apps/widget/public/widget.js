(function(){"use strict";const N={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},F=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,Z=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){let d=null,l=null,o=null,t=null,s=null,w=!1,z=!1,C=!1,S=!1,v="",T=null,b=N.DEFAULT_POSITION,i=null,f=null,R=!1;const O=document.currentScript;if(O)T=O.getAttribute("data-organization-id"),b=O.getAttribute("data-position")??N.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),n=Array.from(e).find(r=>r.hasAttribute("data-organization-id"));n&&(T=n.getAttribute("data-organization-id"),b=n.getAttribute("data-position")??N.DEFAULT_POSITION)}if(!T){console.error("Nexus Widget: data-organization-id attribute is required");return}function P(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Y,{once:!0}):Y()}function Y(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=F,o.style.cssText=`
      all: unset;
      position: fixed;
      ${b==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(i==null?void 0:i.chatBubbleColor)||(i==null?void 0:i.primaryColor)||"#3b82f6"};
      color: ${(i==null?void 0:i.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,o.addEventListener("click",()=>{if(w){B();return}W()}),o.addEventListener("mouseenter",()=>{o&&(o.style.transform="scale(1.05)",o.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),o.addEventListener("mouseleave",()=>{o&&(o.style.transform="scale(1)",o.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(o),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
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
    `,d=document.createElement("iframe"),d.src=J(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{S=!0,v=new URL(d.src).origin,k({type:"nexus:embed-ready"}),A(),E()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",V),te(),window.addEventListener("popstate",A),window.addEventListener("resize",$),window.addEventListener("scroll",$,{passive:!0})}function J(){const e=new URLSearchParams;return e.append("organizationId",T),`${N.WIDGET_URL}?${e.toString()}`}function V(e){var x,m;const{type:n,payload:r}=e.data||{};if(!(S&&v&&e.origin!==v))switch(n){case"close":B();break;case"resize":r!=null&&r.height&&l&&(l.style.height=`${r.height}px`);break;case"nexus:theme":{const a=r;i=(a==null?void 0:a.theme)||null,f=(a==null?void 0:a.brandLogoUrl)||null,E();break}case"nexus:suggestions":{const a=r;z=!0,i=a.theme||i||null,f=a.brandLogoUrl||f||null,E(),oe(a);break}case"nexus:promo":{const a=r;(x=d==null?void 0:d.contentWindow)==null||x.postMessage({type:"nexus:host-ack"},v||"*"),(m=d==null?void 0:d.contentWindow)==null||m.postMessage({type:"nexus:hide-internal-promo"},v||"*"),z=!0,i=a.theme||i||null,f=a.brandLogoUrl||f||null,E(),ne(a);break}case"nexus:session-ready":{if(!T||!r||typeof r.sessionId!="string")return;break}}}function ee(){o&&(R||!i&&!f&&!z||(R=!0,o.style.opacity="1",o.style.pointerEvents="auto"))}function E(){if(!o)return;const e=(i==null?void 0:i.chatBubbleColor)||(i==null?void 0:i.primaryColor)||"#3b82f6",n=(i==null?void 0:i.primaryTextColor)||"#ffffff";if(o.style.background=e,o.style.color=n,ee(),!w)if(f){const r=L(f);o.innerHTML=`
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
      `}else o.innerHTML=F}function k(e){if(!S||!(d!=null&&d.contentWindow))return;const n=v||"*";d.contentWindow.postMessage(e,n)}function A(){k({type:"nexus:parent-location",href:location.href})}function te(){["pushState","replaceState"].forEach(e=>{const n=history[e];history[e]=function(...r){const x=n.apply(this,r);return S&&A(),x}})}function oe(e){const n=e.theme||i||{},r=n.primaryColor||"#0ea5e9",x=n.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${x};
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
        background: ${x};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(s));const a=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((h,H)=>`
          <button data-sugg-index="${H}"
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
            ${y(h)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${y("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${a}
            </div>

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${L(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const g=t.querySelector("#nexus-close");g==null||g.addEventListener("click",()=>{C=!0,_()}),t.querySelectorAll("button[data-sugg-index]").forEach(h=>{h.addEventListener("click",()=>{W()})}),$(),!w&&!C&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),s&&(s.style.opacity="1")})}function ne(e){const n=e.theme||i||{},r=n.primaryColor||"#0ea5e9",x=n.primaryTextColor||"#ffffff",m=n.secondaryColor||"#ffffff",a=n.nudgeBackgroundColor||"#ffffff",g=n.secondaryTextColor||"#111827",I=n.chatBubbleColor||n.primaryColor||"#3b82f6",h=n.primaryTextColor||"#ffffff",H=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(s));const q=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],K=Array.isArray(e.ctaList)&&e.ctaList.length?e.ctaList:[],Q=K.length>0,X=e.identityMode||"auto";let U="";X==="logo"?f&&(U=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${L(f)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):X==="avatars"?q.length&&(U=q.map((u,c)=>`
          <img src="${L(u)}" alt="avatar ${c+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${c?`margin-left:-10px; z-index:${10-c};`:"z-index:10;"}
            " />`).join("")):f?U=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${L(f)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `:q.length&&(U=q.map((u,c)=>`
          <img src="${L(u)}" alt="avatar ${c+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${c?`margin-left:-10px; z-index:${10-c};`:"z-index:10;"}
            " />`).join(""));const le=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${y(e.badgeText)}
         </span>`:"",de=e.title||"Discover the right solution for your business project.",ce=e.body||"Chat with our assistant or book a 15-min demo.",pe=Q?`
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${K.map((u,c)=>{const M=c===0,fe=M?r:m,xe=M?x:g,ge=M?"":"border:1px solid #e5e7eb;",he=u.label&&u.label.trim().length?u.label:re(u.kind);return`
                <button data-cta-index="${c}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${fe};
                    color:${xe};
                    ${ge}
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
                  ${y(he)}
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
              color:${x};
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
            ${y(e.primary||"Chat with AI Assistant")}
          </button>
          ${e.secondary!==void 0?`<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${m};
                    color:${g};
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
                  ${y(e.secondary||"Book a meeting")}
                </button>`:""}
        </div>
      `,ue=H?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${I};
              color:${h};
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
        ${le}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${U}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${y(de)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${y(ce)}
            </div>

            ${ue}

            ${pe}

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${L(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const D=t.querySelector("#nexus-close"),p=t.querySelector("#nexus-voice");if(H&&(p==null||p.addEventListener("mouseenter",()=>{p&&(p.style.transform="scale(1.06)",p.style.boxShadow="0 10px 22px rgba(0,0,0,.22)")}),p==null||p.addEventListener("mouseleave",()=>{p&&(p.style.transform="scale(1)",p.style.boxShadow="0 6px 18px rgba(0,0,0,.18)")}),p==null||p.addEventListener("click",()=>{j(),setTimeout(()=>{k({type:"nexus:open-voice"})},50)})),Q)t.querySelectorAll("button[data-cta-index]").forEach(c=>{const M=Number(c.getAttribute("data-cta-index")||"0");c.addEventListener("click",()=>ie(M))});else{const u=t.querySelector("#nexus-primary"),c=t.querySelector("#nexus-secondary");u==null||u.addEventListener("click",()=>W()),c==null||c.addEventListener("click",()=>se())}D==null||D.addEventListener("click",()=>{C=!0,_()}),$(),!w&&!C&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),s&&(s.style.opacity="1")})}function ie(e){j(),setTimeout(()=>{k({type:"nexus:run-cta",index:e})},50)}function re(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function $(){if(!o||!t||!s)return;const e=o.getBoundingClientRect(),n=12,r=12,x=window.innerHeight-e.top;t.style.bottom=`${x+n}px`,b==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const m=e.left+e.width/2;s.style.left=`${m-r/2}px`,s.style.bottom=`${x+(n-r/2)}px`,s.style.transform="rotate(45deg)";const a=t.getBoundingClientRect(),g=a.right-window.innerWidth,I=-a.left;if(g>0&&b==="bottom-right"){const h=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,h+g)}px`}else if(I>0&&b==="bottom-left"){const h=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,h+I)}px`}}function _(){t&&(t.remove(),t=null),s&&(s.remove(),s=null)}function y(e){return e.replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n])}function L(e){return e.replace(/"/g,"&quot;")}function j(){!l||!o||(w=!0,t&&(t.style.display="none"),s&&(s.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),o.innerHTML=Z,E(),A())}function B(){!l||!o||(w=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),o.innerHTML=F,E(),!C&&z&&t&&s&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",s.style.display="block",s.style.opacity="1",$(),k({type:"nexus:parent-location",href:location.href})))}function W(){j(),setTimeout(()=>k({type:"nexus:open-chat"}),50)}function se(){j(),setTimeout(()=>k({type:"nexus:run-secondary-cta"}),50)}function G(){window.removeEventListener("message",V),window.removeEventListener("popstate",A),window.removeEventListener("resize",$),window.removeEventListener("scroll",$),_(),l&&(l.remove(),l=null,d=null),o&&(o.remove(),o=null),w=!1,S=!1,v="",i=null,f=null,R=!1,z=!1,C=!1}function ae(e){G(),e.organizationId&&(T=e.organizationId),e.position&&(b=e.position),P()}window.NexusWidget={init:ae,show:j,hide:B,destroy:G},P()})()})();
