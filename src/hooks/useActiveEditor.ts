import { useCallback } from 'react';
import { Editor } from '@tiptap/react';

/**
 * 获取当前应该接收命令的编辑器
 * 如果焦点在 NodeView（如 TabGroup）内部，返回该内部编辑器
 * 否则返回外部编辑器
 */
export function useActiveEditor(
  externalEditor: Editor | null,
  getActiveNodeViewEditor: () => Editor | null
): Editor | null {
  return getActiveNodeViewEditor() || externalEditor;
}

/**
 * 执行命令的辅助函数
 * 自动路由到正确的编辑器
 */
export function executeCommand(
  targetEditor: Editor | null,
  command: (editor: Editor) => void
) {
  if (!targetEditor) return;
  command(targetEditor);
}
