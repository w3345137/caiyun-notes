import React, { useState, useRef, useEffect, useCallback } from 'react';
import { NodeViewWrapper, useEditor, EditorContent } from '@tiptap/react';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plus } from 'lucide-react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableWithDefaultWidth } from '../extensions/TableWithDefaultWidth';
import TextAlign from '@tiptap/extension-text-align';
import { TableRowWithTextSelection } from '../extensions/TableRowWithTextSelection';
import { TableCellWithColor } from '../extensions/TableCellWithColor';
import { TableHeaderWithColor } from '../extensions/TableHeaderWithColor';
import { ResizableImage } from '../extensions/ResizableImage';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontSize } from '@tiptap/extension-font-size';
import { ListKeymap } from '@tiptap/extension-list-keymap';
import { Markdown } from '@tiptap/markdown';
import { setActiveInternalEditor } from '../lib/nodeViewEditorManager';

interface TabGroupViewProps {
  node: ProseMirrorNode;
  getPos: () => number;
  updateAttributes: (attrs: Record<string, any>) => void;
  deleteNode: () => void;
  selected: boolean;
  editor: any;
}

interface Tab {
  id: string;
  title: string;
}

interface Contents {
  [tabId: string]: { type: 'doc'; content?: any[] };
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const TabGroupView: React.FC<TabGroupViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor: externalEditor,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const tabs: Tab[] = node.attrs.tabs || [{ id: '1', title: '页签1' }];
  const contents: Contents = node.attrs.contents || { '1': { type: 'doc', content: [{ type: 'paragraph' }] } };
  const activeIndex: number = node.attrs.activeIndex ?? 0;

  // 用 ref 保持最新值，避免 onBlur/handleTabClick 中的闭包过时问题
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const contentsRef = useRef(contents);
  contentsRef.current = contents;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const updateAttributesRef = useRef(updateAttributes);
  updateAttributesRef.current = updateAttributes;

  // 获取主编辑器的可编辑状态
  const isExternalEditable = externalEditor?.isEditable ?? true;

  /**
   * 保存当前活跃 Tab 的编辑器内容到 node attrs
   * 所有会切换/修改 Tab 的操作前都应调用此函数
   */
  const saveCurrentContent = useCallback((editorInstance: any) => {
    if (!editorInstance) return;
    const currentTabId = tabsRef.current[activeIndexRef.current]?.id;
    if (!currentTabId) return;
    updateAttributesRef.current({
      contents: {
        ...contentsRef.current,
        [currentTabId]: editorInstance.getJSON(),
      },
    });
  }, []);

