(function(){"use strict";const D={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},G=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,be=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`,se="https://app.inboundless.co/api/tracker/snapshot",me=250,we=800;let K=!1,q=null,F=null,T=null,J=0,b=null;function ae(n){try{const i=new URL(n);return i.hostname==="widget.inboundless.co"||i.hostname==="app.inboundless.co"}catch{return!1}}function ve(n){const i=history.pushState,o=history.replaceState,t=()=>Promise.resolve().then(n);return history.pushState=function(...l){const u=i.apply(this,l);return t(),u},history.replaceState=function(...l){const u=o.apply(this,l);return t(),u},window.addEventListener("popstate",t),window.addEventListener("hashchange",t),()=>{history.pushState=i,history.replaceState=o,window.removeEventListener("popstate",t),window.removeEventListener("hashchange",t)}}function ke(n){try{const i=new URL(se);i.searchParams.set("organizationId",n.organizationId),i.searchParams.set("sessionId",n.sessionId),i.searchParams.set("pageUrl",n.pageUrl),n.title&&i.searchParams.set("title",n.title),typeof n.width=="number"&&i.searchParams.set("width",String(n.width)),typeof n.height=="number"&&i.searchParams.set("height",String(n.height)),i.searchParams.set("_t",String(Date.now()));const o=new Image;o.referrerPolicy="no-referrer",o.src=i.toString()}catch{}}async function le(n){try{b==null||b.abort()}catch{}b=new AbortController;try{await fetch(se,{method:"POST",headers:{"Content-Type":"application/json"},signal:b.signal,body:JSON.stringify(n),keepalive:!0,mode:"cors"});return}catch{ke(n)}}function Q(n){T&&clearTimeout(T),T=setTimeout(()=>{T=null;const i=Date.now();if(i-J<we)return;J=i;const o=location.href;if(!o||ae(o))return;const t=document.title||void 0;le({organizationId:n.orgId,sessionId:n.sessionId,pageUrl:o,title:t,width:window.innerWidth,height:window.innerHeight})},me)}function Le(){if(F)try{F()}catch{}if(F=null,T)try{clearTimeout(T)}catch{}T=null;try{b==null||b.abort()}catch{}b=null,q=null,J=0,K=!1}function W(){Le()}function ce({orgId:n,contactSessionId:i}){if(K||typeof window>"u")return;K=!0,q=location.href,Q({orgId:n,sessionId:i}),F=ve(()=>{const u=location.href;!u||u===q||(q=u,Q({orgId:n,sessionId:i}))});const o=()=>{document.visibilityState==="visible"&&Q({orgId:n,sessionId:i})};document.addEventListener("visibilitychange",o);const t=()=>{try{const u=location.href;if(!u||ae(u))return;le({organizationId:n,sessionId:i,pageUrl:u,title:document.title||void 0,width:window.innerWidth,height:window.innerHeight})}catch{}};window.addEventListener("pagehide",t);const l=W;W=()=>{try{window.removeEventListener("pagehide",t),document.removeEventListener("visibilitychange",o)}catch{}l()}}(function(){let n=null,i=null,o=null,t=null,l=null,u=!1,A=!1,z=!1,j=!1,m="",N=!1,B=null,w=null,X=null,v=null,S=D.DEFAULT_POSITION,c=null,x=null,Z=!1,M=null,k=null;const Se=200;let ee="";const te=document.currentScript;if(te)v=te.getAttribute("data-organization-id"),S=te.getAttribute("data-position")??D.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),r=Array.from(e).find(d=>d.hasAttribute("data-organization-id"));r&&(v=r.getAttribute("data-organization-id"),S=r.getAttribute("data-position")??D.DEFAULT_POSITION)}if(!v){console.error("Nexus Widget: data-organization-id attribute is required");return}function de(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",ue,{once:!0}):ue()}function $e(e){const r=history.pushState,d=history.replaceState,a=()=>Promise.resolve().then(e);return history.pushState=function(...y){const g=r.apply(this,y);return a(),g},history.replaceState=function(...y){const g=d.apply(this,y);return a(),g},window.addEventListener("popstate",a),window.addEventListener("hashchange",a),()=>{history.pushState=r,history.replaceState=d,window.removeEventListener("popstate",a),window.removeEventListener("hashchange",a)}}function ue(){X=`nx_ext_session_${v}`;try{w=localStorage.getItem(X),w||(w=crypto.randomUUID(),localStorage.setItem(X,w))}catch{w=`ext_${Math.random().toString(36).slice(2)}_${Date.now()}`}o=document.createElement("button"),o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=G,o.style.cssText=`
      all: unset;
      position: fixed;
      ${S==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(c==null?void 0:c.chatBubbleColor)||(c==null?void 0:c.primaryColor)||"#3b82f6"};
      color: ${(c==null?void 0:c.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,o.addEventListener("click",()=>{if(u){ie();return}oe()}),document.body.appendChild(o),i=document.createElement("div"),i.id="nexus-widget-container",i.style.cssText=`
      position: fixed;
      ${S==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 90px;
      width: 400px; height: 600px;
      max-width: calc(100vw - 40px); max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none; opacity: 0; transform: translateY(10px);
      transition: all .3s ease; background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `,n=document.createElement("iframe"),n.src=Te(),n.allow="microphone; clipboard-read; clipboard-write",n.style.cssText="width:100%;height:100%;border:none;",n.onload=()=>{j=!0,m=new URL(n.src).origin,C({type:"nexus:embed-ready"}),C({type:"nexus:request-session",payload:{externalSessionId:w}}),H(!0),!N&&w&&(N=!0,B=w,ce({orgId:v,contactSessionId:w})),M||(M=$e(()=>{H(!1)})),document.addEventListener("visibilitychange",fe),U()},i.appendChild(n),document.body.appendChild(i),window.addEventListener("message",pe),window.addEventListener("resize",E),window.addEventListener("scroll",E,{passive:!0})}function Te(){const e=new URLSearchParams;return e.append("organizationId",v),`${D.WIDGET_URL}?${e.toString()}`}function pe(e){var y,g;const r=e.data||{},d=r==null?void 0:r.type,a=r==null?void 0:r.payload;if(!(j&&m&&e.origin!==m&&d!=="nexus:session-ready")&&d&&!(d!=="nexus:session-ready"&&j&&m&&e.origin!==m))switch(d){case"close":ie();break;case"resize":a!=null&&a.height&&i&&(i.style.height=`${a.height}px`);break;case"nexus:theme":{const s=a;c=(s==null?void 0:s.theme)||null,x=(s==null?void 0:s.brandLogoUrl)||null,U();break}case"nexus:suggestions":{const s=a;A=!0,c=s.theme||c||null,x=s.brandLogoUrl||x||null,U(),Ee(s);break}case"nexus:promo":{const s=a;(y=n==null?void 0:n.contentWindow)==null||y.postMessage({type:"nexus:host-ack"},m||"*"),(g=n==null?void 0:n.contentWindow)==null||g.postMessage({type:"nexus:hide-internal-promo"},m||"*"),A=!0,c=s.theme||c||null,x=s.brandLogoUrl||x||null,U(),Ie(s);break}case"nexus:session-ready":{if(!v)return;const s=a==null?void 0:a.contactSessionId;if(typeof s!="string"||s.trim().length===0||N&&B===s)return;try{W()}catch{}N=!0,B=s,ce({orgId:v,contactSessionId:s});break}}}function Ce(){o&&(Z||!c&&!x&&!A||(Z=!0,o.style.opacity="1",o.style.pointerEvents="auto"))}function U(){if(!o)return;const e=(c==null?void 0:c.chatBubbleColor)||(c==null?void 0:c.primaryColor)||"#3b82f6",r=(c==null?void 0:c.primaryTextColor)||"#ffffff";if(o.style.background=e,o.style.color=r,Ce(),!u)if(x){const d=I(x);o.innerHTML=`
        <div style="
          width:70%;height:70%;
          border-radius:9999px;
          overflow:hidden;
          display:flex;
          align-items:center;
          justify-content:center;
          background:rgba(255,255,255,0.9);
        ">
          <img src="${d}" alt="Chat"
            style="width:100%;height:100%;object-fit:contain;" />
        </div>
      `}else o.innerHTML=G}function C(e){if(!j||!(n!=null&&n.contentWindow))return;const r=m||"*";n.contentWindow.postMessage(e,r)}function H(e){const r=location.href;if(!r)return;const d={href:r,title:document.title||"",referrer:document.referrer||"",ts:Date.now()},a=()=>{d.href===ee&&!e||(ee=d.href,C({type:"nexus:parent-location",payload:d}))};if(e){if(k){try{clearTimeout(k)}catch{}k=null}a();return}k||(k=setTimeout(()=>{k=null,a()},Se))}function fe(){document.visibilityState==="visible"&&H(!1)}function Ee(e){const r=e.theme||c||{},d=r.primaryColor||"#0ea5e9",a=r.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(l));const g=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((L,V)=>`
          <button data-sugg-index="${V}"
            style="
              all: unset;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              padding:8px 10px;
              border-radius:9999px;
              border:1px solid ${d}59;
              cursor:pointer;
              font-weight:600;
              font-size:12px;
              line-height:1;
              color:${d};
              background:${d}14;
              white-space:nowrap;
              max-width:100%;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
            ${$(L)}
          </button>
        `).join("");t.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${$("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${g}
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
    `;const s=t.querySelector("#nexus-close");s==null||s.addEventListener("click",()=>{z=!0,ne()}),t.querySelectorAll("button[data-sugg-index]").forEach(L=>{L.addEventListener("click",()=>{oe()})}),E(),!u&&!z&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),l&&(l.style.opacity="1")})}function Ie(e){const r=e.theme||c||{},d=r.primaryColor||"#0ea5e9",a=r.primaryTextColor||"#ffffff",y=r.secondaryColor||"#ffffff",g=r.nudgeBackgroundColor||"#ffffff",s=r.secondaryTextColor||"#111827",_=r.chatBubbleColor||r.primaryColor||"#3b82f6",L=r.primaryTextColor||"#ffffff",V=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
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
      `,document.body.appendChild(l));const Y=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],ge=Array.isArray(e.ctaList)&&e.ctaList.length?e.ctaList:[],xe=ge.length>0,ye=e.identityMode||"auto";let R="";ye==="logo"?x&&(R=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${I(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `):ye==="avatars"?Y.length&&(R=Y.map((h,p)=>`
          <img src="${I(h)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join("")):x?R=`
          <div style="
            width:32px;height:32px;border-radius:9999px;
            background:#f3f4f6;
            display:flex;align-items:center;justify-content:center;
            overflow:hidden;
            border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.12);
          ">
            <img src="${I(x)}" alt="logo"
              style="width:100%;height:100%;object-fit:contain;" />
          </div>
        `:Y.length&&(R=Y.map((h,p)=>`
          <img src="${I(h)}" alt="avatar ${p+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${p?`margin-left:-10px; z-index:${10-p};`:"z-index:10;"}
            " />`).join(""));const Ne=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${$(e.badgeText)}
         </span>`:"",Me=e.title||"Discover the right solution for your business project.",He=e.body||"Chat with our assistant or book a 15-min demo.",Pe=xe?`
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ge.map((h,p)=>{const O=p===0,Re=O?d:y,Oe=O?a:s,De=O?"":"border:1px solid #e5e7eb;",qe=h.label&&h.label.trim().length?h.label:Ue(h.kind);return`
                <button data-cta-index="${p}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${Re};
                    color:${Oe};
                    ${De}
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
                  ${$(qe)}
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
              background:${d};
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
            ${$(e.primary||"Chat with AI Assistant")}
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
                  ${$(e.secondary||"Book a meeting")}
                </button>`:""}
        </div>
      `,_e=V?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${_};
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
        ${Ne}
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="display:flex;align-items:center;min-width:56px;padding-top:4px">
            ${R}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${$(Me)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${$(He)}
            </div>

            ${_e}

            ${Pe}

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
    `;const re=t.querySelector("#nexus-close"),f=t.querySelector("#nexus-voice");if(V&&(f==null||f.addEventListener("mouseenter",()=>{f&&(f.style.transform="scale(1.06)",f.style.boxShadow="0 10px 22px rgba(0,0,0,.22)")}),f==null||f.addEventListener("mouseleave",()=>{f&&(f.style.transform="scale(1)",f.style.boxShadow="0 6px 18px rgba(0,0,0,.18)")}),f==null||f.addEventListener("click",()=>{P(),setTimeout(()=>{C({type:"nexus:open-voice"})},50)})),xe)t.querySelectorAll("button[data-cta-index]").forEach(p=>{const O=Number(p.getAttribute("data-cta-index")||"0");p.addEventListener("click",()=>ze(O))});else{const h=t.querySelector("#nexus-primary"),p=t.querySelector("#nexus-secondary");h==null||h.addEventListener("click",()=>oe()),p==null||p.addEventListener("click",()=>Ae())}re==null||re.addEventListener("click",()=>{z=!0,ne()}),E(),!u&&!z&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),l&&(l.style.opacity="1")})}function ze(e){P(),setTimeout(()=>{C({type:"nexus:run-cta",index:e})},50)}function Ue(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function E(){if(!o||!t||!l)return;const e=o.getBoundingClientRect(),r=12,d=12,a=window.innerHeight-e.top;t.style.bottom=`${a+r}px`,S==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const y=e.left+e.width/2;l.style.left=`${y-d/2}px`,l.style.bottom=`${a+(r-d/2)}px`,l.style.transform="rotate(45deg)";const g=t.getBoundingClientRect(),s=g.right-window.innerWidth,_=-g.left;if(s>0&&S==="bottom-right"){const L=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,L+s)}px`}else if(_>0&&S==="bottom-left"){const L=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,L+_)}px`}}function ne(){t&&(t.remove(),t=null),l&&(l.remove(),l=null)}function $(e){return e.replace(/[&<>"']/g,r=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[r])}function I(e){return e.replace(/"/g,"&quot;")}function P(){!i||!o||(u=!0,t&&(t.style.display="none"),l&&(l.style.display="none"),i.style.display="block",setTimeout(()=>{i&&(i.style.opacity="1",i.style.transform="translateY(0)")},10),o.innerHTML=be,U(),H(!0))}function ie(){!i||!o||(u=!1,i.style.opacity="0",i.style.transform="translateY(10px)",setTimeout(()=>i&&(i.style.display="none"),300),o.innerHTML=G,U(),!z&&A&&t&&l&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",l.style.display="block",l.style.opacity="1",E(),H(!1)))}function oe(){P(),setTimeout(()=>C({type:"nexus:open-chat"}),50)}function Ae(){P(),setTimeout(()=>C({type:"nexus:run-secondary-cta"}),50)}function he(){try{W()}catch{}if(window.removeEventListener("message",pe),window.removeEventListener("resize",E),window.removeEventListener("scroll",E),document.removeEventListener("visibilitychange",fe),M)try{M()}catch{}if(M=null,k)try{clearTimeout(k)}catch{}k=null,ee="",ne(),i&&(i.remove(),i=null,n=null),o&&(o.remove(),o=null),u=!1,j=!1,m="",N=!1,B=null,c=null,x=null,Z=!1,A=!1,z=!1}function je(e){he(),e.organizationId&&(v=e.organizationId),e.position&&(S=e.position),de()}window.NexusWidget={init:je,show:P,hide:ie,destroy:he},de()})()})();
