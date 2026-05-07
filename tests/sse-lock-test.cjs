const { chromium } = require('playwright');

const BASE_URL = process.env.NOTESAPP_TEST_BASE_URL || 'http://127.0.0.1:3011';
const SHARED_NOTEBOOK_ID = '1774070766899-may0vbeov';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 环境变量未配置`);
  }
  return value;
}

async function getToken(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, grant_type: 'password' })
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  console.log('=== SSE 广播 + 页面锁 测试 ===\n');

  const token1 = await getToken(requireEnv('NOTESAPP_TEST_USER1_EMAIL'), requireEnv('NOTESAPP_TEST_USER1_PASSWORD'));
  const token2 = await getToken(requireEnv('NOTESAPP_TEST_USER2_EMAIL'), requireEnv('NOTESAPP_TEST_USER2_PASSWORD'));
  
  if (!token1) { console.error('❌ 用户1登录失败'); return; }
  if (!token2) { console.error('❌ 用户2登录失败'); return; }
  console.log('✅ 两个用户登录成功\n');

  // 找到共享笔记本中的页面
  const notesRes = await fetch(`${BASE_URL}/api/notes-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'loadFullTree' })
  });
  const notesData = await notesRes.json();
  const allNotes = notesData.data || [];
  const testPage = allNotes.find(n => n.id === '1774526839495-y9kzrt5fo') || allNotes.find(n => n.type === 'page' && n.root_notebook_id === SHARED_NOTEBOOK_ID && n.owner_id === '2f178b6f-ae65-4f38-83bf-2c4f1ea32e72');
  
  if (!testPage) { console.error('❌ 没有找到共享笔记本中的页面'); return; }
  console.log(`测试页面: ${testPage.id} (${testPage.title})`);

  // 先解锁（确保干净状态）
  await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'unlockNote', noteId: testPage.id })
  });
  await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
    body: JSON.stringify({ action: 'unlockNote', noteId: testPage.id })
  });
  console.log('已解锁页面\n');

  // Test 1: 锁机制
  console.log('--- Test 1: 后端锁检查 ---');
  
  const lockRes1 = await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'lockNote', noteId: testPage.id, userName: '彬' })
  });
  const lockData1 = await lockRes1.json();
  console.log(`用户1锁页面: ${lockData1.success ? '✅ 成功' : `❌ 失败: ${JSON.stringify(lockData1)}`}`);

  const lockRes2 = await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token2}` },
    body: JSON.stringify({ action: 'lockNote', noteId: testPage.id, userName: 'test01' })
  });
  const lockData2 = await lockRes2.json();
  console.log(`用户2锁同一页面: ${lockData2.error === 'ALREADY_LOCKED' ? '✅ 正确拒绝(ALREADY_LOCKED)' : `结果: ${JSON.stringify(lockData2)}`}`);

  const unlockRes = await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'unlockNote', noteId: testPage.id })
  });
  const unlockData = await unlockRes.json();
  console.log(`用户1解锁: ${unlockData.success ? '✅ 成功' : '❌ 失败'}\n`);

  // Test 2: SSE 广播
  console.log('--- Test 2: SSE 广播 ---');
  const http = require('http');
  
  function createSSEConnection(token) {
    return new Promise((resolve, reject) => {
      const url = new URL(`/api/events?token=${encodeURIComponent(token)}`, BASE_URL);
      const req = http.get(url, { timeout: 30000 }, (res) => {
        let buffer = '';
        const events = [];
        
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n\n');
          buffer = lines.pop();
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const evt = JSON.parse(line.substring(6));
                events.push(evt);
                console.log(`  [SSE Client] 收到事件: ${evt.type}`);
              } catch (e) {}
            }
          }
        });
        
        resolve({ res, events });
      });
      
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
  }
  
  // 建立 SSE 连接（用户2）
  const sse2 = await createSSEConnection(token2);
  console.log('SSE 用户2连接已建立');
  await new Promise(r => setTimeout(r, 2000));
  
  // 用户1保存笔记
  const saveRes = await fetch(`${BASE_URL}/api/notes-write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'saveNote', note: { id: testPage.id, title: testPage.title, content: 'SSE test ' + Date.now(), type: 'page' } })
  });
  const saveData = await saveRes.json();
  console.log(`用户1保存: ${saveData.success ? '✅ 成功' : `❌ 失败: ${JSON.stringify(saveData)}`}`);
  
  await new Promise(r => setTimeout(r, 3000));
  
  const sseEvents = sse2.events.filter(e => e.type !== 'connected');
  console.log(`SSE 广播: ${sseEvents.length > 0 ? '✅ 收到事件' : '❌ 未收到事件'}`, sseEvents.length > 0 ? `type=${sseEvents.map(e => e.type).join(',')}` : '');
  
  sse2.res.destroy();

  // Test 3: 锁状态实时同步
  console.log('\n--- Test 3: 锁状态实时同步 ---');
  const sse3 = await createSSEConnection(token2);
  console.log('SSE 用户2连接已建立');
  await new Promise(r => setTimeout(r, 2000));
  
  await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'lockNote', noteId: testPage.id, userName: '彬' })
  });
  
  await new Promise(r => setTimeout(r, 3000));
  
  const lockEvents = sse3.events.filter(e => e.type === 'note_locked');
  console.log(`锁状态同步: ${lockEvents.length > 0 ? '✅ 收到锁事件' : '❌ 未收到锁事件'}`, lockEvents.length > 0 ? `by=${lockEvents[0].lockedByName}` : '');
  
  // 清理
  await fetch(`${BASE_URL}/api/locks-manage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token1}` },
    body: JSON.stringify({ action: 'unlockNote', noteId: testPage.id })
  });
  
  sse3.res.destroy();
  console.log('\n=== 测试完成 ===');
}

main().catch(console.error);
