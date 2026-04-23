const API_BASE = '/api/email';

function getAuthToken(): string | null {
  return localStorage.getItem('notesapp_token');
}

async function emailFetch(path: string, options: RequestInit = {}) {
  const token = getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401) {
    localStorage.removeItem('notesapp_token');
    return { success: false, error: '登录已过期，请重新登录' };
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return { success: false, error: data.error || `请求失败(${res.status})` };
  }
  return res.json();
}

export async function detectProvider(email: string) {
  return emailFetch('/detect-provider', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function addEmailAccount(config: {
  email_address: string;
  display_name?: string;
  password: string;
  notebook_id?: string;
  imap_host?: string;
  imap_port?: number;
  imap_ssl?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_ssl?: boolean;
}) {
  return emailFetch('/accounts', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}

export async function getEmailAccounts() {
  return emailFetch('/accounts');
}

export async function deleteEmailAccount(accountId: string) {
  return emailFetch(`/accounts/${accountId}`, { method: 'DELETE' });
}

export async function syncEmails(accountId: string) {
  return emailFetch(`/sync/${accountId}`, { method: 'POST' });
}

export async function getConversations(accountId: string) {
  return emailFetch(`/conversations/${accountId}`);
}

export async function getEmailThread(accountId: string, otherAddr: string) {
  return emailFetch(`/thread/${accountId}/${encodeURIComponent(otherAddr)}`);
}

export async function getEmailContent(accountId: string, folder: string, uid: number) {
  return emailFetch(`/message/${accountId}/${folder}/${uid}`);
}

export async function sendEmail(config: {
  account_id: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  cc?: string;
}) {
  return emailFetch('/send', {
    method: 'POST',
    body: JSON.stringify(config),
  });
}
