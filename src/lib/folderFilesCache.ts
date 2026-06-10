export const FOLDER_FILES_CACHE_TTL_MS = 5 * 60 * 1000;

interface FolderFilesCacheEntry<T> {
  files: T[];
  fetchedAt: number;
  promise?: Promise<T[]>;
}

const folderFilesCache = new Map<string, FolderFilesCacheEntry<unknown>>();

export const getFolderFilesCacheKey = (provider: string, noteId?: string | null, userId?: string | null) => (
  `${userId || 'anonymous'}:${provider}:${noteId || ''}`
);

export const getFreshFolderFilesFromCache = <T>(key: string, now = Date.now()): T[] | null => {
  const entry = folderFilesCache.get(key) as FolderFilesCacheEntry<T> | undefined;
  if (!entry || now - entry.fetchedAt > FOLDER_FILES_CACHE_TTL_MS) return null;
  return entry.files;
};

export const getCachedFolderFiles = <T>(key: string): T[] | null => {
  const entry = folderFilesCache.get(key) as FolderFilesCacheEntry<T> | undefined;
  return entry?.files || null;
};

export const setFolderFilesCache = <T>(key: string, files: T[], fetchedAt = Date.now()) => {
  folderFilesCache.set(key, { files, fetchedAt } as FolderFilesCacheEntry<unknown>);
};

export const invalidateFolderFilesCache = (key: string) => {
  folderFilesCache.delete(key);
};

export const clearFolderFilesCache = () => {
  folderFilesCache.clear();
};

export const getOrLoadFolderFiles = async <T>(
  key: string,
  loader: () => Promise<T[]>,
  opts: { force?: boolean; now?: number } = {},
): Promise<T[]> => {
  const now = opts.now ?? Date.now();
  const existing = folderFilesCache.get(key) as FolderFilesCacheEntry<T> | undefined;

  if (!opts.force) {
    const fresh = getFreshFolderFilesFromCache<T>(key, now);
    if (fresh) return fresh;
    if (existing?.promise) return existing.promise;
  }

  const promise = loader();
  folderFilesCache.set(key, {
    files: existing?.files || [],
    fetchedAt: existing?.fetchedAt || 0,
    promise,
  } as FolderFilesCacheEntry<unknown>);

  try {
    const files = await promise;
    setFolderFilesCache(key, files);
    return files;
  } catch (error) {
    if (existing) {
      folderFilesCache.set(key, {
        files: existing.files,
        fetchedAt: existing.fetchedAt,
      } as FolderFilesCacheEntry<unknown>);
    } else {
      folderFilesCache.delete(key);
    }
    throw error;
  }
};
