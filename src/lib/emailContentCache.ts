export const EMAIL_CONTENT_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EMAIL_THREAD_CACHE_TTL_MS = 5 * 60 * 1000;

const EMAIL_CONTENT_CACHE_PREFIX = 'caiyun_email_content_cache_v3:';
const EMAIL_CONTENT_CACHE_INDEX_KEY = 'caiyun_email_content_cache_index_v3';
const EMAIL_CONTENT_CACHE_MAX_ENTRIES = 300;
const EMAIL_THREAD_CACHE_PREFIX = 'caiyun_email_thread_cache_v1:';
const EMAIL_THREAD_CACHE_INDEX_KEY = 'caiyun_email_thread_cache_index_v1';
const EMAIL_THREAD_CACHE_MAX_ENTRIES = 100;

export interface EmailContentDisplay {
  body: string;
  isHtml: boolean;
  attachments?: EmailAttachmentMeta[];
}

export interface CachedEmailContent extends EmailContentDisplay {
  cachedAt: number;
}

export interface EmailAttachmentMeta {
  filename?: string;
  contentType?: string;
  size?: number;
}

export interface CachedEmailThread<T = unknown> {
  emails: T[];
  cachedAt: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface EmailContentPayload {
  text?: string | null;
  html?: string | null;
  source?: string | null;
  attachments?: unknown;
}

const memoryCache = new Map<string, CachedEmailContent>();
const threadMemoryCache = new Map<string, CachedEmailThread>();

const getBrowserStorage = (): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const storageKeyFor = (key: string) => `${EMAIL_CONTENT_CACHE_PREFIX}${key}`;
const threadStorageKeyFor = (key: string) => `${EMAIL_THREAD_CACHE_PREFIX}${key}`;

const readStoredIndex = (storage: StorageLike, indexKey: string): string[] => {
  try {
    const parsed = JSON.parse(storage.getItem(indexKey) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const writeStoredIndex = (storage: StorageLike, indexKey: string, keys: string[]) => {
  try {
    storage.setItem(indexKey, JSON.stringify(keys));
  } catch {
    // Local storage can be full or unavailable in private mode. In-memory cache still works.
  }
};

const rememberStoredKey = (
  key: string,
  storage: StorageLike,
  indexKey: string,
  keyForStorage: (key: string) => string,
  maxEntries: number,
) => {
  const nextKeys = [key, ...readStoredIndex(storage, indexKey).filter(item => item !== key)];
  const overflowKeys = nextKeys.slice(maxEntries);
  overflowKeys.forEach(item => {
    try {
      storage.removeItem(keyForStorage(item));
    } catch {
      // Ignore individual localStorage cleanup failures.
    }
  });
  writeStoredIndex(storage, indexKey, nextKeys.slice(0, maxEntries));
};

const rememberKey = (key: string, storage: StorageLike) => {
  rememberStoredKey(key, storage, EMAIL_CONTENT_CACHE_INDEX_KEY, storageKeyFor, EMAIL_CONTENT_CACHE_MAX_ENTRIES);
};

const removeStoredEntry = (key: string, storage: StorageLike | null) => {
  memoryCache.delete(key);
  if (!storage) return;
  try {
    storage.removeItem(storageKeyFor(key));
  } catch {
    // Ignore localStorage cleanup failures.
  }
};

const isFresh = (entry: CachedEmailContent, now: number) => (
  Number.isFinite(entry.cachedAt) && now - entry.cachedAt <= EMAIL_CONTENT_CACHE_TTL_MS
);

const isFreshThread = (entry: CachedEmailThread, now: number) => (
  Number.isFinite(entry.cachedAt) && now - entry.cachedAt <= EMAIL_THREAD_CACHE_TTL_MS
);

const normalizePlainText = (value: string) => {
  const withoutInlineImageUrls = value
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]*\[https?:\/\/[^\]\s]+\.(?:png|jpe?g|gif|webp)(?:\?[^\]]*)?\]/gi, '');

  return withoutInlineImageUrls
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      const bracketedUrl = trimmed.match(/^\[(https?:\/\/[^\]]+)\]$/i);
      if (!bracketedUrl) return true;
      const url = bracketedUrl[1];
      return url.length <= 120 && !/sendgrid\.net|\/click\b|tracking|track/i.test(url);
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const getEmailContentCacheKey = (accountId: string, folder: string, uid: number | string) => (
  [accountId, folder, String(uid)].map(part => encodeURIComponent(part || '')).join(':')
);

export const getEmailThreadCacheKey = (accountId: string, otherAddr: string) => (
  [accountId, String(otherAddr || '').toLowerCase()].map(part => encodeURIComponent(part || '')).join(':')
);

export const normalizeEmailContentPayload = (payload: EmailContentPayload): EmailContentDisplay => {
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
      .filter(item => item && typeof item === 'object')
      .map((item: any) => ({
        filename: typeof item.filename === 'string' ? item.filename : undefined,
        contentType: typeof item.contentType === 'string' ? item.contentType : undefined,
        size: typeof item.size === 'number' ? item.size : undefined,
      }))
    : [];
  const withAttachments = (display: Omit<EmailContentDisplay, 'attachments'>): EmailContentDisplay => (
    attachments.length > 0 ? { ...display, attachments } : display
  );

  const html = typeof payload.html === 'string' ? payload.html.trim() : '';
  if (html) {
    return withAttachments({ body: html, isHtml: true });
  }

  const text = typeof payload.text === 'string' ? normalizePlainText(payload.text) : '';
  if (text) {
    return withAttachments({ body: text, isHtml: false });
  }

  const source = typeof payload.source === 'string' ? normalizePlainText(payload.source).slice(0, 500) : '';
  return withAttachments({ body: source, isHtml: false });
};

