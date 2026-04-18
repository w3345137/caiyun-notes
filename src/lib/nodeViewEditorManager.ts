import { Editor } from '@tiptap/react';

// 全局变量，存储当前活跃的内部编辑器
let activeInternalEditor: Editor | null = null;

/**
 * 获取当前活跃的内部编辑器（用于工具栏命令路由）
 */
export function getActiveInternalEditor(): Editor | null {
  return activeInternalEditor;
}

/**
 * 设置当前活跃的内部编辑器（TabGroupView 调用）
 */
export function setActiveInternalEditor(editor: Editor | null): void {
  activeInternalEditor = editor;
}
