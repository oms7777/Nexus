(function(){"use strict";const m={WIDGET_URL:"https://widget.inboundless.co",DEFAULT_POSITION:"bottom-right"},C=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
</svg>`,U=`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"></line>
  <line x1="6" y1="6" x2="18" y2="18"></line>
</svg>`;(function(){try{if(window.self!==window.top)return}catch{return}if(window.__NX_WIDGET_EMBED_LOADED__)return;window.__NX_WIDGET_EMBED_LOADED__=!0;let a=null,l=null,o=null,s=null,u=!1,w=!1,g="",T=!1,x=null,h=m.DEFAULT_POSITION,t=null,d=null,b=!1,c=!1;const L=document.currentScript;if(L)x=L.getAttribute("data-organization-id"),h=L.getAttribute("data-position")??m.DEFAULT_POSITION;else{const e=document.querySelectorAll('script[src*="widget"]'),n=Array.from(e).find(i=>i.hasAttribute("data-organization-id"));n&&(x=n.getAttribute("data-organization-id"),h=n.getAttribute("data-position")??m.DEFAULT_POSITION)}if(!x){console.error("Nexus Widget: data-organization-id attribute is required");return}function D(){document.readyState==="loading"?document.addEventListener("DOMContentLoaded",S,{once:!0}):S()}function S(){o=document.createElement("button"),o.id="nexus-widget-button",o.innerHTML=C;const e=h==="bottom-right"?"right: 20px;":"left: 20px;";o.style.cssText=`
      all: unset;
      position: fixed;
      ${e}
      bottom: 20px;
      width: 60px; height: 60px;
      border-radius: 9999px;
      background: ${(t==null?void 0:t.chatBubbleColor)||(t==null?void 0:t.primaryColor)||"#3b82f6"};
      color: ${(t==null?void 0:t.primaryTextColor)||"#ffffff"};
      cursor: pointer;
      z-index: 2147483000;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.20);
    `,o.addEventListener("click",()=>{u?$():j()}),document.body.appendChild(o),l=document.createElement("div"),l.id="nexus-widget-container",l.style.cssText=`
      position: fixed;
      ${e}
      bottom: 90px;
      width: 400px;
      height: 600px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 110px);
      z-index: 2147482999;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.15);
      display: none;
      background: #fff;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
    `,a=document.createElement("iframe"),a.src=G(),a.allow="microphone; clipboard-read; clipboard-write",a.style.cssText="width:100%;height:100%;border:none;",a.onload=()=>{w=!0,g=new URL(a.src).origin,_({type:"nexus:embed-ready"}),f()},l.appendChild(a),document.body.appendChild(l),window.addEventListener("message",B),window.addEventListener("pagehide",k,{once:!0}),window.addEventListener("beforeunload",k,{once:!0})}function G(){const e=new URLSearchParams;return e.append("organizationId",x),`${m.WIDGET_URL}?${e.toString()}`}function B(e){const{type:n,payload:i}=e.data||{};if(!(w&&g&&e.origin!==g))switch(n){case"close":$();break;case"resize":i!=null&&i.height&&l&&(l.style.height=`${i.height}px`);break;case"nexus:theme":{const r=i;t=(r==null?void 0:r.theme)||null,d=(r==null?void 0:r.brandLogoUrl)||null,f();break}case"nexus:suggestions":{const r=i;b=!0,t=r.theme||t||null,d=r.brandLogoUrl||d||null,f(),q(r);break}case"nexus:promo":{const r=i;b=!0,t=r.theme||t||null,d=r.brandLogoUrl||d||null,f(),V(r);break}}}function _(e){!w||!(a!=null&&a.contentWindow)||a.contentWindow.postMessage(e,g||"*")}function f(){if(!o)return;const e=(t==null?void 0:t.chatBubbleColor)||(t==null?void 0:t.primaryColor)||"#3b82f6",n=(t==null?void 0:t.primaryTextColor)||"#ffffff";if(o.style.background=e,o.style.color=n,u){o.innerHTML=U;return}if(d){const i=v(d);o.innerHTML=`
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
      `}else o.innerHTML=C}function q(e){if(!o||c)return;const n=e.theme||t||{},i=n.primaryColor||"#0ea5e9",r=n.nudgeBackgroundColor||"#ffffff";M(r);const I=(Array.isArray(e.suggestions)?e.suggestions.slice(0,3):[]).map(z=>`
          <button data-kind="open_chat"
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
            ${y(z)}
          </button>
        `).join("");s.innerHTML=`
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:14px;color:#111827;">
            ${y("Quick questions")}
          </div>
          <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;">
            ${I}
          </div>
          ${e.privacyUrl?`<div style="margin-top:10px">
                  <a href="${v(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                    style="color:#6b7280;font-size:11px;text-decoration:underline">
                    View our privacy policy.
                  </a>
                </div>`:""}
        </div>
        <button data-kind="close" title="Close"
          style="all:unset;width:20px;height:20px;display:flex;align-items:center;justify-content:center;
                 color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;">×</button>
      </div>
    `,O(),A()}function V(e){if(!o||c)return;const n=e.theme||t||{},i=n.primaryColor||"#0ea5e9",r=n.primaryTextColor||"#ffffff",W=n.secondaryColor||"#ffffff",I=n.secondaryTextColor||"#111827",z=n.nudgeBackgroundColor||"#ffffff";M(z);const J=e.title||"Discover the right solution for your business project.",Y=e.body||"Chat with our assistant or book a 15-min demo.",P=Array.isArray(e.ctaList)?e.ctaList:[],Z=(P.length>0?P.slice(0,3):[e.primaryCta||{kind:"open_chat",label:e.primary||"Chat with AI Assistant"},e.secondaryCta||{kind:"open_booking",label:e.secondary||"Book a meeting"}].filter(Boolean)).map((p,ee)=>{var R,F;const N=ee===0,te=N?i:W,ne=N?r:I,ie=N?"":"border:1px solid #e5e7eb;",oe=(F=(R=p.label)==null?void 0:R.trim())!=null&&F.length?p.label:X(p.kind);return`
          <button data-kind="${p.kind}" data-url="${p.url?v(p.url):""}"
            style="
              all:unset;
              width:100%;
              min-height:36px;
              padding:0 12px;
              border-radius:8px;
              background:${te};
              color:${ne};
              ${ie}
              cursor:pointer;
              font-weight:600;
              font-size:13px;
              display:inline-flex;
              align-items:center;
              justify-content:center;
              text-align:center;
              box-sizing:border-box;
            ">
            ${y(oe)}
          </button>
        `}).join("");s.innerHTML=`
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#111827;">
            ${y(J)}
          </div>
          <div style="margin-top:6px;color:#4b5563;font-size:14px;line-height:1.4;">
            ${y(Y)}
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
            ${Z}
          </div>

          ${e.privacyUrl?`<div style="margin-top:10px">
                  <a href="${v(e.privacyUrl)}" target="_blank" rel="noopener noreferrer"
                    style="color:#6b7280;font-size:11px;text-decoration:underline">
                    View our privacy policy.
                  </a>
                </div>`:""}
        </div>

        <button data-kind="close" title="Close"
          style="all:unset;width:20px;height:20px;display:flex;align-items:center;justify-content:center;
                 color:#9ca3af;cursor:pointer;font-size:16px;line-height:16px;">×</button>
      </div>
    `,O(),A()}function M(e){if(s)return;const n=h==="bottom-right"?"right: 20px;":"left: 20px;";s=document.createElement("div"),s.id="nexus-nudge",s.style.cssText=`
      all: unset;
      position: fixed;
      ${n}
      bottom: 92px;
      width: 340px;
      max-width: min(340px, calc(100vw - 96px));
      z-index: 2147483001;
      background: ${e};
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.12);
      padding: 12px;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica Neue, Arial;
      font-size: 14px;
      line-height: 1.4;
      display: none;
    `,document.body.appendChild(s)}function O(){if(!s)return;s.querySelectorAll("button[data-kind]").forEach(n=>{n.addEventListener("click",()=>{const i=n.getAttribute("data-kind")||"";if(i==="close"){c=!0,H();return}if(i==="open_chat")j();else if(i==="open_booking")K();else if(i==="open_url"){const r=n.getAttribute("data-url")||"";r&&window.open(r,"_blank","noopener,noreferrer")}})})}function A(){s&&b&&(c||u||(s.style.display="block"))}function H(){s&&(s.style.display="none")}function X(e){return e==="open_chat"?"Chat with AI Assistant":e==="open_booking"?"Book a meeting":"Open link"}function y(e){return e.replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n])}function v(e){return e.replace(/"/g,"&quot;")}function E(){!l||!o||(u=!0,H(),l.style.display="block",o.innerHTML=U,f())}function $(){!l||!o||(u=!1,l.style.display="none",o.innerHTML=C,f(),!c&&b&&A())}function j(){E(),setTimeout(()=>_({type:"nexus:open-chat"}),0)}function K(){E(),setTimeout(()=>_({type:"nexus:run-secondary-cta"}),0)}function k(){if(!T){T=!0;try{window.removeEventListener("message",B)}catch{}s&&(s.remove(),s=null),l&&(l.remove(),l=null,a=null),o&&(o.remove(),o=null),u=!1,w=!1,g="",t=null,d=null,b=!1,c=!1}}function Q(e){k(),T=!1,e.organizationId&&(x=e.organizationId),e.position&&(h=e.position),D()}window.NexusWidget={init:Q,show:E,hide:$,destroy:k},D()})()})();
