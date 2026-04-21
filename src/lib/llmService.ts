export interface LLMConfig {
  id?: string;
  provider: string;
  protocol: string;
  api_key: string;
  base_url: string;
  model_name: string;
  updated_at?: string;
}

function getAuthToken(): string {
  const token = localStorage.getItem('notesapp_token');
  if (!token) return '';
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem('notesapp_token');
      return '';
    }
    return token;
  } catch {
    return '';
  }
}

export async function checkLLMConfig(): Promise<{ configured: boolean; config?: LLMConfig }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/llm/check', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { configured: data.configured, config: data.config };
  } catch (error) {
    console.error('Check LLM config error:', error);
    return { configured: false };
  }
}

export async function saveLLMConfig(config: { provider: string; protocol: string; api_key: string; base_url: string; model_name: string }): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/llm/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(config),
    });
    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (error) {
    console.error('Save LLM config error:', error);
    return { success: false, error: '保存失败' };
  }
}

export async function deleteLLMConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/llm/delete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json();
    if (data.error) return { success: false, error: data.error };
    return { success: true };
  } catch (error) {
    console.error('Delete LLM config error:', error);
    return { success: false, error: '删除失败' };
  }
}

export async function getNotebookLLMConfig(noteId: string): Promise<{ configured: boolean; config?: LLMConfig; is_owner?: boolean }> {
  try {
    const token = getAuthToken();
    const response = await fetch(`/api/llm/notebook-config?note_id=${encodeURIComponent(noteId)}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const data = await response.json();
    return { configured: data.configured, config: data.config, is_owner: data.is_owner };
  } catch (error) {
    console.error('Get notebook LLM config error:', error);
    return { configured: false };
  }
}

export async function testLLMConnection(config: { protocol: string; api_key: string; base_url: string; model_name: string }): Promise<{ success: boolean; reply?: string; elapsed?: number; model?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/llm/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(config),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Test LLM connection error:', error);
    return { success: false, error: '测试请求失败' };
  }
}

export async function transcribeAudio(noteId: string, audioHex: string): Promise<{ success: boolean; text?: string; provider?: string; error?: string }> {
  try {
    const token = getAuthToken();
    const response = await fetch('/api/llm/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ note_id: noteId, audio_hex: audioHex }),
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Transcribe audio error:', error);
    return { success: false, error: '转写请求失败' };
  }
}
