import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

let target;
for (let i = 0; i < 30 && !target; i++) {
  try {
    const response = await fetch('http://127.0.0.1:19222/json/list', { signal: AbortSignal.timeout(800) });
    target = (await response.json()).find(item => item.type === 'page' && /tauri\.localhost/.test(item.url));
  } catch { /* WebView2 is starting. */ }
  if (!target) await setTimeout(500);
}
assert.ok(target?.webSocketDebuggerUrl, 'Packaged WebView2 page did not appear');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const reply = new Promise((resolve, reject) => {
  const timer = globalThis.setTimeout(() => reject(new Error('Packaged IPC timed out')), 25000);
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.id !== 1) return;
    clearTimeout(timer);
    if (value.error || value.result?.exceptionDetails) {
      reject(new Error(JSON.stringify(value.error || value.result.exceptionDetails)));
    } else {
      resolve(value.result.result.value);
    }
  });
});
socket.send(JSON.stringify({
  id: 1,
  method: 'Runtime.evaluate',
  params: {
    expression: `(async()=>{
      const invoke = window.__TAURI_INTERNALS__.invoke;
      const channel = await invoke('get_app_distribution_channel');
      const before = await invoke('has_legacy_windows_install');
      const retired = await invoke('retire_legacy_windows_install');
      return {channel,before,retired,after:await invoke('has_legacy_windows_install')};
    })()`,
    awaitPromise: true,
    returnByValue: true,
  },
}));
try {
  const result = await reply;
  console.log(result);
  assert.deepEqual(result, { channel: 'msstore', before: true, retired: true, after: false });
} finally {
  socket.close();
}