export const getCachedEmailContent = (
  key: string,
  now = Date.now(),
  storage: StorageLike | null = getBrowserStorage(),
): CachedEmailContent | null => {
  const memoryEntry = memoryCache.get(key);
  if (memoryEntry) {
    if (isFresh(memoryEntry, now)) return memoryEntry;
    removeStoredEntry(key, storage);
    return null;
  }

  if (!storage) return null;

  try {
    const raw = storage.getItem(storageKeyFor(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEmailContent;
    if (
      typeof parsed.body !== 'string'
      || typeof parsed.isHtml !== 'boolean'
      || typeof parsed.cachedAt !== 'number'
      || (parsed.attachments !== undefined && !Array.isArray(parsed.attachments))
    ) {
      removeStoredEntry(key, storage);
      return null;
    }
    if (!isFresh(parsed, now)) {
      removeStoredEntry(key, storage);
      return null;
    }
    memoryCache.set(key, parsed);
    return parsed;
  } catch {
    removeStoredEntry(key, storage);
    return null;
  }
};

export const setCachedEmailContent = (
  key: string,
  content: EmailContentDisplay,
  cachedAt = Date.now(),
  storage: StorageLike | null = getBrowserStorage(),
) => {
  const entry: CachedEmailContent = {
    body: content.body,
    isHtml: content.isHtml,
    ...(content.attachments ? { attachments: content.attachments } : {}),
    cachedAt,
  };
  memoryCache.set(key, entry);
  if (!storage) return;

  try {
    storage.setItem(storageKeyFor(key), JSON.stringify(entry));
    rememberKey(key, storage);
  } catch {
    // Keep the in-memory cache even if persistent storage is full.
  }
};

export const getCachedEmailThread = <T = unknown>(
  key: string,
  now = Date.now(),
  storage: StorageLike | null = getBrowserStorage(),
): CachedEmailThread<T> | null => {
  const memoryEntry = threadMemoryCache.get(key);
  if (memoryEntry) {
    if (isFreshThread(memoryEntry, now)) return memoryEntry as CachedEmailThread<T>;
    threadMemoryCache.delete(key);
    if (storage) {
      try {
        storage.removeItem(threadStorageKeyFor(key));
      } catch {
        // Ignore localStorage cleanup failures.
      }
    }
    return null;
  }

  if (!storage) return null;

  try {
    const raw = storage.getItem(threadStorageKeyFor(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEmailThread<T>;
    if (!Array.isArray(parsed.emails) || typeof parsed.cachedAt !== 'number') {
      storage.removeItem(threadStorageKeyFor(key));
      return null;
    }
    if (!isFreshThread(parsed, now)) {
      storage.removeItem(threadStorageKeyFor(key));
      return null;
    }
    threadMemoryCache.set(key, parsed);
    return parsed;
  } catch {
    try {
      storage.removeItem(threadStorageKeyFor(key));
    } catch {
      // Ignore localStorage cleanup failures.
    }
    return null;
  }
};

export const setCachedEmailThread = <T = unknown>(
  key: string,
  emails: T[],
  cachedAt = Date.now(),
  storage: StorageLike | null = getBrowserStorage(),
) => {
  const entry: CachedEmailThread<T> = {
    emails,
    cachedAt,
  };
  threadMemoryCache.set(key, entry);
  if (!storage) return;

  try {
    storage.setItem(threadStorageKeyFor(key), JSON.stringify(entry));
    rememberStoredKey(key, storage, EMAIL_THREAD_CACHE_INDEX_KEY, threadStorageKeyFor, EMAIL_THREAD_CACHE_MAX_ENTRIES);
  } catch {
    // Keep the in-memory cache even if persistent storage is full.
  }
};

export const clearEmailContentCache = (storage: StorageLike | null = getBrowserStorage()) => {
  memoryCache.clear();
  if (!storage) return;
  const keys = readStoredIndex(storage, EMAIL_CONTENT_CACHE_INDEX_KEY);
  keys.forEach(key => {
    try {
      storage.removeItem(storageKeyFor(key));
    } catch {
      // Ignore localStorage cleanup failures.
    }
  });
  try {
    storage.removeItem(EMAIL_CONTENT_CACHE_INDEX_KEY);
  } catch {
    // Ignore localStorage cleanup failures.
  }
};

export const clearEmailThreadCache = (storage: StorageLike | null = getBrowserStorage()) => {
  threadMemoryCache.clear();
  if (!storage) return;
  const keys = readStoredIndex(storage, EMAIL_THREAD_CACHE_INDEX_KEY);
  keys.forEach(key => {
    try {
      storage.removeItem(threadStorageKeyFor(key));
    } catch {
      // Ignore localStorage cleanup failures.
    }
  });
  try {
    storage.removeItem(EMAIL_THREAD_CACHE_INDEX_KEY);
  } catch {
    // Ignore localStorage cleanup failures.
  }
};
