// Desktop uses the existing opaque plug-in runtime. Only this host owns the
// scoped gateway credential. The source page receives no Notes credentials.
const hrNative = (() => {
  const origin = 'https://notes.binapp.top';
  const maxBody = 200 * 1024 * 1024;
  const localLibraries = {
    '/ajax/libs/xlsx/0.18.5/xlsx.full.min.js':'xlsx.full.min.js',
    '/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js':'mammoth.browser.min.js',
    '/ajax/libs/pdf.js/3.11.174/pdf.min.js':'pdf.min.js',
    '/ajax/libs/echarts/5.5.1/echarts.min.js':'echarts.min.js',
  };
  const filename = path => path.split('/').at(-1);

  // Stringified inside the existing sandbox by the v1 runtime.
  function runSource(config) {
    const rawFetch=window.fetch.bind(window);
    const moduleAddresses=new Map();
    const resources=new Map();
    let port,sequence=0;
    const pending=new Map();
    const signal=(operation,value,transfer=[])=>new Promise((resolve,reject)=>{
      if(pending.size>=24)return reject(new Error('业务请求过多，请稍后重试'));
      const id=++sequence;
      pending.set(id,{resolve,reject});
      port.postMessage({id,operation,...value},transfer);
    });
    const resolve=(value)=>new URL(value instanceof Request?value.url:value,config.pageUrl);
    const scoped=(url)=>url.href.startsWith(config.base) && url.origin===new URL(config.base).origin;
    function navigate(value) {
      const url=resolve(value);
      if(scoped(url))signal('navigate',{url:url.href}).catch(error=>alert(error.message));
    }
    function save(value,name) {
      const url=resolve(value);
      const fail=error=>alert(error.message || '文件保存失败');
      if(url.protocol==='blob:'){
        rawFetch(url).then(response=>response.arrayBuffer()).then(body=>
          signal('save',{name,body},[body])).catch(fail);
      }else if(scoped(url))signal('download',{url:url.href,name}).catch(fail);
    }
    window.__caiyunHrNavigate=navigate;
    window.open=(url)=>{save(url);return null;};
    window.fetch=async (input,init={})=>{
      const url=resolve(input);
      if(url.protocol==='blob:'||url.protocol==='data:')return rawFetch(input,init);
      if(!scoped(url))throw new Error('工作区请求超出页签范围');
      const original=input instanceof Request?input:url.href;
      const {signal:abort,...options}=init;
      if(abort?.aborted)throw new DOMException('Aborted','AbortError');
      const request=new Request(original,options);
      const body=['GET','HEAD'].includes(request.method)?null:await request.arrayBuffer();
      const meta={url:url.href,method:request.method,headers:[...request.headers],body};
      const result=await signal('fetch',meta,body?[body]:[]);
      if(result.location)navigate(result.location);
      const empty=[204,205,304].includes(result.status)||request.method==='HEAD';
      return new Response(empty?null:result.body,{status:result.status,headers:result.headers});
    };
    // Handle binary links and dynamic image paths in the opaque runtime.
    document.addEventListener('click',event=>{
      const link=event.target?.closest?.('a[href]');
      if(!link)return;
      const href=link.getAttribute('href');
      if(!href||href.startsWith('#'))return;
      const url=resolve(href);
      if(!scoped(url) && !(url.protocol==='blob:'&&link.hasAttribute('download')))return;
      event.preventDefault();
      save(url.href,link.getAttribute('download')||undefined);
    },true);
    const images=new WeakMap();
    function updateImage(image,value){
      const url=resolve(value);
      if(!scoped(url))return;
      images.set(image,url.href);
      image.removeAttribute('src');
      let result=resources.get(url.href);
      if(!result){
        result=window.fetch(url.href).then(response=>{
          if(!response.ok)throw new Error('图片暂不可用');
          return response.blob();
        }).then(blob=>URL.createObjectURL(blob));
        resources.set(url.href,result);
        result.catch(()=>resources.delete(url.href));
      }
      result.then(href=>{if(images.get(image)===url.href)image.src=href;}).catch(()=>{});
    }
    function scan(node){
      if(node instanceof HTMLImageElement && node.hasAttribute('src'))updateImage(node,node.getAttribute('src'));
      for(const image of node.querySelectorAll?.('img[src]')||[])updateImage(image,image.getAttribute('src'));
    }
    const observer=new MutationObserver(records=>{
      for(const record of records){
        if(record.type==='attributes')scan(record.target);
        else for(const node of record.addedNodes)scan(node);
      }
    });
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
    scan(document.body);

    async function start(){
      if(config.worker){
        window.__caiyunPdfWorker=URL.createObjectURL(new Blob([config.worker],{type:'text/javascript'}));
      }
      for(const dep of config.dependencies){
        moduleAddresses.set(dep.name,URL.createObjectURL(new Blob([dep.code],{type:'text/javascript'})));
      }
      for(const item of config.scripts){
        const script=document.createElement('script');
        if(item.module){
          let code=item.code;
          for(const [name,address] of moduleAddresses){
            code=code.replaceAll('"./'+name+'"',JSON.stringify(address))
                     .replaceAll("'./"+name+"'",JSON.stringify(address));
          }
          script.type='module';
          script.src=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
          await new Promise((resolve,reject)=>{
            script.onload=resolve;
            script.onerror=()=>reject(new Error('业务模块加载失败'));
            document.body.append(script);
          });
        }else{
          script.textContent=item.code;
          document.body.append(script);
        }
      }
      document.dispatchEvent(new Event('DOMContentLoaded',{bubbles:true}));
      parent.postMessage({channel:'caiyun-hr-inline',type:'ready',nonce:config.nonce},'*');
    }
    const receive=event=>{
      if(event.source!==parent||event.data?.channel!=='caiyun-hr-inline'||event.data.nonce!==config.nonce||event.ports.length!==1)return;
      window.removeEventListener('message',receive);
      port=event.ports[0];
      port.onmessage=({data})=>{
        const waiter=pending.get(data.id);
        if(!waiter)return;
        pending.delete(data.id);
        if(data.error)waiter.reject(new Error(data.error));else waiter.resolve(data.result);
      };
      start().catch(error=>parent.postMessage({channel:'caiyun-hr-inline',type:'error',nonce:config.nonce,error:error.message},'*'));
    };
    window.addEventListener('message',receive);
    parent.postMessage({channel:'caiyun-hr-inline',type:'connect',nonce:config.nonce},'*');
  }

  function start({frame,view,base,key,signal}) {
    const root=new URL(base);
    const scoped=value=>{
      const url=new URL(value,base);
      if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname)||url.hash||url.username||url.password)
        throw new Error('业务地址超出页签范围');
      return url;
    };
    const browserFetch=async (target,options={})=>{
      const current = scoped(target);
      const headers=new Headers(options.headers);
      headers.set('X-Caiyun-HR-Mount',key);
      return fetch(current,{...options,headers,signal,credentials:'omit',redirect:'error',cache:'no-store'});
    };
    const text=async url=>{
      const res=await browserFetch(url);
      if(!res.ok)throw new Error('业务页面资源读取失败');
      return res.text();
    };
    async function moduleSource(url) {
      const target=scoped(url);
      if(typeof window.__TAURI_INTERNALS__?.invoke==='function'){
        const response=await window.__TAURI_INTERNALS__.invoke('plugin_http_request',{
          requestId:crypto.randomUUID(),url:target.href,method:'GET',headers:{'X-Caiyun-HR-Mount':key},
          body:null,allowedOrigins:[origin],timeoutMs:30000,
        });
        if(!response.ok||typeof response.body!=='string')throw new Error('业务脚本资源读取失败');
        return response.body;
      }
      const size=384*1024;
      async function read(start){
        const r=await browserFetch(url,{headers:{Range:'bytes='+start+'-'+(start+size-1)}});
        const range=r.headers.get('Content-Range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if(r.status!==206||!range||Number(range[1])!==start)throw new Error('业务脚本资源读取失败');
        const body=await r.arrayBuffer();
        if(body.byteLength!==Number(range[2])-start+1)throw new Error('业务脚本资源不完整');
        return {body,length:Number(range[3])};
      }
      const first=await read(0);
      if(first.length>8*1024*1024)throw new Error('业务脚本资源过大');
      const offsets=[];
      for(let offset=size;offset<first.length;offset+=size)offsets.push(offset);
      const parts=[first,...await Promise.all(offsets.map(read))];
      const decoder=new TextDecoder();
      return parts.map(({body},index)=>decoder.decode(body,{stream:index<parts.length-1})).join('');
    }
    function localPath(value,pageUrl){
      return scoped(new URL(value,pageUrl)).href;
    }
    async function pagePayload(url){
      let destination=scoped(url).href;
      let response=await browserFetch(destination);
      if(response.headers.has('X-Caiyun-Workspace-Location')){
        destination=scoped(response.headers.get('X-Caiyun-Workspace-Location')).href;
        response=await browserFetch(destination);
      }
      if(!response.ok)throw new Error('业务工作区读取失败（'+response.status+'）');
      const html=await response.text();
      const doc=new DOMParser().parseFromString(html,'text/html');
      const dependencies=[...doc.querySelectorAll('link[rel="modulepreload"][href]')];
      const css=[...doc.querySelectorAll('style,link[rel="stylesheet"][href]')];
      const nodes=[...doc.querySelectorAll('script')];
      const payload={base,pageUrl:destination,nonce:crypto.randomUUID()};
      const [styles,scripts,imports,worker]=await Promise.all([
        Promise.all(css.map(el=>el.tagName==='STYLE'?el.textContent:text(localPath(el.getAttribute('href'),destination)))),
        Promise.all(nodes.map(async el=>{
          const src=el.getAttribute('src');
          const asset=src&&new URL(src,destination);
          const vendor=asset?.hostname==='cdnjs.cloudflare.com'?localLibraries[asset.pathname]:null;
          let code=vendor?await text(base+'__lib/'+vendor):src?await text(localPath(src,destination)):el.textContent;
          if(typeof code!=='string')throw new Error('业务页面组件暂不可用');
          if(root.pathname.includes('/salary/')){
            code=code.replace(/window\.location\.href\s*=\s*appPath\('\/login'\)/g,"window.__caiyunHrNavigate(appPath('/login'))")
              .replace("window.location.replace(appPath('/') || '/')","window.__caiyunHrNavigate(appPath('/') || '/')");
          }
          if(root.pathname.includes('/cadre/')&&!src){
            code=code.replace(/(['"])https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/pdf\.worker\.min\.js\1/g,'window.__caiyunPdfWorker')
              .replace('getDocument({ url: pdfUrl })','getDocument({data:new Uint8Array(await (await fetch(pdfUrl)).arrayBuffer())})')
              .replace(/window\.location\.href\s*=\s*(['"])([^'"]+api\/download-import-template)\1/g,"window.open('$2')");
          }
          return {module:el.type==='module',code};
        })),
        Promise.all(dependencies.map(async el=>{
          const href=localPath(el.getAttribute('href'),destination);
          return {name:filename(new URL(href).pathname),code:await moduleSource(href)};
        })),
        root.pathname.includes('/cadre/')?text(base+'__lib/pdf.worker.min.js'):null,
      ]);
      for(const node of [...css,...nodes,...dependencies])node.remove();
      Object.assign(payload,{scripts,dependencies:imports,worker});
      return {nonce:payload.nonce,html:doc.body.innerHTML,css:'body{padding:0}'+styles.join('\n'),
        js:'('+runSource.toString()+')('+JSON.stringify(payload)+');'};
    }
    function outputName(response,fallback){
      if(fallback)return fallback;
      const header=response?.headers.get('Content-Disposition')||'';
      const encoded=header.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
      const raw=header.match(/filename="?([^";]+)"?/i)?.[1];
      if(encoded)try{return decodeURIComponent(encoded);}catch{}
      return raw||'业务文件';
    }
    async function saveBytes(body,name){
      if(!(body instanceof ArrayBuffer)||body.byteLength>maxBody)throw new Error('文件超出保存限制');
      const encoded=btoa(String.fromCharCode(...new TextEncoder().encode(String(name||'业务文件').slice(0,200))));
      await window.__TAURI_INTERNALS__.invoke('save_download_file',new Uint8Array(body),
        {headers:{'x-caiyun-download-name':encoded}});
    }
    let port,nonce,loading;
    async function render(url){
      const payload=await pagePayload(url);
      if(signal.aborted)throw new Error('工作区已关闭');
      port?.close();
      port=null;
      nonce=payload.nonce;
      const loaded=new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('业务页面加载超时')),15000);
        loading={resolve:()=>{clearTimeout(timer);resolve();},reject:error=>{clearTimeout(timer);reject(error);}};
      });
      view.addEventListener('load',()=>{
        if(!signal.aborted)view.contentWindow.postMessage({channel:'caiyun-plugin-v1',type:'init',mode:'ui',token:nonce,ui:payload},'*');
      },{once:true});
      view.src=frame.src;
      return loaded;
    }
    async function request(message,currentPort){
      const reply=(result,error,transfer=[])=>currentPort.postMessage({id:message.id,result,error},transfer);
      if(signal.aborted||!Number.isInteger(message.id))return;
      try{
        if(message.operation==='save'){
          await saveBytes(message.body,message.name);
          return reply(true);
        }
        const url=scoped(message.url);
        if(message.operation==='navigate')return void render(url.href).catch(error=>loading?.reject(error));
        if(message.operation==='download'){
          const response=await browserFetch(url);
          if(!response.ok)throw new Error('业务文件读取失败');
          return reply(await saveBytes(await response.arrayBuffer(),outputName(response,message.name)));
        }
        if(message.operation!=='fetch'||!['GET','HEAD','POST','PUT','DELETE'].includes(message.method))throw new Error('业务请求无效');
        if(message.body!==null&&(!(message.body instanceof ArrayBuffer)||message.body.byteLength>maxBody))throw new Error('文件超出传输限制');
        const headers=new Headers();
        for(const [name,value] of message.headers||[])if(['accept','content-type','range','x-csrf-token'].includes(name.toLowerCase()))headers.set(name,value);
        const response=await browserFetch(url,{method:message.method,headers,body:message.body});
        const body=await response.arrayBuffer();
        reply({status:response.status,headers:[...response.headers],body,location:response.headers.get('X-Caiyun-Workspace-Location')},null,[body]);
      }catch(error){reply(null,error.message||'业务服务暂不可用');}
    }
    const receive=event=>{
      const data=event.data;
      if(event.source!==view.contentWindow||data?.channel!=='caiyun-hr-inline'||data.nonce!==nonce)return;
      if(data.type==='connect'&&!port){
        const channel=new MessageChannel();
        port=channel.port1;
        port.onmessage=event=>void request(event.data,channel.port1);
        event.source.postMessage({channel:'caiyun-hr-inline',nonce},'*',[channel.port2]);
      }else if(data.type==='ready')loading?.resolve();
      else if(data.type==='error')loading?.reject(new Error(data.error));
    };
    window.addEventListener('message',receive);
    signal.addEventListener('abort',()=>{
      window.removeEventListener('message',receive);
      port?.close();
      loading?.reject(new Error('业务工作区已关闭'));
    },{once:true});
    return render(base);
  }
  return {start};
})();
(() => {
  'use strict';
  const channel = 'caiyun-hr-business-v1';
  const native = location.protocol==='tauri:' || /^https?:\/\/tauri\.localhost$/.test(location.origin);
  const workspaces = new Map();
  function findFrame(source) {
    return [...document.querySelectorAll('.plugin-frame-wrap > iframe[title="人力资源业务"]')]
      .find(frame => frame.contentWindow === source && !frame.closest('[hidden]'));
  }
  const nativeWindow = {account:'hr-business',id:'人力资源业务'};
  async function dispose(frame) {
    const item=workspaces.get(frame);
    if(!item)return;
    workspaces.delete(frame);
    item.controller?.abort();
    if(item.native){
      await window.__TAURI_INTERNALS__.invoke('plugin_website_close',nativeWindow).catch(()=>{});
      return;
    }
    item.view.remove();
    frame.style.visibility='';
    item.container.style.position=item.originalPosition;
  }
  window.addEventListener('message',async event=>{
    const data=event.data;
    if(!data || data.channel!==channel || !/^[0-9]{1,12}$/.test(data.id))return;
    const frame=findFrame(event.source);
    if(!frame)return;
    const respond=(value,error)=>{
      if(frame.isConnected)event.source.postMessage({channel,id:data.id,value,error,type:'result'},'*');
    };
    try{
      if(data.action==='platform')return respond({native,inline:native&&typeof hrNative!=='undefined'});
      if(data.action==='hide'){await dispose(frame);return respond(null);}
      if(!['show','inline'].includes(data.action) || typeof data.url!=='string')return;
      const url=new URL(data.url,'https://notes.binapp.top');
      if(url.origin!=='https://notes.binapp.top'||url.search||url.hash)throw new Error('工作区地址无效');
      if(data.action==='inline'){
        if(!native || typeof hrNative==='undefined' || !/^\/hr-business\/workspace\/(cadre|salary|newstaff)\/[A-Za-z0-9_-]{43}\/$/.test(url.pathname) ||
          typeof data.windowKey!=='string' || !/^[A-Za-z0-9_-]{43}$/.test(data.windowKey))
          throw new Error('业务工作区参数无效');
        await dispose(frame);
        const container=frame.parentElement;
        const view=document.createElement('iframe');
        const controller=new AbortController();
        const item={container,view,controller,originalPosition:container.style.position};
        view.title='人力资源业务工作区';
        view.setAttribute('sandbox','allow-scripts');
        view.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'");
        view.referrerPolicy='no-referrer';
        view.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff;visibility:hidden';
        workspaces.set(frame,item);
        container.style.position='relative';
        container.append(view);
        try{
          await hrNative.start({frame,view,base:url.href,key:data.windowKey,signal:controller.signal});
          if(workspaces.get(frame)!==item)return;
          frame.style.visibility='hidden';
          view.style.visibility='';
          return respond(null);
        }catch(error){
          if(workspaces.get(frame)===item)await dispose(frame);
          throw error;
        }
      }
      if(native){
        if(!/^\/hr-business\/desk\/[A-Za-z0-9_-]{43}\/$/.test(url.pathname))throw new Error('工作区地址无效');
        if(typeof data.windowKey!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.windowKey))
          throw new Error('请刷新人力资源业务插件后重新打开');
        const invoke=window.__TAURI_INTERNALS__?.invoke;
        if(typeof invoke!=='function')throw new Error('此客户端无法打开业务工作区');
        await dispose(frame);
        await window.__TAURI_INTERNALS__.invoke('plugin_website_open',{...nativeWindow,
          website:{url:url.href,origins:[url.origin],persistentSession:false},script:'window.__caiyunHrWindowKey='+JSON.stringify(data.windowKey)+';'});
        workspaces.set(frame,{native:true});
        return respond(null);
      }
      if(!/^\/hr-business\/workspace\/(cadre|salary|newstaff)\/[A-Za-z0-9_-]{43}\/$/.test(url.pathname))
        throw new Error('工作区地址无效');
      await dispose(frame);
      const container=frame.parentElement;
      const view=document.createElement('iframe');
      view.title='人力资源业务工作区';
      view.setAttribute('sandbox','allow-scripts allow-forms allow-downloads allow-popups');
      view.referrerPolicy='no-referrer';
      view.setAttribute('allow',"camera 'none'; microphone 'none'; geolocation 'none'");
      view.style.cssText='position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff';
      workspaces.set(frame,{container,view,originalPosition:container.style.position});
      container.style.position='relative';
      frame.style.visibility='hidden';
      view.src=url.href;
      container.append(view);
      respond(null);
    }catch(error){respond(null,error.message);}
  });
  new MutationObserver(()=>{
    for(const frame of workspaces.keys())if(!frame.isConnected||frame.closest('[hidden]'))dispose(frame);
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
})();
