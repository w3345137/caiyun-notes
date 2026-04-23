import { useNoteStore } from '../store/noteStore';

const API_BASE = '/api';

function getAuthToken(): string {
  return localStorage.getItem('notesapp_token') || '';
}

class SSEService {
  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastEventTime: string = new Date().toISOString();
  private isConnecting: boolean = false;

  connect() {
    if (this.eventSource || this.isConnecting) return;
    this.isConnecting = true;

    const token = getAuthToken();
    if (!token) { this.isConnecting = false; return; }

    try {
      this.eventSource = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token)}`);

      this.eventSource.onopen = () => {
        console.log('[SSE] 连接已建立');
        this.isConnecting = false;
        this.syncMissedEvents();
      };

      this.eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'connected') return;
          this.lastEventTime = new Date().toISOString();
          this.handleEvent(data);
        } catch (e) {
          // heartbeat or invalid data, ignore
        }
      };

      this.eventSource.onerror = () => {
        console.log('[SSE] 连接断开，5秒后重连');
        this.disconnect();
        this.reconnectTimer = setTimeout(() => this.connect(), 5000);
      };
    } catch (e) {
      this.isConnecting = false;
      console.error('[SSE] 连接失败:', e);
    }
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.isConnecting = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private async syncMissedEvents() {
    try {
      const token = getAuthToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/notes-query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ action: 'getChangedNotes', since: this.lastEventTime }),
      });
      if (res.ok) {
        const result = await res.json();
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          const store = useNoteStore.getState();
          for (const note of result.data) {
            store.upsertNote(note);
          }
          console.log(`[SSE] 增量同步 ${result.data.length} 条变更`);
        }
      }
    } catch (e) {
      console.error('[SSE] 增量同步失败:', e);
    }
  }

  private handleEvent(event: any) {
    const store = useNoteStore.getState();
    console.log(`[SSE] 收到事件: ${event.type}`, event.noteId?.substring(0, 12));

    switch (event.type) {
      case 'note_updated': {
        if (event.reason === 'attachment_changed') {
          store.triggerFolderRefresh();
        } else {
          const isEditing = store.isNoteEditing(event.noteId);
          if (isEditing) {
            store.addSSENotification({ type: 'note_updated', noteId: event.noteId, updatedBy: event.updatedBy });
          } else {
            store.fetchAndUpsertNote(event.noteId);
          }
        }
        break;
      }
      case 'note_deleted': {
        const isEditing = store.isNoteEditing(event.noteId);
        if (isEditing) {
          store.addSSENotification({ type: 'note_deleted', noteId: event.noteId, updatedBy: event.updatedBy });
        } else {
          store.removeNoteFromStore(event.noteId);
        }
        break;
      }
      case 'note_locked': {
        store.updateNoteLock(event.noteId, true, event.lockedBy, event.lockedByName);
        break;
      }
      case 'note_unlocked': {
        store.updateNoteLock(event.noteId, false, null, null);
        break;
      }
    }
  }
}

export const sseService = new SSEService();
