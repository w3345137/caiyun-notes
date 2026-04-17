/**
 * 本地备份服务
 *
 * Web 端：使用 IndexedDB 存储
 * Tauri 端：使用文件系统存储（APP 数据目录下的 backups 文件夹）
 *
 * 功能：
 * - 自动备份：保存前自动创建备份
 * - 版本管理：保留最近 N 个版本
 * - 恢复功能：从备份恢复内容
 */

import type { Note } from '../types';

// ========== Tauri 环境检测 ==========

declare global {
  interface Window {
    __TAURI__?: {
      fs: {
        readTextFile: (path: string) => Promise<string>;
        writeTextFile: (path: string, contents: string) => Promise<void>;
        readDir: (path: string) => Promise<{ name: string; isDir: boolean }[]>;
        exists: (path: string) => Promise<boolean>;
        mkdir: (path: string, options?: { recursive?: boolean }) => Promise<void>;
        remove: (path: string, options?: { recursive?: boolean }) => Promise<void>;
      };
    };
  }
}

function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

// ========== 配置 ==========

const DB_NAME = 'caiyun-notes-backup';
const DB_VERSION = 1;
const STORE_NAME = 'backups';
const MAX_BACKUPS_PER_NOTE = 10; // 每个页面最多保留 10 个备份版本
const TAURI_BACKUP_DIR = 'backups'; // Tauri 备份子目录名

// 备份配置（存储在 localStorage）
export interface BackupConfig {
  enabled: boolean;           // 是否启用自动备份
  maxVersions: number;        // 最大保留版本数
  excludeNoteIds?: string[];  // 排除的笔记本 ID（可选）
}

const CONFIG_KEY = 'backup-config';

export function getBackupConfig(): BackupConfig {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('[Backup] 读取配置失败:', e);
  }
  return {
    enabled: false,
    maxVersions: MAX_BACKUPS_PER_NOTE,
  };
}

export function setBackupConfig(config: BackupConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    console.log('[Backup] 配置已保存:', config);
  } catch (e) {
    console.error('[Backup] 保存配置失败:', e);
  }
}

// ========== Tauri 备份路径 ==========

let tauriBasePath: string | null = null;

/**
 * 获取 Tauri 备份目录路径
 * 使用 appDataDir/backups
 */
async function getTauriBackupPath(): Promise<string | null> {
  if (tauriBasePath) return tauriBasePath;

  try {
    // 动态导入 @tauri-apps/api/path
    const { appDataDir } = await import('@tauri-apps/api/path');
    const appData = await appDataDir();
    tauriBasePath = `${appData}${TAURI_BACKUP_DIR}`;
    console.log('[Backup] Tauri 备份路径:', tauriBasePath);
    return tauriBasePath;
  } catch (e) {
    console.error('[Backup] 获取 Tauri 路径失败:', e);
    return null;
  }
}

/**
 * 获取备份路径显示（用于 UI）
 */
export function getBackupPathDisplay(): string {
  if (isTauri()) {
    return `APP 数据目录/${TAURI_BACKUP_DIR}`;
  }
  return '浏览器本地存储';
}

// ========== 备份数据结构 ==========

export interface BackupRecord {
  id: string;           // 备份 ID（时间戳）
  noteId: string;       // 页面 ID
  noteTitle: string;    // 页面标题
  content: string;      // 完整内容
  version: number;      // 云端版本号
  createdAt: string;    // 备份时间
  size: number;         // 内容大小（字节）
  notebookPath: string; // 笔记本路径（用于显示）
}

// ========== IndexedDB 操作 ==========

let dbInstance: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[Backup] 打开数据库失败:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      
      // 创建备份存储
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        // 创建索引，用于按页面 ID 查询
        store.createIndex('noteId', 'noteId', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        console.log('[Backup] 数据库初始化完成');
      }
    };
  });
}

// ========== 核心功能 ==========

/**
 * 创建备份
 */
