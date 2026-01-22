(function(){"use strict";const N={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},F=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,ne=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let d=null,l=null,n=null,t=null,a=null,w=!1,z=!1,T=!1,S=!1,v="",A=null,b=N.DEFAULT_POSITION,i=null,x=null,B=!1,j=null,H=null,D=null,k=null;const P=document.currentScript;if(P)A=P.getAttribute("data-organization-id"),b=P.getAttribute("data-position")??N.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),o=Array.from(e).find(s=>s.hasAttribute("data-organization-id"));o&&(A=o.getAttribute("data-organization-id"),b=o.getAttribute("data-position")??N.DEFAULT_POSITION)}if(!A){console.error("Nexus Widget: data-organization-id attribute is required");return}function X(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",K,{once:!0}):K()}function ie(e){const o=history.pushState,s=history.replaceState,c=()=>Promise.resolve().then(e);return history.pushState=function(...g){const r=o.apply(this,g);return c(),r},history.replaceState=function(...g){const r=s.apply(this,g);return c(),r},window.addEventListener("popstate",c),window.addEventListener("hashchange",c),()=>{history.pushState=o,history.replaceState=s,window.removeEventListener("popstate",c),window.removeEventListener("hashchange",c)}}function K(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=F,n.style.cssText=`
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
    `,n.addEventListener("click",()=>{if(w){Y();return}G()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
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
    `,d=document.createElement("iframe"),d.src=re(),d.allow="microphone; clipboard-read; clipboard-write",d.style.cssText="width:100%;height:100%;border:none;",d.onload=()=>{S=!0,v=new URL(d.src).origin,L({type:"nexus:embed-ready"}),ae(),j||(j=ie(()=>{O()})),E()},l.appendChild(d),document.body.appendChild(l),window.addEventListener("message",Q),window.addEventListener("resize",$),window.addEventListener("scroll",$,{passive:!0}),O(!0)}function re(){const e=new URLSearchParams;return e.append("organizationId",A),`${N.WIDGET_URL}?${e.toString()}`}function Q(e){var c,g;const{type:o,payload:s}=e.data||{};if(!(S&&v&&e.origin!==v))switch(o){case"close":Y();break;case"resize":s!=null&&s.height&&l&&(l.style.height=`${s.height}px`);break;case"nexus:theme":{const r=s;i=(r==null?void 0:r.theme)||null,x=(r==null?void 0:r.brandLogoUrl)||null,E();break}case"nexus:suggestions":{const r=s;z=!0,i=r.theme||i||null,x=r.brandLogoUrl||x||null,E(),le(r);break}case"nexus:promo":{const r=s;(c=d==null?void 0:d.contentWindow)==null||c.postMessage({type:"nexus:host-ack"},v||"*"),(g=d==null?void 0:d.contentWindow)==null||g.postMessage({type:"nexus:hide-internal-promo"},v||"*"),z=!0,i=r.theme||i||null,x=r.brandLogoUrl||x||null,E(),de(r);break}}}function se(){n&&(B||!i&&!x&&!z||(B=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function E(){if(!n)return;const e=(i==null?void 0:i.chatBubbleColor)||(i==null?void 0:i.primaryColor)||"#3b82f6",o=(i==null?void 0:i.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=o,se(),!w)if(x){const s=C(x);n.innerHTML=`
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
      `}else n.innerHTML=F}function L(e){if(!(d!=null&&d.contentWindow))return;const o=v||"*";d.contentWindow.postMessage(e,o)}function Z(e=!1){const o=location.href;if(!(!e&&o===H)){if(H=o,!S){D=o;return}L({type:"nexus:parent-location",payload:{href:o}})}}function ae(){if(!S)return;const e=D??location.href;D=null,Z(!0),H=e,L({type:"nexus:parent-location",payload:{href:e}})}function O(e=!1){k&&window.clearTimeout(k),k=window.setTimeout(()=>{k=null,Z(e)},250)}function le(e){const o=e.theme||i||{},s=o.primaryColor||"#0ea5e9",c=o.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(a));const r=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((y,R)=>`
          <button data-sugg-index="${R}"
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
                    <a href="${C(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const h=t.querySelector("#nexus-close");h==null||h.addEventListener("click",()=>{T=!0,W()}),t.querySelectorAll("button[data-sugg-index]").forEach(y=>{y.addEventListener("click",()=>{G()})}),$(),!w&&!T&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function de(e){const o=e.theme||i||{},s=o.primaryColor||"#0ea5e9",c=o.primaryTextColor||"#ffffff",g=o.secondaryColor||"#ffffff",r=o.nudgeBackgroundColor||"#ffffff",h=o.secondaryTextColor||"#111827",_=o.chatBubbleColor||o.primaryColor||"#3b82f6",y=o.primaryTextColor||"#ffffff",R=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(a));const q=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],ee=Array.isArray(e.ctaList)&&e.ctaList.length?e.ctaList:[],te=ee.length>0,oe=e.identityMode||"auto";let M="";oe==="logo"?x&&(M=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${C(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):oe==="avatars"?q.length&&(M=q.map((f,p)=>`
          <img src="${C(f)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join("")):x?M=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${C(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `:q.length&&(M=q.map((f,p)=>`
          <img src="${C(f)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join(""));const xe=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${m(e.badgeText)}
         </span>`:"",ge=e.title||"Discover the right solution for your business project.",he=e.body||"Chat with our assistant or book a 15-min demo.",ye=te?`
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ee.map((f,p)=>{const U=p===0,me=U?s:g,we=U?c:h,ve=U?"":"border:1px solid #e5e7eb;",ke=f.label&&f.label.trim().length?f.label:pe(f.kind);return`
                <button data-cta-index="${p}"
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
                  ${m(ke)}
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
      `,be=R?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${_};
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
        ${xe}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${M}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${m(ge)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${m(he)}
            </div>

            ${be}

            ${ye}

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${C(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const V=t.querySelector("#nexus-close"),u=t.querySelector("#nexus-voice");if(R&&(u==null||u.addEventListener("mouseenter",()=>{u&&(u.style.transform="scale(1.06)",u.style.boxShadow="0 10px 22px rgba(0,0,0,.22)")}),u==null||u.addEventListener("mouseleave",()=>{u&&(u.style.transform="scale(1)",u.style.boxShadow="0 6px 18px rgba(0,0,0,.18)")}),u==null||u.addEventListener("click",()=>{I(),setTimeout(()=>{L({type:"nexus:open-voice"})},50)})),te)t.querySelectorAll("button[data-cta-index]").forEach(p=>{const U=Number(p.getAttribute("data-cta-index")||"0");p.addEventListener("click",()=>ce(U))});else{const f=t.querySelector("#nexus-primary"),p=t.querySelector("#nexus-secondary");f==null||f.addEventListener("click",()=>G()),p==null||p.addEventListener("click",()=>ue())}V==null||V.addEventListener("click",()=>{T=!0,W()}),$(),!w&&!T&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),a&&(a.style.opacity="1")})}function ce(e){I(),setTimeout(()=>{L({type:"nexus:run-cta",index:e})},50)}function pe(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function $(){if(!n||!t||!a)return;const e=n.getBoundingClientRect(),o=12,s=12,c=window.innerHeight-e.top;t.style.bottom=`${c+o}px`,b==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const g=e.left+e.width/2;a.style.left=`${g-s/2}px`,a.style.bottom=`${c+(o-s/2)}px`,a.style.transform="rotate(45deg)";const r=t.getBoundingClientRect(),h=r.right-window.innerWidth,_=-r.left;if(h>0&&b==="bottom-right"){const y=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,y+h)}px`}else if(_>0&&b==="bottom-left"){const y=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,y+_)}px`}}function W(){t&&(t.remove(),t=null),a&&(a.remove(),a=null)}function m(e){return e.replace(/[&<>"']/g,o=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[o])}function C(e){return e.replace(/"/g,"&quot;")}function I(){!l||!n||(w=!0,t&&(t.style.display="none"),a&&(a.style.display="none"),l.style.display="block",setTimeout(()=>{l&&(l.style.opacity="1",l.style.transform="translateY(0)")},10),n.innerHTML=ne,E(),O(!0))}function Y(){!l||!n||(w=!1,l.style.opacity="0",l.style.transform="translateY(10px)",setTimeout(()=>l&&(l.style.display="none"),300),n.innerHTML=F,E(),!T&&z&&t&&a&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",a.style.display="block",a.style.opacity="1",$(),O()))}function G(){I(),setTimeout(()=>L({type:"nexus:open-chat"}),50)}function ue(){I(),setTimeout(()=>L({type:"nexus:run-secondary-cta"}),50)}function J(){if(window.removeEventListener("message",Q),window.removeEventListener("resize",$),window.removeEventListener("scroll",$),j)try{j()}catch{}j=null,k&&window.clearTimeout(k),k=null,W(),l&&(l.remove(),l=null,d=null),n&&(n.remove(),n=null),w=!1,S=!1,v="",i=null,x=null,B=!1,z=!1,T=!1,H=null,D=null}function fe(e){J(),e.organizationId&&(A=e.organizationId),e.position&&(b=e.position),X()}window.NexusWidget={init:fe,show:I,hide:Y,destroy:J},X()})()})();
