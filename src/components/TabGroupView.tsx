import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { NodeViewWrapper, useEditor, EditorContent } from '@tiptap/react';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Lock, Plus, Unlock } from 'lucide-react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { TableWithDefaultWidth } from '../extensions/TableWithDefaultWidth';
import TextAlign from '@tiptap/extension-text-align';
import { TableRowWithTextSelection } from '../extensions/TableRowWithTextSelection';
import { TableCellWithColor } from '../extensions/TableCellWithColor';
import { TableHeaderWithColor } from '../extensions/TableHeaderWithColor';
import { TextSelectionInTableExtension } from '../extensions/TextSelectionInTablePlugin';
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
import { MindmapExtension } from '../extensions/MindmapExtension';
import { RouteBlock } from '../extensions/RouteBlock';
import { FolderBlock } from '../extensions/FolderBlock';
import { AudioBlock } from '../extensions/AudioBlock';
import {
  apiOrgPlanGetTabContent,
  apiOrgPlanListTabs,
  apiOrgPlanLockTab,
  apiOrgPlanSaveTabContent,
  apiOrgPlanUnlockTab,
} from '../lib/edgeApi';
import { useAuth } from './authContext';
import toast from 'react-hot-toast';

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
  assignmentId?: string;
  employeeId?: string;
  canEdit?: boolean;
  lockedBy?: string | null;
  lockedByName?: string | null;
}