export async function createBackup(note: Note, notebookPath: string): Promise<{ success: boolean; error?: string }> {
  const config = getBackupConfig();
  if (!config.enabled) {
    return { success: true }; // 未启用，跳过
  }

  // 只备份页面类型
  if (note.type !== 'page') {
    return { success: true };
  }

  // 检查是否在排除列表中
  if (config.excludeNoteIds?.includes(note.id)) {
    return { success: true };
  }

  const content = note.content || '';
  const size = new Blob([content]).size;

  // 如果内容为空或太小，不备份
  if (size < 50) {
    console.log('[Backup] 内容太小，跳过备份:', note.id, 'size:', size);
    return { success: true };
  }

  const backup: BackupRecord = {
    id: `${note.id}-${Date.now()}`,
    noteId: note.id,
    noteTitle: note.title,
    content,
    version: note.version,
    createdAt: new Date().toISOString(),
    size,
    notebookPath,
  };

  // Tauri 环境：使用文件系统
  if (isTauri()) {
    const basePath = await getTauriBackupPath();
    if (basePath) {
      return createBackupTauri(backup, basePath, config.maxVersions);
    }
    return { success: false, error: '无法获取备份路径' };
  }

  // Web 环境：使用 IndexedDB
  return createBackupIndexedDB(backup, config.maxVersions);
}

/**
 * Tauri 文件系统备份
 */
async function createBackupTauri(
  backup: BackupRecord,
  basePath: string,
  maxVersions: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!window.__TAURI__) {
      return { success: false, error: 'Tauri API 不可用' };
    }

    // 创建备份目录：basePath/noteId/
    const noteDir = `${basePath}/${backup.noteId}`;
    
    // 检查目录是否存在，不存在则创建
    const dirExists = await window.__TAURI__.fs.exists(noteDir);
    if (!dirExists) {
      await window.__TAURI__.fs.mkdir(noteDir, { recursive: true });
    }

    // 备份文件名：timestamp-version.json
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `${timestamp}-v${backup.version}.json`;
    const filePath = `${noteDir}/${fileName}`;

    // 写入文件
    const backupJson = JSON.stringify(backup, null, 2);
    await window.__TAURI__.fs.writeTextFile(filePath, backupJson);

    console.log('[Backup] Tauri 备份创建成功:', filePath);

    // 清理旧备份
    await cleanOldBackupsTauri(backup.noteId, basePath, maxVersions);

    return { success: true };
  } catch (e) {
    console.error('[Backup] Tauri 备份失败:', e);
    return { success: false, error: String(e) };
  }
}

/**
 * IndexedDB 备份
 */
async function createBackupIndexedDB(
  backup: BackupRecord,
  maxVersions: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = await openDB();

    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(backup);

      request.onsuccess = () => {
        console.log('[Backup] IndexedDB 备份创建成功:', backup.id, 'size:', backup.size);
        
        // 清理旧备份
        cleanOldBackups(backup.noteId, maxVersions);
        
        resolve({ success: true });
      };

      request.onerror = () => {
        console.error('[Backup] 备份创建失败:', request.error);
        resolve({ success: false, error: request.error?.message || '备份失败' });
      };
    });
  } catch (e) {
    console.error('[Backup] 备份异常:', e);
    return { success: false, error: String(e) };
  }
}

/**
 * 获取页面的所有备份
 */
export async function getBackups(noteId: string): Promise<BackupRecord[]> {
  // Tauri 环境
  if (isTauri()) {
    const basePath = await getTauriBackupPath();
    if (basePath) {
      return getBackupsTauri(noteId, basePath);
    }
    return [];
  }

  // Web 环境
  return getBackupsIndexedDB(noteId);
}

/**
 * Tauri 获取备份列表
 */
