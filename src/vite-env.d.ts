/// <reference types="vite/client" />

interface Window {
  __TAURI__?: {
    fs: {
      mkdir: (path: string, options?: Record<string, unknown>) => Promise<void>;
      exists: (path: string, options?: Record<string, unknown>) => Promise<boolean>;
      writeTextFile: (path: string, contents: string, options?: Record<string, unknown>) => Promise<void>;
      readTextFile: (path: string, options?: Record<string, unknown>) => Promise<string>;
      readDir: (path: string, options?: Record<string, unknown>) => Promise<Array<{ name: string; isDirectory: boolean }>>;
      remove: (path: string, options?: Record<string, unknown>) => Promise<void>;
      BaseDirectory: Record<string, unknown>;
    };
    core?: {
      invoke: <T = unknown>(command: string, args?: Record<string, unknown>) => Promise<T>;
    };
  };
  __TAURI_INTERNALS__?: unknown;
}

declare module 'mind-elixir';
declare module 'mind-elixir/style.css';