interface Contents {
  [tabId: string]: { type: 'doc'; content?: any[] };
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const TabGroupView: React.FC<TabGroupViewProps> = ({
  node,
  updateAttributes,
  deleteNode,
  editor: externalEditor,
}) => {
  const { user } = useAuth();
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [orgTabs, setOrgTabs] = useState<Tab[]>([]);
  const [orgLoading, setOrgLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const tabs: Tab[] = useMemo(() => node.attrs.tabs || [{ id: '1', title: '页签1' }], [node.attrs.tabs]);
  const contents: Contents = useMemo(
    () => node.attrs.contents || { '1': { type: 'doc', content: [{ type: 'paragraph' }] } },
    [node.attrs.contents]
  );
  const activeIndex: number = node.attrs.activeIndex ?? 0;
  const structureLocked = !!node.attrs.structureLocked;
  const orgPlanMeta = node.attrs.orgPlan || null;
  const displayTabs: Tab[] = useMemo(
    () => (orgPlanMeta ? (orgTabs.length ? orgTabs : tabs) : tabs),
    [orgPlanMeta, orgTabs, tabs]
  );

  // 用 ref 保持最新值，避免 onBlur/handleTabClick 中的闭包过时问题
  const tabsRef = useRef(tabs);
  tabsRef.current = displayTabs;
  const contentsRef = useRef(contents);
  contentsRef.current = contents;
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const updateAttributesRef = useRef(updateAttributes);
  updateAttributesRef.current = updateAttributes;
  const orgPlanRef = useRef<any>(orgPlanMeta);
  orgPlanRef.current = orgPlanMeta;

  // 获取主编辑器的可编辑状态
  const isExternalEditable = externalEditor?.isEditable ?? true;
  const activeTab = displayTabs[activeIndex] || null;
  const lockedByOther = !!(activeTab?.lockedBy && activeTab.lockedBy !== user?.id);
  const activeTabEditable = !orgPlanMeta || (!!activeTab?.canEdit && !lockedByOther);
  const internalEditable = orgPlanMeta ? activeTabEditable : (isExternalEditable && activeTabEditable);

  const serializeContent = (content: any) => JSON.stringify(content || { type: 'doc', content: [{ type: 'paragraph' }] });

  /**
   * 保存当前活跃 Tab 的编辑器内容到 node attrs
   * 所有会切换/修改 Tab 的操作前都应调用此函数
   */
  const saveCurrentContent = useCallback((editorInstance: any) => {
    if (!editorInstance) return;
    const currentTabId = tabsRef.current[activeIndexRef.current]?.id;
    if (!currentTabId) return;
    const currentTab = tabsRef.current[activeIndexRef.current];
    const nextContent = editorInstance.getJSON();
    const previousContent = contentsRef.current[currentTabId];
    if (serializeContent(previousContent) === serializeContent(nextContent)) return;
    updateAttributesRef.current({
      contents: {
        ...contentsRef.current,
        [currentTabId]: nextContent,
      },
    });
    const orgPlan = orgPlanRef.current;
    const lockedByOtherUser = currentTab?.lockedBy && currentTab.lockedBy !== user?.id;
    if (orgPlan?.noteId && currentTab?.assignmentId && currentTab.canEdit && !lockedByOtherUser) {
      apiOrgPlanSaveTabContent(orgPlan.noteId, currentTab.assignmentId, nextContent)
        .then((result) => {
          if (!result.success) toast.error(result.error || '页签自动保存失败');
        });
    }
  }, [user?.id]);

  // 创建内部编辑器
  const internalEditor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        listKeymap: false,
      }),
      Placeholder.configure({ placeholder: '开始输入...' }),
      ResizableImage.configure({
        HTMLAttributes: { class: 'rounded-lg' },
      }),
      TableWithDefaultWidth.configure({
        resizable: true,
        handleWidth: 3,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      TableRowWithTextSelection,
      TableCellWithColor.configure({
        HTMLAttributes: { class: 'relative' },
      }),
      TableHeaderWithColor,
      TextSelectionInTableExtension,
      MindmapExtension,
      RouteBlock,
      FolderBlock,
      AudioBlock,
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
        markedOptions: {
          breaks: false,
        },
      }),
    ],
    content: contents[displayTabs[activeIndex]?.id] || { type: 'doc', content: [{ type: 'paragraph' }] },
    // Tiptap Table only registers column-resize plugins during editor creation
    // when the editor is editable. Keep the plugin installed; the effect below
    // still enforces page locks, outer read-only mode, and org-tab permissions.
    editable: true,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[100px]',
      },
      // 拦截图片拖拽和粘贴，转为 base64 data URL（blob: URL 刷新后失效）
      handleDrop: (view: any, event: any, _slice: any, moved: boolean) => {
        if (moved) return false;
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0) return false;
        const imageFiles = Array.from(files as FileList).filter((file) => file.type.startsWith('image/'));
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
      internalEditor.setEditable(internalEditable);
    }
  }, [internalEditor, internalEditable]);

  useEffect(() => {
    if (!orgPlanMeta?.noteId) {
      setOrgTabs([]);
      return;
    }
    let cancelled = false;
    setOrgLoading(true);
    apiOrgPlanListTabs(orgPlanMeta.noteId).then((result) => {
      if (cancelled) return;
      if (!result.success) {
        toast.error(result.error || '加载组织页签失败');
        return;
      }
      const nextTabs: Tab[] = (result.data?.tabs || []).map((tab: any) => ({
        id: tab.assignmentId,
        assignmentId: tab.assignmentId,
        employeeId: tab.employeeId,
        title: tab.title,
        canEdit: !!tab.canEdit,
        lockedBy: tab.lockedBy || null,
        lockedByName: tab.lockedByName || null,
      }));
      setOrgTabs(nextTabs);
      updateAttributesRef.current({ tabs: nextTabs });
    }).finally(() => {
      if (!cancelled) setOrgLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [orgPlanMeta?.noteId]);

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
    const targetTab = tabsRef.current[activeIndex];
    if (!targetTab) return;

    const targetContent = contentsRef.current[targetTab.id] || { type: 'doc', content: [{ type: 'paragraph' }] };
    if (orgPlanRef.current?.noteId && targetTab.assignmentId) {
      internalEditor.commands.setContent(targetContent, { emitUpdate: false });
      apiOrgPlanGetTabContent(targetTab.assignmentId).then((result) => {
        if (tabsRef.current[activeIndexRef.current]?.id !== targetTab.id) return;
        if (!result.success) {
          toast.error(result.error || '加载页签内容失败');
          return;
        }
        let parsed = targetContent;
        try {
          parsed = typeof result.data?.content === 'string' ? JSON.parse(result.data.content) : result.data?.content;
        } catch {
          parsed = { type: 'doc', content: [{ type: 'paragraph' }] };
        }
        internalEditor.commands.setContent(parsed || { type: 'doc', content: [{ type: 'paragraph' }] }, { emitUpdate: false });
        updateAttributesRef.current({
          contents: {
            ...contentsRef.current,
            [targetTab.id]: parsed,
          },
        });
      });
      return;
    }
    internalEditor.commands.setContent(targetContent, { emitUpdate: false });
  }, [activeIndex, internalEditor]);

  // 添加 Tab：先保存当前内容
  const handleAddTab = useCallback(() => {
    if (structureLocked) return;
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
  }, [structureLocked, tabs, contents, updateAttributes, internalEditor, saveCurrentContent]);

  // 删除 Tab：先保存当前内容
  const handleDeleteTab = useCallback((index: number) => {
    if (structureLocked) return;
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
  }, [structureLocked, tabs, contents, activeIndex, deleteNode, updateAttributes, internalEditor, saveCurrentContent]);

  // 更新 Tab 标题
  const updateTabTitle = useCallback((index: number, title: string) => {
    if (structureLocked) return;
    const newTabs = [...tabs];
    newTabs[index] = { ...newTabs[index], title };
    updateAttributes({ tabs: newTabs });
  }, [structureLocked, tabs, updateAttributes]);

  const handleOrgLockToggle = useCallback(async () => {
    if (!orgPlanMeta?.noteId || !activeTab?.assignmentId) return;
    const lockedByMe = activeTab.lockedBy && activeTab.lockedBy === user?.id;
    const result = lockedByMe || activeTab.lockedBy
      ? await apiOrgPlanUnlockTab(activeTab.assignmentId)
      : await apiOrgPlanLockTab(activeTab.assignmentId, user?.display_name || user?.email || '');
    if (!result.success) {
      toast.error(result.error || '页签锁定状态更新失败');
      return;
    }
    const tabsResult = await apiOrgPlanListTabs(orgPlanMeta.noteId);
    if (tabsResult.success) {
      const nextTabs: Tab[] = (tabsResult.data?.tabs || []).map((tab: any) => ({
        id: tab.assignmentId,
        assignmentId: tab.assignmentId,
        employeeId: tab.employeeId,
        title: tab.title,
        canEdit: !!tab.canEdit,
        lockedBy: tab.lockedBy || null,
        lockedByName: tab.lockedByName || null,
      }));
      setOrgTabs(nextTabs);
      updateAttributes({ tabs: nextTabs });
    }
  }, [activeTab, orgPlanMeta?.noteId, updateAttributes, user?.display_name, user?.email, user?.id]);

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
        className="tab-group-container border border-gray-200 rounded-lg overflow-hidden mb-2 select-none"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Tab 按钮栏 */}
        <div className="tab-group-header flex h-10 items-stretch bg-gray-50 border-b border-gray-200 overflow-hidden">
          <div
            className="tab-group-tab-scroll h-10 flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
            style={{ overflowX: 'auto', overflowY: 'hidden', minWidth: 0 }}
          >
            <div className="tab-group-tab-track flex h-full w-max min-w-full" style={{ display: 'flex', width: 'max-content', minWidth: '100%' }}>
              {displayTabs.map((tab, index) => {
                const isActive = index === activeIndex;

                return (
                  <div key={tab.id} className="tab-group-tab-item relative h-full shrink-0">
                    {editingIndex === index ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={handleTitleKeyDown}
                        className="h-9 bg-white border border-blue-400 rounded px-2 text-sm outline-none w-24"
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <div className={`tab-group-tab-shell flex h-full items-center border-r border-gray-200 last:border-r-0 ${isActive ? 'bg-white text-blue-600 font-medium border-b-2 border-b-blue-500' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}>
                        <button
                          onClick={() => handleTabClick(index)}
                          className="tab-group-tab-button h-full px-3 text-sm cursor-pointer whitespace-nowrap"
                          style={{ cursor: 'pointer' }}
                        >
                          {tab.title}
                        </button>
                        {!structureLocked && (
                          <button
                            onClick={(e) => handleMenuToggle(e, index)}
                            className="tab-group-tab-menu-button h-full px-1 cursor-pointer"
                            style={{ cursor: 'pointer' }}
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M7 10l5 5 5-5z"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    )}

                    {!structureLocked && openMenuIndex === index && menuPosition && (
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
            </div>
          </div>

          <div
            className="tab-group-actions sticky right-0 z-10 h-10 shrink-0 flex items-center border-l border-gray-200 bg-gray-50 shadow-[-8px_0_12px_rgba(249,250,251,0.9)]"
            style={{ position: 'sticky', right: 0, flexShrink: 0 }}
          >
          {orgPlanMeta && activeTab?.assignmentId && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOrgLockToggle();
            }}
            className="ml-auto flex h-full items-center gap-1 px-2 text-xs text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
            title={activeTab.lockedBy ? `已锁定: ${activeTab.lockedByName || '未知用户'}` : '锁定当前页签'}
          >
            {activeTab.lockedBy ? <Lock size={14} /> : <Unlock size={14} />}
            {activeTab.lockedBy ? (activeTab.lockedBy === user?.id ? '我已锁定' : '已锁定') : '未锁定'}
          </button>
          )}

          {isExternalEditable && !structureLocked && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAddTab();
            }}
            className="flex h-full items-center justify-center px-2 text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
            title="添加页签"
          >
            <Plus size={14} />
          </button>
          )}
          </div>
        </div>

        {/* Tab 内容区 */}
        <div className="tab-content-wrapper p-3">
          {orgPlanMeta && (orgLoading || lockedByOther) && (
            <div className="mb-2 text-xs text-gray-400">
              {orgLoading ? '正在加载组织页签...' : `该页签已被 ${activeTab?.lockedByName || '其他人'} 锁定，只读`}
            </div>
          )}
          {internalEditor && <EditorContent editor={internalEditor} />}
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export default TabGroupView;
