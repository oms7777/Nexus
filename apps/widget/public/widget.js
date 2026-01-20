(function(){"use strict";const P={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},Y=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,he=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`,ge="https://app.inboundless.co/api/tracker/snapshot",xe=250,ye=800;let G=!1,D=null,F=null,L=null,J=0,b=null;function oe(r){try{const o=new URL(r);return o.hostname==="widget.inboundless.co"||o.hostname==="app.inboundless.co"}catch{return!1}}function be(r){const o=history.pushState,n=history.replaceState,t=()=>Promise.resolve().then(r);return history.pushState=function(...l){const u=o.apply(this,l);return t(),u},history.replaceState=function(...l){const u=n.apply(this,l);return t(),u},window.addEventListener("popstate",t),window.addEventListener("hashchange",t),()=>{history.pushState=o,history.replaceState=n,window.removeEventListener("popstate",t),window.removeEventListener("hashchange",t)}}async function re(r){try{b==null||b.abort()}catch{}b=new AbortController;try{await fetch(ge,{method:"POST",headers:{"Content-Type":"application/json"},signal:b.signal,body:JSON.stringify(r),keepalive:!0,mode:"cors"})}catch{}}function K(r){L&&clearTimeout(L),L=setTimeout(()=>{L=null;const o=Date.now();if(o-J<ye)return;J=o;const n=location.href;if(!n||oe(n))return;const t=document.title||void 0;re({organizationId:r.orgId,sessionId:r.sessionId,pageUrl:n,title:t,width:window.innerWidth,height:window.innerHeight})},xe)}function me(){if(F)try{F()}catch{}if(F=null,L)try{clearTimeout(L)}catch{}L=null;try{b==null||b.abort()}catch{}b=null,D=null,J=0,G=!1}function q(){me()}function we({orgId:r,contactSessionId:o}){if(G||typeof window>"u")return;G=!0,D=location.href,K({orgId:r,sessionId:o}),F=be(()=>{const u=location.href;!u||u===D||(D=u,K({orgId:r,sessionId:o}))});const n=()=>{document.visibilityState==="visible"&&K({orgId:r,sessionId:o})};document.addEventListener("visibilitychange",n);const t=()=>{try{const u=location.href;if(!u||oe(u))return;re({organizationId:r,sessionId:o,pageUrl:u,title:document.title||void 0,width:window.innerWidth,height:window.innerHeight})}catch{}};window.addEventListener("pagehide",t);const l=q;q=()=>{try{window.removeEventListener("pagehide",t),document.removeEventListener("visibilitychange",n)}catch{}l()}}(function(){let r=null,o=null,n=null,t=null,l=null,u=!1,U=!1,E=!1,W=!1,T="",j=!1,z=null,C=null,v=P.DEFAULT_POSITION,d=null,x=null,Q=!1,N=null,m=null;const ve=200;let X="";const Z=document.currentScript;if(Z)C=Z.getAttribute("data-organization-id"),v=Z.getAttribute("data-position")??P.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),i=Array.from(e).find(c=>c.hasAttribute("data-organization-id"));i&&(C=i.getAttribute("data-organization-id"),v=i.getAttribute("data-position")??P.DEFAULT_POSITION)}if(!C){console.error("Nexus Widget: data-organization-id attribute is required");return}function se(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",ae,{once:!0}):ae()}function ke(e){const i=history.pushState,c=history.replaceState,a=()=>Promise.resolve().then(e);return history.pushState=function(...y){const g=i.apply(this,y);return a(),g},history.replaceState=function(...y){const g=c.apply(this,y);return a(),g},window.addEventListener("popstate",a),window.addEventListener("hashchange",a),()=>{history.pushState=i,history.replaceState=c,window.removeEventListener("popstate",a),window.removeEventListener("hashchange",a)}}function ae(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=Y,n.style.cssText=`
      all: unset;
      position: fixed;
      ${v==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(d==null?void 0:d.chatBubbleColor)||(d==null?void 0:d.primaryColor)||"#3b82f6"};
      color: ${(d==null?void 0:d.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,n.addEventListener("click",()=>{if(u){te();return}ne()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),o=document.createElement("div"),o.id="nexus-widget-container",o.style.cssText=`
      position: fixed;
      ${v==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `,r=document.createElement("iframe"),r.src=Le(),r.allow="microphone; clipboard-read; clipboard-write",r.style.cssText="width:100%;height:100%;border:none;",r.onload=()=>{W=!0,T=new URL(r.src).origin,I({type:"nexus:embed-ready"}),H(!0),N||(N=ke(()=>{H(!1)})),document.addEventListener("visibilitychange",de),A()},o.appendChild(r),document.body.appendChild(o),window.addEventListener("message",le),window.addEventListener("resize",$),window.addEventListener("scroll",$,{passive:!0})}function Le(){const e=new URLSearchParams;return e.append("organizationId",C),`${P.WIDGET_URL}?${e.toString()}`}function le(e){var y,g;const i=e.data||{},c=i==null?void 0:i.type,a=i==null?void 0:i.payload;if(!(W&&T&&e.origin!==T)&&c)switch(c){case"close":te();break;case"resize":a!=null&&a.height&&o&&(o.style.height=`${a.height}px`);break;case"nexus:theme":{const s=a;d=(s==null?void 0:s.theme)||null,x=(s==null?void 0:s.brandLogoUrl)||null,A();break}case"nexus:suggestions":{const s=a;U=!0,d=s.theme||d||null,x=s.brandLogoUrl||x||null,A(),Ce(s);break}case"nexus:promo":{const s=a;(y=r==null?void 0:r.contentWindow)==null||y.postMessage({type:"nexus:host-ack"},T||"*"),(g=r==null?void 0:r.contentWindow)==null||g.postMessage({type:"nexus:hide-internal-promo"},T||"*"),U=!0,d=s.theme||d||null,x=s.brandLogoUrl||x||null,A(),$e(s);break}case"nexus:session-ready":{if(!C)return;const s=a==null?void 0:a.contactSessionId;if(typeof s!="string"||s.trim().length===0)return;if(j&&z&&z!==s){try{q()}catch{}j=!1,z=null}if(j&&z===s)return;j=!0,z=s,we({orgId:C,contactSessionId:s});break}}}function Te(){n&&(Q||!d&&!x&&!U||(Q=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function A(){if(!n)return;const e=(d==null?void 0:d.chatBubbleColor)||(d==null?void 0:d.primaryColor)||"#3b82f6",i=(d==null?void 0:d.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=i,Te(),!u)if(x){const c=S(x);n.innerHTML=`
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${c}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `}else n.innerHTML=Y}function I(e){if(!W||!(r!=null&&r.contentWindow))return;const i=T||"*";r.contentWindow.postMessage(e,i)}function H(e){const i=location.href;if(!i)return;const c={href:i,title:document.title||"",referrer:document.referrer||"",ts:Date.now()},a=()=>{c.href===X&&!e||(X=c.href,I({type:"nexus:parent-location",payload:c}))};if(e){if(m){try{clearTimeout(m)}catch{}m=null}a();return}m||(m=setTimeout(()=>{m=null,a()},ve))}function de(){document.visibilityState==="visible"&&H(!1)}function Ce(e){const i=e.theme||d||{},c=i.primaryColor||"#0ea5e9",a=i.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(t),l=document.createElement("div"),l.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${a};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(l));const g=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((w,B)=>`
          <button data-sugg-index="${B}"
            style="
              all: unset;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:8px 10px;
              border-radius:9999px;
              border:1px solid ${c}59;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
              line-height:1;
              color:${c};
              background:${c}14;
              white-space:nowrap;
              max-width:100%;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
            ${k(w)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${k("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${g}
            </div>

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${S(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const s=t.querySelector("#nexus-close");s==null||s.addEventListener("click",()=>{E=!0,ee()}),t.querySelectorAll("button[data-sugg-index]").forEach(w=>{w.addEventListener("click",()=>{ne()})}),$(),!u&&!E&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),l&&(l.style.opacity="1")})}function $e(e){const i=e.theme||d||{},c=i.primaryColor||"#0ea5e9",a=i.primaryTextColor||"#ffffff",y=i.secondaryColor||"#ffffff",g=i.nudgeBackgroundColor||"#ffffff",s=i.secondaryTextColor||"#111827",R=i.chatBubbleColor||i.primaryColor||"#3b82f6",w=i.primaryTextColor||"#ffffff",B=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${g};
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
      `,document.body.appendChild(t),l=document.createElement("div"),l.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${g};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(l));const V=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],ue=Array.isArray(e.ctaList)&&e.ctaList.length?e.ctaList:[],pe=ue.length>0,fe=e.identityMode||"auto";let O="";fe==="logo"?x&&(O=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${S(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):fe==="avatars"?V.length&&(O=V.map((h,p)=>`
          <img src="${S(h)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join("")):x?O=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${S(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `:V.length&&(O=V.map((h,p)=>`
          <img src="${S(h)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join(""));const Ie=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${k(e.badgeText)}
         </span>`:"",Ue=e.title||"Discover the right solution for your business project.",je=e.body||"Chat with our assistant or book a 15-min demo.",Ne=pe?`
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ue.map((h,p)=>{const _=p===0,Me=_?c:y,Re=_?a:s,Oe=_?"":"border:1px solid #e5e7eb;",_e=h.label&&h.label.trim().length?h.label:Ee(h.kind);return`
                <button data-cta-index="${p}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${Me};
                    color:${Re};
                    ${Oe}
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
                  ${k(_e)}
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
              background:${c};
              color:${a};
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
            ${k(e.primary||"Chat with AI Assistant")}
          </button>
          ${e.secondary!==void 0?`<button id="nexus-secondary"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${y};
                    color:${s};
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
                  ${k(e.secondary||"Book a meeting")}
                </button>`:""}
        </div>
      `,He=B?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${R};
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
        ${Ie}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${O}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${k(Ue)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${k(je)}
            </div>

            ${He}

            ${Ne}

            ${e.privacyUrl?`<div style="margin-top:10px">
                    <a href="${S(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const ie=t.querySelector("#nexus-close"),f=t.querySelector("#nexus-voice");if(B&&(f==null||f.addEventListener("mouseenter",()=>{f&&(f.style.transform="scale(1.06)",f.style.boxShadow="0 10px 22px rgba(0,0,0,.22)")}),f==null||f.addEventListener("mouseleave",()=>{f&&(f.style.transform="scale(1)",f.style.boxShadow="0 6px 18px rgba(0,0,0,.18)")}),f==null||f.addEventListener("click",()=>{M(),setTimeout(()=>{I({type:"nexus:open-voice"})},50)})),pe)t.querySelectorAll("button[data-cta-index]").forEach(p=>{const _=Number(p.getAttribute("data-cta-index")||"0");p.addEventListener("click",()=>Se(_))});else{const h=t.querySelector("#nexus-primary"),p=t.querySelector("#nexus-secondary");h==null||h.addEventListener("click",()=>ne()),p==null||p.addEventListener("click",()=>ze())}ie==null||ie.addEventListener("click",()=>{E=!0,ee()}),$(),!u&&!E&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),l&&(l.style.opacity="1")})}function Se(e){M(),setTimeout(()=>{I({type:"nexus:run-cta",index:e})},50)}function Ee(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function $(){if(!n||!t||!l)return;const e=n.getBoundingClientRect(),i=12,c=12,a=window.innerHeight-e.top;t.style.bottom=`${a+i}px`,v==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const y=e.left+e.width/2;l.style.left=`${y-c/2}px`,l.style.bottom=`${a+(i-c/2)}px`,l.style.transform="rotate(45deg)";const g=t.getBoundingClientRect(),s=g.right-window.innerWidth,R=-g.left;if(s>0&&v==="bottom-right"){const w=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,w+s)}px`}else if(R>0&&v==="bottom-left"){const w=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,w+R)}px`}}function ee(){t&&(t.remove(),t=null),l&&(l.remove(),l=null)}function k(e){return e.replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}function S(e){return e.replace(/"/g,"&quot;")}function M(){!o||!n||(u=!0,t&&(t.style.display="none"),l&&(l.style.display="none"),o.style.display="block",setTimeout(()=>{o&&(o.style.opacity="1",o.style.transform="translateY(0)")},10),n.innerHTML=he,A(),H(!0))}function te(){!o||!n||(u=!1,o.style.opacity="0",o.style.transform="translateY(10px)",setTimeout(()=>o&&(o.style.display="none"),300),n.innerHTML=Y,A(),!E&&U&&t&&l&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",l.style.display="block",l.style.opacity="1",$(),H(!1)))}function ne(){M(),setTimeout(()=>I({type:"nexus:open-chat"}),50)}function ze(){M(),setTimeout(()=>I({type:"nexus:run-secondary-cta"}),50)}function ce(){try{q()}catch{}if(window.removeEventListener("message",le),window.removeEventListener("resize",$),window.removeEventListener("scroll",$),document.removeEventListener("visibilitychange",de),N)try{N()}catch{}if(N=null,m)try{clearTimeout(m)}catch{}m=null,X="",ee(),o&&(o.remove(),o=null,r=null),n&&(n.remove(),n=null),u=!1,W=!1,T="",j=!1,z=null,d=null,x=null,Q=!1,U=!1,E=!1}function Ae(e){ce(),e.organizationId&&(C=e.organizationId),e.position&&(v=e.position),se()}window.NexusWidget={init:Ae,show:M,hide:te,destroy:ce},se()})()})();
