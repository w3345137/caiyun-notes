// Disposable Windows runner only. Connect to the WebView2 of the QA launch,
// never to a real account. The only record accessed is our own synthetic draft.
import assert from 'node:assert/strict';
import {setTimeout as wait} from 'node:timers/promises';

const [operation, port, nonce] = process.argv.slice(2);
assert.ok(['write', 'read', 'quit'].includes(operation) && /^[0-9]+$/.test(port));
assert.match(nonce, /^[a-f0-9-]{36}$/);

async function draftOperation(mode, key) {
  if (mode === 'quit') {
    // Same controlled-exit command used by the app. Do not skip the save handler.
    setTimeout(() => window.__TAURI__.core.invoke('request_app_exit'), 50);
    return 'quit';
  }
  const expected = 'Unsynced QA draft ' + key;
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('caiyun-notes-drafts', 1);
    request.onupgradeneeded = () => {
      if (mode !== 'write') return request.transaction.abort();
      const store = request.result.createObjectStore('drafts', {keyPath: 'noteId'});
      store.createIndex('updatedAt', 'updatedAt');
      store.createIndex('savedAt', 'savedAt');
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', mode === 'write' ? 'readwrite' : 'readonly');
      const store = tx.objectStore('drafts');
      let value;
      if (mode === 'write') {
        const now = new Date().toISOString();
        store.add({noteId: key, content: expected, title: 'QA', savedAt: now, updatedAt: now});
      }
      const read = store.get(key);
      read.onsuccess = () => { value = read.result?.content; };
      tx.onabort = () => reject(tx.error || Error('Draft transaction aborted'));
      tx.oncomplete = () => value === expected ? resolve(mode) : reject(Error('Draft differs'));
    });
  } finally { db.close(); }
}

const stop = Date.now() + 30000;
let observed = 'no response';
async function evaluate(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  try {
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    const response = new Promise((resolve, reject) => {
      socket.onmessage = e => {
        const msg = JSON.parse(e.data);
        if (msg.id === 1) msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
      };
      socket.onclose = () => reject(Error('Closed before test result'));
    });
    const expression = "document.readyState === 'complete' && window.__TAURI__?.core?.invoke ? (" +
      draftOperation.toString() + ')(' + JSON.stringify(operation) + ',' + JSON.stringify(nonce) + ') : "wait"';
    socket.send(JSON.stringify({id:1, method:'Runtime.evaluate', params:{expression, awaitPromise:true, returnByValue:true}}));
    const timer = setTimeout(() => socket.close(), 5000);
    try { return await response; } finally { clearTimeout(timer); }
  } finally { socket.close(); }
}

let passed = false;
while (Date.now() < stop) {
  const pages = await fetch('http://127.0.0.1:' + port + '/json/list')
    .then(r => r.json()).catch(error => { observed = error.cause?.code || error.message; return null; });
  const target = pages?.find(p => ['webview','page'].includes(p.type) && /^https?:\/\/tauri\.localhost\//.test(p.url));
  if (target) {
    const result = await evaluate(target).catch(error => { observed = error.message; return null; });
    if (result) {
      const error = result.exceptionDetails?.exception?.description;
      if (error && !error.startsWith('SecurityError:')) throw Error(error);
      observed = error || String(result.result?.value);
      if (observed === operation) {
        passed = true;
        break;
      }
    }
  }
  await wait(300);
}
assert.ok(passed, 'Installed app WebView did not finish ' + operation + ': ' + observed);
