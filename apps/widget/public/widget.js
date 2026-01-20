(function(){"use strict";const R={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},Y=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,fe=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`,he="https://app.inboundless.co/api/tracker/snapshot",xe=400,ge=1500;let G=!1,D=null,F=null,L=null,J=0,b=null;function ye(){return Date.now()}function be(a){const s=history.pushState,n=history.replaceState,t=()=>Promise.resolve().then(a);return history.pushState=function(...o){const y=s.apply(this,o);return t(),y},history.replaceState=function(...o){const y=n.apply(this,o);return t(),y},window.addEventListener("popstate",t),window.addEventListener("hashchange",t),()=>{history.pushState=s,history.replaceState=n,window.removeEventListener("popstate",t),window.removeEventListener("hashchange",t)}}async function ie(a){try{b==null||b.abort()}catch{}b=new AbortController;try{await fetch(he,{method:"POST",headers:{"Content-Type":"application/json"},signal:b.signal,body:JSON.stringify(a),keepalive:!0})}catch{}}function oe(a){L&&clearTimeout(L),L=setTimeout(()=>{L=null;const s=ye();if(s-J<ge)return;J=s;const n=location.href,t=document.title||void 0;ie({organizationId:a.orgId,sessionId:a.sessionId,pageUrl:n,title:t,width:window.innerWidth,height:window.innerHeight})},xe)}function me(){if(F)try{F()}catch{}if(F=null,L)try{clearTimeout(L)}catch{}L=null;try{b==null||b.abort()}catch{}b=null,D=null,J=0,G=!1}function q(){me()}function we({orgId:a,contactSessionId:s}){if(G||typeof window>"u"||window.self!==window.top)return;G=!0,D=location.href,oe({orgId:a,sessionId:s}),F=be(()=>{const o=location.href;!o||o===D||(D=o,oe({orgId:a,sessionId:s}))});const n=()=>{try{const o=location.href;ie({organizationId:a,sessionId:s,pageUrl:o,title:document.title||void 0,width:window.innerWidth,height:window.innerHeight})}catch{}};window.addEventListener("pagehide",n);const t=q;q=()=>{try{window.removeEventListener("pagehide",n)}catch{}t()}}(function(){let a=null,s=null,n=null,t=null,o=null,y=!1,N=!1,E=!1,B=!1,T="",U=!1,z=null,S=null,v=R.DEFAULT_POSITION,d=null,x=null,K=!1,j=null,m=null;const ve=200;let Q="";const X=document.currentScript;if(X)S=X.getAttribute("data-organization-id"),v=X.getAttribute("data-position")??R.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),i=Array.from(e).find(c=>c.hasAttribute("data-organization-id"));i&&(S=i.getAttribute("data-organization-id"),v=i.getAttribute("data-position")??R.DEFAULT_POSITION)}if(!S){console.error("Nexus Widget: data-organization-id attribute is required");return}function re(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",se,{once:!0}):se()}function ke(e){const i=history.pushState,c=history.replaceState,l=()=>Promise.resolve().then(e);return history.pushState=function(...g){const h=i.apply(this,g);return l(),h},history.replaceState=function(...g){const h=c.apply(this,g);return l(),h},window.addEventListener("popstate",l),window.addEventListener("hashchange",l),()=>{history.pushState=i,history.replaceState=c,window.removeEventListener("popstate",l),window.removeEventListener("hashchange",l)}}function se(){n=document.createElement("button"),n.id="nexus-widget-button",n.innerHTML=Y,n.style.cssText=`
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
    `,n.addEventListener("click",()=>{if(y){ee();return}te()}),n.addEventListener("mouseenter",()=>{n&&(n.style.transform="scale(1.05)",n.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),n.addEventListener("mouseleave",()=>{n&&(n.style.transform="scale(1)",n.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(n),s=document.createElement("div"),s.id="nexus-widget-container",s.style.cssText=`
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
    `,a=document.createElement("iframe"),a.src=Le(),a.allow="microphone; clipboard-read; clipboard-write",a.style.cssText="width:100%;height:100%;border:none;",a.onload=()=>{B=!0,T=new URL(a.src).origin,I({type:"nexus:embed-ready"}),H(!0),j||(j=ke(()=>{H(!1)})),document.addEventListener("visibilitychange",le),A()},s.appendChild(a),document.body.appendChild(s),window.addEventListener("message",ae),window.addEventListener("resize",C),window.addEventListener("scroll",C,{passive:!0})}function Le(){const e=new URLSearchParams;return e.append("organizationId",S),`${R.WIDGET_URL}?${e.toString()}`}function ae(e){var g,h;const i=e.data||{},c=i==null?void 0:i.type,l=i==null?void 0:i.payload;if(!(B&&T&&e.origin!==T)&&c)switch(c){case"close":ee();break;case"resize":l!=null&&l.height&&s&&(s.style.height=`${l.height}px`);break;case"nexus:theme":{const r=l;d=(r==null?void 0:r.theme)||null,x=(r==null?void 0:r.brandLogoUrl)||null,A();break}case"nexus:suggestions":{const r=l;N=!0,d=r.theme||d||null,x=r.brandLogoUrl||x||null,A(),Se(r);break}case"nexus:promo":{const r=l;(g=a==null?void 0:a.contentWindow)==null||g.postMessage({type:"nexus:host-ack"},T||"*"),(h=a==null?void 0:a.contentWindow)==null||h.postMessage({type:"nexus:hide-internal-promo"},T||"*"),N=!0,d=r.theme||d||null,x=r.brandLogoUrl||x||null,A(),Ce(r);break}case"nexus:session-ready":{if(!S)return;const r=l==null?void 0:l.contactSessionId;if(typeof r!="string"||r.trim().length===0)return;if(U&&z&&z!==r){try{q()}catch{}U=!1,z=null}if(U&&z===r)return;U=!0,z=r,we({orgId:S,contactSessionId:r});break}}}function Te(){n&&(K||!d&&!x&&!N||(K=!0,n.style.opacity="1",n.style.pointerEvents="auto"))}function A(){if(!n)return;const e=(d==null?void 0:d.chatBubbleColor)||(d==null?void 0:d.primaryColor)||"#3b82f6",i=(d==null?void 0:d.primaryTextColor)||"#ffffff";if(n.style.background=e,n.style.color=i,Te(),!y)if(x){const c=$(x);n.innerHTML=`
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
      `}else n.innerHTML=Y}function I(e){if(!B||!(a!=null&&a.contentWindow))return;const i=T||"*";a.contentWindow.postMessage(e,i)}function H(e){const i=location.href;if(!i)return;const c={href:i,title:document.title||"",referrer:document.referrer||"",ts:Date.now()},l=()=>{c.href===Q&&!e||(Q=c.href,I({type:"nexus:parent-location",payload:c}))};if(e){if(m){try{clearTimeout(m)}catch{}m=null}l();return}m||(m=setTimeout(()=>{m=null,l()},ve))}function le(){document.visibilityState==="visible"&&H(!1)}function Se(e){const i=e.theme||d||{},c=i.primaryColor||"#0ea5e9",l=i.nudgeBackgroundColor||"#ffffff";t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${l};
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
      `,document.body.appendChild(t),o=document.createElement("div"),o.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${l};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(o));const h=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map((w,W)=>`
          <button data-sugg-index="${W}"
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
              ${h}
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
    `;const r=t.querySelector("#nexus-close");r==null||r.addEventListener("click",()=>{E=!0,Z()}),t.querySelectorAll("button[data-sugg-index]").forEach(w=>{w.addEventListener("click",()=>{te()})}),C(),!y&&!E&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),o&&(o.style.opacity="1")})}function Ce(e){const i=e.theme||d||{},c=i.primaryColor||"#0ea5e9",l=i.primaryTextColor||"#ffffff",g=i.secondaryColor||"#ffffff",h=i.nudgeBackgroundColor||"#ffffff",r=i.secondaryTextColor||"#111827",O=i.chatBubbleColor||i.primaryColor||"#3b82f6",w=i.primaryTextColor||"#ffffff",W=e.canUseVoice!==!1;t||(t=document.createElement("div"),t.id="nexus-nudge",t.style.cssText=`
        all: unset;
        position: fixed;
        width: 340px; max-width: min(340px, calc(100vw - 96px));
        z-index: 2147483001;
        background: ${h};
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
      `,document.body.appendChild(t),o=document.createElement("div"),o.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${h};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(o));const V=Array.isArray(e.avatars)?e.avatars.slice(0,3):[],ce=Array.isArray(e.ctaList)&&e.ctaList.length?e.ctaList:[],ue=ce.length>0,pe=e.identityMode||"auto";let _="";pe==="logo"?x&&(_=`
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
        `):pe==="avatars"?V.length&&(_=V.map((f,u)=>`
          <img src="${$(f)}" alt="avatar ${u+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${u?`margin-left:-10px; z-index:${10-u};`:"z-index:10;"}
            " />`).join("")):x?_=`
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
        `:V.length&&(_=V.map((f,u)=>`
          <img src="${$(f)}" alt="avatar ${u+1}"
            style="
              width:26px;height:26px;border-radius:9999px;object-fit:cover;
              border:2px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.12);
              position: relative; ${u?`margin-left:-10px; z-index:${10-u};`:"z-index:10;"}
            " />`).join(""));const Ie=e.badgeText?`<span style="
           position:absolute; left:12px; top:10px;
           background:#10b981; color:#fff; font-size:11px; line-height:1;
           padding:4px 6px; border-radius:6px; font-weight:600;">
           ${k(e.badgeText)}
         </span>`:"",Ne=e.title||"Discover the right solution for your business project.",Ue=e.body||"Chat with our assistant or book a 15-min demo.",je=ue?`
        <div id="nexus-cta-stack"
          style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
          ${ce.map((f,u)=>{const P=u===0,Me=P?c:g,Oe=P?l:r,_e=P?"":"border:1px solid #e5e7eb;",Pe=f.label&&f.label.trim().length?f.label:Ee(f.kind);return`
                <button data-cta-index="${u}"
                  style="
                    all: unset;
                    width:100%;
                    min-height:36px;
                    padding:0 12px;
                    border-radius:8px;
                    background:${Me};
                    color:${Oe};
                    ${_e}
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
                  ${k(Pe)}
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
              color:${l};
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
                    background:${g};
                    color:${r};
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
      `,He=W?`
        <div style="display:flex;justify-content:center;margin-top:10px;">
          <button id="nexus-voice"
            title="Voice call"
            style="
              all: unset;
              width:44px;height:44px;
              border-radius:9999px;
              background:${O};
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
            ${_}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;color:#111827;">
              ${k(Ne)}
            </div>
            <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;word-break:break-word;">
              ${k(Ue)}
            </div>

            ${He}

            ${je}

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
    `;const ne=t.querySelector("#nexus-close"),p=t.querySelector("#nexus-voice");if(W&&(p==null||p.addEventListener("mouseenter",()=>{p&&(p.style.transform="scale(1.06)",p.style.boxShadow="0 10px 22px rgba(0,0,0,.22)")}),p==null||p.addEventListener("mouseleave",()=>{p&&(p.style.transform="scale(1)",p.style.boxShadow="0 6px 18px rgba(0,0,0,.18)")}),p==null||p.addEventListener("click",()=>{M(),setTimeout(()=>{I({type:"nexus:open-voice"})},50)})),ue)t.querySelectorAll("button[data-cta-index]").forEach(u=>{const P=Number(u.getAttribute("data-cta-index")||"0");u.addEventListener("click",()=>$e(P))});else{const f=t.querySelector("#nexus-primary"),u=t.querySelector("#nexus-secondary");f==null||f.addEventListener("click",()=>te()),u==null||u.addEventListener("click",()=>ze())}ne==null||ne.addEventListener("click",()=>{E=!0,Z()}),C(),!y&&!E&&requestAnimationFrame(()=>{t&&(t.style.opacity="1",t.style.transform="translateY(0)"),o&&(o.style.opacity="1")})}function $e(e){M(),setTimeout(()=>{I({type:"nexus:run-cta",index:e})},50)}function Ee(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function C(){if(!n||!t||!o)return;const e=n.getBoundingClientRect(),i=12,c=12,l=window.innerHeight-e.top;t.style.bottom=`${l+i}px`,v==="bottom-right"?(t.style.right="20px",t.style.left=""):(t.style.left="20px",t.style.right="");const g=e.left+e.width/2;o.style.left=`${g-c/2}px`,o.style.bottom=`${l+(i-c/2)}px`,o.style.transform="rotate(45deg)";const h=t.getBoundingClientRect(),r=h.right-window.innerWidth,O=-h.left;if(r>0&&v==="bottom-right"){const w=parseFloat(getComputedStyle(t).right||"20");t.style.right=`${Math.max(12,w+r)}px`}else if(O>0&&v==="bottom-left"){const w=parseFloat(getComputedStyle(t).left||"20");t.style.left=`${Math.max(12,w+O)}px`}}function Z(){t&&(t.remove(),t=null),o&&(o.remove(),o=null)}function k(e){return e.replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}function $(e){return e.replace(/"/g,"&quot;")}function M(){!s||!n||(y=!0,t&&(t.style.display="none"),o&&(o.style.display="none"),s.style.display="block",setTimeout(()=>{s&&(s.style.opacity="1",s.style.transform="translateY(0)")},10),n.innerHTML=fe,A(),H(!0))}function ee(){!s||!n||(y=!1,s.style.opacity="0",s.style.transform="translateY(10px)",setTimeout(()=>s&&(s.style.display="none"),300),n.innerHTML=Y,A(),!E&&N&&t&&o&&(t.style.display="block",t.style.opacity="1",t.style.transform="translateY(0)",o.style.display="block",o.style.opacity="1",C(),H(!1)))}function te(){M(),setTimeout(()=>I({type:"nexus:open-chat"}),50)}function ze(){M(),setTimeout(()=>I({type:"nexus:run-secondary-cta"}),50)}function de(){try{q()}catch{}if(window.removeEventListener("message",ae),window.removeEventListener("resize",C),window.removeEventListener("scroll",C),document.removeEventListener("visibilitychange",le),j)try{j()}catch{}if(j=null,m)try{clearTimeout(m)}catch{}m=null,Q="",Z(),s&&(s.remove(),s=null,a=null),n&&(n.remove(),n=null),y=!1,B=!1,T="",U=!1,z=null,d=null,x=null,K=!1,N=!1,E=!1}function Ae(e){de(),e.organizationId&&(S=e.organizationId),e.position&&(v=e.position),re()}window.NexusWidget={init:Ae,show:M,hide:ee,destroy:de},re()})()})();
