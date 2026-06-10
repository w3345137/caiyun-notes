import { useSyncExternalStore } from 'react';
import { Editor } from '@tiptap/react';

// 全局变量，存储当前活跃的内部编辑器
let activeInternalEditor: Editor | null = null;
const listeners = new Set<() => void>();

/**
 * 获取当前活跃的内部编辑器（用于工具栏命令路由）
 */
export function getActiveInternalEditor(): Editor | null {
  return activeInternalEditor;
}

function subscribeActiveInternalEditor(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * 订阅当前活跃的内部编辑器，确保工具栏在焦点进出 NodeView 时重新路由命令
 */
export function useActiveInternalEditor(): Editor | null {
  return useSyncExternalStore(
    subscribeActiveInternalEditor,
    getActiveInternalEditor,
    getActiveInternalEditor
  );
}

/**
 * 设置当前活跃的内部编辑器（TabGroupView 调用）
 */
export function setActiveInternalEditor(editor: Editor | null): void {
  if (activeInternalEditor === editor) return;
  activeInternalEditor = editor;
  listeners.forEach((listener) => listener());
}
