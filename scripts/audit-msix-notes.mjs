import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.env.RUNNER_TEMP, 'qa-msix-deps', 'package.json'));
const { chromium } = require('playwright-core');
const Y = require('yjs');
const {Server}=require('@hocuspocus/server');
const {WebSocket}=require('ws');

const phase = process.argv[2];
const weakAuth=phase==='weak-auth';
const modeFile = process.env.RUNNER_TEMP + '/caiyun-msix-audit-yjs.json';
const user = {id:'msix-isolated-user',email:'qa@example.invalid',display_name:'隔离验收'};
const token = [Buffer.from('{"alg":"none"}').toString('base64url'),Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+(weakAuth?86400:1209600)})).toString('base64url'),'fixture'].join('.');
const stamp = new Date().toISOString();
const noteId='msix-qa-page-1';
const node=(id,parent_id,type,title,order=0) => ({id,parent_id,root_notebook_id:'msix-qa-book',type,title,order,owner_id:user.id,access_permission:'owner',version:1,content:'',created_at:stamp,updated_at:stamp});
const notes=[node('msix-qa-book',null,'notebook','MSIX QA 笔记本'),node('msix-qa-section','msix-qa-book','section','MSIX QA 分区'),node(noteId,'msix-qa-section','page','MSIX QA 正文'),node('msix-qa-page-2','msix-qa-section','page','MSIX QA 另一页',1)];
const groups={revision:0,defaultId:'default',groups:[{id:'default',name:'MSIX QA 分组',icon:'book-open'}],assignments:{'msix-qa-book':'default'}};
const docs = new Map();
const docTimes=new Map();
const socketEvents={};
const onlineMarker='MSIX-ONLINE-42';
const offlineMarker='MSIX-OFFLINE-53';
let offline=phase==='recover';
let refreshFailures=0;
let navigations=0;
const messages=new Set();
const statuses=[];
const writes=[];
const queryActions=new Set();
const sockets=new Set();
const requests=new Set();
const shellRequests=new Map();
function serverDocument(name) {
  if (docs.has(name)) return docs.get(name);
  const doc=new Y.Doc();
  const saved=fs.existsSync(modeFile)?JSON.parse(fs.readFileSync(modeFile,'utf8')):{};
  if(saved[name]){Y.applyUpdate(doc,Buffer.from(saved[name].state,'base64'));docTimes.set(name,saved[name].updatedAt);}
  else {
    const p=new Y.XmlElement('paragraph');
    const text=new Y.XmlText();
    text.insert(0,'MSIX baseline');
    p.insert(0,[text]);
    doc.getXmlFragment('default').insert(0,[p]);
  }
  docs.set(name,doc);
  if(!docTimes.has(name))docTimes.set(name,stamp);
  return doc;
}
const saveServer=()=>fs.writeFileSync(modeFile,JSON.stringify(Object.fromEntries([...docs].map(([name,doc])=>[name,{state:Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),updatedAt:docTimes.get(name)}]))));
const docName=body=>`note:${body.noteId||noteId}/tab:${body.tabId||'default'}`;
const persisted=body=>{
  const doc=serverDocument(docName(body));
  const state=Y.encodeStateAsUpdate(doc);
  const vector=Y.encodeStateVectorFromUpdate(state);
  return {confirmed:true,documentName:docName(body),yState:Buffer.from(state).toString('base64'),
    stateVector:Buffer.from(vector).toString('base64'),deleteState:Buffer.from(Y.diffUpdate(state,vector)).toString('base64'),updatedAt:docTimes.get(docName(body))};
};
const server=new Server({address:'127.0.0.1',port:0,quiet:true,stopOnSignals:false,debounce:80,maxDebounce:400,
  onAuthenticate: async()=>({account:'qa'}),
  onLoadDocument:async({documentName})=>Y.encodeStateAsUpdate(serverDocument(documentName)),
  onStoreDocument:async({documentName,document})=>{
    const before=Buffer.from(Y.encodeStateAsUpdate(serverDocument(documentName)));
    if(!before.equals(Buffer.from(Y.encodeStateAsUpdate(document))))docTimes.set(documentName,new Date().toISOString());
    const snapshot=new Y.Doc();
    Y.applyUpdate(snapshot,Y.encodeStateAsUpdate(document));
    docs.set(documentName,snapshot);
    saveServer();
  },
});
await server.listen();
let browser;
for(let i=0;i<35&&!browser;i++) {
  try{browser=await chromium.connectOverCDP('http://127.0.0.1:18495',{timeout:1200});}
  catch{await new Promise(r=>setTimeout(r,800));}
}
assert(browser,'Packaged WebView2 not reachable');
const context=browser.contexts()[0];
const page=context.pages().find(p=>/tauri\.localhost/.test(p.url()));
assert(page,'No packaged app page');
page.setDefaultTimeout(25000);
page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
page.on('pageerror',error=>messages.add(error.message.slice(0,180)));
page.on('console',m=>{if(m.type()==='error'&&/CRDT|IndexedDB|durable/i.test(m.text()))messages.add(m.text().slice(0,180));});
try {
  await context.addInitScript(({user,token,offline,weakAuth})=>{
    if(window.top!==window)return;
    window.__qaOnline=!offline;
    Object.defineProperty(navigator,'onLine',{get:()=>window.__qaOnline});
    if(!weakAuth || !sessionStorage.getItem('qa-weak-auth-seeded')){
      localStorage.setItem('notesapp_user',JSON.stringify(user));
      localStorage.setItem('notesapp_token',token);
      if(weakAuth) sessionStorage.setItem('qa-weak-auth-seeded','1');
    }
    localStorage.setItem('i18nextLng','zh-CN');
  },{user,token,offline,weakAuth});
  await context.routeWebSocket('**/*', socket=>{
    if(offline || !socket.url().startsWith('wss://notes.binapp.top/qa-msix-collab'))return socket.close({code:1001});
    const upstream=new WebSocket(server.webSocketURL+'/qa-msix-collab');
    const queued=[];
    sockets.add(socket);
    socket.onMessage(raw=>{
      socketEvents.forwarded=(socketEvents.forwarded||0)+1;
      if(upstream.readyState===WebSocket.OPEN)upstream.send(raw);else if(upstream.readyState===WebSocket.CONNECTING)queued.push(raw);
    });
    upstream.on('open',()=>{for(const data of queued)upstream.send(data);queued.length=0;});
    upstream.on('message',raw=>{
      socketEvents.received=(socketEvents.received||0)+1;
      socket.send(Buffer.from(raw));
    });
    upstream.on('error',error=>messages.add('isolated Hocuspocus connection: '+error.message));
    upstream.on('close',()=>{if(sockets.delete(socket))socket.close({code:1001});});
    socket.onClose(()=>{sockets.delete(socket);upstream.close();});
  });
  await context.route('**/*', async route=>{
    const req=route.request();
    const url=new URL(req.url());
    if(['tauri.localhost','caiyun-plugin.localhost','ipc.localhost'].includes(url.hostname))return route.continue();
    if(url.origin!=='https://notes.binapp.top' || !url.pathname.startsWith('/api/'))return route.abort();
    requests.add(url.pathname);
    if(url.searchParams.has('__caiyun_channel'))shellRequests.set(url.pathname,url.searchParams.get('__caiyun_channel'));
    const respond=(json,status=200)=>route.fulfill({json,status,headers:{'Access-Control-Allow-Origin':'http://tauri.localhost','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':req.headers()['access-control-request-headers']||'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS,PUT,PATCH,DELETE'}});
    if(req.method()==='OPTIONS')return respond({});
    let body={};
    try{body=req.postDataJSON()||{}}catch{}
    if(offline)return route.abort('internetdisconnected');
    switch(url.pathname){
      case '/api/auth/v1/me':
        return weakAuth && !req.headers().authorization ? respond({error:'登录已失效'},401) : respond(user);
      case '/api/auth/v1/refresh':
        if(weakAuth){refreshFailures++;return respond({error:'isolated transient failure'},503);}
        return respond({token,access_token:token,user,expires_in:1209600});
      case '/api/auth/v1/sse-ticket':return respond({ticket:'qa-sse-ticket'});
      case '/api/app-release-policy':return respond({latestVersion:'10.2.14',minimumVersion:'10.2.8',rolloutSalt:'fixture',rolloutPercentage:100});
      case '/api/notebook-groups':return respond({state:groups});
      case '/api/notes-query':
        queryActions.add(body.action||'none');
        if(['loadTree','loadFullTree','loadTreeDelta','loadAccessibleNotes'].includes(body.action))return respond({success:true,data:notes,changeSeq:'0'});
        if(body.action==='getNoteById')return respond({success:true,data:notes.find(n=>n.id===body.noteId)||null});
        if(body.action==='loadSidebarState')return respond({success:true,data:{selectedNoteId:noteId,expandedNodes:['msix-qa-book','msix-qa-section'],notebookOrder:['msix-qa-book']}});
        return respond({success:true,data:null});
      case '/api/notes-write':
        writes.push(body.action||'unknown');
        if(body.note && !notes.some(n=>n.id===body.note.id))notes.push(body.note);
        return respond({success:true,data:{...body.note,version:2}});
      case '/api/collab-config':
        return respond({success:true,data:{wsUrl:'wss://notes.binapp.top/qa-msix-collab',documentName:docName(body),permission:'write',initialState:persisted(body),ticket:'qa-ticket'}});
      case '/api/collab-persistence':
        return respond({success:true,data:persisted(body)});
      case '/api/page-tabs':
        return respond({success:true,data:{revision:0,tabs:[{id:'default',tabId:'default',title:'默认',order:0}],defaultTabId:'default',activeTabId:'default'}});
      case '/api/tab-content':
        return respond({success:true,data:{content:JSON.stringify({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'MSIX baseline'}]}]}),updatedAt:stamp}});
      case '/api/collab-state':
        return respond({success:true,data:{items:[],nextCursor:null,complete:true}});
      case '/api/email/accounts':return respond({success:true,accounts:[]});
      default:return respond({success:true,data:[]});
    }
  });
  await page.reload({waitUntil:'domcontentloaded'});
  const editor=page.locator('.ProseMirror[contenteditable="true"]').first();
  const openNote=async id=>{
    let row=page.locator(`[data-page-id="${id}"]`);
    await page.locator('[data-notebook-id="msix-qa-book"]').first().waitFor({state:'attached'});

    if(!await row.isVisible()){
      const notebook=page.locator('[data-notebook-id="msix-qa-book"]');
      const expand=notebook.locator('button[aria-expanded="false"]');
      if(await expand.isVisible())await expand.click();
      await page.locator('[data-section-id="msix-qa-section"]').click();
    }
    await row.click();
    await editor.waitFor();
  };
  const countDraft=async () => page.evaluate(async id=>{
    const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('caiyun-local-workspace-v1');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    try {
      const table=db.transaction('collabUpdates','readonly').objectStore('collabUpdates');
      const all=await new Promise((resolve,reject)=>{const req=table.getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      return all.filter(r=>r.noteId===id||String(r.documentName||'').startsWith('note:'+id+'/')).length;
    } finally { db.close(); }
  },noteId);
  const waitFor=(fn,label,timeout=20000)=>new Promise(async(resolve,reject)=>{
    const deadline=Date.now()+timeout;
    try{
      do{if(await fn())return resolve(true);await new Promise(r=>setTimeout(r,200));}while(Date.now()<deadline);
      reject(new Error(label));
    }catch(error){reject(error);}
  });
  const status=async()=>page.locator('[data-document-sync-state]').first().getAttribute('data-document-sync-state',{timeout:2000}).catch(()=>null);
  if(weakAuth){
    await waitFor(()=>refreshFailures>0,'The fixture did not exercise the transient refresh failure');
    await page.waitForTimeout(1000);
    assert.equal(navigations,1,'A temporary 503 must not reload the workspace');
    assert(await page.evaluate(()=>!!localStorage.getItem('notesapp_token')),'Temporary failure must retain local session');
    console.log('PASS exact MSIX: transient 503 preserves the session and workspace',{refreshFailures,navigations});
    process.exitCode=0;
  } else {
  await openNote(noteId);
  if(phase==='edit'){
    await editor.filter({hasText:'MSIX baseline'}).waitFor();
    await editor.press('End');
    await editor.pressSequentially(' '+onlineMarker);
    await waitFor(()=>[...docs.values()].some(doc=>doc.getXmlFragment('default').toString().includes(onlineMarker)),'Online text never reached the isolated CRDT target');
    await page.locator('[data-page-id="msix-qa-page-2"]').click();
    await openNote(noteId);
    await editor.filter({hasText:onlineMarker}).waitFor();
    statuses.push({phase:'online',state:await status()});
    offline=true;
    for(const socket of [...sockets])socket.close({code:1001});
    await page.evaluate(()=>{window.__qaOnline=false;window.dispatchEvent(new Event('offline'));});
    const before=await countDraft();
    await editor.press('End');
    await editor.pressSequentially(' '+offlineMarker);
    await waitFor(async()=>await countDraft()>before,'Offline edit never reached the durable IndexedDB journal');
    statuses.push({phase:'offline-before-restart',state:await status(),journal:await countDraft()});
    console.log('PASS exact MSIX edit: editor, isolated CRDT delivery, page switch, offline journal',JSON.stringify(statuses));
  } else {
    await editor.filter({hasText:offlineMarker}).waitFor();
    assert((await countDraft())>0,'Offline journal missing after process restart');
    statuses.push({phase:'offline-restart',state:await status(),journal:await countDraft()});
    offline=false;
    await page.evaluate(()=>{window.__qaOnline=true;window.dispatchEvent(new Event('online'));});
    let replayed=await waitFor(()=>[...docs.values()].some(doc=>doc.getXmlFragment('default').toString().includes(offlineMarker)),'Recovered draft never reached the isolated CRDT target',45000).catch(()=>false);
    if(!replayed) {
      console.log('Reconnect diagnostics',JSON.stringify({state:await status(),socketEvents,requests:[...requests],durableEntries:await countDraft(),recent:await page.evaluate(()=>{
        const raw=JSON.parse(localStorage.getItem('caiyun-runtime-diagnostics:v1')||'[]');
        return (Array.isArray(raw)?raw:raw.events||[]).filter(e=>e.outcome==='blocked'||e.outcome==='failure').slice(-12).map(e=>[e.domain,e.stage,e.outcome,e.reason]);
      })}));
    }
    if(replayed)await waitFor(async()=>await status()==='synced','Server received the draft but UI did not confirm persistence',16000);
    statuses.push({phase:'reconnect',state:await status()});
    const template=JSON.parse(fs.readFileSync(new URL('./qa-msix-plugin-fixture.json', import.meta.url)));
    await page.evaluate(async({template,account})=>{
      const db=await new Promise((resolve,reject)=>{
        const req=indexedDB.open('caiyun-local-plugins-v1',1);
        req.onupgradeneeded=()=>{for(const t of ['records','keys','archives'])req.result.createObjectStore(t);};
        req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
      });
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('records','readwrite');
        tx.objectStore('records').put({package:template,enabled:true,digest:'qa-fixture',data:{},settings:{},secrets:{},runs:[]},JSON.stringify([account,template.manifest.id]));
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
      db.close();
      const signal=new BroadcastChannel('caiyun-plugins-v1');signal.postMessage('change');signal.close();
    },{template,account:user.id});
    await page.locator('[data-plugin-rail-id="example.local.hello"] button').click();
    await page.frameLocator('iframe[title="插件入门"]').getByRole('heading',{name:'你好，插件'}).waitFor();
    console.log('PASS exact MSIX plugin via the app sidebar and sandbox');
    if(!replayed)throw new Error('Recovered draft remained local during the controlled reconnect window');
    console.log('PASS exact MSIX recovery: cold restart offline and CRDT reconnect',JSON.stringify(statuses),'messages',JSON.stringify(socketEvents));
  }
  }
  console.log('Seen app request types',JSON.stringify([...requests]),'store channel',JSON.stringify([...shellRequests]),'writes',JSON.stringify(writes));
} catch(error){
  console.log('Audit evidence',JSON.stringify({phase,statuses,refreshFailures,navigations,requests:[...requests],queryActions:[...queryActions],socketEvents,ws:sockets.size,docs:[...docs.keys()],errors:[...messages]}));
  console.log('UI excerpt',await page.locator('body').innerText({timeout:1500}).then(v=>v.slice(0,1800)).catch(()=>'<unavailable>'));
  await page.screenshot({path:process.env.RUNNER_TEMP+`/msix-audit-${phase}.png`}).catch(()=>{});
  throw error;
} finally {
  await browser.close();
  await server.destroy();
}
