(function(){"use strict";const A={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},O=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,ne=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`,ie="https://app.inboundless.co/api/tracker/snapshot",oe=400,re=1500;let M=!1,N=null,U=null,w=null,P=0,f=null;function se(){return Date.now()}function ae(o){const i=history.pushState,t=history.replaceState,e=()=>Promise.resolve().then(o);return history.pushState=function(...s){const p=i.apply(this,s);return e(),p},history.replaceState=function(...s){const p=t.apply(this,s);return e(),p},window.addEventListener("popstate",e),window.addEventListener("hashchange",e),()=>{history.pushState=i,history.replaceState=t,window.removeEventListener("popstate",e),window.removeEventListener("hashchange",e)}}async function j(o){try{f==null||f.abort()}catch{}f=new AbortController;try{await fetch(ie,{method:"POST",headers:{"Content-Type":"application/json"},signal:f.signal,body:JSON.stringify(o),keepalive:!0})}catch{}}function q(o){w&&clearTimeout(w),w=setTimeout(()=>{w=null;const i=se();if(i-P<re)return;P=i;const t=location.href,e=document.title||void 0;j({organizationId:o.orgId,sessionId:o.sessionId,pageUrl:t,title:e,width:window.innerWidth,height:window.innerHeight})},oe)}function le(){if(U)try{U()}catch{}if(U=null,w)try{clearTimeout(w)}catch{}w=null;try{f==null||f.abort()}catch{}f=null,N=null,P=0,M=!1}function z(){le()}function ce({orgId:o,contactSessionId:i}){if(M||typeof window>"u"||window.self!==window.top)return;M=!0,N=location.href,q({orgId:o,sessionId:i}),U=ae(()=>{const s=location.href;!s||s===N||(N=s,q({orgId:o,sessionId:i}))});const t=()=>{try{const s=location.href;j({organizationId:o,sessionId:i,pageUrl:s,title:document.title||void 0,width:window.innerWidth,height:window.innerHeight})}catch{}};window.addEventListener("pagehide",t);const e=z;z=()=>{try{window.removeEventListener("pagehide",t)}catch{}e()}}(function(){let o=null,i=null,t=null,e=null,s=null,p=!1,k=!1,$=!1,H=!1,m="",C=!1,L=null,b=null,x=A.DEFAULT_POSITION,l=null,h=null,R=!1,I=null,g=null;const de=200;let _="";const D=document.currentScript;if(D)b=D.getAttribute("data-organization-id"),x=D.getAttribute("data-position")??A.DEFAULT_POSITION;else{const n=document.querySelectorAll('script[src*="widget"]'),r=Array.from(n).find(d=>d.hasAttribute("data-organization-id"));r&&(b=r.getAttribute("data-organization-id"),x=r.getAttribute("data-position")??A.DEFAULT_POSITION)}if(!b){console.error("Nexus Widget: data-organization-id attribute is required");return}function V(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",Y,{once:!0}):Y()}function ue(n){const r=history.pushState,d=history.replaceState,c=()=>Promise.resolve().then(n);return history.pushState=function(...y){const u=r.apply(this,y);return c(),u},history.replaceState=function(...y){const u=d.apply(this,y);return c(),u},window.addEventListener("popstate",c),window.addEventListener("hashchange",c),()=>{history.pushState=r,history.replaceState=d,window.removeEventListener("popstate",c),window.removeEventListener("hashchange",c)}}function Y(){t=document.createElement("button"),t.id="nexus-widget-button",t.innerHTML=O,t.style.cssText=`
      all: unset;
      position: fixed;
      ${x==="bottom-right"?"right: 20px;":"left: 20px;"}
      bottom: 20px;
      width: 60px; height: 60px; border-radius: 9999px;
      background: ${(l==null?void 0:l.chatBubbleColor)||(l==null?void 0:l.primaryColor)||"#3b82f6"};
      color: ${(l==null?void 0:l.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
      transition: transform .2s ease, box-shadow .2s ease, background .2s ease, opacity .15s ease;
      opacity: 0;
      pointer-events: none;
    `,t.addEventListener("click",()=>{if(p){W();return}ee()}),t.addEventListener("mouseenter",()=>{t&&(t.style.transform="scale(1.05)",t.style.boxShadow="0 6px 28px rgba(15,23,42,.35)")}),t.addEventListener("mouseleave",()=>{t&&(t.style.transform="scale(1)",t.style.boxShadow="0 4px 24px rgba(0,0,0,.25)")}),document.body.appendChild(t),i=document.createElement("div"),i.id="nexus-widget-container",i.style.cssText=`
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
    `,o=document.createElement("iframe"),o.src=pe(),o.allow="microphone; clipboard-read; clipboard-write",o.style.cssText="width:100%;height:100%;border:none;",o.onload=()=>{H=!0,m=new URL(o.src).origin,B({type:"nexus:embed-ready"}),v(!0),I||(I=ue(()=>{v(!1)})),document.addEventListener("visibilitychange",J),T()},i.appendChild(o),document.body.appendChild(i),window.addEventListener("message",G),window.addEventListener("resize",E),window.addEventListener("scroll",E,{passive:!0})}function pe(){const n=new URLSearchParams;return n.append("organizationId",b),`${A.WIDGET_URL}?${n.toString()}`}function G(n){var y,u;const r=n.data||{},d=r==null?void 0:r.type,c=r==null?void 0:r.payload;if(!(H&&m&&n.origin!==m)&&d)switch(d){case"close":W();break;case"resize":c!=null&&c.height&&i&&(i.style.height=`${c.height}px`);break;case"nexus:theme":{const a=c;l=(a==null?void 0:a.theme)||null,h=(a==null?void 0:a.brandLogoUrl)||null,T();break}case"nexus:suggestions":{const a=c;k=!0,l=a.theme||l||null,h=a.brandLogoUrl||h||null,T(),he(a);break}case"nexus:promo":{const a=c;(y=o==null?void 0:o.contentWindow)==null||y.postMessage({type:"nexus:host-ack"},m||"*"),(u=o==null?void 0:o.contentWindow)==null||u.postMessage({type:"nexus:hide-internal-promo"},m||"*"),k=!0,l=a.theme||l||null,h=a.brandLogoUrl||h||null,T();break}case"nexus:session-ready":{if(!b)return;const a=c==null?void 0:c.contactSessionId;if(typeof a!="string"||a.trim().length===0)return;if(C&&L&&L!==a){try{z()}catch{}C=!1,L=null}if(C&&L===a){v(!0);break}C=!0,L=a,ce({orgId:b,contactSessionId:a}),v(!0);break}}}function fe(){t&&(R||!l&&!h&&!k||(R=!0,t.style.opacity="1",t.style.pointerEvents="auto"))}function T(){if(!t)return;const n=(l==null?void 0:l.chatBubbleColor)||(l==null?void 0:l.primaryColor)||"#3b82f6",r=(l==null?void 0:l.primaryTextColor)||"#ffffff";if(t.style.background=n,t.style.color=r,fe(),!p)if(h){const d=K(h);t.innerHTML=`
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
      `}else t.innerHTML=O}function B(n){!H||!(o!=null&&o.contentWindow)||o.contentWindow.postMessage(n,m||"*")}function v(n){const r=location.href;if(!r)return;const d={type:"nexus:parent-location",href:r,title:document.title||"",referrer:document.referrer||"",ts:Date.now()},c=()=>{!n&&r===_||(_=r,B(d))};if(n){if(g){try{clearTimeout(g)}catch{}g=null}c();return}g||(g=setTimeout(()=>{g=null,c()},de))}function J(){document.visibilityState==="visible"&&v(!1)}function he(n){const r=n.theme||l||{},d=r.primaryColor||"#0ea5e9",c=r.nudgeBackgroundColor||"#ffffff";e||(e=document.createElement("div"),e.id="nexus-nudge",e.style.cssText=`
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
      `,document.body.appendChild(e),s=document.createElement("div"),s.style.cssText=`
        position: fixed;
        width: 12px; height: 12px;
        background: ${c};
        border-left: 1px solid #e5e7eb;
        border-top: 1px solid #e5e7eb;
        transform: rotate(45deg);
        z-index: 2147483002;
        box-shadow: 0 2px 8px rgba(0,0,0,.08);
        opacity: 0; transition: opacity .18s ease;
      `,document.body.appendChild(s));const u=(Array.isArray(n.suggestions)?n.suggestions.slice(0,3):[]).map((S,ye)=>`
          <button data-sugg-index="${ye}"
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
            ${X(S)}
          </button>
        `).join("");e.innerHTML=`
      <div style="position:relative">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:800;font-size:14px;color:#111827;">
              ${X("Quick questions")}
            </div>

            <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
              ${u}
            </div>

            ${n.privacyUrl?`<div style="margin-top:10px">
                    <a href="${K(n.privacyUrl)}" target="_blank" rel="noopener noreferrer"
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
    `;const a=e.querySelector("#nexus-close");a==null||a.addEventListener("click",()=>{$=!0,Q()}),e.querySelectorAll("button[data-sugg-index]").forEach(S=>{S.addEventListener("click",()=>{ee()})}),E(),!p&&!$&&requestAnimationFrame(()=>{e&&(e.style.opacity="1",e.style.transform="translateY(0)"),s&&(s.style.opacity="1")})}function E(){if(!t||!e||!s)return;const n=t.getBoundingClientRect(),r=12,d=12,c=window.innerHeight-n.top;e.style.bottom=`${c+r}px`,x==="bottom-right"?(e.style.right="20px",e.style.left=""):(e.style.left="20px",e.style.right="");const y=n.left+n.width/2;s.style.left=`${y-d/2}px`,s.style.bottom=`${c+(r-d/2)}px`,s.style.transform="rotate(45deg)";const u=e.getBoundingClientRect(),a=u.right-window.innerWidth,F=-u.left;if(a>0&&x==="bottom-right"){const S=parseFloat(getComputedStyle(e).right||"20");e.style.right=`${Math.max(12,S+a)}px`}else if(F>0&&x==="bottom-left"){const S=parseFloat(getComputedStyle(e).left||"20");e.style.left=`${Math.max(12,S+F)}px`}}function Q(){e&&(e.remove(),e=null),s&&(s.remove(),s=null)}function X(n){return n.replace(/[&<>"']/g,r=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[r])}function K(n){return n.replace(/"/g,"&quot;")}function Z(){!i||!t||(p=!0,e&&(e.style.display="none"),s&&(s.style.display="none"),i.style.display="block",setTimeout(()=>{i&&(i.style.opacity="1",i.style.transform="translateY(0)")},10),t.innerHTML=ne,T(),v(!0))}function W(){!i||!t||(p=!1,i.style.opacity="0",i.style.transform="translateY(10px)",setTimeout(()=>i&&(i.style.display="none"),300),t.innerHTML=O,T(),!$&&k&&e&&s&&(e.style.display="block",e.style.opacity="1",e.style.transform="translateY(0)",s.style.display="block",s.style.opacity="1",E(),v(!1)))}function ee(){Z(),setTimeout(()=>B({type:"nexus:open-chat"}),50)}function te(){try{z()}catch{}if(window.removeEventListener("message",G),window.removeEventListener("resize",E),window.removeEventListener("scroll",E),document.removeEventListener("visibilitychange",J),I)try{I()}catch{}if(I=null,g)try{clearTimeout(g)}catch{}g=null,_="",Q(),i&&(i.remove(),i=null,o=null),t&&(t.remove(),t=null),p=!1,H=!1,m="",C=!1,L=null,l=null,h=null,R=!1,k=!1,$=!1}function ge(n){te(),n.organizationId&&(b=n.organizationId),n.position&&(x=n.position),V()}window.NexusWidget={init:ge,show:Z,hide:W,destroy:te},V()})()})();
