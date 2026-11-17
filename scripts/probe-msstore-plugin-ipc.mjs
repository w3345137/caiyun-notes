const phase = process.argv[2];
const base = 'http://127.0.0.1:18495';
let target;
for (let attempt = 0; attempt < 35 && !target; attempt++) {
  try {
    const response = await fetch(base+'/json/list', {signal:AbortSignal.timeout(900)});
    const targets = await response.json();
    target = targets.find(entry => entry.type==='page' && /^https?:\/\/tauri\.localhost(?:\/|$)/.test(entry.url));
    if (!target && attempt===15) console.log('WebView targets',targets.map(t=>({type:t.type,origin:new URL(t.url).origin})));
  } catch {}
  if (!target) await new Promise(resolve=>setTimeout(resolve,1000));
}
if (!target) throw new Error('Actual packaged main WebView2 CDP target not found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
const timeLimit = setTimeout(()=>{console.error('CDP probe timed out');process.exit(1);},80000);
let requestId = 0;
const requests = new Map();
socket.addEventListener('message', event=>{
  const message=JSON.parse(event.data);
  const callback=requests.get(message.id);
  if (callback) {requests.delete(message.id);message.error?callback.reject(message.error):callback.resolve(message.result);}
});
try {
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  const call = (method,params={})=>new Promise((resolve,reject)=>{
    const id=++requestId;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));
  });
  const evalInApp = async expression=>{
    const {result,exceptionDetails}=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if(exceptionDetails)throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  const view = await evalInApp(`(async()=>{
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    const call = async (command,args={}) => {
      try {return {ok:true,value:await Promise.race([invoke(command,args),new Promise((_,reject)=>setTimeout(()=>reject('IPC timed out'),6000))])}}
      catch(e) {return {ok:false,error:String(e)}}
    };
    return {origin:location.origin,userAgent:navigator.userAgent,modules:[...document.querySelectorAll('script[type=module]')].map(s=>new URL(s.src).pathname),
      nativeVersion:await call('plugin_host_version'), distribution:await call('get_app_distribution_channel'),
      shellVersion:await call('plugin:app|version')};
  })()`);
  console.log(phase,JSON.stringify(view));
  const runtime = await evalInApp(`(async()=>{
    const f=document.createElement('iframe'); f.sandbox='allow-scripts'; f.src='http://caiyun-plugin.localhost/v1.html';
    const token='ci-isolated-plugin-probe';
    const result=await new Promise(resolve=>{
      const finish=value=>{clearTimeout(timer);removeEventListener('message',onMessage);f.remove();resolve(value);};
      const timer=setTimeout(()=>finish({ready:false}),7000);
      const onMessage=e=>{if(e.source===f.contentWindow&&e.data?.token===token&&e.data?.type==='ready')finish({ready:true});};
      addEventListener('message',onMessage);
      f.onload=()=>f.contentWindow.postMessage({channel:'caiyun-plugin-v1',type:'init',mode:'ui',token,ui:{html:'<p>CI probe</p>',css:'',js:''}},'*');
      document.body.append(f);
    }); return result;
  })()`);
  console.log(phase,'sandbox',JSON.stringify(runtime));
  if(phase==='direct'){
    if(view.distribution.value!=='direct') throw new Error('Expected the standalone executable');
    await evalInApp("localStorage.setItem('caiyun-isolated-ci-direct-marker','p25')");
  }
  if(phase==='bundled'){
    console.log('Standalone-to-store profile continuity',await evalInApp("localStorage.getItem('caiyun-isolated-ci-direct-marker') === 'p25'"));
    const update=await evalInApp(`window.__TAURI_INTERNALS__.invoke('check_frontend_bundle_update').then(x=>({status:x.status,releaseId:x.releaseId})).catch(e=>({error:String(e)}))`);
    console.log(phase,'signed frontend',JSON.stringify(update));
  }
  if(phase==='restarted' && (!view.nativeVersion.ok || view.nativeVersion.value!==1 || !runtime.ready)){
    throw new Error('Packaged plugin host or sandbox probe failed');
  }
} finally {
  clearTimeout(timeLimit);
  socket.close();
}