  // 创建内部编辑器
  const internalEditor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '开始输入...' }),
      ResizableImage.configure({
        HTMLAttributes: { class: 'rounded-lg' },
      }),
      TableWithDefaultWidth.configure({ resizable: true }),
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      TableRowWithTextSelection,
      TableCellWithColor.configure({
        HTMLAttributes: { class: 'relative' },
      }),
      TableHeaderWithColor,
      TextStyle,
      Color,
      FontSize.configure({ types: ['textStyle'] }),
      Highlight,
      Link.configure({ openOnClick: false }),
      TaskList.configure({
        HTMLAttributes: { class: 'not-prose pl-0 list-none' },
      }),
      TaskItem.configure({
        HTMLAttributes: { class: 'flex items-start gap-2 py-1' },
      }),
      ListKeymap.configure({
        listTypes: [
          { itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
          { itemName: 'taskItem', wrapperNames: ['taskList'] },
        ],
      }),
      Markdown.configure({
        html: false,
        tightLists: true,
        breaks: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: contents[tabs[activeIndex]?.id] || { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: isExternalEditable,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[100px]',
      },
      // 拦截图片拖拽和粘贴，转为 base64 data URL（blob: URL 刷新后失效）
      handleDrop: (view: any, event: any, _slice: any, moved: boolean) => {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files).filter((f: File) => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
        for (const file of imageFiles) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const base64 = (e.target?.result as string);
            const node = view.state.schema.nodes.image.create({ src: base64, width: 300 });
            const insertPos = pos ? pos.pos : view.state.selection.from;
            const tr = view.state.tr.insert(insertPos, node);
            view.dispatch(tr);
          };
          reader.readAsDataURL(file);
        }
        return true;
      },
      handlePaste: (view: any, event: any) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            const reader = new FileReader();
            reader.onload = (e) => {
              const base64 = (e.target?.result as string);
              const node = view.state.schema.nodes.image.create({ src: base64, width: 300 });
              const tr = view.state.tr.insert(view.state.selection.from, node);
              view.dispatch(tr);
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
    },
    immediatelyRender: false,
    onFocus: () => {
      setActiveInternalEditor(internalEditor);
    },
    onBlur: () => {
      // 失去焦点时保存当前内容（通过 ref 获取最新值）
      saveCurrentContent(internalEditor);
      setActiveInternalEditor(null);
    },
  });

  // 同步主编辑器的锁定状态到内部编辑器
  useEffect(() => {
    if (internalEditor) {
      internalEditor.setEditable(isExternalEditable);
    }
  }, [internalEditor, isExternalEditable]);

  // 内部编辑器内容变化时自动保存到 node attrs（防抖 1s，防止刷新丢失）
  useEffect(() => {
    if (!internalEditor) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        saveCurrentContent(internalEditor);
      }, 1000);
    };
    internalEditor.on('update', handler);
    return () => {
      internalEditor.off('update', handler);
      if (timer) clearTimeout(timer);
    };
  }, [internalEditor, saveCurrentContent]);

  // 切换 Tab：先保存当前内容，再切换
  const handleTabClick = useCallback((index: number) => {
    if (editingIndex !== null) return;
    if (index === activeIndexRef.current) return;
    // 先保存当前 Tab 的内容
    saveCurrentContent(internalEditor);
    updateAttributesRef.current({ activeIndex: index });
  }, [editingIndex, internalEditor, saveCurrentContent]);

  // 加载目标 Tab 内容 —— 仅在 activeIndex 变化时触发
  useEffect(() => {
    if (!internalEditor) return;
    const targetTab = tabs[activeIndex];
    if (!targetTab) return;

    const targetContent = contents[targetTab.id] || { type: 'doc', content: [{ type: 'paragraph' }] };
    internalEditor.commands.setContent(targetContent, false);
  }, [activeIndex, internalEditor]); // 故意不包含 tabs 和 contents，避免循环触发

  // 添加 Tab：先保存当前内容
  const handleAddTab = useCallback(() => {
    saveCurrentContent(internalEditor);
    const newId = generateId();
    const newTitle = `页签${tabs.length + 1}`;
    updateAttributes({
      tabs: [...tabs, { id: newId, title: newTitle }],
      contents: {
        ...contents,
        [newId]: { type: 'doc', content: [{ type: 'paragraph' }] },
      },
      activeIndex: tabs.length,
    });
  }, [tabs, contents, updateAttributes, internalEditor, saveCurrentContent]);

  // 删除 Tab：先保存当前内容
  const handleDeleteTab = useCallback((index: number) => {
    if (tabs.length === 1) {
      deleteNode();
      return;
    }

    // 先保存当前内容（确保未保存的编辑不丢失）
    saveCurrentContent(internalEditor);

    const tabIdToDelete = tabs[index].id;
    const newTabs = tabs.filter((_, i) => i !== index);
    const newContents = { ...contents };
    delete newContents[tabIdToDelete];

    let newActiveIndex = activeIndex;
    if (index === activeIndex) {
      newActiveIndex = Math.min(index, newTabs.length - 1);
    } else if (index < activeIndex) {
      newActiveIndex = activeIndex - 1;
    }

    updateAttributes({
      tabs: newTabs,
      contents: newContents,
      activeIndex: newActiveIndex,
    });
  }, [tabs, contents, activeIndex, deleteNode, updateAttributes, internalEditor, saveCurrentContent]);

  // 更新 Tab 标题
  const updateTabTitle = useCallback((index: number, title: string) => {
    const newTabs = [...tabs];
    newTabs[index] = { ...newTabs[index], title };
    updateAttributes({ tabs: newTabs });
  }, [tabs, updateAttributes]);

  // 计算菜单位置
  const getMenuPosition = (buttonEl: HTMLElement) => {
    const rect = buttonEl.getBoundingClientRect();
    return {
      top: rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
    };
  };

  // 切换菜单
  const handleMenuToggle = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (openMenuIndex === index) {
      setOpenMenuIndex(null);
      setMenuPosition(null);
    } else {
      setMenuPosition(getMenuPosition(e.currentTarget as HTMLElement));
      setOpenMenuIndex(index);
    }
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null);
      }
    };
    if (openMenuIndex !== null) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [openMenuIndex]);

  // 开始编辑标题
  const handleTitleClick = (index: number, currentTitle: string) => {
    setEditingIndex(index);
    setEditValue(currentTitle);
    setOpenMenuIndex(null);
  };

  // 标题编辑完成
  const handleTitleBlur = () => {
    if (editingIndex !== null) {
      const newTitle = editValue.trim() || `页签${editingIndex + 1}`;
      updateTabTitle(editingIndex, newTitle);
      setEditingIndex(null);
    }
  };

  // 标题键盘事件
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingIndex !== null) {
        const newTitle = editValue.trim() || `页签${editingIndex + 1}`;
        updateTabTitle(editingIndex, newTitle);
      }
      setEditingIndex(null);
    } else if (e.key === 'Escape') {
      setEditingIndex(null);
    }
  };

  // 自动聚焦
  useEffect(() => {
    if (editingIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIndex]);

  return (
    <NodeViewWrapper>
      <div
        className={`tab-group-container border border-gray-200 rounded-lg overflow-hidden mb-2 select-none ${
          selected ? 'ring-2 ring-blue-500' : ''
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Tab 按钮栏 */}
        <div className="flex items-center bg-gray-50 border-b border-gray-200 overflow-hidden">
          {tabs.map((tab, index) => {
            const isActive = index === activeIndex;

            return (
              <div key={tab.id} className="relative">
                {editingIndex === index ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleTitleBlur}
                    onKeyDown={handleTitleKeyDown}
                    className="bg-white border border-blue-400 rounded px-2 py-1.5 text-sm outline-none w-24"
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <div className={`flex items-center border-r border-gray-200 last:border-r-0 ${isActive ? 'bg-white text-blue-600 font-medium border-b-2 border-b-blue-500 -mb-px' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                    <button
                      onClick={() => handleTabClick(index)}
                      className="px-3 py-2 text-sm cursor-pointer whitespace-nowrap"
                      style={{ cursor: 'pointer' }}
                    >
                      {tab.title}
                    </button>
                    <button
                      onClick={(e) => handleMenuToggle(e, index)}
                      className="px-1 py-2 cursor-pointer"
                      style={{ cursor: 'pointer' }}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M7 10l5 5 5-5z"/>
                      </svg>
                    </button>
                  </div>
                )}

                {openMenuIndex === index && menuPosition && (
                  <div
                    ref={menuRef}
                    className="fixed bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-[99999] min-w-[100px]"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                  >
                    {isExternalEditable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuIndex(null);
                        handleTitleClick(index, tab.title);
                      }}
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 text-gray-700"
                    >
                      重命名
                    </button>
                    )}
                    {isExternalEditable && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenMenuIndex(null);
                        handleDeleteTab(index);
                      }}
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-gray-100 text-red-600"
                    >
                      删除页签
                    </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {isExternalEditable && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddTab();
            }}
            className="flex items-center justify-center px-2 py-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
            title="添加页签"
          >
            <Plus size={14} />
          </button>
          )}
        </div>

        {/* Tab 内容区 */}
        <div className="tab-content-wrapper p-3">
          {internalEditor && <EditorContent editor={internalEditor} />}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export default TabGroupView;
