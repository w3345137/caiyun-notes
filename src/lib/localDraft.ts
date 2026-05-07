/**
 * 本地最新草稿
 *
 * 和历史备份不同，这里每个页面只保留一份最新内容，用来抵抗刷新、关闭
 * 或云端短暂失败造成的丢内容风险。高频输入会覆盖同一条记录，不产生版本膨胀。
 */

import type { Note } from '../types';

const DB_NAME = 'caiyun-notes-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

export interface NoteDraftRecord {
  noteId: string;
  title: string;
  content: string;
  updatedAt: string;
  savedAt: string;
}

let dbInstance: IDBDatabase | null = null;
const pendingDrafts = new Map<string, NoteDraftRecord>();
const activeDraftWrites = new Map<string, Promise<void>>();

function canUseIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDraftDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!canUseIndexedDB()) {
      reject(new Error('IndexedDB 不可用'));
      return;
    }

    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'noteId' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
        store.createIndex('savedAt', 'savedAt', { unique: false });
      }
    };
  });
}

function getNoteUpdatedAt(note: Note): string {
  const raw = note as Note & { updated_at?: string };
  return raw.updatedAt || raw.updated_at || new Date().toISOString();
}

function parseTime(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDraftRecord(note: Note): NoteDraftRecord | null {
  if (note.type !== 'page') return null;
  if (typeof note.content !== 'string') return null;

  return {
    noteId: note.id,
    title: note.title || '无标题',
    content: note.content,
    updatedAt: getNoteUpdatedAt(note),
    savedAt: new Date().toISOString(),
  };
}

async function putDraft(record: NoteDraftRecord): Promise<void> {
  const db = await openDraftDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(record);

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

async function drainDraftQueue(noteId: string): Promise<void> {
  try {
    while (pendingDrafts.has(noteId)) {
      const latest = pendingDrafts.get(noteId)!;
      pendingDrafts.delete(noteId);
      await putDraft(latest);
    }
  } finally {
    activeDraftWrites.delete(noteId);
  }
}

function queueDraftRecord(record: NoteDraftRecord): Promise<void> {
  pendingDrafts.set(record.noteId, record);

  const active = activeDraftWrites.get(record.noteId);
  if (active) return active;

  const promise = drainDraftQueue(record.noteId);
  activeDraftWrites.set(record.noteId, promise);
  return promise;
}

export function saveNoteDraft(note: Note): Promise<void> {
  const record = toDraftRecord(note);
  if (!record) return Promise.resolve();
  return queueDraftRecord(record);
}

export async function flushNoteDrafts(noteId?: string): Promise<void> {
  const ids = noteId
    ? [noteId]
    : Array.from(new Set([...pendingDrafts.keys(), ...activeDraftWrites.keys()]));

  const waits = ids.map((id) => {
    const active = activeDraftWrites.get(id);
    if (active) return active;

    if (pendingDrafts.has(id)) {
      const promise = drainDraftQueue(id);
      activeDraftWrites.set(id, promise);
      return promise;
    }

    return null;
  }).filter(Boolean) as Promise<void>[];

  await Promise.all(waits);
}

export function hasPendingDraftSaves(): boolean {
  return pendingDrafts.size > 0 || activeDraftWrites.size > 0;
}

export async function getAllNoteDrafts(): Promise<NoteDraftRecord[]> {
  if (!canUseIndexedDB()) return [];

  const db = await openDraftDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as NoteDraftRecord[]);
  });
}

export async function mergeNotesWithLocalDrafts(notes: Note[]): Promise<{ notes: Note[]; restoredNoteIds: string[] }> {
  let drafts: NoteDraftRecord[] = [];

  try {
    drafts = await getAllNoteDrafts();
  } catch (e) {
    console.warn('[Draft] 读取本地草稿失败:', e);
    return { notes, restoredNoteIds: [] };
  }

  if (drafts.length === 0) {
    return { notes, restoredNoteIds: [] };
  }

  const draftsById = new Map(drafts.map((draft) => [draft.noteId, draft]));
  const restoredNoteIds: string[] = [];

  const mergedNotes = notes.map((note) => {
    const draft = draftsById.get(note.id);
    if (!draft || note.type !== 'page' || draft.content === note.content) {
      return note;
    }

    const serverUpdatedAt = parseTime(getNoteUpdatedAt(note));
    const draftUpdatedAt = parseTime(draft.updatedAt);
    if (draftUpdatedAt <= serverUpdatedAt) {
      return note;
    }

    restoredNoteIds.push(note.id);
    return {
      ...note,
      title: draft.title || note.title,
      content: draft.content,
      updatedAt: draft.updatedAt,
      updated_at: draft.updatedAt,
    } as Note;
  });

  return { notes: mergedNotes, restoredNoteIds };
}

export async function deleteNoteDraft(noteId: string): Promise<void> {
  pendingDrafts.delete(noteId);
  await activeDraftWrites.get(noteId)?.catch(() => {});

  if (!canUseIndexedDB()) return;

  const db = await openDraftDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).delete(noteId);

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}

export async function clearAllNoteDrafts(): Promise<void> {
  pendingDrafts.clear();

  await Promise.all(Array.from(activeDraftWrites.values()).map((write) => write.catch(() => {})));

  if (!canUseIndexedDB()) return;

  const db = await openDraftDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const request = tx.objectStore(STORE_NAME).clear();

    request.onerror = () => reject(request.error);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
}