async function getBackupsTauri(noteId: string, basePath: string): Promise<BackupRecord[]> {
  try {
    if (!window.__TAURI__) return [];

    const noteDir = `${basePath}/${noteId}`;
    const dirExists = await window.__TAURI__.fs.exists(noteDir);
    if (!dirExists) return [];

    const files = await window.__TAURI__.fs.readDir(noteDir);
    const backups: BackupRecord[] = [];

    for (const file of files) {
      if (file.isDir || !file.name.endsWith('.json')) continue;

      try {
        const content = await window.__TAURI__.fs.readTextFile(`${noteDir}/${file.name}`);
        const backup = JSON.parse(content) as BackupRecord;
        backups.push(backup);
      } catch (e) {
        console.error('[Backup] 读取备份文件失败:', file.name, e);
      }
    }

    // 按时间倒序排序
    backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return backups;
  } catch (e) {
    console.error('[Backup] 获取 Tauri 备份列表失败:', e);
    return [];
  }
}

/**
 * IndexedDB 获取备份列表
 */
async function getBackupsIndexedDB(noteId: string): Promise<BackupRecord[]> {
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('noteId');
      const request = index.getAll(noteId);

      request.onsuccess = () => {
        const backups = request.result as BackupRecord[];
        // 按时间倒序排序
        backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        resolve(backups);
      };

      request.onerror = () => {
        console.error('[Backup] 获取备份列表失败:', request.error);
        resolve([]);
      };
    });
  } catch (e) {
    console.error('[Backup] 获取备份异常:', e);
    return [];
  }
}

/**
 * 获取单个备份详情
 */
export async function getBackup(backupId: string): Promise<BackupRecord | null> {
  // Tauri 环境：从文件读取
  if (isTauri()) {
    const basePath = await getTauriBackupPath();
    if (basePath) {
      // backupId 格式：noteId-timestamp
      const [noteId] = backupId.split('-');
      const backups = await getBackupsTauri(noteId, basePath);
      return backups.find(b => b.id === backupId) || null;
    }
    return null;
  }

  // Web 环境：从 IndexedDB 读取
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(backupId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        console.error('[Backup] 获取备份详情失败:', request.error);
        resolve(null);
      };
    });
  } catch (e) {
    console.error('[Backup] 获取备份详情异常:', e);
    return null;
  }
}

/**
 * 删除单个备份
 */
export async function deleteBackup(backupId: string): Promise<{ success: boolean }> {
  // Tauri 环境
  if (isTauri()) {
    // TODO: 实现文件删除（需要找到具体文件）
    return { success: true };
  }

  // Web 环境
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(backupId);

      request.onsuccess = () => {
        console.log('[Backup] 备份已删除:', backupId);
        resolve({ success: true });
      };

      request.onerror = () => {
        console.error('[Backup] 删除备份失败:', request.error);
        resolve({ success: false });
      };
    });
  } catch (e) {
    console.error('[Backup] 删除备份异常:', e);
    return { success: false };
  }
}

/**
 * 清理旧备份（IndexedDB）
 */
async function cleanOldBackups(noteId: string, maxVersions: number): Promise<void> {
  try {
    const backups = await getBackupsIndexedDB(noteId);
    
    if (backups.length <= maxVersions) {
      return;
    }

    // 删除多余的旧备份
    const toDelete = backups.slice(maxVersions);
    for (const backup of toDelete) {
      await deleteBackup(backup.id);
    }
    
    console.log(`[Backup] 清理了 ${toDelete.length} 个旧备份`);
  } catch (e) {
    console.error('[Backup] 清理旧备份失败:', e);
  }
}

/**
 * 清理旧备份（Tauri）
 */
async function cleanOldBackupsTauri(noteId: string, basePath: string, maxVersions: number): Promise<void> {
  try {
    if (!window.__TAURI__) return;

    const backups = await getBackupsTauri(noteId, basePath);
    if (backups.length <= maxVersions) return;

    const toDelete = backups.slice(maxVersions);
    const noteDir = `${basePath}/${noteId}`;

    for (const backup of toDelete) {
      // 查找对应的文件
      const files = await window.__TAURI__.fs.readDir(noteDir);
      for (const file of files) {
        if (file.name.includes(backup.id.split('-')[1])) {
          try {
            await window.__TAURI__.fs.remove(`${noteDir}/${file.name}`);
            console.log('[Backup] 已删除旧备份:', file.name);
          } catch (e) {
            console.error('[Backup] 删除文件失败:', file.name, e);
          }
        }
      }
    }
  } catch (e) {
    console.error('[Backup] 清理 Tauri 旧备份失败:', e);
  }
}

