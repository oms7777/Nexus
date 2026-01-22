(function(){"use strict";const M={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},O=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,J=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let d=null,l=null,o=null,t=null,a=null,w=!1,T=!1,L=!1,U=!1,v="",z=null,b=M.DEFAULT_POSITION,i=null,x=null,R=!1,S=null;const q=document.currentScript;if(q)z=q.getAttribute("data-organization-id"),b=q.getAttribute("data-position")??M.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),n=Array.from(e).find(s=>s.hasAttribute("data-organization-id"));n&&(z=n.getAttribute("data-organization-id"),b=n.getAttribute("data-position")??M.DEFAULT_POSITION)}if(!z){console.error("Nexus Widget: data-organization-id attribute is required");return}function Y(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",G,{once:!0}):G()}function ee(e){const n=history.pushState,s=history.replaceState,c=()=>Promise.resolve().then(e);return history.pushState=function(...g){const r=n.apply(this,g);return c(),r},history.replaceState=function(...g){const r=s.apply(this,g);return c(),r},window.addEventListener("popstate",c),window.addEventListener("hashchange",c),()=>{history.pushState=n,history.replaceState=s,window.removeEventListener("popstate",c),window.removeEventListener("hashchange",c)}}function G(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=O,o.style.cssText=`
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
    `,d=document.createElement("iframe"),d.src=te(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{U=!0,v=new URL(d.src).origin,E({type:"nexus:embed-ready"}),N(),S||(S=ee(()=>{N()})),C()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",V),window.addEventListener("resize",k),window.addEventListener("scroll",k,{passive:!0})}function te(){const e=new URLSearchParams;return e.append("organizationId",z),`${M.WIDGET_URL}?${e.toString()}`}function V(e){var c,g;const{type:n,payload:s}=e.data||{};if(!(U&&v&&e.origin!==v))switch(n){case"close":B();break;case"resize":s!=null&&s.height&&l&&(l.style.height=`${s.height}px`);break;case"nexus:theme":{const r=s;i=(r==null?void 0:r.theme)||null,x=(r==null?void 0:r.brandLogoUrl)||null,C();break}case"nexus:suggestions":{const r=s;T=!0,i=r.theme||i||null,x=r.brandLogoUrl||x||null,C(),ne(r);break}case"nexus:promo":{const r=s;(c=d==null?void 0:d.contentWindow)==null||c.postMessage({type:"nexus:host-ack"},v||"*"),(g=d==null?void 0:d.contentWindow)==null||g.postMessage({type:"nexus:hide-internal-promo"},v||"*"),T=!0,i=r.theme||i||null,x=r.brandLogoUrl||x||null,C(),ie(r);break}}}function oe(){o&&(R||!i&&!x&&!T||(R=!0,o.style.opacity="1",o.style.pointerEvents="auto"))}function C(){if(!o)return;const e=(i==null?void 0:i.chatBubbleColor)||(i==null?void 0:i.primaryColor)||"#3b82f6",n=(i==null?void 0:i.primaryTextColor)||"#ffffff";if(o.style.background=e,o.style.color=n,oe(),!w)if(x){const s=$(x);o.innerHTML=`
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${s}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `}else o.innerHTML=O}function E(e){if(!U||!(d!=null&&d.contentWindow))return;const n=v||"*";d.contentWindow.postMessage(e,n)}function N(){const e=location.href;E({type:"nexus:parent-location",payload:{href:e}})}function ne(e){const n=e.theme||i||{},s=n.primaryColor||"#0ea5e9",c=n.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(a));const r=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((y,H)=>`
          <button data-sugg-index="${H}"
            style="
              all: unset;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:8px 10px;
              border-radius:9999px;
              border:1px solid ${s}59;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
              line-height:1;
              color:${s};
              background:${s}14;
              white-space:nowrap;
              max-width:100%;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
            ${m(y)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${m("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${r}
            </div>

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${$(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const h=t.querySelector("#nexus-close");h==null||h.addEventListener("click",()=>{L=!0,F()}),t.querySelectorAll("button[data-sugg-index]").forEach(y=>{y.addEventListener("click",()=>{W()})}),k(),!w&&!L&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function ie(e){const n=e.theme||i||{},s=n.primaryColor||"#0ea5e9",c=n.primaryTextColor||"#ffffff",g=n.secondaryColor||"#ffffff",r=n.nudgeBackgroundColor||"#ffffff",h=n.secondaryTextColor||"#111827",j=n.chatBubbleColor||n.primaryColor||"#3b82f6",y=n.primaryTextColor||"#ffffff",H=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(a));const D=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],K=Array.isArray(e.ctaList)&&e.ctaList.length?e.ctaList:[],Q=K.length>0,Z=e.identityMode||"auto";let I="";Z==="logo"?x&&(I=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${$(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):Z==="avatars"?D.length&&(I=D.map((f,p)=>`
          <img src="${$(f)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join("")):x?I=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${$(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `:D.length&&(I=D.map((f,p)=>`
          <img src="${$(f)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join(""));const de=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${m(e.badgeText)}
         </span>`:"",ce=e.title||"Discover the right solution for your business project.",pe=e.body||"Chat with our assistant or book a 15-min demo.",ue=Q?`
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${K.map((f,p)=>{const _=p===0,xe=_?s:g,ge=_?c:h,he=_?"":"border:1px solid #e5e7eb;",ye=f.label&&f.label.trim().length?f.label:se(f.kind);return`
                <button data-cta-index="${p}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${xe};
                    color:${ge};
                    ${he}
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
                  ${m(ye)}
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
              background:${s};
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
            ${m(e.primary||"Chat with AI Assistant")}
          </button>
          ${e.secondary!==void 0?`<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${g};
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
                  ${m(e.secondary||"Book a meeting")}
                </button>`:""}
        </div>
      `,fe=H?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${j};
              color:${y};
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
        ${de}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${I}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${m(ce)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${m(pe)}
            </div>

            ${fe}

            ${ue}

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${$(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const P=t.querySelector("#nexus-close"),u=t.querySelector("#nexus-voice");if(H&&(u==null||u.addEventListener("mouseenter",()=>{u&&(u.style.transform="scale(1.06)",u.style.boxShadow="0 10px 22px rgba(0,0,0,.22)")}),u==null||u.addEventListener("mouseleave",()=>{u&&(u.style.transform="scale(1)",u.style.boxShadow="0 6px 18px rgba(0,0,0,.18)")}),u==null||u.addEventListener("click",()=>{A(),setTimeout(()=>{E({type:"nexus:open-voice"})},50)})),Q)t.querySelectorAll("button[data-cta-index]").forEach(p=>{const _=Number(p.getAttribute("data-cta-index")||"0");p.addEventListener("click",()=>re(_))});else{const f=t.querySelector("#nexus-primary"),p=t.querySelector("#nexus-secondary");f==null||f.addEventListener("click",()=>W()),p==null||p.addEventListener("click",()=>ae())}P==null||P.addEventListener("click",()=>{L=!0,F()}),k(),!w&&!L&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function re(e){A(),setTimeout(()=>{E({type:"nexus:run-cta",index:e})},50)}function se(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function k(){if(!o||!t||!a)return;const e=o.getBoundingClientRect(),n=12,s=12,c=window.innerHeight-e.top;t.style.bottom=`${c+n}px`,b==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const g=e.left+e.width/2;a.style.left=`${g-s/2}px`,a.style.bottom=`${c+(n-s/2)}px`,a.style.transform="rotate(45deg)";const r=t.getBoundingClientRect(),h=r.right-window.innerWidth,j=-r.left;if(h>0&&b==="bottom-right"){const y=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,y+h)}px`}else if(j>0&&b==="bottom-left"){const y=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,y+j)}px`}}function F(){t&&(t.remove(),t=null),a&&(a.remove(),a=null)}function m(e){return e.replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n])}function $(e){return e.replace(/"/g,"&quot;")}function A(){!l||!o||(w=!0,t&&(t.style.display="none"),a&&(a.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),o.innerHTML=J,C(),N())}function B(){!l||!o||(w=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),o.innerHTML=O,C(),!L&&T&&t&&a&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",a.style.display="block",a.style.opacity="1",k(),N()))}function W(){A(),setTimeout(()=>E({type:"nexus:open-chat"}),50)}function ae(){A(),setTimeout(()=>E({type:"nexus:run-secondary-cta"}),50)}function X(){if(window.removeEventListener("message",V),window.removeEventListener("resize",k),window.removeEventListener("scroll",k),S)try{S()}catch{}S=null,F(),l&&(l.remove(),l=null,d=null),o&&(o.remove(),o=null),w=!1,U=!1,v="",i=null,x=null,R=!1,T=!1,L=!1}function le(e){X(),e.organizationId&&(z=e.organizationId),e.position&&(b=e.position),Y()}window.NexusWidget={init:le,show:A,hide:B,destroy:X},Y()})()})();
