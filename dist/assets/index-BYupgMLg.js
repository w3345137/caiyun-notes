const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/App-LGzz5yRC.js","assets/react-core-C-3378df.js","assets/syncStatusCenter-CmvHrc51.js","assets/localWorkspaceStore-CBbIEMoE.js","assets/editor-MiJVjar0.js","assets/tauri-DWh9r1QE.js","assets/nativeWorkspaceTransfer-1-z4DWOA.js","assets/accountPreferenceStore-Rjp5I1Ug.js","assets/treeMutationOutbox-IYcVbTB5.js"])))=>i.map(i=>d[i]);
import{a as c,R as Et,j as s,d as St}from"./react-core-C-3378df.js";import{S as Ct}from"./tauri-DWh9r1QE.js";(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const n of o.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&a(n)}).observe(document,{childList:!0,subtree:!0});function r(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function a(i){if(i.ep)return;i.ep=!0;const o=r(i);fetch(i.href,o)}})();const At="modulepreload",Tt=function(e){return"/"+e},Oe={},T=function(t,r,a){let i=Promise.resolve();if(r&&r.length>0){let n=function(d){return Promise.all(d.map(m=>Promise.resolve(m).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};document.getElementsByTagName("link");const l=document.querySelector("meta[property=csp-nonce]"),u=(l==null?void 0:l.nonce)||(l==null?void 0:l.getAttribute("nonce"));i=n(r.map(d=>{if(d=Tt(d),d in Oe)return;Oe[d]=!0;const m=d.endsWith(".css"),f=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${d}"]${f}`))return;const h=document.createElement("link");if(h.rel=m?"stylesheet":At,m||(h.as="script"),h.crossOrigin="",h.href=d,u&&h.setAttribute("nonce",u),document.head.appendChild(h),m)return new Promise((p,w)=>{h.addEventListener("load",p),h.addEventListener("error",()=>w(new Error(`Unable to preload CSS for ${d}`)))})}))}function o(n){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=n,window.dispatchEvent(l),!l.defaultPrevented)throw n}return i.then(n=>{for(const l of n||[])l.status==="rejected"&&o(l.reason);return t().catch(o)})};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var Ot={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Lt=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=(e,t)=>{const r=c.forwardRef(({color:a="currentColor",size:i=24,strokeWidth:o=2,absoluteStrokeWidth:n,className:l="",children:u,...d},m)=>c.createElement("svg",{ref:m,...Ot,width:i,height:i,stroke:a,strokeWidth:n?Number(o)*24/Number(i):o,className:["lucide",`lucide-${Lt(e)}`,l].join(" "),...d},[...t.map(([f,h])=>c.createElement(f,h)),...Array.isArray(u)?u:[u]]));return r.displayName=`${e}`,r};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const It=v("CircleAlert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=v("CircleCheckBig",[["path",{d:"M22 11.08V12a10 10 0 1 1-5.93-9.14",key:"g774vq"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=v("Database",[["ellipse",{cx:"12",cy:"5",rx:"9",ry:"3",key:"msslwz"}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5",key:"1wlel7"}],["path",{d:"M3 12A9 3 0 0 0 21 12",key:"mv7ke4"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ce=v("EyeOff",[["path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24",key:"1jxqfv"}],["path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",key:"9wicm4"}],["path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",key:"1jreej"}],["line",{x1:"2",x2:"22",y1:"2",y2:"22",key:"a6p6uj"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const de=v("Eye",[["path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",key:"rwhkz3"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pt=v("Key",[["circle",{cx:"7.5",cy:"15.5",r:"5.5",key:"yqb3hr"}],["path",{d:"m21 2-9.6 9.6",key:"1j0ho8"}],["path",{d:"m15.5 7.5 3 3L22 7l-3-3",key:"1rn1fs"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ue=v("LoaderCircle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=v("Lock",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ie=v("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $e=v("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Pe=v("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Rt=v("TriangleAlert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ut=v("User",[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Dt=v("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]);class Mt extends Et.Component{constructor(t){super(t),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,r){console.error("[ErrorBoundary] 页面渲染异常",t,r)}render(){return this.state.hasError?s.jsx("div",{className:"flex min-h-screen items-center justify-center bg-gray-50 px-6 py-10",children:s.jsxs("section",{className:"w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm",role:"alert",children:[s.jsx(Rt,{className:"mx-auto h-8 w-8 text-red-500","aria-hidden":"true"}),s.jsx("h1",{className:"mt-3 text-lg font-semibold text-gray-900",children:"页面暂时无法显示"}),s.jsx("p",{className:"mt-2 text-sm leading-6 text-gray-500",children:"当前页面遇到异常，您的本地内容不会因此被删除。"}),s.jsxs("button",{type:"button",onClick:()=>window.location.reload(),className:"mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",children:[s.jsx($e,{className:"h-4 w-4","aria-hidden":"true"}),"重新加载"]})]})}):this.props.children}}let $t={data:""},zt=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||$t},Ft=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,Bt=/\/\*[^]*?\*\/|  +/g,Re=/\n+/g,O=(e,t)=>{let r="",a="",i="";for(let o in e){let n=e[o];o[0]=="@"?o[1]=="i"?r=o+" "+n+";":a+=o[1]=="f"?O(n,o):o+"{"+O(n,o[1]=="k"?"":t)+"}":typeof n=="object"?a+=O(n,t?t.replace(/([^,])+/g,l=>o.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,u=>/&/.test(u)?u.replace(/&/g,l):l?l+" "+u:u)):o):n!=null&&(o=/^--/.test(o)?o:o.replace(/[A-Z]/g,"-$&").toLowerCase(),i+=O.p?O.p(o,n):o+":"+n+";")}return r+(t&&i?t+"{"+i+"}":i)+a},C={},ze=e=>{if(typeof e=="object"){let t="";for(let r in e)t+=r+ze(e[r]);return t}return e},Vt=(e,t,r,a,i)=>{let o=ze(e),n=C[o]||(C[o]=(u=>{let d=0,m=11;for(;d<u.length;)m=101*m+u.charCodeAt(d++)>>>0;return"go"+m})(o));if(!C[n]){let u=o!==e?e:(d=>{let m,f,h=[{}];for(;m=Ft.exec(d.replace(Bt,""));)m[4]?h.shift():m[3]?(f=m[3].replace(Re," ").trim(),h.unshift(h[0][f]=h[0][f]||{})):h[0][m[1]]=m[2].replace(Re," ").trim();return h[0]})(e);C[n]=O(i?{["@keyframes "+n]:u}:u,r?"":"."+n)}let l=r&&C.g?C.g:null;return r&&(C.g=C[n]),((u,d,m,f)=>{f?d.data=d.data.replace(f,u):d.data.indexOf(u)===-1&&(d.data=m?u+d.data:d.data+u)})(C[n],t,a,l),n},qt=(e,t,r)=>e.reduce((a,i,o)=>{let n=t[o];if(n&&n.call){let l=n(r),u=l&&l.props&&l.props.className||/^go/.test(l)&&l;n=u?"."+u:l&&typeof l=="object"?l.props?"":O(l,""):l===!1?"":l}return a+i+(n??"")},"");function ee(e){let t=this||{},r=e.call?e(t.p):e;return Vt(r.unshift?r.raw?qt(r,[].slice.call(arguments,1),t.p):r.reduce((a,i)=>Object.assign(a,i&&i.call?i(t.p):i),{}):r,zt(t.target),t.g,t.o,t.k)}let Fe,me,fe;ee.bind({g:1});let A=ee.bind({k:1});function Wt(e,t,r,a){O.p=t,Fe=e,me=r,fe=a}function L(e,t){let r=this||{};return function(){let a=arguments;function i(o,n){let l=Object.assign({},o),u=l.className||i.className;r.p=Object.assign({theme:me&&me()},l),r.o=/ *go\d+/.test(u),l.className=ee.apply(r,a)+(u?" "+u:"");let d=e;return e[0]&&(d=l.as||e,delete l.as),fe&&d[0]&&fe(l),Fe(d,l)}return i}}var Ht=e=>typeof e=="function",Z=(e,t)=>Ht(e)?e(t):e,Kt=(()=>{let e=0;return()=>(++e).toString()})(),Be=(()=>{let e;return()=>{if(e===void 0&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");e=!t||t.matches}return e}})(),Jt=20,he="default",Ve=(e,t)=>{let{toastLimit:r}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,r)};case 1:return{...e,toasts:e.toasts.map(n=>n.id===t.toast.id?{...n,...t.toast}:n)};case 2:let{toast:a}=t;return Ve(e,{type:e.toasts.find(n=>n.id===a.id)?1:0,toast:a});case 3:let{toastId:i}=t;return{...e,toasts:e.toasts.map(n=>n.id===i||i===void 0?{...n,dismissed:!0,visible:!1}:n)};case 4:return t.toastId===void 0?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(n=>n.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let o=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(n=>({...n,pauseDuration:n.pauseDuration+o}))}}},Y=[],qe={toasts:[],pausedAt:void 0,settings:{toastLimit:Jt}},_={},We=(e,t=he)=>{_[t]=Ve(_[t]||qe,e),Y.forEach(([r,a])=>{r===t&&a(_[t])})},He=e=>Object.keys(_).forEach(t=>We(e,t)),Yt=e=>Object.keys(_).find(t=>_[t].toasts.some(r=>r.id===e)),te=(e=he)=>t=>{We(t,e)},Zt={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},Gt=(e={},t=he)=>{let[r,a]=c.useState(_[t]||qe),i=c.useRef(_[t]);c.useEffect(()=>(i.current!==_[t]&&a(_[t]),Y.push([t,a]),()=>{let n=Y.findIndex(([l])=>l===t);n>-1&&Y.splice(n,1)}),[t]);let o=r.toasts.map(n=>{var l,u,d;return{...e,...e[n.type],...n,removeDelay:n.removeDelay||((l=e[n.type])==null?void 0:l.removeDelay)||(e==null?void 0:e.removeDelay),duration:n.duration||((u=e[n.type])==null?void 0:u.duration)||(e==null?void 0:e.duration)||Zt[n.type],style:{...e.style,...(d=e[n.type])==null?void 0:d.style,...n.style}}});return{...r,toasts:o}},Qt=(e,t="blank",r)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...r,id:(r==null?void 0:r.id)||Kt()}),q=e=>(t,r)=>{let a=Qt(t,e,r);return te(a.toasterId||Yt(a.id))({type:2,toast:a}),a.id},y=(e,t)=>q("blank")(e,t);y.error=q("error");y.success=q("success");y.loading=q("loading");y.custom=q("custom");y.dismiss=(e,t)=>{let r={type:3,toastId:e};t?te(t)(r):He(r)};y.dismissAll=e=>y.dismiss(void 0,e);y.remove=(e,t)=>{let r={type:4,toastId:e};t?te(t)(r):He(r)};y.removeAll=e=>y.remove(void 0,e);y.promise=(e,t,r)=>{let a=y.loading(t.loading,{...r,...r==null?void 0:r.loading});return typeof e=="function"&&(e=e()),e.then(i=>{let o=t.success?Z(t.success,i):void 0;return o?y.success(o,{id:a,...r,...r==null?void 0:r.success}):y.dismiss(a),i}).catch(i=>{let o=t.error?Z(t.error,i):void 0;o?y.error(o,{id:a,...r,...r==null?void 0:r.error}):y.dismiss(a)}),e};var Xt=1e3,er=(e,t="default")=>{let{toasts:r,pausedAt:a}=Gt(e,t),i=c.useRef(new Map).current,o=c.useCallback((f,h=Xt)=>{if(i.has(f))return;let p=setTimeout(()=>{i.delete(f),n({type:4,toastId:f})},h);i.set(f,p)},[]);c.useEffect(()=>{if(a)return;let f=Date.now(),h=r.map(p=>{if(p.duration===1/0)return;let w=(p.duration||0)+p.pauseDuration-(f-p.createdAt);if(w<0){p.visible&&y.dismiss(p.id);return}return setTimeout(()=>y.dismiss(p.id,t),w)});return()=>{h.forEach(p=>p&&clearTimeout(p))}},[r,a,t]);let n=c.useCallback(te(t),[t]),l=c.useCallback(()=>{n({type:5,time:Date.now()})},[n]),u=c.useCallback((f,h)=>{n({type:1,toast:{id:f,height:h}})},[n]),d=c.useCallback(()=>{a&&n({type:6,time:Date.now()})},[a,n]),m=c.useCallback((f,h)=>{let{reverseOrder:p=!1,gutter:w=8,defaultPosition:I}=h||{},N=r.filter(b=>(b.position||I)===(f.position||I)&&b.height),H=N.findIndex(b=>b.id===f.id),$=N.filter((b,R)=>R<H&&b.visible).length;return N.filter(b=>b.visible).slice(...p?[$+1]:[0,$]).reduce((b,R)=>b+(R.height||0)+w,0)},[r]);return c.useEffect(()=>{r.forEach(f=>{if(f.dismissed)o(f.id,f.removeDelay);else{let h=i.get(f.id);h&&(clearTimeout(h),i.delete(f.id))}})},[r,o]),{toasts:r,handlers:{updateHeight:u,startPause:l,endPause:d,calculateOffset:m}}},tr=A`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,rr=A`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,sr=A`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,ar=L("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${tr} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${rr} 0.15s ease-out forwards;
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
    animation: ${sr} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,nr=A`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,ir=L("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${nr} 1s linear infinite;
`,or=A`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,lr=A`
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
}`,cr=L("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${or} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${lr} 0.2s ease-out forwards;
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
`,dr=L("div")`
  position: absolute;
`,ur=L("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,mr=A`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,fr=L("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${mr} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,hr=({toast:e})=>{let{icon:t,type:r,iconTheme:a}=e;return t!==void 0?typeof t=="string"?c.createElement(fr,null,t):t:r==="blank"?null:c.createElement(ur,null,c.createElement(ir,{...a}),r!=="loading"&&c.createElement(dr,null,r==="error"?c.createElement(ar,{...a}):c.createElement(cr,{...a})))},pr=e=>`
0% {transform: translate3d(0,${e*-200}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,gr=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${e*-150}%,-1px) scale(.6); opacity:0;}
`,yr="0%{opacity:0;} 100%{opacity:1;}",xr="0%{opacity:1;} 100%{opacity:0;}",br=L("div")`
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
`,vr=L("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,wr=(e,t)=>{let r=e.includes("top")?1:-1,[a,i]=Be()?[yr,xr]:[pr(r),gr(r)];return{animation:t?`${A(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${A(i)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},jr=c.memo(({toast:e,position:t,style:r,children:a})=>{let i=e.height?wr(e.position||t||"top-center",e.visible):{opacity:0},o=c.createElement(hr,{toast:e}),n=c.createElement(vr,{...e.ariaProps},Z(e.message,e));return c.createElement(br,{className:e.className,style:{...i,...r,...e.style}},typeof a=="function"?a({icon:o,message:n}):c.createElement(c.Fragment,null,o,n))});Wt(c.createElement);var Nr=({id:e,className:t,style:r,onHeightUpdate:a,children:i})=>{let o=c.useCallback(n=>{if(n){let l=()=>{let u=n.getBoundingClientRect().height;a(e,u)};l(),new MutationObserver(l).observe(n,{subtree:!0,childList:!0,characterData:!0})}},[e,a]);return c.createElement("div",{ref:o,className:t,style:r},i)},kr=(e,t)=>{let r=e.includes("top"),a=r?{top:0}:{bottom:0},i=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:Be()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(r?1:-1)}px)`,...a,...i}},_r=ee`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,K=16,Er=({reverseOrder:e,position:t="top-center",toastOptions:r,gutter:a,children:i,toasterId:o,containerStyle:n,containerClassName:l})=>{let{toasts:u,handlers:d}=er(r,o);return c.createElement("div",{"data-rht-toaster":o||"",style:{position:"fixed",zIndex:9999,top:K,left:K,right:K,bottom:K,pointerEvents:"none",...n},className:l,onMouseEnter:d.startPause,onMouseLeave:d.endPause},u.map(m=>{let f=m.position||t,h=d.calculateOffset(m,{reverseOrder:e,gutter:a,defaultPosition:t}),p=kr(f,h);return c.createElement(Nr,{id:m.id,key:m.id,onHeightUpdate:d.updateHeight,className:m.visible?_r:"",style:p},m.type==="custom"?Z(m.message,m):i?i(m):c.createElement(jr,{toast:m,position:f}))}))},D=y;const pe="https://notes.binapp.top";function ge(){return typeof window>"u"?void 0:window}function k(){const e=ge();return!!(e!=null&&e.__TAURI_INTERNALS__||e!=null&&e.__TAURI__)}function Ke(){var t,r;if(!k())return!1;const e=(r=(t=ge())==null?void 0:t.location)==null?void 0:r.origin;return e==="tauri://localhost"||e==="http://tauri.localhost"||e==="https://tauri.localhost"}function Je(e){const t=String(e||"").trim();if(!t||t.startsWith("//")||t.includes("\\")||/^[a-z][a-z\d+.-]*:/i.test(t))throw new TypeError("Expected a relative application path");return t.startsWith("/")?t:`/${t}`}function Sr(){var t,r;const e=(r=(t=ge())==null?void 0:t.location)==null?void 0:r.origin;return e&&e!=="null"?e:pe}function E(e){const t=k()?pe:Sr();return new URL(Je(e),t).toString()}function ns(e){return E(e)}function is(e){return new URL(Je(e),pe).toString()}function os(e){const t=String(e||"").trim();if(!t)return"";if(/^https?:\/\//i.test(t)||/^blob:/i.test(t)||/^data:image\//i.test(t))return t;if(/^[a-z][a-z\d+.-]*:/i.test(t)||t.startsWith("//"))return"";try{return E(t)}catch{return""}}const Cr="auth-session.json",ye="session",Ye="notesapp_token",Ze="notesapp_user";let J=null,G=Promise.resolve();function xe(e){const t=e;return!(t!=null&&t.id)||!(t!=null&&t.email)?null:{id:t.id,email:t.email,display_name:t.display_name||t.email.split("@")[0]}}function Ge(e){const t=e,r=xe(t==null?void 0:t.user);return r?{version:1,accessToken:typeof(t==null?void 0:t.accessToken)=="string"&&t.accessToken?t.accessToken:null,user:r,updatedAt:typeof(t==null?void 0:t.updatedAt)=="string"?t.updatedAt:new Date().toISOString()}:null}async function be(){return k()?(J||(J=Ct.load(Cr,{autoSave:!1,defaults:{}}).catch(e=>(J=null,console.warn("[NativeAuth] 打开原生会话桥失败:",e),null))),J):null}function Qe(e){const t=G.catch(()=>{}).then(e);return G=t,t}function Xe(e){const t=Ge(e);if(!t||typeof localStorage>"u")return!1;try{return t.accessToken&&localStorage.setItem(Ye,t.accessToken),localStorage.setItem(Ze,JSON.stringify(t.user)),!0}catch{return!1}}async function re(e,t){const r=xe(t);if(!r||!k())return!1;const a={version:1,accessToken:e||null,user:r,updatedAt:new Date().toISOString()};return Qe(async()=>{const i=await be();return i?(await i.set(ye,a),await i.save(),!0):!1})}async function ve(){await G.catch(()=>{});const e=await be();return e?Ge(await e.get(ye)):null}async function et(){const e=await ve();return e!=null&&e.accessToken?re(null,e.user):!!e}async function tt(){return k()?Qe(async()=>{const e=await be();return e?(await e.delete(ye),await e.save(),!0):!1}):!1}function we(e,t){!k()||!(t!=null&&t.id)||!(t!=null&&t.email)||re(e,t)}function rt(){k()&&tt()}async function Ar(){await G.catch(()=>{})}async function Tr(){if(!k())return null;const e=await ve().catch(()=>null);if(e&&Xe(e),Ke())return e!=null&&e.accessToken&&await et(),e;try{const t=localStorage.getItem(Ye),r=xe(JSON.parse(localStorage.getItem(Ze)||"null"));r&&await re(t,r)}catch{}return e}const Or=Object.freeze(Object.defineProperty({__proto__:null,applyNativeAuthSessionToWebStorage:Xe,clearNativeAuthBridge:tt,consumeNativeAuthBridgeToken:et,flushNativeAuthBridgeWrites:Ar,hydrateAuthSessionFromNativeBridge:Tr,persistNativeAuthBridge:re,readNativeAuthBridge:ve,scheduleNativeAuthBridgeClear:rt,scheduleNativeAuthBridgeWrite:we},Symbol.toStringTag,{value:"Module"})),Q="notesapp_token",je="notesapp_user";let P=null;function Lr(){if(typeof window>"u")return!1;const e=window;return!!(e.__TAURI_INTERNALS__||e.__TAURI__)}function Ir(){if(typeof window>"u")return!1;if(Lr())return!0;try{return localStorage.getItem("notesapp_force_local_token")==="1"}catch{return!1}}function W(){try{return localStorage.getItem(Q)||""}catch{return""}}function Ne(e){const t=(e==null?void 0:e.access_token)||"";try{t&&Ir()?localStorage.setItem(Q,t):localStorage.removeItem(Q)}catch{}we(t,M())}function se(e){e!=null&&e.id&&(e!=null&&e.email)&&(P={id:e.id,email:e.email,display_name:e.display_name||e.email.split("@")[0]});try{e!=null&&e.id&&(e!=null&&e.email)&&localStorage.setItem(je,JSON.stringify(P))}catch{}we(W(),P)}function M(){try{const e=localStorage.getItem(je);if(!e)return P;const t=JSON.parse(e);return!(t!=null&&t.id)||!(t!=null&&t.email)?P:{id:t.id,email:t.email,display_name:t.display_name||t.email.split("@")[0]}}catch{return P}}function st(){P=null;try{localStorage.removeItem(Q),localStorage.removeItem(je)}catch{}rt()}function ae(e=!1){const t=W();return{...e?{"Content-Type":"application/json"}:{},...t?{Authorization:`Bearer ${t}`}:{}}}function ne(e,t={},r=!1){return fetch(e,{...t,credentials:"include",headers:{...ae(r),...t.headers||{}}})}async function X(e,t){const r=await ne(E("/api/auth/v1/token"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t,grant_type:"password"})});if(!r.ok){const i=await r.json().catch(()=>({}));throw new Error(i.error||"账号或密码错误")}const a=await r.json();return Ne(a),se(a.user),a}async function at(e,t,r,a){const i=await ne(E("/api/auth/v1/token"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t,grant_type:"signup",display_name:r,verifyToken:a})});if(!i.ok){const n=await i.json().catch(()=>({}));throw new Error(n.error||"注册失败")}const o=await i.json();return Ne(o),se(o.user),o}async function nt(){const e=await ne(E("/api/auth/v1/refresh"),{method:"POST",headers:ae(!0)}),t=await e.json().catch(()=>({}));if(!e.ok)throw new Error(t.error||"登录续期失败");return Ne(t),se(t.user),t}async function it(e,t){const r=await fetch(E("/api/send-code"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,purpose:t})}),a=await r.json().catch(()=>({}));if(!r.ok)throw new Error(a.error||"发送验证码失败");return a}async function ot(e,t,r){const a=await fetch(E("/api/verify-code"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,code:t,purpose:r})}),i=await a.json().catch(()=>({}));if(!a.ok)throw new Error(i.error||"验证码验证失败");return i}async function lt(e,t,r){const a=await fetch(E("/api/reset-password"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,newPassword:t,verifyToken:r})}),i=await a.json().catch(()=>({}));if(!a.ok)throw new Error(i.error||"重置密码失败");return i}async function ct(){await ne(E("/api/auth/v1/logout"),{method:"POST",headers:ae(!0),body:JSON.stringify({})}).catch(()=>{}),st(),window.location.reload()}function ie(e){try{const t=e.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"),r=decodeURIComponent(atob(t).split("").map(a=>"%"+("00"+a.charCodeAt(0).toString(16)).slice(-2)).join(""));return JSON.parse(r)}catch{return null}}function dt(){var t;const e=W();if(e){const r=ie(e);if(r!=null&&r.sub)return r.sub}return((t=M())==null?void 0:t.id)||null}function ut(){var t;const e=W();if(e){const r=ie(e);if(r!=null&&r.email)return r.email}return((t=M())==null?void 0:t.email)||null}function Pr(){var r;const e=W();if(e){const a=ie(e);if(a!=null&&a.display_name||a!=null&&a.username||a!=null&&a.email)return a.display_name||a.username||a.email.split("@")[0]||null}const t=M();return(t==null?void 0:t.display_name)||((r=t==null?void 0:t.email)==null?void 0:r.split("@")[0])||null}const Rr={signIn:X,signOut:ct,refreshToken:nt,getCurrentUserId:dt,getCurrentUserEmail:ut};async function mt(){let e;try{e=await fetch(E("/api/auth/v1/me"),{method:"GET",credentials:"include",headers:ae(!1)})}catch{return null}if(!e.ok)return(e.status===401||e.status===403)&&st(),null;const t=await e.json().catch(()=>null);if(!(t!=null&&t.id)||!(t!=null&&t.email))return null;const r=t.display_name||t.email.split("@")[0];return se({id:t.id,email:t.email,display_name:r}),{id:t.id,email:t.email,display_name:r,user_metadata:{display_name:r}}}const Ur=()=>Promise.resolve(!0),Dr=e=>({data:{subscription:{unsubscribe:()=>{}}}}),Mr=Object.freeze(Object.defineProperty({__proto__:null,auth:Rr,getCurrentUser:mt,getCurrentUserEmail:ut,getCurrentUserId:dt,getCurrentUsername:Pr,isAuthReady:Ur,onAuthStateChange:Dr,parseJWTPayload:ie,refreshToken:nt,resetPassword:lt,sendVerificationCode:it,signIn:X,signOut:ct,signUp:at,verifyCode:ot},Symbol.toStringTag,{value:"Module"})),ft=c.createContext({user:null,loading:!0}),$r=()=>c.useContext(ft);function zr({children:e}){const t=M(),[r,a]=c.useState(t),[i,o]=c.useState(!t);return c.useEffect(()=>{let n=!1;async function l(){try{const u=await mt();if(n)return;if(u){a(u);return}const d=M();a(d||null)}finally{n||o(!1)}}return l(),()=>{n=!0}},[]),s.jsx(ft.Provider,{value:{user:r,loading:i},children:e})}const Fr=/HTTP|SQL|ECONN|stack|Internal Server Error|TypeError|ReferenceError|SyntaxError|\/api\/|\bat\s+\w+/i,Br=/[\u3400-\u9fff]/u;function Vr(e,t){const r=typeof e=="string"?e.trim():e instanceof Error?e.message.trim():"";return!r||r.length>120||!Br.test(r)||Fr.test(r)?t:r}function qr(e,t=!0){const r=c.useRef(null),a=c.useId(),i=c.useRef(e);return c.useEffect(()=>{i.current=e},[e]),c.useEffect(()=>{if(!t)return;const o=document.activeElement instanceof HTMLElement?document.activeElement:null,n=document.body.style.overflow;document.body.style.overflow="hidden";const l=window.setTimeout(()=>{var d;return(d=r.current)==null?void 0:d.focus()},0),u=d=>{var p,w;if(d.key==="Escape"){d.preventDefault(),i.current();return}if(d.key!=="Tab")return;const m=Array.from(((p=r.current)==null?void 0:p.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]);if(m.length===0){d.preventDefault(),(w=r.current)==null||w.focus();return}const f=m[0],h=m[m.length-1];d.shiftKey&&(document.activeElement===f||document.activeElement===r.current)?(d.preventDefault(),h.focus()):!d.shiftKey&&document.activeElement===h&&(d.preventDefault(),f.focus())};return document.addEventListener("keydown",u),()=>{window.clearTimeout(l),document.removeEventListener("keydown",u),document.body.style.overflow=n,o==null||o.focus()}},[t]),{dialogRef:r,titleId:a}}function Wr({message:e,onClose:t}){const{dialogRef:r,titleId:a}=qr(t);return s.jsx("div",{className:"fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 px-4",onClick:t,children:s.jsxs("div",{ref:r,role:"dialog","aria-modal":"true","aria-labelledby":a,tabIndex:-1,className:"w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-xl outline-none",onClick:i=>i.stopPropagation(),children:[s.jsxs("div",{className:"flex items-start gap-3",children:[s.jsx(It,{className:"mt-0.5 h-5 w-5 shrink-0 text-red-500","aria-hidden":"true"}),s.jsxs("div",{className:"min-w-0 flex-1",children:[s.jsx("h2",{id:a,className:"font-semibold text-gray-900",children:"操作未完成"}),s.jsx("p",{className:"mt-2 text-sm leading-6 text-gray-600",children:e})]})]}),s.jsx("button",{type:"button",onClick:t,className:"mt-5 flex h-9 w-full items-center justify-center rounded-md bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",children:"确定"})]})})}function B(e,t){const r=e instanceof Error?e.message:String((e==null?void 0:e.message)||"");return/load failed|failed to fetch|networkerror|network request failed/i.test(r)?"无法连接服务器，请检查网络后重试":r==="Invalid credentials"?"邮箱或密码错误":r==="No local password"?"该账号尚未设置本地密码，请点击“忘记密码”，通过邮箱验证设置新密码后登录":/already exists|already registered/i.test(r)?"该邮箱已注册":Vr(r,t)}function Hr({isOpen:e,onClose:t,onSuccess:r}){const[a,i]=c.useState("login"),[o,n]=c.useState(""),[l,u]=c.useState(""),[d,m]=c.useState(""),[f,h]=c.useState(""),[p,w]=c.useState(!1),[I,N]=c.useState(!1),[H,$]=c.useState(""),[b,R]=c.useState(""),[j,ke]=c.useState(""),[_e,Ee]=c.useState(!1),[U,oe]=c.useState(0),[Se,Ce]=c.useState(!1);if(c.useEffect(()=>{if(U<=0)return;const g=setTimeout(()=>oe(U-1),1e3);return()=>clearTimeout(g)},[U]),!e)return null;const x=g=>$(g),gt=()=>$(""),yt=async g=>{const S=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!o){x("请输入邮箱地址");return}if(!S.test(o)){x("请输入有效的邮箱地址");return}Ce(!0);try{await it(o,g),Ee(!0),oe(60),D.success("验证码已发送到您的邮箱")}catch(_t){x(B(_t,"发送验证码失败"))}finally{Ce(!1)}},xt=async g=>{if(!b){x("请输入验证码");return}if(b.length!==6){x("请输入6位验证码");return}N(!0);try{const S=await ot(o,b,g);ke(S.verifyToken),D.success("邮箱验证成功")}catch(S){x(B(S,"验证码错误"))}finally{N(!1)}},bt=async()=>{if(!o||!l){x("请填写邮箱和密码");return}N(!0);try{await X(o,l),D.success("登录成功"),r==null||r(),t(),setTimeout(()=>window.location.reload(),300)}catch(g){x(B(g,"登录失败，请稍后重试"))}finally{N(!1)}},vt=async()=>{if(!j){x("请先完成邮箱验证");return}if(!f){x("请输入昵称");return}if(l.length<6){x("密码至少需要6位");return}if(l!==d){x("两次输入的密码不一致");return}N(!0);try{await at(o,l,f,j),await X(o,l),D.success("注册成功"),z(),r==null||r(),t(),setTimeout(()=>window.location.reload(),300)}catch(g){x(B(g,"注册失败，请重试"))}finally{N(!1)}},wt=async()=>{if(!j){x("请先完成邮箱验证");return}if(l.length<6){x("密码至少需要6位");return}if(l!==d){x("两次输入的密码不一致");return}N(!0);try{await lt(o,l,j),D.success("密码重置成功，请使用新密码登录"),z(),i("login")}catch(g){x(B(g,"密码重置失败"))}finally{N(!1)}},z=()=>{n(""),u(""),m(""),h(""),R(""),ke(""),Ee(!1),oe(0)},Ae=()=>{i("login"),z()},jt=()=>{i("register"),z()},Nt=()=>{i("forgot-password"),z()},kt=g=>{g.preventDefault(),a==="login"?bt():a==="register"?vt():wt()},Te=g=>s.jsxs("div",{className:"space-y-3",children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"邮箱"}),s.jsxs("div",{className:"flex gap-2",children:[s.jsxs("div",{className:"relative flex-1",children:[s.jsx(Ie,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"email","aria-label":"邮箱",value:o,onChange:S=>n(S.target.value),placeholder:"your@email.com",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",disabled:!!j,required:!0})]}),s.jsx("button",{type:"button",onClick:()=>yt(g),disabled:Se||U>0||!!j,className:"px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5",children:Se?s.jsxs(s.Fragment,{children:[s.jsx(ue,{className:"w-3.5 h-3.5 animate-spin"})," 发送中"]}):j?s.jsxs(s.Fragment,{children:[s.jsx(le,{className:"w-3.5 h-3.5"})," 已验证"]}):U>0?`${U}s`:_e?s.jsxs(s.Fragment,{children:[s.jsx($e,{className:"w-3.5 h-3.5"})," 重新发送"]}):"发送验证码"})]})]}),!j&&_e&&s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"验证码"}),s.jsxs("div",{className:"flex gap-2",children:[s.jsxs("div",{className:"relative flex-1",children:[s.jsx(Pt,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"text","aria-label":"验证码",value:b,onChange:S=>R(S.target.value.replace(/\D/g,"").slice(0,6)),placeholder:"输入6位数字验证码",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all tracking-widest text-center font-mono text-lg",maxLength:6,required:!0})]}),s.jsx("button",{type:"button",onClick:()=>xt(g),disabled:b.length!==6||I,className:"px-4 py-2.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed",children:I?s.jsx(ue,{className:"w-3.5 h-3.5 animate-spin"}):"验证"})]}),s.jsxs("p",{className:"text-xs text-gray-400 mt-1.5",children:["验证码已发送到 ",o,"，请查收（可能在垃圾邮件中）"]})]}),j&&s.jsxs("div",{className:"bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2",children:[s.jsx(le,{className:"w-5 h-5 text-green-500 flex-shrink-0"}),s.jsx("span",{className:"text-sm text-green-700 font-medium",children:"邮箱验证成功"})]})]});return s.jsxs("div",{className:"fixed inset-0 z-[1000] overflow-y-auto bg-black/50 p-4 md:p-6",children:[s.jsx("div",{className:"flex min-h-full items-center justify-center",children:s.jsxs("div",{"data-auth-modal":"panel",role:"dialog","aria-modal":"true","aria-labelledby":"auth-modal-title",className:"relative grid w-full max-w-[880px] overflow-hidden rounded-lg bg-white shadow-2xl md:grid-cols-[300px_minmax(0,1fr)]",children:[s.jsxs("aside",{className:"hidden min-h-[500px] flex-col justify-between bg-gradient-to-br from-blue-500 to-indigo-600 p-8 text-white md:flex",children:[s.jsxs("div",{children:[s.jsx("div",{className:"mb-7 flex h-11 w-11 items-center justify-center rounded-lg bg-white/15",children:s.jsx(Le,{className:"h-6 w-6"})}),s.jsx("p",{className:"text-sm font-medium text-blue-100",children:"彩云笔记"}),s.jsx("h2",{className:"mt-2 text-2xl font-bold",children:a==="login"?"欢迎回来":a==="register"?"创建您的账号":"找回账号访问权"}),s.jsx("p",{className:"mt-3 text-sm leading-6 text-blue-100",children:a==="login"?"登录后继续同步您的笔记和工作区。":a==="register"?"完成邮箱验证后即可开始使用。":"通过已验证邮箱安全地重置密码。"})]}),s.jsxs("div",{className:"space-y-5 border-t border-white/20 pt-6 text-sm",children:[s.jsxs("div",{className:"flex gap-3",children:[s.jsx(Le,{className:"mt-0.5 h-5 w-5 flex-none text-emerald-300"}),s.jsxs("div",{children:[s.jsx("p",{className:"font-medium",children:"独立数据库"}),s.jsx("p",{className:"mt-1 leading-5 text-blue-100",children:"笔记数据存储在自建 PostgreSQL 服务。"})]})]}),s.jsxs("div",{className:"flex gap-3",children:[s.jsx(Pe,{className:"mt-0.5 h-5 w-5 flex-none text-emerald-300"}),s.jsxs("div",{children:[s.jsx("p",{className:"font-medium",children:"密码加密存储"}),s.jsx("p",{className:"mt-1 leading-5 text-blue-100",children:"账号凭据不会以明文保存。"})]})]})]})]}),s.jsxs("section",{className:"relative min-w-0 px-5 py-5 sm:px-7 md:px-9 md:py-7",children:[s.jsxs("div",{className:"mb-5 flex items-start justify-between gap-4",children:[s.jsxs("div",{children:[s.jsx("h2",{id:"auth-modal-title",className:"text-xl font-bold text-gray-900",children:a==="login"?"欢迎回来":a==="register"?"注册账号":"重置密码"}),s.jsx("p",{className:"mt-1 text-sm text-gray-500",children:a==="login"?"登录以同步您的笔记":a==="register"?"创建账号开始使用":"通过邮箱验证重置密码"})]}),s.jsx("button",{type:"button",onClick:t,"aria-label":"关闭",className:"rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700",children:s.jsx(Dt,{className:"w-5 h-5"})})]}),s.jsxs("form",{onSubmit:kt,className:"space-y-4",children:[a==="register"&&s.jsxs(s.Fragment,{children:[j&&s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"昵称"}),s.jsxs("div",{className:"relative",children:[s.jsx(Ut,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"text","aria-label":"昵称",value:f,onChange:g=>h(g.target.value),placeholder:"输入您的昵称",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0})]})]}),Te("register"),j&&s.jsxs(s.Fragment,{children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(F,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:p?"text":"password","aria-label":"密码",value:l,onChange:g=>u(g.target.value),placeholder:"设置登录密码（至少6位）",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),s.jsx("button",{type:"button",onClick:()=>w(!p),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:p?s.jsx(ce,{className:"w-4 h-4"}):s.jsx(de,{className:"w-4 h-4"})})]})]}),s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"确认密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(F,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:p?"text":"password","aria-label":"确认密码",value:d,onChange:g=>m(g.target.value),placeholder:"再次输入密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",minLength:6})]})]})]}),s.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-3",children:s.jsxs("div",{className:"flex items-start gap-2",children:[s.jsx(Pe,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),s.jsxs("div",{className:"text-sm text-blue-700",children:[s.jsx("p",{className:"font-medium mb-1",children:"邮箱验证注册"}),s.jsx("p",{className:"text-blue-600",children:"验证邮箱后即可注册使用，确保账号安全。"})]})]})})]}),a==="forgot-password"&&s.jsxs(s.Fragment,{children:[Te("reset-password"),j&&s.jsxs(s.Fragment,{children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"新密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(F,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:p?"text":"password","aria-label":"新密码",value:l,onChange:g=>u(g.target.value),placeholder:"设置新密码（至少6位）",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),s.jsx("button",{type:"button",onClick:()=>w(!p),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:p?s.jsx(ce,{className:"w-4 h-4"}):s.jsx(de,{className:"w-4 h-4"})})]})]}),s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"确认新密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(F,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:p?"text":"password","aria-label":"确认新密码",value:d,onChange:g=>m(g.target.value),placeholder:"再次输入新密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",minLength:6})]})]})]})]}),a==="login"&&s.jsxs(s.Fragment,{children:[s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"邮箱"}),s.jsxs("div",{className:"relative",children:[s.jsx(Ie,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:"email","aria-label":"邮箱",value:o,onChange:g=>n(g.target.value),placeholder:"your@email.com",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0})]})]}),s.jsxs("div",{children:[s.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"密码"}),s.jsxs("div",{className:"relative",children:[s.jsx(F,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),s.jsx("input",{type:p?"text":"password","aria-label":"密码",value:l,onChange:g=>u(g.target.value),placeholder:"输入密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),s.jsx("button",{type:"button",onClick:()=>w(!p),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:p?s.jsx(ce,{className:"w-4 h-4"}):s.jsx(de,{className:"w-4 h-4"})})]})]}),s.jsx("div",{className:"text-right",children:s.jsx("button",{type:"button",onClick:Nt,className:"text-sm text-blue-500 hover:text-blue-600",children:"忘记密码？"})})]}),s.jsx("button",{type:"submit",disabled:I||a!=="login"&&!j,className:"w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4",children:I?s.jsxs(s.Fragment,{children:[s.jsx(ue,{className:"w-4 h-4 animate-spin"}),a==="login"?"登录中...":a==="register"?"注册中...":"重置中..."]}):s.jsxs(s.Fragment,{children:[s.jsx(le,{className:"w-4 h-4"}),a==="login"?"登录":a==="register"?"注册":"重置密码"]})}),s.jsxs("div",{className:"text-center pt-2 flex items-center justify-center gap-3",children:[a==="login"&&s.jsx("button",{type:"button",onClick:jt,className:"text-sm text-blue-500 hover:text-blue-600",children:"还没有账号？立即注册"}),a==="register"&&s.jsx("button",{type:"button",onClick:Ae,className:"text-sm text-gray-500 hover:text-gray-700",children:"已有账号？立即登录"}),a==="forgot-password"&&s.jsx("button",{type:"button",onClick:Ae,className:"text-sm text-gray-500 hover:text-gray-700",children:"返回登录"})]}),s.jsx("div",{className:"mt-4 border-t border-gray-100 pt-4 text-center",children:s.jsx("p",{className:"text-xs text-gray-400",children:"献给热爱知识管理的你——彬"})})]})]})]})}),H&&s.jsx(Wr,{message:H,onClose:gt})]})}const ht="/assets/logo-Cw1I6IdG.png",Kr=c.lazy(()=>T(()=>import("./App-LGzz5yRC.js").then(e=>e.S),__vite__mapDeps([0,1,2,3,4,5,6,7,8])));function Ue({status:e}){return s.jsx("div",{className:"flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100",children:s.jsxs("div",{className:"w-72 text-center",children:[s.jsx("img",{src:ht,alt:"彩云笔记",className:"mx-auto mb-4 h-24 w-24 object-contain"}),s.jsx("div",{className:"mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200",children:s.jsx("div",{className:"h-full w-2/3 animate-pulse rounded-full bg-blue-500"})}),s.jsx("p",{className:"text-sm text-gray-500",children:e})]})})}function Jr(){const{user:e,loading:t}=$r(),[r,a]=c.useState(!1);return t?s.jsx(Ue,{status:"正在验证登录状态"}):e?s.jsx(c.Suspense,{fallback:s.jsx(Ue,{status:"正在载入本地工作区"}),children:s.jsx(Kr,{})}):s.jsxs("div",{className:"flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100",children:[s.jsxs("div",{className:"mx-auto max-w-md px-6 text-center",children:[s.jsx("div",{className:"mx-auto mb-6 flex h-24 w-24 items-center justify-center",children:s.jsx("img",{src:ht,alt:"彩云笔记",className:"h-full w-full object-contain"})}),s.jsx("h1",{className:"mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent",children:"彩云笔记"}),s.jsx("p",{className:"mb-8 text-gray-600",children:"安全可靠的云端笔记应用，让记录更轻松"}),s.jsx("button",{onClick:()=>a(!0),className:"rounded-lg bg-blue-500 px-8 py-3 font-medium text-white shadow-sm transition-colors hover:bg-blue-600",children:"登录 / 注册"}),s.jsx("p",{className:"mt-8 text-sm text-gray-400",children:"献给热爱知识管理的你——彬"})]}),s.jsx(Hr,{isOpen:r,onClose:()=>a(!1)}),s.jsx(Er,{position:"bottom-center"})]})}function Yr(){return s.jsx(zr,{children:s.jsx(Jr,{})})}const De="caiyun_frontend_bundle_ready_event_v2",Zr=2500,Gr=60*1e3;let Me=!1,V=null,pt=null;async function Qr(){const{invoke:e}=await T(async()=>{const{invoke:t}=await import("./tauri-DWh9r1QE.js").then(r=>r.d);return{invoke:t}},[]);return e("check_frontend_bundle_update")}function Xr(e){pt=e,sessionStorage.getItem(De)!==e&&(sessionStorage.setItem(De,e),window.dispatchEvent(new CustomEvent("frontend-bundle-update-ready",{detail:{releaseId:e}})))}function ls(){return pt}function es(e={}){if(!e.invoke&&!k())return Promise.resolve(null);if(V)return V;const t=e.invoke||Qr,r=e.notify||(a=>D.success(a));return V=t("check_frontend_bundle_update").then(a=>(a.status==="installed"&&a.releaseId?Xr(a.releaseId):a.status==="requiresShellUpdate"&&(r("界面更新需要新版桌面端，请先更新 App"),window.dispatchEvent(new CustomEvent("frontend-bundle-shell-update-required",{detail:{releaseId:a.releaseId||null,minShellVersion:a.minShellVersion||null}}))),a)).catch(a=>(console.warn("[FrontendBundle] 后台检查界面更新失败:",a),null)).finally(()=>{V=null}),V}function ts(e=Zr){if(Me||!k())return;Me=!0;let t=null;const r=o=>{t!==null&&window.clearTimeout(t),t=window.setTimeout(()=>void a(),Math.max(0,o))},a=async()=>{await es(),r(Gr)},i=()=>{document.visibilityState==="visible"&&a()};r(e),window.addEventListener("focus",i),document.addEventListener("visibilitychange",i)}async function rs(){if(k()){const{hydrateAuthSessionFromNativeBridge:o}=await T(async()=>{const{hydrateAuthSessionFromNativeBridge:l}=await Promise.resolve().then(()=>Or);return{hydrateAuthSessionFromNativeBridge:l}},void 0),n=await o();if(n!=null&&n.user.id&&Ke()){const{restoreNativeWorkspaceBootstrap:l}=await T(async()=>{const{restoreNativeWorkspaceBootstrap:u}=await import("./nativeWorkspaceTransfer-1-z4DWOA.js");return{restoreNativeWorkspaceBootstrap:u}},__vite__mapDeps([6,5,2,1,7]));await l(n.user.id).catch(u=>{console.warn("[NativeWorkspace] 恢复首屏迁移快照失败:",u)})}}const[{getCurrentUserId:e},{hydrateAccountPreferences:t},{hydrateTreeMutationOutbox:r},{hydrateLocalWorkspaceCritical:a}]=await Promise.all([T(()=>Promise.resolve().then(()=>Mr),void 0),T(()=>import("./accountPreferenceStore-Rjp5I1Ug.js"),__vite__mapDeps([7,2,1,5])),T(()=>import("./treeMutationOutbox-IYcVbTB5.js"),__vite__mapDeps([8,2,1,5])),T(()=>import("./localWorkspaceStore-CBbIEMoE.js").then(o=>o.Z),__vite__mapDeps([3,4,1,2,5,6,7]))]),i=e();if(i){const o=await Promise.allSettled([a(),t(i),r(i)]);for(const n of o)n.status==="rejected"&&console.warn("[Workspace] 恢复本地工作区失败:",n.reason)}St.createRoot(document.getElementById("root")).render(s.jsx(c.StrictMode,{children:s.jsx(Mt,{children:s.jsx(Yr,{})})})),ts()}rs();export{F as A,It as C,Le as D,de as E,Er as F,Pt as K,ue as L,Ie as M,$e as R,Pe as S,Rt as T,Ut as U,Dt as X,T as _,Pr as a,ne as b,v as c,ae as d,E as e,st as f,dt as g,ns as h,k as i,Ar as j,W as k,ht as l,ls as m,qr as n,mt as o,ie as p,y as q,nt as r,Ir as s,Vr as t,$r as u,le as v,is as w,ct as x,os as y,D as z};
