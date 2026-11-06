/* Frozen public runtime v1. No imports from the application or native IPC. */
(() => {
  let initialized = false, token = '', worker, workerUrl;
  function sdk(send, listen) {
    let next = 0; const pending = new Map(), listeners = new Map();
    listen(m => {
      if (m.type === 'result') { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.value); } }
      if (m.type === 'event') for (const fn of listeners.get(m.name) || []) { try { fn(m.value); } catch (_) {} }
    });
    const call = (method, params) => new Promise((resolve,reject) => {
      if (pending.size >= 32) return reject(new Error('请求过多，请稍后重试'));
      const id=String(++next), timer=setTimeout(()=>{pending.delete(id);reject(new Error('插件请求超时'))},65000);
      pending.set(id,{resolve,reject,timer});send({type:'call',id,method,params});
    });
    return Object.freeze({ apiVersion:1,
      info:()=>call('host.info'), settings:()=>call('settings.get'),
      storage:Object.freeze({get:key=>call('storage.get',{key}),set:(key,value)=>call('storage.set',{key,value}),remove:key=>call('storage.remove',{key})}),
      request:options=>call('network.request',options), notify:message=>call('notify',{message}),
      openWebsite:()=>call('website.open'),
      on:(name,fn)=>{if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);return()=>listeners.get(name).delete(fn)},
    });
  }
  addEventListener('message', e => {
    if (e.source !== parent || !e.data || e.data.channel !== 'caiyun-plugin-v1') return;
    const m=e.data;
    if (!initialized && m.type === 'init' && typeof m.token === 'string') {
      initialized=true; token=m.token;
      const send = value => parent.postMessage({...value,channel:'caiyun-plugin-v1',token},'*');
      if (m.mode === 'task') {
        const source = `const caiyun=(${sdk.toString()})(m=>postMessage(m),fn=>addEventListener('message',e=>fn(e.data)));self.caiyun=caiyun;\n(async()=>{${m.code}\n})().then(()=>postMessage({type:'task.done'}),()=>postMessage({type:'task.error'}));`;
        workerUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));worker=new Worker(workerUrl);
        // WebKit resolves worker URLs asynchronously. Keep it until the worker has actually started.
        const release=()=>{if(workerUrl){URL.revokeObjectURL(workerUrl);workerUrl=null}};
        worker.onmessage=e=>{release();send(e.data)};worker.onerror=()=>{release();send({type:'task.error'})};
      } else {
        window.caiyun=sdk(send,fn=>addEventListener('message',e=>{if(e.source===parent&&e.data?.token===token)fn(e.data)}));
        const style=document.createElement('style');style.textContent='*{box-sizing:border-box}body{margin:0;padding:20px;font:14px/1.6 system-ui,sans-serif;color:#1f2937;background:#fff}button,input,textarea,select{font:inherit}button{cursor:pointer}'+m.ui.css;document.head.append(style);
        document.getElementById('app').innerHTML=m.ui.html;
        addEventListener('error',()=>send({type:'ui.error'}));addEventListener('unhandledrejection',()=>send({type:'ui.error'}));
        const script=document.createElement('script');script.textContent=m.ui.js;document.body.append(script);
      }
      send({type:'ready'});
    } else if (initialized && m.token === token) {
      if(m.type==='dispose'){worker?.terminate();if(workerUrl)URL.revokeObjectURL(workerUrl);return}
      if(worker)worker.postMessage(m);
    }
  });
})();