/**
 * 获取备份统计信息
 */
export async function getBackupStats(): Promise<{
  totalBackups: number;
  totalSize: number;
  noteCount: number;
}> {
  // Tauri 环境
  if (isTauri()) {
    const basePath = await getTauriBackupPath();
    if (basePath) {
      return getBackupStatsTauri(basePath);
    }
    return { totalBackups: 0, totalSize: 0, noteCount: 0 };
  }

  // Web 环境
  return getBackupStatsIndexedDB();
}

/**
 * Tauri 获取统计
 */
async function getBackupStatsTauri(basePath: string): Promise<{
  totalBackups: number;
  totalSize: number;
  noteCount: number;
}> {
  try {
    if (!window.__TAURI__) return { totalBackups: 0, totalSize: 0, noteCount: 0 };

    const dirExists = await window.__TAURI__.fs.exists(basePath);
    if (!dirExists) return { totalBackups: 0, totalSize: 0, noteCount: 0 };

    const noteDirs = await window.__TAURI__.fs.readDir(basePath);
    let totalBackups = 0;
    let totalSize = 0;
    const noteIds = new Set<string>();

    for (const noteDir of noteDirs) {
      if (!noteDir.isDir) continue;

      const files = await window.__TAURI__.fs.readDir(`${basePath}/${noteDir.name}`);
      for (const file of files) {
        if (file.isDir || !file.name.endsWith('.json')) continue;

        try {
          const content = await window.__TAURI__.fs.readTextFile(`${basePath}/${noteDir.name}/${file.name}`);
          const backup = JSON.parse(content) as BackupRecord;
          totalBackups++;
          totalSize += backup.size;
          noteIds.add(backup.noteId);
        } catch (e) {
          // 忽略读取错误
        }
      }
    }

    return {
      totalBackups,
      totalSize,
      noteCount: noteIds.size,
    };
  } catch (e) {
    console.error('[Backup] 获取 Tauri 统计失败:', e);
    return { totalBackups: 0, totalSize: 0, noteCount: 0 };
  }
}

/**
 * IndexedDB 获取统计
 */
async function getBackupStatsIndexedDB(): Promise<{
  totalBackups: number;
  totalSize: number;
  noteCount: number;
}> {
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const backups = request.result as BackupRecord[];
        const noteIds = new Set(backups.map(b => b.noteId));
        const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
        
        resolve({
          totalBackups: backups.length,
          totalSize,
          noteCount: noteIds.size,
        });
      };

      request.onerror = () => {
        resolve({ totalBackups: 0, totalSize: 0, noteCount: 0 });
      };
    });
  } catch (e) {
    return { totalBackups: 0, totalSize: 0, noteCount: 0 };
  }
}

/**
 * 清空所有备份
 */
export async function clearAllBackups(): Promise<{ success: boolean }> {
  // Tauri 环境：删除整个备份目录
  if (isTauri()) {
    const basePath = await getTauriBackupPath();
    if (basePath && window.__TAURI__) {
      try {
        const exists = await window.__TAURI__.fs.exists(basePath);
        if (exists) {
          await window.__TAURI__.fs.remove(basePath, { recursive: true });
        }
        console.log('[Backup] Tauri 备份已清空');
        return { success: true };
      } catch (e) {
        console.error('[Backup] 清空 Tauri 备份失败:', e);
        return { success: false };
      }
    }
    return { success: false };
  }

  // Web 环境：清空 IndexedDB
  try {
    const db = await openDB();
    
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        console.log('[Backup] 所有备份已清空');
        resolve({ success: true });
      };

      request.onerror = () => {
        console.error('[Backup] 清空备份失败:', request.error);
        resolve({ success: false });
      };
    });
  } catch (e) {
    console.error('[Backup] 清空备份异常:', e);
    return { success: false };
  }
}

/**
 * 格式化文件大小
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
