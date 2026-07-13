const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/App-CdNuGLSp.js","assets/react-core-C-3378df.js","assets/nativeWorkspaceTransfer-BMcoR19_.js","assets/tauri-Dfr_IEKd.js","assets/editor-BDa4AnIB.js","assets/App-DV-pNTNj.css"])))=>i.map(i=>d[i]);
import{a as c,R as pt,j as r,d as gt}from"./react-core-C-3378df.js";import{S as yt}from"./tauri-Dfr_IEKd.js";(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const o of i.addedNodes)o.tagName==="LINK"&&o.rel==="modulepreload"&&a(o)}).observe(document,{childList:!0,subtree:!0});function s(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function a(n){if(n.ep)return;n.ep=!0;const i=s(n);fetch(n.href,i)}})();const xt="modulepreload",bt=function(e){return"/"+e},Ae={},W=function(t,s,a){let n=Promise.resolve();if(s&&s.length>0){let o=function(d){return Promise.all(d.map(m=>Promise.resolve(m).then(f=>({status:"fulfilled",value:f}),f=>({status:"rejected",reason:f}))))};document.getElementsByTagName("link");const l=document.querySelector("meta[property=csp-nonce]"),u=(l==null?void 0:l.nonce)||(l==null?void 0:l.getAttribute("nonce"));n=o(s.map(d=>{if(d=bt(d),d in Ae)return;Ae[d]=!0;const m=d.endsWith(".css"),f=m?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${d}"]${f}`))return;const h=document.createElement("link");if(h.rel=m?"stylesheet":xt,m||(h.as="script"),h.crossOrigin="",h.href=d,u&&h.setAttribute("nonce",u),document.head.appendChild(h),m)return new Promise((p,w)=>{h.addEventListener("load",p),h.addEventListener("error",()=>w(new Error(`Unable to preload CSS for ${d}`)))})}))}function i(o){const l=new Event("vite:preloadError",{cancelable:!0});if(l.payload=o,window.dispatchEvent(l),!l.defaultPrevented)throw o}return n.then(o=>{for(const l of o||[])l.status==="rejected"&&i(l.reason);return t().catch(i)})};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var vt={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const wt=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase();/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const v=(e,t)=>{const s=c.forwardRef(({color:a="currentColor",size:n=24,strokeWidth:i=2,absoluteStrokeWidth:o,className:l="",children:u,...d},m)=>c.createElement("svg",{ref:m,...vt,width:n,height:n,stroke:a,strokeWidth:o?Number(i)*24/Number(n):i,className:["lucide",`lucide-${wt(e)}`,l].join(" "),...d},[...t.map(([f,h])=>c.createElement(f,h)),...Array.isArray(u)?u:[u]]));return s.displayName=`${e}`,s};/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const jt=v("CircleAlert",[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ne=v("CircleCheckBig",[["path",{d:"M22 11.08V12a10 10 0 1 1-5.93-9.14",key:"g774vq"}],["path",{d:"m9 11 3 3L22 4",key:"1pflzl"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Te=v("Database",[["ellipse",{cx:"12",cy:"5",rx:"9",ry:"3",key:"msslwz"}],["path",{d:"M3 5V19A9 3 0 0 0 21 19V5",key:"1wlel7"}],["path",{d:"M3 12A9 3 0 0 0 21 12",key:"mv7ke4"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const oe=v("EyeOff",[["path",{d:"M9.88 9.88a3 3 0 1 0 4.24 4.24",key:"1jxqfv"}],["path",{d:"M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68",key:"9wicm4"}],["path",{d:"M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61",key:"1jreej"}],["line",{x1:"2",x2:"22",y1:"2",y2:"22",key:"a6p6uj"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ie=v("Eye",[["path",{d:"M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z",key:"rwhkz3"}],["circle",{cx:"12",cy:"12",r:"3",key:"1v7zrd"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Nt=v("Key",[["circle",{cx:"7.5",cy:"15.5",r:"5.5",key:"yqb3hr"}],["path",{d:"m21 2-9.6 9.6",key:"1j0ho8"}],["path",{d:"m15.5 7.5 3 3L22 7l-3-3",key:"1rn1fs"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const le=v("LoaderCircle",[["path",{d:"M21 12a9 9 0 1 1-6.219-8.56",key:"13zald"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=v("Lock",[["rect",{width:"18",height:"11",x:"3",y:"11",rx:"2",ry:"2",key:"1w4ew1"}],["path",{d:"M7 11V7a5 5 0 0 1 10 0v4",key:"fwvmzm"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Oe=v("Mail",[["rect",{width:"20",height:"16",x:"2",y:"4",rx:"2",key:"18n3k1"}],["path",{d:"m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7",key:"1ocrg3"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const De=v("RefreshCw",[["path",{d:"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",key:"v9h5vc"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}],["path",{d:"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",key:"3uifl3"}],["path",{d:"M8 16H3v5",key:"1cv678"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Le=v("Shield",[["path",{d:"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",key:"oel41y"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const kt=v("TriangleAlert",[["path",{d:"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3",key:"wmoenq"}],["path",{d:"M12 9v4",key:"juzpu7"}],["path",{d:"M12 17h.01",key:"p32p05"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Et=v("User",[["path",{d:"M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2",key:"975kel"}],["circle",{cx:"12",cy:"7",r:"4",key:"17ys0d"}]]);/**
 * @license lucide-react v0.364.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const St=v("X",[["path",{d:"M18 6 6 18",key:"1bl5f8"}],["path",{d:"m6 6 12 12",key:"d8bk6v"}]]);class _t extends pt.Component{constructor(t){super(t),this.state={hasError:!1,error:null}}static getDerivedStateFromError(t){return{hasError:!0,error:t}}componentDidCatch(t,s){console.error("[ErrorBoundary] 页面渲染异常",t,s)}render(){return this.state.hasError?r.jsx("div",{className:"flex min-h-screen items-center justify-center bg-gray-50 px-6 py-10",children:r.jsxs("section",{className:"w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm",role:"alert",children:[r.jsx(kt,{className:"mx-auto h-8 w-8 text-red-500","aria-hidden":"true"}),r.jsx("h1",{className:"mt-3 text-lg font-semibold text-gray-900",children:"页面暂时无法显示"}),r.jsx("p",{className:"mt-2 text-sm leading-6 text-gray-500",children:"当前页面遇到异常，您的本地内容不会因此被删除。"}),r.jsxs("button",{type:"button",onClick:()=>window.location.reload(),className:"mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",children:[r.jsx(De,{className:"h-4 w-4","aria-hidden":"true"}),"重新加载"]})]})}):this.props.children}}let Ct={data:""},At=e=>{if(typeof window=="object"){let t=(e?e.querySelector("#_goober"):window._goober)||Object.assign(document.createElement("style"),{innerHTML:" ",id:"_goober"});return t.nonce=window.__nonce__,t.parentNode||(e||document.head).appendChild(t),t.firstChild}return e||Ct},Tt=/(?:([\u0080-\uFFFF\w-%@]+) *:? *([^{;]+?);|([^;}{]*?) *{)|(}\s*)/g,Ot=/\/\*[^]*?\*\/|  +/g,Ie=/\n+/g,T=(e,t)=>{let s="",a="",n="";for(let i in e){let o=e[i];i[0]=="@"?i[1]=="i"?s=i+" "+o+";":a+=i[1]=="f"?T(o,i):i+"{"+T(o,i[1]=="k"?"":t)+"}":typeof o=="object"?a+=T(o,t?t.replace(/([^,])+/g,l=>i.replace(/([^,]*:\S+\([^)]*\))|([^,])+/g,u=>/&/.test(u)?u.replace(/&/g,l):l?l+" "+u:u)):i):o!=null&&(i=/^--/.test(i)?i:i.replace(/[A-Z]/g,"-$&").toLowerCase(),n+=T.p?T.p(i,o):i+":"+o+";")}return s+(t&&n?t+"{"+n+"}":n)+a},_={},$e=e=>{if(typeof e=="object"){let t="";for(let s in e)t+=s+$e(e[s]);return t}return e},Lt=(e,t,s,a,n)=>{let i=$e(e),o=_[i]||(_[i]=(u=>{let d=0,m=11;for(;d<u.length;)m=101*m+u.charCodeAt(d++)>>>0;return"go"+m})(i));if(!_[o]){let u=i!==e?e:(d=>{let m,f,h=[{}];for(;m=Tt.exec(d.replace(Ot,""));)m[4]?h.shift():m[3]?(f=m[3].replace(Ie," ").trim(),h.unshift(h[0][f]=h[0][f]||{})):h[0][m[1]]=m[2].replace(Ie," ").trim();return h[0]})(e);_[o]=T(n?{["@keyframes "+o]:u}:u,s?"":"."+o)}let l=s&&_.g?_.g:null;return s&&(_.g=_[o]),((u,d,m,f)=>{f?d.data=d.data.replace(f,u):d.data.indexOf(u)===-1&&(d.data=m?u+d.data:d.data+u)})(_[o],t,a,l),o},It=(e,t,s)=>e.reduce((a,n,i)=>{let o=t[i];if(o&&o.call){let l=o(s),u=l&&l.props&&l.props.className||/^go/.test(l)&&l;o=u?"."+u:l&&typeof l=="object"?l.props?"":T(l,""):l===!1?"":l}return a+n+(o??"")},"");function Z(e){let t=this||{},s=e.call?e(t.p):e;return Lt(s.unshift?s.raw?It(s,[].slice.call(arguments,1),t.p):s.reduce((a,n)=>Object.assign(a,n&&n.call?n(t.p):n),{}):s,At(t.target),t.g,t.o,t.k)}let ze,ce,de;Z.bind({g:1});let C=Z.bind({k:1});function Pt(e,t,s,a){T.p=t,ze=e,ce=s,de=a}function O(e,t){let s=this||{};return function(){let a=arguments;function n(i,o){let l=Object.assign({},i),u=l.className||n.className;s.p=Object.assign({theme:ce&&ce()},l),s.o=/ *go\d+/.test(u),l.className=Z.apply(s,a)+(u?" "+u:"");let d=e;return e[0]&&(d=l.as||e,delete l.as),de&&d[0]&&de(l),ze(d,l)}return n}}var Rt=e=>typeof e=="function",J=(e,t)=>Rt(e)?e(t):e,Ut=(()=>{let e=0;return()=>(++e).toString()})(),Fe=(()=>{let e;return()=>{if(e===void 0&&typeof window<"u"){let t=matchMedia("(prefers-reduced-motion: reduce)");e=!t||t.matches}return e}})(),Mt=20,ue="default",Be=(e,t)=>{let{toastLimit:s}=e.settings;switch(t.type){case 0:return{...e,toasts:[t.toast,...e.toasts].slice(0,s)};case 1:return{...e,toasts:e.toasts.map(o=>o.id===t.toast.id?{...o,...t.toast}:o)};case 2:let{toast:a}=t;return Be(e,{type:e.toasts.find(o=>o.id===a.id)?1:0,toast:a});case 3:let{toastId:n}=t;return{...e,toasts:e.toasts.map(o=>o.id===n||n===void 0?{...o,dismissed:!0,visible:!1}:o)};case 4:return t.toastId===void 0?{...e,toasts:[]}:{...e,toasts:e.toasts.filter(o=>o.id!==t.toastId)};case 5:return{...e,pausedAt:t.time};case 6:let i=t.time-(e.pausedAt||0);return{...e,pausedAt:void 0,toasts:e.toasts.map(o=>({...o,pauseDuration:o.pauseDuration+i}))}}},K=[],qe={toasts:[],pausedAt:void 0,settings:{toastLimit:Mt}},E={},He=(e,t=ue)=>{E[t]=Be(E[t]||qe,e),K.forEach(([s,a])=>{s===t&&a(E[t])})},Ve=e=>Object.keys(E).forEach(t=>He(e,t)),Dt=e=>Object.keys(E).find(t=>E[t].toasts.some(s=>s.id===e)),X=(e=ue)=>t=>{He(t,e)},$t={blank:4e3,error:4e3,success:2e3,loading:1/0,custom:4e3},zt=(e={},t=ue)=>{let[s,a]=c.useState(E[t]||qe),n=c.useRef(E[t]);c.useEffect(()=>(n.current!==E[t]&&a(E[t]),K.push([t,a]),()=>{let o=K.findIndex(([l])=>l===t);o>-1&&K.splice(o,1)}),[t]);let i=s.toasts.map(o=>{var l,u,d;return{...e,...e[o.type],...o,removeDelay:o.removeDelay||((l=e[o.type])==null?void 0:l.removeDelay)||(e==null?void 0:e.removeDelay),duration:o.duration||((u=e[o.type])==null?void 0:u.duration)||(e==null?void 0:e.duration)||$t[o.type],style:{...e.style,...(d=e[o.type])==null?void 0:d.style,...o.style}}});return{...s,toasts:i}},Ft=(e,t="blank",s)=>({createdAt:Date.now(),visible:!0,dismissed:!1,type:t,ariaProps:{role:"status","aria-live":"polite"},message:e,pauseDuration:0,...s,id:(s==null?void 0:s.id)||Ut()}),B=e=>(t,s)=>{let a=Ft(t,e,s);return X(a.toasterId||Dt(a.id))({type:2,toast:a}),a.id},y=(e,t)=>B("blank")(e,t);y.error=B("error");y.success=B("success");y.loading=B("loading");y.custom=B("custom");y.dismiss=(e,t)=>{let s={type:3,toastId:e};t?X(t)(s):Ve(s)};y.dismissAll=e=>y.dismiss(void 0,e);y.remove=(e,t)=>{let s={type:4,toastId:e};t?X(t)(s):Ve(s)};y.removeAll=e=>y.remove(void 0,e);y.promise=(e,t,s)=>{let a=y.loading(t.loading,{...s,...s==null?void 0:s.loading});return typeof e=="function"&&(e=e()),e.then(n=>{let i=t.success?J(t.success,n):void 0;return i?y.success(i,{id:a,...s,...s==null?void 0:s.success}):y.dismiss(a),n}).catch(n=>{let i=t.error?J(t.error,n):void 0;i?y.error(i,{id:a,...s,...s==null?void 0:s.error}):y.dismiss(a)}),e};var Bt=1e3,qt=(e,t="default")=>{let{toasts:s,pausedAt:a}=zt(e,t),n=c.useRef(new Map).current,i=c.useCallback((f,h=Bt)=>{if(n.has(f))return;let p=setTimeout(()=>{n.delete(f),o({type:4,toastId:f})},h);n.set(f,p)},[]);c.useEffect(()=>{if(a)return;let f=Date.now(),h=s.map(p=>{if(p.duration===1/0)return;let w=(p.duration||0)+p.pauseDuration-(f-p.createdAt);if(w<0){p.visible&&y.dismiss(p.id);return}return setTimeout(()=>y.dismiss(p.id,t),w)});return()=>{h.forEach(p=>p&&clearTimeout(p))}},[s,a,t]);let o=c.useCallback(X(t),[t]),l=c.useCallback(()=>{o({type:5,time:Date.now()})},[o]),u=c.useCallback((f,h)=>{o({type:1,toast:{id:f,height:h}})},[o]),d=c.useCallback(()=>{a&&o({type:6,time:Date.now()})},[a,o]),m=c.useCallback((f,h)=>{let{reverseOrder:p=!1,gutter:w=8,defaultPosition:L}=h||{},N=s.filter(b=>(b.position||L)===(f.position||L)&&b.height),q=N.findIndex(b=>b.id===f.id),M=N.filter((b,P)=>P<q&&b.visible).length;return N.filter(b=>b.visible).slice(...p?[M+1]:[0,M]).reduce((b,P)=>b+(P.height||0)+w,0)},[s]);return c.useEffect(()=>{s.forEach(f=>{if(f.dismissed)i(f.id,f.removeDelay);else{let h=n.get(f.id);h&&(clearTimeout(h),n.delete(f.id))}})},[s,i]),{toasts:s,handlers:{updateHeight:u,startPause:l,endPause:d,calculateOffset:m}}},Ht=C`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
 transform: scale(1) rotate(45deg);
  opacity: 1;
}`,Vt=C`
from {
  transform: scale(0);
  opacity: 0;
}
to {
  transform: scale(1);
  opacity: 1;
}`,Kt=C`
from {
  transform: scale(0) rotate(90deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(90deg);
	opacity: 1;
}`,Wt=O("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#ff4b4b"};
  position: relative;
  transform: rotate(45deg);

  animation: ${Ht} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;

  &:after,
  &:before {
    content: '';
    animation: ${Vt} 0.15s ease-out forwards;
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
    animation: ${Kt} 0.15s ease-out forwards;
    animation-delay: 180ms;
    transform: rotate(90deg);
  }
`,Jt=C`
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
`,Yt=O("div")`
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 2px solid;
  border-radius: 100%;
  border-color: ${e=>e.secondary||"#e0e0e0"};
  border-right-color: ${e=>e.primary||"#616161"};
  animation: ${Jt} 1s linear infinite;
`,Gt=C`
from {
  transform: scale(0) rotate(45deg);
	opacity: 0;
}
to {
  transform: scale(1) rotate(45deg);
	opacity: 1;
}`,Qt=C`
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
}`,Zt=O("div")`
  width: 20px;
  opacity: 0;
  height: 20px;
  border-radius: 10px;
  background: ${e=>e.primary||"#61d345"};
  position: relative;
  transform: rotate(45deg);

  animation: ${Gt} 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
  animation-delay: 100ms;
  &:after {
    content: '';
    box-sizing: border-box;
    animation: ${Qt} 0.2s ease-out forwards;
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
`,Xt=O("div")`
  position: absolute;
`,er=O("div")`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 20px;
  min-height: 20px;
`,tr=C`
from {
  transform: scale(0.6);
  opacity: 0.4;
}
to {
  transform: scale(1);
  opacity: 1;
}`,rr=O("div")`
  position: relative;
  transform: scale(0.6);
  opacity: 0.4;
  min-width: 20px;
  animation: ${tr} 0.3s 0.12s cubic-bezier(0.175, 0.885, 0.32, 1.275)
    forwards;
`,sr=({toast:e})=>{let{icon:t,type:s,iconTheme:a}=e;return t!==void 0?typeof t=="string"?c.createElement(rr,null,t):t:s==="blank"?null:c.createElement(er,null,c.createElement(Yt,{...a}),s!=="loading"&&c.createElement(Xt,null,s==="error"?c.createElement(Wt,{...a}):c.createElement(Zt,{...a})))},ar=e=>`
0% {transform: translate3d(0,${e*-200}%,0) scale(.6); opacity:.5;}
100% {transform: translate3d(0,0,0) scale(1); opacity:1;}
`,nr=e=>`
0% {transform: translate3d(0,0,-1px) scale(1); opacity:1;}
100% {transform: translate3d(0,${e*-150}%,-1px) scale(.6); opacity:0;}
`,or="0%{opacity:0;} 100%{opacity:1;}",ir="0%{opacity:1;} 100%{opacity:0;}",lr=O("div")`
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
`,cr=O("div")`
  display: flex;
  justify-content: center;
  margin: 4px 10px;
  color: inherit;
  flex: 1 1 auto;
  white-space: pre-line;
`,dr=(e,t)=>{let s=e.includes("top")?1:-1,[a,n]=Fe()?[or,ir]:[ar(s),nr(s)];return{animation:t?`${C(a)} 0.35s cubic-bezier(.21,1.02,.73,1) forwards`:`${C(n)} 0.4s forwards cubic-bezier(.06,.71,.55,1)`}},ur=c.memo(({toast:e,position:t,style:s,children:a})=>{let n=e.height?dr(e.position||t||"top-center",e.visible):{opacity:0},i=c.createElement(sr,{toast:e}),o=c.createElement(cr,{...e.ariaProps},J(e.message,e));return c.createElement(lr,{className:e.className,style:{...n,...s,...e.style}},typeof a=="function"?a({icon:i,message:o}):c.createElement(c.Fragment,null,i,o))});Pt(c.createElement);var mr=({id:e,className:t,style:s,onHeightUpdate:a,children:n})=>{let i=c.useCallback(o=>{if(o){let l=()=>{let u=o.getBoundingClientRect().height;a(e,u)};l(),new MutationObserver(l).observe(o,{subtree:!0,childList:!0,characterData:!0})}},[e,a]);return c.createElement("div",{ref:i,className:t,style:s},n)},fr=(e,t)=>{let s=e.includes("top"),a=s?{top:0}:{bottom:0},n=e.includes("center")?{justifyContent:"center"}:e.includes("right")?{justifyContent:"flex-end"}:{};return{left:0,right:0,display:"flex",position:"absolute",transition:Fe()?void 0:"all 230ms cubic-bezier(.21,1.02,.73,1)",transform:`translateY(${t*(s?1:-1)}px)`,...a,...n}},hr=Z`
  z-index: 9999;
  > * {
    pointer-events: auto;
  }
`,H=16,pr=({reverseOrder:e,position:t="top-center",toastOptions:s,gutter:a,children:n,toasterId:i,containerStyle:o,containerClassName:l})=>{let{toasts:u,handlers:d}=qt(s,i);return c.createElement("div",{"data-rht-toaster":i||"",style:{position:"fixed",zIndex:9999,top:H,left:H,right:H,bottom:H,pointerEvents:"none",...o},className:l,onMouseEnter:d.startPause,onMouseLeave:d.endPause},u.map(m=>{let f=m.position||t,h=d.calculateOffset(m,{reverseOrder:e,gutter:a,defaultPosition:t}),p=fr(f,h);return c.createElement(mr,{id:m.id,key:m.id,onHeightUpdate:d.updateHeight,className:m.visible?hr:"",style:p},m.type==="custom"?J(m.message,m):n?n(m):c.createElement(ur,{toast:m,position:f}))}))},U=y;const me="https://notes.binapp.top";function fe(){return typeof window>"u"?void 0:window}function k(){const e=fe();return!!(e!=null&&e.__TAURI_INTERNALS__||e!=null&&e.__TAURI__)}function Ke(){var t,s;if(!k())return!1;const e=(s=(t=fe())==null?void 0:t.location)==null?void 0:s.origin;return e==="tauri://localhost"||e==="http://tauri.localhost"||e==="https://tauri.localhost"}function We(e){const t=String(e||"").trim();if(!t||t.startsWith("//")||t.includes("\\")||/^[a-z][a-z\d+.-]*:/i.test(t))throw new TypeError("Expected a relative application path");return t.startsWith("/")?t:`/${t}`}function gr(){var t,s;const e=(s=(t=fe())==null?void 0:t.location)==null?void 0:s.origin;return e&&e!=="null"?e:me}function A(e){const t=k()?me:gr();return new URL(We(e),t).toString()}function Jr(e){return A(e)}function Yr(e){return new URL(We(e),me).toString()}const yr="auth-session.json",he="session",Je="notesapp_token",Ye="notesapp_user";let V=null,Y=Promise.resolve();function pe(e){const t=e;return!(t!=null&&t.id)||!(t!=null&&t.email)?null:{id:t.id,email:t.email,display_name:t.display_name||t.email.split("@")[0]}}function Ge(e){const t=e,s=pe(t==null?void 0:t.user);return s?{version:1,accessToken:typeof(t==null?void 0:t.accessToken)=="string"&&t.accessToken?t.accessToken:null,user:s,updatedAt:typeof(t==null?void 0:t.updatedAt)=="string"?t.updatedAt:new Date().toISOString()}:null}async function ge(){return k()?(V||(V=yt.load(yr,{autoSave:!1,defaults:{}}).catch(e=>(V=null,console.warn("[NativeAuth] 打开原生会话桥失败:",e),null))),V):null}function Qe(e){const t=Y.catch(()=>{}).then(e);return Y=t,t}function Ze(e){const t=Ge(e);if(!t||typeof localStorage>"u")return!1;try{return t.accessToken&&localStorage.setItem(Je,t.accessToken),localStorage.setItem(Ye,JSON.stringify(t.user)),!0}catch{return!1}}async function ee(e,t){const s=pe(t);if(!s||!k())return!1;const a={version:1,accessToken:e||null,user:s,updatedAt:new Date().toISOString()};return Qe(async()=>{const n=await ge();return n?(await n.set(he,a),await n.save(),!0):!1})}async function ye(){await Y.catch(()=>{});const e=await ge();return e?Ge(await e.get(he)):null}async function Xe(){const e=await ye();return e!=null&&e.accessToken?ee(null,e.user):!!e}async function et(){return k()?Qe(async()=>{const e=await ge();return e?(await e.delete(he),await e.save(),!0):!1}):!1}function xe(e,t){!k()||!(t!=null&&t.id)||!(t!=null&&t.email)||ee(e,t)}function tt(){k()&&et()}async function xr(){await Y.catch(()=>{})}async function br(){if(!k())return null;const e=await ye().catch(()=>null);if(e&&Ze(e),Ke())return e!=null&&e.accessToken&&await Xe(),e;try{const t=localStorage.getItem(Je),s=pe(JSON.parse(localStorage.getItem(Ye)||"null"));s&&await ee(t,s)}catch{}return e}const vr=Object.freeze(Object.defineProperty({__proto__:null,applyNativeAuthSessionToWebStorage:Ze,clearNativeAuthBridge:et,consumeNativeAuthBridgeToken:Xe,flushNativeAuthBridgeWrites:xr,hydrateAuthSessionFromNativeBridge:br,persistNativeAuthBridge:ee,readNativeAuthBridge:ye,scheduleNativeAuthBridgeClear:tt,scheduleNativeAuthBridgeWrite:xe},Symbol.toStringTag,{value:"Module"})),G="notesapp_token",be="notesapp_user";let I=null;function wr(){if(typeof window>"u")return!1;const e=window;return!!(e.__TAURI_INTERNALS__||e.__TAURI__)}function jr(){if(typeof window>"u")return!1;if(wr())return!0;try{return localStorage.getItem("notesapp_force_local_token")==="1"}catch{return!1}}function ve(){try{return localStorage.getItem(G)||""}catch{return""}}function we(e){const t=(e==null?void 0:e.access_token)||"";try{t&&jr()?localStorage.setItem(G,t):localStorage.removeItem(G)}catch{}xe(t,Q())}function te(e){e!=null&&e.id&&(e!=null&&e.email)&&(I={id:e.id,email:e.email,display_name:e.display_name||e.email.split("@")[0]});try{e!=null&&e.id&&(e!=null&&e.email)&&localStorage.setItem(be,JSON.stringify(I))}catch{}xe(ve(),I)}function Q(){try{const e=localStorage.getItem(be);if(!e)return I;const t=JSON.parse(e);return!(t!=null&&t.id)||!(t!=null&&t.email)?I:{id:t.id,email:t.email,display_name:t.display_name||t.email.split("@")[0]}}catch{return I}}function rt(){I=null;try{localStorage.removeItem(G),localStorage.removeItem(be)}catch{}tt()}function re(e=!1){const t=ve();return{...e?{"Content-Type":"application/json"}:{},...t?{Authorization:`Bearer ${t}`}:{}}}function se(e,t={},s=!1){return fetch(e,{...t,credentials:"include",headers:{...re(s),...t.headers||{}}})}async function Pe(e,t){const s=await se(A("/api/auth/v1/token"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t,grant_type:"password"})});if(!s.ok){const n=await s.json().catch(()=>({}));throw new Error(n.error||"账号或密码错误")}const a=await s.json();return we(a),te(a.user),a}async function Nr(e,t,s,a){const n=await se(A("/api/auth/v1/token"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:t,grant_type:"signup",display_name:s,verifyToken:a})});if(!n.ok){const o=await n.json().catch(()=>({}));throw new Error(o.error||"注册失败")}const i=await n.json();return we(i),te(i.user),i}async function Gr(){const e=await se(A("/api/auth/v1/refresh"),{method:"POST",headers:re(!0)}),t=await e.json().catch(()=>({}));if(!e.ok)throw new Error(t.error||"登录续期失败");return we(t),te(t.user),t}async function kr(e,t){const s=await fetch(A("/api/send-code"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,purpose:t})}),a=await s.json().catch(()=>({}));if(!s.ok)throw new Error(a.error||"发送验证码失败");return a}async function Er(e,t,s){const a=await fetch(A("/api/verify-code"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,code:t,purpose:s})}),n=await a.json().catch(()=>({}));if(!a.ok)throw new Error(n.error||"验证码验证失败");return n}async function Sr(e,t,s){const a=await fetch(A("/api/reset-password"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,newPassword:t,verifyToken:s})}),n=await a.json().catch(()=>({}));if(!a.ok)throw new Error(n.error||"重置密码失败");return n}async function Qr(){await se(A("/api/auth/v1/logout"),{method:"POST",headers:re(!0),body:JSON.stringify({})}).catch(()=>{}),rt(),window.location.reload()}function _r(e){try{const t=e.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"),s=decodeURIComponent(atob(t).split("").map(a=>"%"+("00"+a.charCodeAt(0).toString(16)).slice(-2)).join(""));return JSON.parse(s)}catch{return null}}function Zr(){var t;const e=ve();if(e){const s=_r(e);if(s!=null&&s.sub)return s.sub}return((t=Q())==null?void 0:t.id)||null}async function Cr(){let e;try{e=await fetch(A("/api/auth/v1/me"),{method:"GET",credentials:"include",headers:re(!1)})}catch{return null}if(!e.ok)return(e.status===401||e.status===403)&&rt(),null;const t=await e.json().catch(()=>null);if(!(t!=null&&t.id)||!(t!=null&&t.email))return null;const s=t.display_name||t.email.split("@")[0];return te({id:t.id,email:t.email,display_name:s}),{id:t.id,email:t.email,display_name:s,user_metadata:{display_name:s}}}const st=c.createContext({user:null,loading:!0}),Ar=()=>c.useContext(st);function Tr({children:e}){const t=Q(),[s,a]=c.useState(t),[n,i]=c.useState(!t);return c.useEffect(()=>{let o=!1;async function l(){try{const u=await Cr();if(o)return;if(u){a(u);return}const d=Q();a(d||null)}finally{o||i(!1)}}return l(),()=>{o=!0}},[]),r.jsx(st.Provider,{value:{user:s,loading:n},children:e})}const Or=/HTTP|SQL|ECONN|stack|Internal Server Error|TypeError|ReferenceError|SyntaxError|\/api\/|\bat\s+\w+/i,Lr=/[\u3400-\u9fff]/u;function Ir(e,t){const s=typeof e=="string"?e.trim():e instanceof Error?e.message.trim():"";return!s||s.length>120||!Lr.test(s)||Or.test(s)?t:s}function Pr(e,t=!0){const s=c.useRef(null),a=c.useId(),n=c.useRef(e);return c.useEffect(()=>{n.current=e},[e]),c.useEffect(()=>{if(!t)return;const i=document.activeElement instanceof HTMLElement?document.activeElement:null,o=document.body.style.overflow;document.body.style.overflow="hidden";const l=window.setTimeout(()=>{var d;return(d=s.current)==null?void 0:d.focus()},0),u=d=>{var p,w;if(d.key==="Escape"){d.preventDefault(),n.current();return}if(d.key!=="Tab")return;const m=Array.from(((p=s.current)==null?void 0:p.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))||[]);if(m.length===0){d.preventDefault(),(w=s.current)==null||w.focus();return}const f=m[0],h=m[m.length-1];d.shiftKey&&(document.activeElement===f||document.activeElement===s.current)?(d.preventDefault(),h.focus()):!d.shiftKey&&document.activeElement===h&&(d.preventDefault(),f.focus())};return document.addEventListener("keydown",u),()=>{window.clearTimeout(l),document.removeEventListener("keydown",u),document.body.style.overflow=o,i==null||i.focus()}},[t]),{dialogRef:s,titleId:a}}function Rr({message:e,onClose:t}){const{dialogRef:s,titleId:a}=Pr(t);return r.jsx("div",{className:"fixed inset-0 z-[1001] flex items-center justify-center bg-black/50 px-4",onClick:t,children:r.jsxs("div",{ref:s,role:"dialog","aria-modal":"true","aria-labelledby":a,tabIndex:-1,className:"w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-xl outline-none",onClick:n=>n.stopPropagation(),children:[r.jsxs("div",{className:"flex items-start gap-3",children:[r.jsx(jt,{className:"mt-0.5 h-5 w-5 shrink-0 text-red-500","aria-hidden":"true"}),r.jsxs("div",{className:"min-w-0 flex-1",children:[r.jsx("h2",{id:a,className:"font-semibold text-gray-900",children:"操作未完成"}),r.jsx("p",{className:"mt-2 text-sm leading-6 text-gray-600",children:e})]})]}),r.jsx("button",{type:"button",onClick:t,className:"mt-5 flex h-9 w-full items-center justify-center rounded-md bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",children:"确定"})]})})}function z(e,t){const s=e instanceof Error?e.message:String((e==null?void 0:e.message)||"");return/load failed|failed to fetch|networkerror|network request failed/i.test(s)?"无法连接服务器，请检查网络后重试":s==="Invalid credentials"?"邮箱或密码错误":s==="No local password"?"该账号尚未设置本地密码，请点击“忘记密码”，通过邮箱验证设置新密码后登录":/already exists|already registered/i.test(s)?"该邮箱已注册":Ir(s,t)}function Ur({isOpen:e,onClose:t,onSuccess:s}){const[a,n]=c.useState("login"),[i,o]=c.useState(""),[l,u]=c.useState(""),[d,m]=c.useState(""),[f,h]=c.useState(""),[p,w]=c.useState(!1),[L,N]=c.useState(!1),[q,M]=c.useState(""),[b,P]=c.useState(""),[j,je]=c.useState(""),[Ne,ke]=c.useState(!1),[R,ae]=c.useState(0),[Ee,Se]=c.useState(!1);if(c.useEffect(()=>{if(R<=0)return;const g=setTimeout(()=>ae(R-1),1e3);return()=>clearTimeout(g)},[R]),!e)return null;const x=g=>M(g),nt=()=>M(""),ot=async g=>{const S=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;if(!i){x("请输入邮箱地址");return}if(!S.test(i)){x("请输入有效的邮箱地址");return}Se(!0);try{await kr(i,g),ke(!0),ae(60),U.success("验证码已发送到您的邮箱")}catch(ht){x(z(ht,"发送验证码失败"))}finally{Se(!1)}},it=async g=>{if(!b){x("请输入验证码");return}if(b.length!==6){x("请输入6位验证码");return}N(!0);try{const S=await Er(i,b,g);je(S.verifyToken),U.success("邮箱验证成功")}catch(S){x(z(S,"验证码错误"))}finally{N(!1)}},lt=async()=>{if(!i||!l){x("请填写邮箱和密码");return}N(!0);try{await Pe(i,l),U.success("登录成功"),s==null||s(),t(),setTimeout(()=>window.location.reload(),300)}catch(g){x(z(g,"登录失败，请稍后重试"))}finally{N(!1)}},ct=async()=>{if(!j){x("请先完成邮箱验证");return}if(!f){x("请输入昵称");return}if(l.length<6){x("密码至少需要6位");return}if(l!==d){x("两次输入的密码不一致");return}N(!0);try{await Nr(i,l,f,j),await Pe(i,l),U.success("注册成功"),D(),s==null||s(),t(),setTimeout(()=>window.location.reload(),300)}catch(g){x(z(g,"注册失败，请重试"))}finally{N(!1)}},dt=async()=>{if(!j){x("请先完成邮箱验证");return}if(l.length<6){x("密码至少需要6位");return}if(l!==d){x("两次输入的密码不一致");return}N(!0);try{await Sr(i,l,j),U.success("密码重置成功，请使用新密码登录"),D(),n("login")}catch(g){x(z(g,"密码重置失败"))}finally{N(!1)}},D=()=>{o(""),u(""),m(""),h(""),P(""),je(""),ke(!1),ae(0)},_e=()=>{n("login"),D()},ut=()=>{n("register"),D()},mt=()=>{n("forgot-password"),D()},ft=g=>{g.preventDefault(),a==="login"?lt():a==="register"?ct():dt()},Ce=g=>r.jsxs("div",{className:"space-y-3",children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"邮箱"}),r.jsxs("div",{className:"flex gap-2",children:[r.jsxs("div",{className:"relative flex-1",children:[r.jsx(Oe,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:"email","aria-label":"邮箱",value:i,onChange:S=>o(S.target.value),placeholder:"your@email.com",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",disabled:!!j,required:!0})]}),r.jsx("button",{type:"button",onClick:()=>ot(g),disabled:Ee||R>0||!!j,className:"px-4 py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5",children:Ee?r.jsxs(r.Fragment,{children:[r.jsx(le,{className:"w-3.5 h-3.5 animate-spin"})," 发送中"]}):j?r.jsxs(r.Fragment,{children:[r.jsx(ne,{className:"w-3.5 h-3.5"})," 已验证"]}):R>0?`${R}s`:Ne?r.jsxs(r.Fragment,{children:[r.jsx(De,{className:"w-3.5 h-3.5"})," 重新发送"]}):"发送验证码"})]})]}),!j&&Ne&&r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"验证码"}),r.jsxs("div",{className:"flex gap-2",children:[r.jsxs("div",{className:"relative flex-1",children:[r.jsx(Nt,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:"text","aria-label":"验证码",value:b,onChange:S=>P(S.target.value.replace(/\D/g,"").slice(0,6)),placeholder:"输入6位数字验证码",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all tracking-widest text-center font-mono text-lg",maxLength:6,required:!0})]}),r.jsx("button",{type:"button",onClick:()=>it(g),disabled:b.length!==6||L,className:"px-4 py-2.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed",children:L?r.jsx(le,{className:"w-3.5 h-3.5 animate-spin"}):"验证"})]}),r.jsxs("p",{className:"text-xs text-gray-400 mt-1.5",children:["验证码已发送到 ",i,"，请查收（可能在垃圾邮件中）"]})]}),j&&r.jsxs("div",{className:"bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2",children:[r.jsx(ne,{className:"w-5 h-5 text-green-500 flex-shrink-0"}),r.jsx("span",{className:"text-sm text-green-700 font-medium",children:"邮箱验证成功"})]})]});return r.jsxs("div",{className:"fixed inset-0 z-[1000] overflow-y-auto bg-black/50 p-4 md:p-6",children:[r.jsx("div",{className:"flex min-h-full items-center justify-center",children:r.jsxs("div",{"data-auth-modal":"panel",role:"dialog","aria-modal":"true","aria-labelledby":"auth-modal-title",className:"relative grid w-full max-w-[880px] overflow-hidden rounded-lg bg-white shadow-2xl md:grid-cols-[300px_minmax(0,1fr)]",children:[r.jsxs("aside",{className:"hidden min-h-[500px] flex-col justify-between bg-gradient-to-br from-blue-500 to-indigo-600 p-8 text-white md:flex",children:[r.jsxs("div",{children:[r.jsx("div",{className:"mb-7 flex h-11 w-11 items-center justify-center rounded-lg bg-white/15",children:r.jsx(Te,{className:"h-6 w-6"})}),r.jsx("p",{className:"text-sm font-medium text-blue-100",children:"彩云笔记"}),r.jsx("h2",{className:"mt-2 text-2xl font-bold",children:a==="login"?"欢迎回来":a==="register"?"创建您的账号":"找回账号访问权"}),r.jsx("p",{className:"mt-3 text-sm leading-6 text-blue-100",children:a==="login"?"登录后继续同步您的笔记和工作区。":a==="register"?"完成邮箱验证后即可开始使用。":"通过已验证邮箱安全地重置密码。"})]}),r.jsxs("div",{className:"space-y-5 border-t border-white/20 pt-6 text-sm",children:[r.jsxs("div",{className:"flex gap-3",children:[r.jsx(Te,{className:"mt-0.5 h-5 w-5 flex-none text-emerald-300"}),r.jsxs("div",{children:[r.jsx("p",{className:"font-medium",children:"独立数据库"}),r.jsx("p",{className:"mt-1 leading-5 text-blue-100",children:"笔记数据存储在自建 PostgreSQL 服务。"})]})]}),r.jsxs("div",{className:"flex gap-3",children:[r.jsx(Le,{className:"mt-0.5 h-5 w-5 flex-none text-emerald-300"}),r.jsxs("div",{children:[r.jsx("p",{className:"font-medium",children:"密码加密存储"}),r.jsx("p",{className:"mt-1 leading-5 text-blue-100",children:"账号凭据不会以明文保存。"})]})]})]})]}),r.jsxs("section",{className:"relative min-w-0 px-5 py-5 sm:px-7 md:px-9 md:py-7",children:[r.jsxs("div",{className:"mb-5 flex items-start justify-between gap-4",children:[r.jsxs("div",{children:[r.jsx("h2",{id:"auth-modal-title",className:"text-xl font-bold text-gray-900",children:a==="login"?"欢迎回来":a==="register"?"注册账号":"重置密码"}),r.jsx("p",{className:"mt-1 text-sm text-gray-500",children:a==="login"?"登录以同步您的笔记":a==="register"?"创建账号开始使用":"通过邮箱验证重置密码"})]}),r.jsx("button",{type:"button",onClick:t,"aria-label":"关闭",className:"rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700",children:r.jsx(St,{className:"w-5 h-5"})})]}),r.jsxs("form",{onSubmit:ft,className:"space-y-4",children:[a==="register"&&r.jsxs(r.Fragment,{children:[j&&r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"昵称"}),r.jsxs("div",{className:"relative",children:[r.jsx(Et,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:"text","aria-label":"昵称",value:f,onChange:g=>h(g.target.value),placeholder:"输入您的昵称",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0})]})]}),Ce("register"),j&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"密码"}),r.jsxs("div",{className:"relative",children:[r.jsx($,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:p?"text":"password","aria-label":"密码",value:l,onChange:g=>u(g.target.value),placeholder:"设置登录密码（至少6位）",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),r.jsx("button",{type:"button",onClick:()=>w(!p),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:p?r.jsx(oe,{className:"w-4 h-4"}):r.jsx(ie,{className:"w-4 h-4"})})]})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"确认密码"}),r.jsxs("div",{className:"relative",children:[r.jsx($,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:p?"text":"password","aria-label":"确认密码",value:d,onChange:g=>m(g.target.value),placeholder:"再次输入密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",minLength:6})]})]})]}),r.jsx("div",{className:"bg-blue-50 border border-blue-200 rounded-lg p-3",children:r.jsxs("div",{className:"flex items-start gap-2",children:[r.jsx(Le,{className:"w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"}),r.jsxs("div",{className:"text-sm text-blue-700",children:[r.jsx("p",{className:"font-medium mb-1",children:"邮箱验证注册"}),r.jsx("p",{className:"text-blue-600",children:"验证邮箱后即可注册使用，确保账号安全。"})]})]})})]}),a==="forgot-password"&&r.jsxs(r.Fragment,{children:[Ce("reset-password"),j&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"新密码"}),r.jsxs("div",{className:"relative",children:[r.jsx($,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:p?"text":"password","aria-label":"新密码",value:l,onChange:g=>u(g.target.value),placeholder:"设置新密码（至少6位）",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),r.jsx("button",{type:"button",onClick:()=>w(!p),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:p?r.jsx(oe,{className:"w-4 h-4"}):r.jsx(ie,{className:"w-4 h-4"})})]})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"确认新密码"}),r.jsxs("div",{className:"relative",children:[r.jsx($,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:p?"text":"password","aria-label":"确认新密码",value:d,onChange:g=>m(g.target.value),placeholder:"再次输入新密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",minLength:6})]})]})]})]}),a==="login"&&r.jsxs(r.Fragment,{children:[r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"邮箱"}),r.jsxs("div",{className:"relative",children:[r.jsx(Oe,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:"email","aria-label":"邮箱",value:i,onChange:g=>o(g.target.value),placeholder:"your@email.com",className:"w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0})]})]}),r.jsxs("div",{children:[r.jsx("label",{className:"block text-sm font-medium text-gray-700 mb-1.5",children:"密码"}),r.jsxs("div",{className:"relative",children:[r.jsx($,{className:"absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"}),r.jsx("input",{type:p?"text":"password","aria-label":"密码",value:l,onChange:g=>u(g.target.value),placeholder:"输入密码",className:"w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all",required:!0,minLength:6}),r.jsx("button",{type:"button",onClick:()=>w(!p),className:"absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600",children:p?r.jsx(oe,{className:"w-4 h-4"}):r.jsx(ie,{className:"w-4 h-4"})})]})]}),r.jsx("div",{className:"text-right",children:r.jsx("button",{type:"button",onClick:mt,className:"text-sm text-blue-500 hover:text-blue-600",children:"忘记密码？"})})]}),r.jsx("button",{type:"submit",disabled:L||a!=="login"&&!j,className:"w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4",children:L?r.jsxs(r.Fragment,{children:[r.jsx(le,{className:"w-4 h-4 animate-spin"}),a==="login"?"登录中...":a==="register"?"注册中...":"重置中..."]}):r.jsxs(r.Fragment,{children:[r.jsx(ne,{className:"w-4 h-4"}),a==="login"?"登录":a==="register"?"注册":"重置密码"]})}),r.jsxs("div",{className:"text-center pt-2 flex items-center justify-center gap-3",children:[a==="login"&&r.jsx("button",{type:"button",onClick:ut,className:"text-sm text-blue-500 hover:text-blue-600",children:"还没有账号？立即注册"}),a==="register"&&r.jsx("button",{type:"button",onClick:_e,className:"text-sm text-gray-500 hover:text-gray-700",children:"已有账号？立即登录"}),a==="forgot-password"&&r.jsx("button",{type:"button",onClick:_e,className:"text-sm text-gray-500 hover:text-gray-700",children:"返回登录"})]}),r.jsx("div",{className:"mt-4 border-t border-gray-100 pt-4 text-center",children:r.jsx("p",{className:"text-xs text-gray-400",children:"献给热爱知识管理的你——彬"})})]})]})]})}),q&&r.jsx(Rr,{message:q,onClose:nt})]})}const at="/assets/logo-Cw1I6IdG.png",Mr=c.lazy(()=>W(()=>import("./App-CdNuGLSp.js").then(e=>e.al),__vite__mapDeps([0,1,2,3,4,5])));function Re({status:e}){return r.jsx("div",{className:"flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100",children:r.jsxs("div",{className:"w-72 text-center",children:[r.jsx("img",{src:at,alt:"彩云笔记",className:"mx-auto mb-4 h-24 w-24 object-contain"}),r.jsx("div",{className:"mb-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200",children:r.jsx("div",{className:"h-full w-2/3 animate-pulse rounded-full bg-blue-500"})}),r.jsx("p",{className:"text-sm text-gray-500",children:e})]})})}function Dr(){const{user:e,loading:t}=Ar(),[s,a]=c.useState(!1);return t?r.jsx(Re,{status:"正在验证登录状态"}):e?r.jsx(c.Suspense,{fallback:r.jsx(Re,{status:"正在载入本地工作区"}),children:r.jsx(Mr,{})}):r.jsxs("div",{className:"flex h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100",children:[r.jsxs("div",{className:"mx-auto max-w-md px-6 text-center",children:[r.jsx("div",{className:"mx-auto mb-6 flex h-24 w-24 items-center justify-center",children:r.jsx("img",{src:at,alt:"彩云笔记",className:"h-full w-full object-contain"})}),r.jsx("h1",{className:"mb-2 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-3xl font-bold text-transparent",children:"彩云笔记"}),r.jsx("p",{className:"mb-8 text-gray-600",children:"安全可靠的云端笔记应用，让记录更轻松"}),r.jsx("button",{onClick:()=>a(!0),className:"rounded-lg bg-blue-500 px-8 py-3 font-medium text-white shadow-sm transition-colors hover:bg-blue-600",children:"登录 / 注册"}),r.jsx("p",{className:"mt-8 text-sm text-gray-400",children:"献给热爱知识管理的你——彬"})]}),r.jsx(Ur,{isOpen:s,onClose:()=>a(!1)}),r.jsx(pr,{position:"bottom-center"})]})}function $r(){return r.jsx(Tr,{children:r.jsx(Dr,{})})}const Ue="caiyun_frontend_bundle_ready_notice_v1",zr=2500;let Me=!1,F=null;async function Fr(){const{invoke:e}=await W(async()=>{const{invoke:t}=await import("./tauri-Dfr_IEKd.js").then(s=>s.d);return{invoke:t}},[]);return e("check_frontend_bundle_update")}function Br(e,t){sessionStorage.getItem(Ue)!==e&&(sessionStorage.setItem(Ue,e),t("界面更新已准备好，下次启动生效"),window.dispatchEvent(new CustomEvent("frontend-bundle-update-ready",{detail:{releaseId:e}})))}function qr(e={}){if(!e.invoke&&!k())return Promise.resolve(null);if(F)return F;const t=e.invoke||Fr,s=e.notify||(a=>U.success(a));return F=t("check_frontend_bundle_update").then(a=>(a.status==="installed"&&a.releaseId?Br(a.releaseId,s):a.status==="requiresShellUpdate"&&(s("界面更新需要新版桌面端，请先更新 App"),window.dispatchEvent(new CustomEvent("frontend-bundle-shell-update-required",{detail:{releaseId:a.releaseId||null,minShellVersion:a.minShellVersion||null}}))),a)).catch(a=>(console.warn("[FrontendBundle] 后台检查界面更新失败:",a),null)).finally(()=>{F=null}),F}function Hr(e=zr){Me||!k()||(Me=!0,window.setTimeout(()=>{qr()},Math.max(0,e)))}async function Vr(){if(k()){const{hydrateAuthSessionFromNativeBridge:e}=await W(async()=>{const{hydrateAuthSessionFromNativeBridge:s}=await Promise.resolve().then(()=>vr);return{hydrateAuthSessionFromNativeBridge:s}},void 0),t=await e();if(t!=null&&t.user.id&&Ke()){const{restoreNativeWorkspaceBootstrap:s}=await W(async()=>{const{restoreNativeWorkspaceBootstrap:a}=await import("./nativeWorkspaceTransfer-BMcoR19_.js").then(n=>n.H);return{restoreNativeWorkspaceBootstrap:a}},__vite__mapDeps([2,3]));await s(t.user.id).catch(a=>{console.warn("[NativeWorkspace] 恢复首屏迁移快照失败:",a)})}}gt.createRoot(document.getElementById("root")).render(r.jsx(c.StrictMode,{children:r.jsx(_t,{children:r.jsx($r,{})})})),Hr()}Vr();export{jt as C,Te as D,ie as E,pr as F,Nt as K,le as L,Oe as M,De as R,Le as S,kt as T,Et as U,St as X,W as _,se as a,A as b,v as c,re as d,rt as e,Jr as f,Zr as g,xr as h,k as i,ve as j,Pr as k,at as l,Cr as m,y as n,ne as o,_r as p,Yr as q,Gr as r,jr as s,Ir as t,Ar as u,Qr as v,$ as w,U as z};
