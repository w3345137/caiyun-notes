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
let target;
while (Date.now() < stop && !target) {
  const pages = await fetch('http://127.0.0.1:' + port + '/json/list')
    .then(r => r.json()).catch(() => []);
  target = pages.find(p => p.type === 'page' && /^https?:\/\/tauri\.localhost\//.test(p.url));
  if (!target) await wait(300);
}
assert.ok(target, 'Did not find the installed app WebView');
const socket = new WebSocket(target.webSocketDebuggerUrl);
try {
  await new Promise((resolve,reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const response = new Promise((resolve,reject) => {
    socket.onmessage = e => {
      const msg = JSON.parse(e.data);
      if (msg.id === 1) msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
    };
    socket.onclose = () => reject(Error('Closed before test result'));
  });
  socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{
    expression: '(' + draftOperation.toString() + ')(' + JSON.stringify(operation) + ',' + JSON.stringify(nonce) + ')',
    awaitPromise:true,returnByValue:true
  }}));
  const timer = setTimeout(() => socket.close(), 15000);
  try {
    const result = await response;
    assert.ok(!result.exceptionDetails, result.exceptionDetails?.exception?.description || 'WebView evaluation failed');
    assert.equal(result.result.value, operation);
  } finally { clearTimeout(timer); }
} finally { socket.close(); }
