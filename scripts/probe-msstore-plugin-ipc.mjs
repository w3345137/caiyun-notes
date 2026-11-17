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
  for(let attempt=0;attempt<35;attempt++){
    const ready=await evalInApp("typeof window.__TAURI_INTERNALS__?.invoke==='function' && !!document.querySelector('script[type=module]')").catch(()=>false);
    if(ready)break;
    if(attempt===34)throw new Error('Main document did not finish navigation to the Tauri origin');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  const view = await evalInApp(`(async()=>{
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    const call = async (command,args={}) => {
      try {return {ok:true,value:await Promise.race([invoke(command,args),new Promise((_,reject)=>setTimeout(()=>reject('IPC timed out'),6000))])}}
      catch(e) {return {ok:false,error:String(e)}}
    };
    return {origin:location.origin,userAgent:navigator.userAgent,modules:[...document.querySelectorAll('script[type=module]')].map(s=>new URL(s.src).pathname),
      nativeVersion:await call('plugin_host_version'), distribution:await call('get_app_distribution_channel'),
      shellVersion:await call('plugin:app|version'), speech:await call('qwen_models').then(r=>r.ok?{ok:r.ok,available:r.value.available,engine:r.value.engine}:r)};
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
  if(phase==='previous'){
    if(view.distribution.value!=='msstore'||view.shellVersion.value!=='10.2.13')throw new Error('Expected the previous Microsoft Store build');
  }
  if(phase==='direct'){
    if(view.distribution.value!=='direct') throw new Error('Expected the standalone executable');
    await evalInApp(`new Promise((resolve,reject)=>{
      const request=indexedDB.open('caiyun-isolated-msix-qa',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('test');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,tx=db.transaction('test','readwrite');
        tx.objectStore('test').put('p25','marker');
        tx.oncomplete=()=>{db.close();resolve(true);};
        tx.onerror=()=>reject(tx.error);
      };
    })`);
  }
  if(phase==='bundled'){
    const markerContinues=await evalInApp(`new Promise((resolve,reject)=>{
      const request=indexedDB.open('caiyun-isolated-msix-qa',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('test');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{const db=request.result,query=db.transaction('test').objectStore('test').get('marker');
        query.onsuccess=()=>{db.close();resolve(query.result==='p25');};
        query.onerror=()=>reject(query.error);
      };
    })`);
    if(!markerContinues)throw new Error('IndexedDB marker was not retained through MSIX upgrade');
  }
  if (phase==='previous'||phase==='bundled') {
    const update=await evalInApp(`(async()=>{
      for(let i=0;i<18;i++){
        const result=await window.__TAURI_INTERNALS__.invoke('check_frontend_bundle_update').catch(e=>({error:String(e)}));
        if(result.status!=='busy')return {status:result.status,releaseId:result.releaseId,error:result.error};
        await new Promise(r=>setTimeout(r,800));
      }
      return {error:'signed update still busy'};
    })()`);
    console.log(phase,'signed frontend',JSON.stringify(update));
    if(phase==='previous' && (update.error || !update.releaseId)){
      throw new Error('Could not seed the previous signed frontend before upgrade');
    }
  }
  if (phase === 'bundled' || phase === 'restarted') {
    if (view.distribution.value !== 'msstore' || view.shellVersion.value !== '10.2.14') {
      throw new Error('Wrong candidate store channel or shell version');
    }
    if (!view.modules.some(path=>/-sync-[a-f0-9]{12}\.js$/.test(path))) {
      throw new Error('The embedded patched frontend was replaced');
    }
    if (!view.speech.ok || !view.speech.available || view.speech.engine !== 'cpu') throw new Error('The packaged app cannot resolve its offline speech helper');
    if (!view.nativeVersion.ok || view.nativeVersion.value !== 1 || !runtime.ready) {
      throw new Error('Packaged plugin host or sandbox probe failed');
    }
  }
  if(phase==='restarted' && (!view.nativeVersion.ok || view.nativeVersion.value!==1 || !runtime.ready)){
    throw new Error('Packaged plugin host or sandbox probe failed');
  }
} finally {
  clearTimeout(timeLimit);
  socket.close();
}
