const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/App-N2bTcpOe.js","assets/react-core-C-3378df.js","assets/nativeWorkspaceTransfer-CZmvl2w3.js","assets/tauri-DLJJNSAo.js","assets/editor-BDa4AnIB.js","assets/App-DV-pNTNj.css"])))=>i.map(i=>d[i]);
import{R as ut,j as s,a as c,d as mt}from"./react-core-C-3378df.js";import{S as ft}from"./tauri-DLJJNSAo.js";(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const n of o.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&a(n)}).observe(document,{childList:!0,subtree:!0});function r(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function a(i){if(i.ep)return;i.ep=!0;const o=r(i);fetch(i.href,o)}})();const ht="modulepreload",pt=function(e){return"/"+e},_e={},oe=function(t,r,a){let i=Promise.resolve();if(r&&r.length>0){let n=function(u){return Promise.all(u.map(f=>Promise.resolve(f).then(m=>({status:"fulfilled",value:m}),m=>({status:"rejected",reason:m}))))};document.getElementsByTagName("link");const l=document.querySelector("meta[property=csp-nonce]"),d=(l==null?void 0:l.nonce)||(l==null?void 0:l.getAttribute("nonce"));i=n(r.map(u=>{if(u=pt(u),u in _e)return;_e[u]=!0;const f=u.endsWith(".css"),m=f?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${u}"]${m}`))return;const h=document.createElement("link");if(h.rel=f?"stylesheet":ht,f||(h.as="script"),h.crossOrigin="",h.href=u,d&&h.setAttribute("nonce",d),document.head.appendChild(h),f)return new Promise((g,k)=>{h.addEventListener("load",g),h.addEventListener("error",()=>k(new Error(`Unable to preload CSS for ${u}`)))})}))}function o(n){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=n,window.dispatchEvent(l),!l.defaultPrevented)throw n}return i.then(n=>{for(const l of n||[])l.status==="rejected"&&o(l.reason);return t().catch(o)})},gt=e=>e instanceof Error?e.message+`
`+e.stack:JSON.stringify(e,null,2);class xt extends ut.Component{constructor(t){super(t),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}render(){return this.state.hasError?s.jsxs("div",{className:"p-4 border border-red-500 rounded",children:[s.jsx("h2",{className:"text-red-500",children:"Something went wrong."}),s.jsx("pre",{className:"mt-2 text-sm",children:gt(this.state.error)})]}):this.props.children}}let yt={data:""},bt=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||yt},wt=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,vt=/\/\*[^]*?\*\/|  +/g,Ae=/\n+/g,T=(e,t)=>{let r="",a="",i="";for(let o in e){let n=e[o];o[0]=="@"?o[1]=="i"?r=o+" "+n+";":a+=o[1]=="f"?T(n,o):o+"{"+T(n,o[1]=="k"?"":t)+"}":typeof n=="object"?a+=T(n,t?t.replace(/([^,])+/g,l=>o.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,d=>/&/.test(d)?d.replace(/&/g,l):l?l+" "+d:d)):o):n!=null&&(o=/^--/.test(o)?o:o.replace(/[A-Z]/g,"-$&").toLowerCase(),i+=T.p?T.p(o,n):o+":"+n+";")}return r+(t&&i?t+"{"+i+"}":i)+a},C={},Re=e=>{if(typeof e=="object"){let t="";for(let r in e)t+=r+Re(e[r]);return t}return e},jt=(e,t,r,a,i)=>{let o=Re(e),n=C[o]||(C[o]=(d=>{let u=0,f=11;for(;u<d.length;)f=101*f+d.charCodeAt(u++)>>>0;return"go"+f})(o));if(!C[n]){let d=o!==e?e:(u=>{let f,m,h=[{}];for(;f=wt.exec(u.replace(vt,""));)f[4]?h.shift():f[3]?(m=f[3].replace(Ae," ").trim(),h.unshift(h[0][m]=h[0][m]||{})):h[0][f[1]]=f[2].replace(Ae," ").trim();return h[0]})(e);C[n]=T(i?{["@keyframes "+n]:d}:d,r?"":"."+n)}let l=r&&C.g?C.g:null;return r&&(C.g=C[n]),((d,u,f,m)=>{m?u.data=u.data.replace(m,d):u.data.indexOf(d)===-1&&(u.data=f?d+u.data:u.data+d)})(C[n],t,a,l),n},Nt=(e,t,r)=>e.reduce((a,i,o)=>{let n=t[o];if(n&&n.call){let l=n(r),d=l&&l.props&&l.props.className||/^go/.test(l)&&l;n=d?"."+d:l&&typeof l=="object"?l.props?"":T(l,""):l===!1?"":l}return a+i+(n??"")},"");function G(e){let t=this||{},r=e.call?e(t.p):e;return jt(r.unshift?r.raw?Nt(r,[].slice.call(arguments,1),t.p):r.reduce((a,i)=>Object.assign(a,i&&i.call?i(t.p):i),{}):r,bt(t.target),t.g,t.o,t.k)}let $e,le,ce;G.bind({g:1});let E=G.bind({k:1});function kt(e,t,r,a){T.p=t,$e=e,le=r,ce=a}function O(e,t){let r=this||{};return function(){let a=arguments;function i(o,n){let l=Object.assign({},o),d=l.className||i.className;r.p=Object.assign({theme:le&&le()},l),r.o=/ *go\d+/.test(d),l.className=G.apply(r,a)+(d?" "+d:"");let u=e;return e[0]&&(u=l.as||e,delete l.as),ce&&u[0]&&ce(l),$e(u,l)}return i}}var St=e=>typeof e=="function",H=(e,t)=>St(e)?e(t):e,Ct=(()=>{let e=0;return()=>(++e).toString()})(),Ue=(()=>{let e;return()=>{if(e===void 0&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");e=!t||t.matches}return e}})(),Et=20,de="default",Me=(e,t)=>{let{toastLimit:r}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,r)};case 1:return{...e,toasts:e.toasts.map(n=>n.id===t.toast.id?{...n,...t.toast}:n)};case 2:let{toast:a}=t;return Me(e,{type:e.toasts.find(n=>n.id===a.id)?1:0,toast:a});case 3:let{toastId:i}=t;return{...e,toasts:e.toasts.map(n=>n.id===i||i===void 0?{...n,dismissed:!0,visible:!1}:n)};case 4:return t.toastId===void 0?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(n=>n.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let o=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(n=>({...n,pauseDuration:n.pauseDuration+o}))}}},V=[],ze={toasts:[],pausedAt:void 0,settings:{toastLimit:Et}},S={},De=(e,t=de)=>{S[t]=Me(S[t]||ze,e),V.forEach(([r,a])=>{r===t&&a(S[t])})},Fe=e=>Object.keys(S).forEach(t=>De(e,t)),_t=e=>Object.keys(S).find(t=>S[t].toasts.some(r=>r.id===e)),Z=(e=de)=>t=>{De(t,e)},At={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},Tt=(e={},t=de)=>{let[r,a]=c.useState(S[t]||ze),i=c.useRef(S[t]);c.useEffect(()=>(i.current!==S[t]&&a(S[t]),V.push([t,a]),()=>{let n=V.findIndex(([l])=>l===t);n>-1&&V.splice(n,1)}),[t]);let o=r.toasts.map(n=>{var l,d,u;return{...e,...e[n.type],...n,removeDelay:n.removeDelay||((l=e[n.type])==null?void 0:l.removeDelay)||(e==null?void 0:e.removeDelay),duration:n.duration||((d=e[n.type])==null?void 0:d.duration)||(e==null?void 0:e.duration)||At[n.type],style:{...e.style,...(u=e[n.type])==null?void 0:u.style,...n.style}}});return{...r,toasts:o}},Ot=(e,t="blank",r)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...r,id:(r==null?void 0:r.id)||Ct()}),F=e=>(t,r)=>{let a=Ot(t,e,r);return Z(a.toasterId||_t(a.id))({type:2,toast:a}),a.id},y=(e,t)=>F("blank")(e,t);y.error=F("error");y.success=F("success");y.loading=F("loading");y.custom=F("custom");y.dismiss=(e,t)=>{let r={type:3,toastId:e};t?Z(t)(r):Fe(r)};y.dismissAll=e=>y.dismiss(void 0,e);y.remove=(e,t)=>{let r={type:4,toastId:e};t?Z(t)(r):Fe(r)};y.removeAll=e=>y.remove(void 0,e);y.promise=(e,t,r)=>{let a=y.loading(t.loading,{...r,...r==null?void 0:r.loading});return typeof e=="function"&&(e=e()),e.then(i=>{let o=t.success?H(t.success,i):void 0;return o?y.success(o,{id:a,...r,...r==null?void 0:r.success}):y.dismiss(a),i}).catch(i=>{let o=t.error?H(t.error,i):void 0;o?y.error(o,{id:a,...r,...r==null?void 0:r.error}):y.dismiss(a)}),e};var Lt=1e3,Pt=(e,t="default")=>{let{toasts:r,pausedAt:a}=Tt(e,t),i=c.useRef(new Map).current,o=c.useCallback((m,h=Lt)=>{if(i.has(m))return;let g=setTimeout(()=>{i.delete(m),n({type:4,toastId:m})},h);i.set(m,g)},[]);c.useEffect(()=>{if(a)return;let m=Date.now(),h=r.map(g=>{if(g.duration===1/0)return;let k=(g.duration||0)+g.pauseDuration-(m-g.createdAt);if(k<0){g.visible&&y.dismiss(g.id);return}return setTimeout(()=>y.dismiss(g.id,t),k)});return()=>{h.forEach(g=>g&&clearTimeout(g))}},[r,a,t]);let n=c.useCallback(Z(t),[t]),l=c.useCallback(()=>{n({type:5,time:Date.now()})},[n]),d=c.useCallback((m,h)=>{n({type:1,toast:{id:m,height:h}})},[n]),u=c.useCallback(()=>{a&&n({type:6,time:Date.now()})},[a,n]),f=c.useCallback((m,h)=>{let{reverseOrder:g=!1,gutter:k=8,defaultPosition:L}=h||{},N=r.filter(w=>(w.position||L)===(m.position||L)&&w.height),B=N.findIndex(w=>w.id===m.id),$=N.filter((w,I)=>I<B&&w.visible).length;return N.filter(w=>w.visible).slice(...g?[$+1]:[0,$]).reduce((w,I)=>w+(I.height||0)+k,0)},[r]);return c.useEffect(()=>{r.forEach(m=>{if(m.dismissed)o(m.id,m.removeDelay);else{let h=i.get(m.id);h&&(clearTimeout(h),i.delete(m.id))}})},[r,o]),{toasts:r,handlers:{updateHeight:d,startPause:l,endPause:u,calculateOffset:f}}},It=E`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,Rt=E`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,$t=E`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,Ut=O("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${It} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${Rt} 0.15s ease-out forwards;
    animation-delay: 150ms;
    position: absolute;
    border-radius: 3px;
    opacity: 0;
    background: ${e=>e.secondary||"#fff"};
    bottom: 9px;
    left: 4px;
    height: 2px;
    width: 12px;
  }

  &:before {
    animation: ${$t} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,Mt=E`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,zt=O("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${Mt} 1s linear infinite;
`,Dt=E`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,Ft=E`
0% {
	height: 0;
	width: 0;
	opacity: 0;
}
40% {
  height: 0;
	width: 6px;
	opacity: 1;
}
100% {
  opacity: 1;
  height: 10px;
}`,Bt=O("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${Dt} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${Ft} 0.2s ease-out forwards;
    opacity: 0;
    animation-delay: 200ms;
    position: absolute;
    border-right: 2px solid;
    border-bottom: 2px solid;
    border-color: ${e=>e.secondary||"#fff"};
    bottom: 6px;
    left: 6px;
    height: 10px;
    width: 6px;
  }
`,qt=O("div")`
  position: absolute;
`,Wt=O("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,Vt=E`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,Ht=O("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${Vt} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,Jt=({toast:e})=>{let{icon:t,type:r,iconTheme:a}=e;return t!==void 0?typeof t=="string"?c.createElement(Ht,null,t):t:r==="blank"?null:c.createElement(Wt,null,c.createElement(zt,{...a}),r!=="loading"&&c.createElement(qt,null,r==="error"?c.createElement(Ut,{...a}):c.createElement(Bt,{...a})))},Kt=e=>`
0% {transform: translate3d(0,${e*-200}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,Yt=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${e*-150}%,-1px) scale(.6); opacity:0;}
`,Gt="0%{opacity:0;} 100%{opacity:1;}",Zt="0%{opacity:1;} 100%{opacity:0;}",Qt=O("div")`
  display: flex;
  align-items: center;
  background: #fff;
  color: #363636;
  line-height: 1.3;
  will-change: transform;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.1), 0 3px 3px rgba(0, 0, 0, 0.05);
  max-width: 350px;
  pointer-events: auto;
  padding: 8px 10px;
  border-radius: 8px;
`,Xt=O("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,es=(e,t)=>{let r=e.includes("top")?1:-1,[a,i]=Ue()?[Gt,Zt]:[Kt(r),Yt(r)];return{animation:t?`${E(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${E(i)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},ts=c.memo(({toast:e,position:t,style:r,children:a})=>{let i=e.height?es(e.position||t||"top-center",e.visible):{opacity:0},o=c.createElement(Jt,{toast:e}),n=c.createElement(Xt,{...e.ariaProps},H(e.message,e));return c.createElement(Qt,{className:e.className,style:{...i,...r,...e.style}},typeof a=="function"?a({icon:o,message:n}):c.createElement(c.Fragment,null,o,n))});kt(c.createElement);var ss=({id:e,className:t,style:r,onHeightUpdate:a,children:i})=>{let o=c.useCallback(n=>{if(n){let l=()=>{let d=n.getBoundingClientRect().height;a(e,d)};l(),new MutationObserver(l).observe(n,{subtree:!0,childList:!0,characterData:!0})}},[e,a]);return c.createElement("div",{ref:o,className:t,style:r},i)},rs=(e,t)=>{let r=e.includes("top"),a=r?{top:0}:{bottom:0},i=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:Ue()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(r?1:-1)}px)`,...a,...i}},as=G`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,q=16,ns=({reverseOrder:e,position:t="top-center",toastOptions:r,gutter:a,children:i,toasterId:o,containerStyle:n,containerClassName:l})=>{let{toasts:d,handlers:u}=Pt(r,o);return c.createElement("div",{"data-rht-toaster":o||"",style:{position:"fixed",zIndex:9999,top:q,left:q,right:q,bottom:q,pointerEvents:"none",...n},className:l,onMouseEnter:u.startPause,onMouseLeave:u.endPause},d.map(f=>{let m=f.position||t,h=u.calculateOffset(f,{reverseOrder:e,gutter:a,defaultPosition:t}),g=rs(m,h);return c.createElement(ss,{id:f.id,key:f.id,onHeightUpdate:u.updateHeight,className:f.visible?as:"",style:g},f.type==="custom"?H(f.message,f):i?i(f):c.createElement(ts,{toast:f,position:m}))}))},M=y;const ue="https://notes.binapp.top";function me(){return typeof window>"u"?void 0:window}function _(){const e=me();return!!(e!=null&&e.__TAURI_INTERNALS__||e!=null&&e.__TAURI__)}function Be(){var t,r;if(!_())return!1;const e=(r=(t=me())==null?void 0:t.location)==null?void 0:r.origin;return e==="tauri://localhost"||e==="http://tauri.localhost"||e==="https://tauri.localhost"}function qe(e){const t=String(e||"").trim();if(!t||t.startsWith("//")||t.includes("\\")||/^[a-z][a-z\d+.-]*:/i.test(t))throw new TypeError("Expected a relative application path");return t.startsWith("/")?t:`/${t}`}function is(){var t,r;const e=(r=(t=me())==null?void 0:t.location)==null?void 0:r.origin;return e&&e!=="null"?e:ue}function A(e){const t=_()?ue:is();return new URL(qe(e),t).toString()}function $s(e){return A(e)}function Us(e){return new URL(qe(e),ue).toString()}const os="auth-session.json",fe="session",We="notesapp_token",Ve="notesapp_user";let W=null,J=Promise.resolve();function he(e){const t=e;return!(t!=null&&t.id)||!(t!=null&&t.email)?null:{id:t.id,email:t.email,display_name:t.display_name||t.email.split("@")[0]}}function He(e){const t=e,r=he(t==null?void 0:t.user);return r?{version:1,accessToken:typeof(t==null?void 0:t.accessToken)=="string"&&t.accessToken?t.accessToken:null,user:r,updatedAt:typeof(t==null?void 0:t.updatedAt)=="string"?t.updatedAt:new Date().toISOString()}:null}async function pe(){return _()?(W||(W=ft.load(os,{autoSave:!1,defaults:{}}).catch(e=>(W=null,console.warn("[NativeAuth] 打开原生会话桥失败:",e),null))),W):null}function Je(e){const t=J.catch(()=>{}).then(e);return J=t,t}function Ke(e){const t=He(e);if(!t||typeof localStorage>"u")return!1;try{return t.accessToken&&localStorage.setItem(We,t.accessToken),localStorage.setItem(Ve,JSON.stringify(t.user)),!0}catch{return!1}}async function Q(e,t){const r=he(t);if(!r||!_())return!1;const a={version:1,accessToken:e||null,user:r,updatedAt:new Date().toISOString()};return Je(async()=>{const i=await pe();return i?(await i.set(fe,a),await i.save(),!0):!1})}async function ge(){await J.catch(()=>{});const e=await pe();return e?He(await e.get(fe)):null}async function Ye(){const e=await ge();return e!=null&&e.accessToken?Q(null,e.user):!!e}async function Ge(){return _()?Je(async()=>{const e=await pe();return e?(await e.delete(fe),await e.save(),!0):!1}):!1}function xe(e,t){!_()||!(t!=null&&t.id)||!(t!=null&&t.email)||Q(e,t)}function Ze(){_()&&Ge()}async function ls(){await J.catch(()=>{})}async function cs(){if(!_())return null;const e=await ge().catch(()=>null);if(e&&Ke(e),Be())return e!=null&&e.accessToken&&await Ye(),e;try{const t=localStorage.getItem(We),r=he(JSON.parse(localStorage.getItem(Ve)||"null"));r&&await Q(t,r)}catch{}return e}const ds=Object.freeze(Object.defineProperty({__proto__:null,applyNativeAuthSessionToWebStorage:Ke,clearNativeAuthBridge:Ge,consumeNativeAuthBridgeToken:Ye,flushNativeAuthBridgeWrites:ls,hydrateAuthSessionFromNativeBridge:cs,persistNativeAuthBridge:Q,readNativeAuthBridge:ge,scheduleNativeAuthBridgeClear:Ze,scheduleNativeAuthBridgeWrite:xe},Symbol.toStringTag,{value:"Module"})),K="notesapp_token",ye="notesapp_user";let P=null;function us(){if(typeof window>"u")return!1;const e=window;return!!(e.__TAURI_INTERNALS__||e.__TAURI__)}function ms(){if(typeof window>"u")return!1;if(us())return!0;try{return localStorage.getItem("notesapp_force_local_token")==="1"}catch{return!1}}function be(){try{return localStorage.getItem(K)||""}catch{return""}}function we(e){const t=(e==null?void 0:e.access_token)||"";try{t&&ms()?localStorage.setItem(K,t):localStorage.removeItem(K)}catch{}xe(t,Y())}function X(e){e!=null&&e.id&&(e!=null&&e.email)&&(P={id:e.id,email:e.email,display_name:e.display_name||e.email.split("@")[0]});try{e!=null&&e.id&&(e!=null&&e.email)&&localStorage.setItem(ye,JSON.stringify(P))}catch{}xe(be(),P)}function Y(){try{const e=localStorage.getItem(ye);if(!e)return P;const t=JSON.parse(e);return!(t!=null&&t.id)||!(t!=null&&t.email)?P:{id:t.id,email:t.email,display_name:t.display_name||t.email.split("@")[0]}}catch{return P}}function Qe(){P=null;try{localStorage.removeItem(K),localStorage.removeItem(ye)}catch{}Ze()}function ee(e=!1){const t=be();return{...e?{"Content-Type":"application/json"}:{},...t?{Authorization:`Bearer ${t}`}:{}}}function te(e,t={},r=!1){return fetch(e,{...t,credentials:"include",headers:{...ee(r),...t.headers||{}}})}async function Te(e,t){const r=await te(A("/api/auth/v1/token"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t,grant_type:"password"})});if(!r.ok){const i=await r.json().catch(()=>({}));throw new Error(i.error||"账号或密码错误")}const a=await r.json();return we(a),X(a.user),a}async function fs(e,t,r,a){const i=await te(A("/api/auth/v1/token"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t,grant_type:"signup",display_name:r,verifyToken:a})});if(!i.ok){const n=await i.json().catch(()=>({}));throw new Error(n.error||"注册失败")}const o=await i.json();return we(o),X(o.user),o}async function Ms(){const e=await te(A("/api/auth/v1/refresh"),{method:"POST",headers:ee(!0)}),t=await e.json().catch(()=>({}));if(!e.ok)throw new Error(t.error||"登录续期失败");return we(t),X(t.user),t}async function hs(e,t){const r=await fetch(A("/api/send-code"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,purpose:t})}),a=await r.json().catch(()=>({}));if(!r.ok)throw new Error(a.error||"发送验证码失败");return a}async function ps(e,t,r){const a=await fetch(A("/api/verify-code"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,code:t,purpose:r})}),i=await a.json().catch(()=>({}));if(!a.ok)throw new Error(i.error||"验证码验证失败");return i}async function gs(e,t,r){const a=await fetch(A("/api/reset-password"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,newPassword:t,verifyToken:r})}),i=await a.json().catch(()=>({}));if(!a.ok)throw new Error(i.error||"重置密码失败");return i}async function zs(){await te(A("/api/auth/v1/logout"),{method:"POST",headers:ee(!0),body:JSON.stringify({})}).catch(()=>{}),Qe(),window.location.reload()}function xs(e){try{const t=e.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"),r=decodeURIComponent(atob(t).split("").map(a=>"%"+("00"+a.charCodeAt(0).toString(16)).slice(-2)).join(""));return JSON.parse(r)}catch{return null}}function Ds(){var t;const e=be();if(e){const r=xs(e);if(r!=null&&r.sub)return r.sub}return((t=Y())==null?void 0:t.id)||null}async function ys(){let e;try{e=await fetch(A("/api/auth/v1/me"),{method:"GET",credentials:"include",headers:ee(!1)})}catch{return null}if(!e.ok)return(e.status===401||e.status===403)&&Qe(),null;const t=await e.json().catch(()=>null);if(!(t!=null&&t.id)||!(t!=null&&t.email))return null;const r=t.display_name||t.email.split("@")[0];return X({id:t.id,email:t.email,display_name:r}),{id:t.id,email:t.email,display_name:r,user_metadata:{display_name:r}}}const Xe=c.createContext({user:null,loading:!0}),bs=()=>c.useContext(Xe);function ws({children:e}){const t=Y(),[r,a]=c.useState(t),[i,o]=c.useState(!t);return c.useEffect(()=>{let n=!1;async function l(){try{const d=await ys();if(n)return;if(d){a(d);return}const u=Y();a(u||null)}finally{n||o(!1)}}return l(),()=>{n=!0}},[]),s.jsx(Xe.Provider,{value:{user:r,loading:i},children:e})}/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var vs={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const js=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const j=(e,t)=>{const r=c.forwardRef(({color:a="currentColor",size:i=24,strokeWidth:o=2,absoluteStrokeWidth:n,className:l="",children:d,...u},f)=>c.createElement("svg",{ref:f,...vs,width:i,height:i,stroke:a,strokeWidth:n?Number(o)*24/Number(i):o,className:["lucide",`lucide-${js(e)}`,l].join(" "),...u},[...t.map(([m,h])=>c.createElement(m,h)),...Array.isArray(d)?d:[d]]));return r.displayName=`${e}`,r};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ns=j("CircleAlert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const re=j("CircleCheckBig",[["path",{d:"M22 11.08V12a10 10 0 1 1-5.93-9.14",key:"g774vq"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=j("Database",[["ellipse",{cx:"12",cy:"5",rx:"9",ry:"3",key:"msslwz"}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5",key:"1wlel7"}],["path",{d:"M3 12A9 3 0 0 0 21 12",key:"mv7ke4"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ae=j("EyeOff",[["path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24",key:"1jxqfv"}],["path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",key:"9wicm4"}],["path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",key:"1jreej"}],["line",{x1:"2",x2:"22",y1:"2",y2:"22",key:"a6p6uj"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=j("Eye",[["path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",key:"rwhkz3"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ks=j("Key",[["circle",{cx:"7.5",cy:"15.5",r:"5.5",key:"yqb3hr"}],["path",{d:"m21 2-9.6 9.6",key:"1j0ho8"}],["path",{d:"m15.5 7.5 3 3L22 7l-3-3",key:"1rn1fs"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=j("LoaderCircle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const z=j("Lock",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=j("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ss=j("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=j("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Cs=j("User",[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Es=j("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]);function _s({message:e,onClose:t}){return s.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-[1001]",children:s.jsxs("div",{className:"bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden",children:[s.jsxs("div",{className:"bg-red-500 px-6 py-4 flex items-center gap-3",children:[s.jsx(Ns,{className:"w-6 h-6 text-white"}),s.jsx("span",{className:"text-white font-medium",children:"出错了"})]}),s.jsxs("div",{className:"p-6",children:[s.jsx("p",{className:"text-gray-700 mb-6",children:e}),s.jsx("button",{onClick:t,className:"w-full py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-all",children:"确定"})]})]})})}function D(e,t){const r=e instanceof Error?e.message:String((e==null?void 0:e.message)||"");return/load failed|failed to fetch|networkerror|network request failed/i.test(r)?"无法连接服务器，请检查网络后重试":r||t}function As({isOpen:e,onClose:t,onSuccess:r}){const[a,i]=c.useState("login"),[o,n]=c.useState(""),[l,d]=c.useState(""),[u,f]=c.useState(""),[m,h]=c.useState(""),[g,k]=c.useState(!1),[L,N]=c.useState(!1),[B,$]=c.useState(""),[w,I]=c.useState(""),[v,ve]=c.useState(""),[je,Ne]=c.useState(!1),[R,se]=c.useState(0),[ke,Se]=c.useState(!1);if(c.useEffect(()=>{if(R<=0)return;const p=setTimeout(()=>se(R-1),1e3);return()=>clearTimeout(p)},[R]),!e)return null;const b=p=>$(p),tt=()=>$(""),st=async p=>{const x=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!o){b("请输入邮箱地址");return}if(!x.test(o)){b("请输入有效的邮箱地址");return}Se(!0);try{await hs(o,p),Ne(!0),se(60),M.success("验证码已发送到您的邮箱")}catch(dt){b(D(dt,"发送验证码失败"))}finally{Se(!1)}},rt=async p=>{if(!w){b("请输入验证码");return}if(w.length!==6){b("请输入6位验证码");return}N(!0);try{const x=await ps(o,w,p);ve(x.verifyToken),M.success("邮箱验证成功")}catch(x){b(D(x,"验证码错误"))}finally{N(!1)}},at=async()=>{if(!o||!l){b("请填写邮箱和密码");return}N(!0);try{await Te(o,l),M.success("登录成功"),r==null||r(),t(),setTimeout(()=>window.location.reload(),300)}catch(p){let x=D(p,"登录失败，请检查邮箱和密码");x==="Invalid credentials"&&(x="邮箱或密码错误"),x==="No local password"&&(x='该账号尚未设置本地密码，请点击"忘记密码"通过邮箱验证设置新密码后登录'),b(x)}finally{N(!1)}},nt=async()=>{if(!v){b("请先完成邮箱验证");return}if(!m){b("请输入昵称");return}if(l.length<6){b("密码至少需要6位");return}if(l!==u){b("两次输入的密码不一致");return}N(!0);try{await fs(o,l,m,v),await Te(o,l),M.success("注册成功"),U(),r==null||r(),t(),setTimeout(()=>window.location.reload(),300)}catch(p){let x=D(p,"注册失败，请重试");(x.includes("already exists")||x.includes("already registered"))&&(x="该邮箱已注册"),b(x)}finally{N(!1)}},it=async()=>{if(!v){b("请先完成邮箱验证");return}if(l.length<6){b("密码至少需要6位");return}if(l!==u){b("两次输入的密码不一致");return}N(!0);try{await gs(o,l,v),M.success("密码重置成功，请使用新密码登录"),U(),i("login")}catch(p){b(D(p,"密码重置失败"))}finally{N(!1)}},U=()=>{n(""),d(""),f(""),h(""),I(""),ve(""),Ne(!1),se(0)},Ce=()=>{i("login"),U()},ot=()=>{i("register"),U()},lt=()=>{i("forgot-password"),U()},ct=p=>{p.preventDefault(),a==="login"?at():a==="register"?nt():it()},Ee=p=>s.jsxs("div",{className:"space-y-3",children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"邮箱"}),s.jsxs("div",{className:"flex gap-2",children:[s.jsxs("div",{className:"relative flex-1",children:[s.jsx(Le,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"email",value:o,onChange:x=>n(x.target.value),placeholder:"your@email.com",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",disabled:!!v,required:!0})]}),s.jsx("button",{type:"button",onClick:()=>st(p),disabled:ke||R>0||!!v,className:"px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5",children:ke?s.jsxs(s.Fragment,{children:[s.jsx(ie,{className:"w-3.5 h-3.5 animate-spin"})," 发送中"]}):v?s.jsxs(s.Fragment,{children:[s.jsx(re,{className:"w-3.5 h-3.5"})," 已验证"]}):R>0?`${R}s`:je?s.jsxs(s.Fragment,{children:[s.jsx(Ss,{className:"w-3.5 h-3.5"})," 重新发送"]}):"发送验证码"})]})]}),!v&&je&&s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"验证码"}),s.jsxs("div",{className:"flex gap-2",children:[s.jsxs("div",{className:"relative flex-1",children:[s.jsx(ks,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"text",value:w,onChange:x=>I(x.target.value.replace(/\D/g,"").slice(0,6)),placeholder:"输入6位数字验证码",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all tracking-widest text-center font-mono text-lg",maxLength:6,required:!0})]}),s.jsx("button",{type:"button",onClick:()=>rt(p),disabled:w.length!==6||L,className:"px-4 py-2.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed",children:L?s.jsx(ie,{className:"w-3.5 h-3.5 animate-spin"}):"验证"})]}),s.jsxs("p",{className:"text-xs text-gray-400 mt-1.5",children:["验证码已发送到 ",o,"，请查收（可能在垃圾邮件中）"]})]}),v&&s.jsxs("div",{className:"bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2",children:[s.jsx(re,{className:"w-5 h-5 text-green-500 flex-shrink-0"}),s.jsx("span",{className:"text-sm text-green-700 font-medium",children:"邮箱验证成功"})]})]});return s.jsxs("div",{className:"fixed inset-0 z-[1000] overflow-y-auto bg-black/50 p-4 md:p-6",children:[s.jsx("div",{className:"flex min-h-full items-center justify-center",children:s.jsxs("div",{"data-auth-modal":"panel",role:"dialog","aria-modal":"true","aria-labelledby":"auth-modal-title",className:"relative grid w-full max-w-[880px] overflow-hidden rounded-lg bg-white shadow-2xl md:grid-cols-[300px_minmax(0,1fr)]",children:[s.jsxs("aside",{className:"hidden min-h-[500px] flex-col justify-between bg-gradient-to-br from-blue-500 to-indigo-600 p-8 text-white md:flex",children:[s.jsxs("div",{children:[s.jsx("div",{className:"mb-7 flex h-11 w-11 items-center justify-center rounded-lg bg-white/15",children:s.jsx(Oe,{className:"h-6 w-6"})}),s.jsx("p",{className:"text-sm font-medium text-blue-100",children:"彩云笔记"}),s.jsx("h2",{className:"mt-2 text-2xl font-bold",children:a==="login"?"欢迎回来":a==="register"?"创建您的账号":"找回账号访问权"}),s.jsx("p",{className:"mt-3 text-sm leading-6 text-blue-100",children:a==="login"?"登录后继续同步您的笔记和工作区。":a==="register"?"完成邮箱验证后即可开始使用。":"通过已验证邮箱安全地重置密码。"})]}),s.jsxs("div",{className:"space-y-5 border-t border-white/20 pt-6 text-sm",children:[s.jsxs("div",{className:"flex gap-3",children:[s.jsx(Oe,{className:"mt-0.5 h-5 w-5 flex-none text-emerald-300"}),s.jsxs("div",{children:[s.jsx("p",{className:"font-medium",children:"独立数据库"}),s.jsx("p",{className:"mt-1 leading-5 text-blue-100",children:"笔记数据存储在自建 PostgreSQL 服务。"})]})]}),s.jsxs("div",{className:"flex gap-3",children:[s.jsx(Pe,{className:"mt-0.5 h-5 w-5 flex-none text-emerald-300"}),s.jsxs("div",{children:[s.jsx("p",{className:"font-medium",children:"密码加密存储"}),s.jsx("p",{className:"mt-1 leading-5 text-blue-100",children:"账号凭据不会以明文保存。"})]})]})]})]}),s.jsxs("section",{className:"relative min-w-0 px-5 py-5 sm:px-7 md:px-9 md:py-7",children:[s.jsxs("div",{className:"mb-5 flex items-start justify-between gap-4",children:[s.jsxs("div",{children:[s.jsx("h2",{id:"auth-modal-title",className:"text-xl font-bold text-gray-900",children:a==="login"?"欢迎回来":a==="register"?"注册账号":"重置密码"}),s.jsx("p",{className:"mt-1 text-sm text-gray-500",children:a==="login"?"登录以同步您的笔记":a==="register"?"创建账号开始使用":"通过邮箱验证重置密码"})]}),s.jsx("button",{type:"button",onClick:t,"aria-label":"关闭",className:"rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700",children:s.jsx(Es,{className:"w-5 h-5"})})]}),s.jsxs("form",{onSubmit:ct,className:"space-y-4",children:[a==="register"&&s.jsxs(s.Fragment,{children:[v&&s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"昵称"}),s.jsxs("div",{className:"relative",children:[s.jsx(Cs,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"text",value:m,onChange:p=>h(p.target.value),placeholder:"输入您的昵称",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0})]})]}),Ee("register"),v&&s.jsxs(s.Fragment,{children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(z,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:g?"text":"password",value:l,onChange:p=>d(p.target.value),placeholder:"设置登录密码（至少6位）",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),s.jsx("button",{type:"button",onClick:()=>k(!g),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:g?s.jsx(ae,{className:"w-4 h-4"}):s.jsx(ne,{className:"w-4 h-4"})})]})]}),s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"确认密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(z,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:g?"text":"password",value:u,onChange:p=>f(p.target.value),placeholder:"再次输入密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",minLength:6})]})]})]}),s.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-3",children:s.jsxs("div",{className:"flex items-start gap-2",children:[s.jsx(Pe,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),s.jsxs("div",{className:"text-sm text-blue-700",children:[s.jsx("p",{className:"font-medium mb-1",children:"邮箱验证注册"}),s.jsx("p",{className:"text-blue-600",children:"验证邮箱后即可注册使用，确保账号安全。"})]})]})})]}),a==="forgot-password"&&s.jsxs(s.Fragment,{children:[Ee("reset-password"),v&&s.jsxs(s.Fragment,{children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"新密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(z,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:g?"text":"password",value:l,onChange:p=>d(p.target.value),placeholder:"设置新密码（至少6位）",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),s.jsx("button",{type:"button",onClick:()=>k(!g),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:g?s.jsx(ae,{className:"w-4 h-4"}):s.jsx(ne,{className:"w-4 h-4"})})]})]}),s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"确认新密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(z,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:g?"text":"password",value:u,onChange:p=>f(p.target.value),placeholder:"再次输入新密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",minLength:6})]})]})]})]}),a==="login"&&s.jsxs(s.Fragment,{children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"邮箱"}),s.jsxs("div",{className:"relative",children:[s.jsx(Le,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"email",value:o,onChange:p=>n(p.target.value),placeholder:"your@email.com",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0})]})]}),s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(z,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:g?"text":"password",value:l,onChange:p=>d(p.target.value),placeholder:"输入密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),s.jsx("button",{type:"button",onClick:()=>k(!g),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:g?s.jsx(ae,{className:"w-4 h-4"}):s.jsx(ne,{className:"w-4 h-4"})})]})]}),s.jsx("div",{className:"text-right",children:s.jsx("button",{type:"button",onClick:lt,className:"text-sm text-blue-500 hover:text-blue-600",children:"忘记密码？"})})]}),s.jsx("button",{type:"submit",disabled:L||a!=="login"&&!v,className:"w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4",children:L?s.jsxs(s.Fragment,{children:[s.jsx(ie,{className:"w-4 h-4 animate-spin"}),a==="login"?"登录中...":a==="register"?"注册中...":"重置中..."]}):s.jsxs(s.Fragment,{children:[s.jsx(re,{className:"w-4 h-4"}),a==="login"?"登录":a==="register"?"注册":"重置密码"]})}),s.jsxs("div",{className:"text-center pt-2 flex items-center justify-center gap-3",children:[a==="login"&&s.jsx("button",{type:"button",onClick:ot,className:"text-sm text-blue-500 hover:text-blue-600",children:"还没有账号？立即注册"}),a==="register"&&s.jsx("button",{type:"button",onClick:Ce,className:"text-sm text-gray-500 hover:text-gray-700",children:"已有账号？立即登录"}),a==="forgot-password"&&s.jsx("button",{type:"button",onClick:Ce,className:"text-sm text-gray-500 hover:text-gray-700",children:"返回登录"})]}),s.jsx("div",{className:"mt-4 border-t border-gray-100 pt-4 text-center",children:s.jsx("p",{className:"text-xs text-gray-400",children:"献给热爱知识管理的你——彬"})})]})]})]})}),B&&s.jsx(_s,{message:B,onClose:tt})]})}const et="/assets/logo-Cw1I6IdG.png",Ts=c.lazy(()=>oe(()=>import("./App-N2bTcpOe.js").then(e=>e.ag),__vite__mapDeps([0,1,2,3,4,5])));function Ie({status:e}){return s.jsx("div",{className:"flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100",children:s.jsxs("div",{className:"w-72 text-center",children:[s.jsx("img",{src:et,alt:"彩云笔记",className:"mx-auto mb-4 h-24 w-24 object-contain"}),s.jsx("div",{className:"mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200",children:s.jsx("div",{className:"h-full w-2/3 animate-pulse rounded-full bg-blue-500"})}),s.jsx("p",{className:"text-sm text-gray-500",children:e})]})})}function Os(){const{user:e,loading:t}=bs(),[r,a]=c.useState(!1);return t?s.jsx(Ie,{status:"正在验证登录状态"}):e?s.jsx(c.Suspense,{fallback:s.jsx(Ie,{status:"正在载入本地工作区"}),children:s.jsx(Ts,{})}):s.jsxs("div",{className:"flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100",children:[s.jsxs("div",{className:"mx-auto max-w-md px-6 text-center",children:[s.jsx("div",{className:"mx-auto mb-6 flex h-24 w-24 items-center justify-center",children:s.jsx("img",{src:et,alt:"彩云笔记",className:"h-full w-full object-contain"})}),s.jsx("h1",{className:"mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent",children:"彩云笔记"}),s.jsx("p",{className:"mb-8 text-gray-600",children:"安全可靠的云端笔记应用，让记录更轻松"}),s.jsx("button",{onClick:()=>a(!0),className:"rounded-lg bg-blue-500 px-8 py-3 font-medium text-white shadow-sm transition-colors hover:bg-blue-600",children:"登录 / 注册"}),s.jsx("p",{className:"mt-8 text-sm text-gray-400",children:"献给热爱知识管理的你——彬"})]}),s.jsx(As,{isOpen:r,onClose:()=>a(!1)}),s.jsx(ns,{position:"bottom-center"})]})}function Ls(){return s.jsx(ws,{children:s.jsx(Os,{})})}async function Ps(){if(_()){const{hydrateAuthSessionFromNativeBridge:e}=await oe(async()=>{const{hydrateAuthSessionFromNativeBridge:r}=await Promise.resolve().then(()=>ds);return{hydrateAuthSessionFromNativeBridge:r}},void 0),t=await e();if(t!=null&&t.user.id&&Be()){const{restoreNativeWorkspaceBootstrap:r}=await oe(async()=>{const{restoreNativeWorkspaceBootstrap:a}=await import("./nativeWorkspaceTransfer-CZmvl2w3.js").then(i=>i.H);return{restoreNativeWorkspaceBootstrap:a}},__vite__mapDeps([2,3]));await r(t.user.id).catch(a=>{console.warn("[NativeWorkspace] 恢复首屏迁移快照失败:",a)})}}mt.createRoot(document.getElementById("root")).render(s.jsx(c.StrictMode,{children:s.jsx(xt,{children:s.jsx(Ls,{})})}))}Ps();export{Ns as C,Oe as D,ne as E,ns as F,ks as K,ie as L,Le as M,Ss as R,Pe as S,Cs as U,Es as X,oe as _,te as a,A as b,j as c,ee as d,Qe as e,$s as f,Ds as g,ls as h,_ as i,be as j,ys as k,et as l,re as m,y as n,Us as o,xs as p,zs as q,Ms as r,ms as s,z as t,bs as u,M as z};
