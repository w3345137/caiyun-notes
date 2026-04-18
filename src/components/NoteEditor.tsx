import React, { useEffect, useRef, useCallback, useState, lazy, Suspense } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Table } from '@tiptap/extension-table';
import { TableWithDefaultWidth } from '../extensions/TableWithDefaultWidth';
import { TableRowWithTextSelection } from '../extensions/TableRowWithTextSelection';
import { TableCellWithColor } from '../extensions/TableCellWithColor';
import { TableHeaderWithColor } from '../extensions/TableHeaderWithColor';
import { ResizableImage } from '../extensions/ResizableImage';
import { TextSelectionInTablePlugin } from '../extensions/TextSelectionInTablePlugin';
import { TabGroup } from '../extensions/TabGroup';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { FontSize } from '@tiptap/extension-font-size';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { getActiveInternalEditor } from '../lib/nodeViewEditorManager';
import { ListKeymap } from '@tiptap/extension-list-keymap';
import { useNoteStore, markNoteAsEditing, markNoteAsEditingEnd } from '../store/noteStore';
import { useAuth } from '../components/AuthProvider';
import { MindmapExtension, getActiveMindmapActions } from '../extensions/MindmapExtension';
import { RouteBlock } from '../extensions/RouteBlock.tsx';
import { AttachmentBlock } from '../extensions/AttachmentBlock';
import { AlertCircle, Plus, Minus, Table as TableIcon, ChevronDown, PaintBucket, Lock, Unlock, Bold, Italic, Strikethrough, List, ListOrdered, ListTodo, CirclePlus, Camera, Maximize2, Download, Image, FileText, Trash2 } from 'lucide-react';
import mermaid from 'mermaid';
import toast from 'react-hot-toast';
import html2canvas from 'html2canvas';
import { HistoryPanel } from '../components/HistoryPanel';
import { AttachmentInsertModal } from '../components/AttachmentInsertModal';
import { apiGetNotebookShares } from '../lib/edgeApi';
import { checkOneDriveBinding } from '../lib/onedriveService';

// 延迟初始化 mermaid - Safari 兼容性修复
let mermaidInitialized = false;
const initMermaid = () => {
  if (mermaidInitialized) return;
  try {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      fontFamily: 'sans-serif',
    });
    mermaidInitialized = true;
  } catch (e) {
    console.error('Mermaid initialization failed:', e);
  }
};

const ToolbarButton: React.FC<{
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}> = ({ onClick, isActive, disabled, title, children }) => {
  return (
    <button
      onMouseDown={(e) => {
        // 阻止默认行为，防止 focus 转移导致内部编辑器失焦
        e.preventDefault();
      }}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`w-6 h-6 flex items-center justify-center rounded transition-all flex-shrink-0 ${
        isActive ? 'bg-blue-100 text-blue-600 shadow-sm' : 'text-gray-600 hover:bg-gray-100 hover:shadow-sm'
      } ${disabled ? 'cursor-not-allowed pointer-events-none' : ''}`}
    >
      {children}
    </button>
  );
};

// 字号选项 - 从8号开始
const FONT_SIZES = [
  { label: '8', value: '8px' },
  { label: '9', value: '9px' },
  { label: '10', value: '10px' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '28', value: '28px' },
  { label: '32', value: '32px' },
  { label: '36', value: '36px' },
  { label: '48', value: '48px' },
];

const EditorToolbar: React.FC<{
  editor: any;
  onMindmapClick: () => void;
  onAttachmentClick: () => void;
  showColorPicker: boolean;
  setShowColorPicker: (show: boolean) => void;
  handleCellColor: (color: string) => void;
  disabled?: boolean;
  wordCount?: number;
}> = React.memo(({ editor: externalEditor, onMindmapClick, onAttachmentClick, showColorPicker, setShowColorPicker, handleCellColor, disabled, wordCount = 0 }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showFontSizeDropdown, setShowFontSizeDropdown] = useState(false);
  const [showAlignDropdown, setShowAlignDropdown] = useState(false);
  const [showCellAlignDropdown, setShowCellAlignDropdown] = useState(false);
  const [showTextColorPicker, setShowTextColorPicker] = useState(false);
  const [showInsertDropdown, setShowInsertDropdown] = useState(false);
  const [showTableInsertDropdown, setShowTableInsertDropdown] = useState(false);
  const [showDeleteDropdown, setShowDeleteDropdown] = useState(false);
  const [showCellOpDropdown, setShowCellOpDropdown] = useState(false);
  const [isTableActive, setIsTableActive] = useState(false);
  const [isMindmapActive, setIsMindmapActive] = useState(false);
  const [showMindmapAddDropdown, setShowMindmapAddDropdown] = useState(false);
  const [showMindmapExportDropdown, setShowMindmapExportDropdown] = useState(false);
  const [, forceToolbarUpdate] = useState(0); // 强制工具栏重渲染
  const toolbarRef = useRef<HTMLDivElement>(null);

  // 优先使用内部编辑器（如果在页签内），否则使用外部编辑器
  const activeInternal = getActiveInternalEditor();
  const editor = activeInternal || externalEditor;

  // 监听 editor 的 selection 变化，触发工具栏状态更新
  useEffect(() => {
    if (!editor) return;

    let rafId: number;
    let cachedMindmapActive = false;

    // 文档结构变化时扫描是否有 mindmap 节点（O(n) 遍历，仅在增删节点时触发）
    const scanMindmap = () => {
      let found = false;
      editor.state.doc.descendants((node: any) => {
        if (node.type.name === 'mindmap') {
          found = true;
          return false;
        }
      });
      if (found !== cachedMindmapActive) {
        cachedMindmapActive = found;
        setIsMindmapActive(found);
      }
    };

    // 初始扫描
    scanMindmap();

    // 选区变化：只更新格式状态（轻量）
    const onSelectionUpdate = () => {
      rafId = requestAnimationFrame(() => {
        setIsTableActive(editor.isActive('table'));
        forceToolbarUpdate(n => n + 1);
      });
    };

    // transaction：只在文档结构变化时重新扫描 mindmap
    const onTransaction = ({ transaction }: any) => {
      if (transaction.docChanged) {
        rafId = requestAnimationFrame(() => {
          scanMindmap();
          setIsTableActive(editor.isActive('table'));
          forceToolbarUpdate(n => n + 1);
        });
      }
    };

    editor.on('selectionUpdate', onSelectionUpdate);
    editor.on('transaction', onTransaction);
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate);
      editor.off('transaction', onTransaction);
      cancelAnimationFrame(rafId);
    };
  }, [editor]);

  // 获取当前字号 - 根据光标位置返回正确字号
  const getCurrentFontSize = () => {
    if (!editor) return '16';

    // 用 editor.getAttributes 获取光标位置的 textStyle 属性
    const fontSize = editor.getAttributes('textStyle').fontSize;
    if (fontSize) {
      return fontSize.replace('px', '');
    }

    // 检查是否是标题，根据级别返回默认字号
    if (editor.isActive('heading', { level: 1 })) return '32';
    if (editor.isActive('heading', { level: 2 })) return '24';
    if (editor.isActive('heading', { level: 3 })) return '20';

    return '16';
  };

  // 点击空白处关闭下拉框
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowFontSizeDropdown(false);
        setShowAlignDropdown(false);
        setShowCellAlignDropdown(false);
        setShowTextColorPicker(false);
        setShowInsertDropdown(false);
        setShowTableInsertDropdown(false);
        setShowDeleteDropdown(false);
        setShowCellOpDropdown(false);
        setShowColorPicker(false);
        setShowMindmapAddDropdown(false);
        setShowMindmapExportDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const colors = [
    '#fef3c7', '#fce7f3', '#dbeafe', '#dcfce7', '#f3e8ff', '#fee2e2',
    '#fef9c3', '#fecaca', '#d1d5db', '#ffffff', '#f0f9ff', '#f0fdf4'
  ];

  // 文字颜色选项
  const textColors = [
    '#000000', '#374151', '#dc2626', '#ea580c', '#ca8a04', '#16a34a',
    '#0891b2', '#2563eb', '#7c3aed', '#db2777', '#ffffff', '#6b7280'
  ];

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && editor) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        editor.chain().focus().insertContent({ type: 'image', attrs: { src: base64, width: 300 } }).run();
      };
      reader.readAsDataURL(file);
    }
    event.target.value = '';
  }, [editor]);

  const handleLinkUpload = useCallback(() => {
    const url = window.prompt('输入图片链接:', 'https://');
    if (url) {
      editor.chain().focus().insertContent({ type: 'image', attrs: { src: url, width: 300 } }).run();
    }
  }, [editor]);

  const handleFontSize = useCallback((size: string) => {
    editor.chain().focus().setFontSize(size).run();
    setShowFontSizeDropdown(false);
  }, [editor]);

  const handleCellVerticalAlign = useCallback((align: 'top' | 'center' | 'bottom') => {
    if (editor) {
      try {
        // 根据当前选中的单元格类型更新垂直对齐
        if (editor.isActive('tableHeader')) {
          editor.chain().focus().updateAttributes('tableHeader', { verticalAlign: align }).run();
        } else if (editor.isActive('tableCell')) {
          editor.chain().focus().updateAttributes('tableCell', { verticalAlign: align }).run();
        }
      } catch (e) {
        console.error('设置单元格对齐失败:', e);
      }
      setShowCellAlignDropdown(false);
    }
  }, [editor]);

  const handleTextColor = useCallback((color: string) => {
    editor.chain().focus().setColor(color).run();
    setShowTextColorPicker(false);
  }, [editor]);

  // 获取当前文字颜色
  const getCurrentTextColor = () => {
    if (!editor) return '#000000';
    const color = editor.getAttributes('textStyle').color;
    return color || '#000000';
  };

  if (!editor) return null;

  // 统一工具栏样式
  const themeClass = 'bg-white/90 backdrop-blur-sm border-gray-200';

  return (
    <div ref={toolbarRef} className={`relative z-10 flex items-center gap-[2px] px-1 py-0.5 ${themeClass} rounded-lg shadow-md border border-gray-200 ${disabled ? 'opacity-70 pointer-events-none select-none' : ''}`}>
      {/* 撤销/重做 */}
      <div className="flex items-center gap-0.5 pr-2 border-r border-gray-200">
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={disabled || !editor.can().undo()} title="撤销 (Ctrl+Z)">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6"/><path d="M21 17a9 9 0 00-9-9 9 9 0 00-6 2.3L3 13"/>
          </svg>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={disabled || !editor.can().redo()} title="重做 (Ctrl+Y)">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 019-9 9 9 0 016 2.3l3 2.7"/>
          </svg>
        </ToolbarButton>
      </div>

      {/* 文本格式 */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive('bold')} disabled={disabled} title="粗体 (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive('italic')} disabled={disabled} title="斜体 (Ctrl+I)">
          <Italic className="w-3.5 h-3.5" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive('strike')} disabled={disabled} title="删除线 (Ctrl+Shift+X)">
          <Strikethrough className="w-3.5 h-3.5" />
        </ToolbarButton>
      </div>

      {/* 字号 + 文字颜色 - 合并分组 */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200 relative">
        {/* 字号 */}
        <ToolbarButton onClick={() => { setShowFontSizeDropdown(!showFontSizeDropdown); setShowTextColorPicker(false); }} disabled={disabled} title="字号" isActive={showFontSizeDropdown}>
          <span className="text-xs font-medium">{getCurrentFontSize()}</span>
        </ToolbarButton>
        {showFontSizeDropdown && (
          <div className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-[9999] min-w-[80px]">
            {FONT_SIZES.map((size) => (
              <button
                key={size.value}
                onClick={() => handleFontSize(size.value)}
                className={`w-full px-4 py-1 text-xs text-left hover:bg-gray-100 ${getCurrentFontSize() === size.label ? 'bg-blue-100 text-blue-600 font-medium' : ''}`}
              >
                {size.label}
              </button>
            ))}
          </div>
        )}
        {/* 文字颜色 */}
        <ToolbarButton onClick={() => { setShowTextColorPicker(!showTextColorPicker); setShowFontSizeDropdown(false); }} disabled={disabled} title="文字颜色" isActive={showTextColorPicker}>
          <span className="text-xs font-bold" style={{ color: getCurrentTextColor() }}>A</span>
        </ToolbarButton>
        {showTextColorPicker && (
          <div className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-[9999] min-w-[180px]">
            <p className="text-xs font-medium text-gray-700 mb-2">选择文字颜色</p>
            <div className="grid grid-cols-6 gap-1.5">
              {textColors.map((color, i) => (
                <button
                  key={i}
                  onClick={() => handleTextColor(color)}
                  className="w-6 h-6 rounded border border-gray-200 hover:scale-110 hover:border-blue-500 transition-all flex items-center justify-center"
                  style={{ backgroundColor: color }}
                >
                  {color === '#ffffff' && <div className="w-full h-full rounded border border-gray-300" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => { editor.chain().focus().unsetColor().run(); setShowTextColorPicker(false); }}
              className="w-full mt-2 px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded border border-gray-200"
            >
              清除颜色
            </button>
          </div>
        )}
      </div>

      {/* 标题 */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive('heading', { level: 1 })} disabled={disabled} title="标题1 (Ctrl+Alt+1)">
          <span className="text-xs font-bold">H1</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive('heading', { level: 2 })} disabled={disabled} title="标题2 (Ctrl+Alt+2)">
          <span className="text-xs font-bold">H2</span>
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive('heading', { level: 3 })} disabled={disabled} title="标题3 (Ctrl+Alt+3)">
          <span className="text-xs font-bold">H3</span>
        </ToolbarButton>
      </div>

      {/* 对齐方式 */}
      <div className="relative px-2 border-r border-gray-200">
        <ToolbarButton onClick={() => { setShowAlignDropdown(!showAlignDropdown); setShowFontSizeDropdown(false); }} title="对齐方式" disabled={disabled} isActive={editor.isActive({ textAlign: 'center' }) || editor.isActive({ textAlign: 'left' }) || editor.isActive({ textAlign: 'right' })}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
          </svg>
        </ToolbarButton>
        {showAlignDropdown && (
          <div className="absolute top-full mt-2 left-0 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-50 min-w-[100px]">
            <button onClick={() => { editor.chain().focus().setTextAlign('left').run(); setShowAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 flex items-center gap-2">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/></svg>
              左对齐
            </button>
            <button onClick={() => { editor.chain().focus().setTextAlign('center').run(); setShowAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 flex items-center gap-2">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
              居中
            </button>
            <button onClick={() => { editor.chain().focus().setTextAlign('right').run(); setShowAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 flex items-center gap-2">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/></svg>
              右对齐
            </button>
            <button onClick={() => { editor.chain().focus().setTextAlign('justify').run(); setShowAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 flex items-center gap-2">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              两端对齐
            </button>
          </div>
        )}
      </div>

      {/* 列表 */}
      <div className="flex items-center gap-0.5 px-2 border-r border-gray-200">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive('bulletList')} disabled={disabled} title="无序列表 (Ctrl+.) | Tab缩进">
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive('orderedList')} disabled={disabled} title="有序列表">
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive('taskList')} disabled={disabled} title="待办列表 (Ctrl+1) | Tab缩进">
          <ListTodo className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* 插入 */}
      <div className="flex items-center gap-0.5 px-2 relative">
        <ToolbarButton
          onClick={() => { setShowInsertDropdown(!showInsertDropdown); }}
          disabled={disabled}
          title="插入"
          isActive={showInsertDropdown}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="currentColor"/>
            <line x1="12" y1="7" x2="12" y2="17" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <line x1="7" y1="12" x2="17" y2="12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </ToolbarButton>
        {showInsertDropdown && (
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute top-full mt-2 right-0 bg-white rounded-xl shadow-2xl border border-gray-200 py-2 z-[9999] min-w-[140px]"
          >
            {/* 插入图片 */}
            <button
              onClick={() => { fileInputRef.current?.click(); setShowInsertDropdown(false); }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
            >
              插入图片
            </button>
            <button
              onClick={() => {
                if (!editor) return;
                editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                setShowInsertDropdown(false);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
            >
              插入表格
            </button>
            {/* 插入思维导图 */}
            <button
              onClick={() => { onMindmapClick(); setShowInsertDropdown(false); }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
            >
              插入思维导图
            </button>
            {/* 插入行程规划 */}
            <button
              onClick={() => {
                if (!editor) return;
                editor.chain().focus().insertRouteBlock().run();
                toast.success('行程规划已添加');
                setShowInsertDropdown(false);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
            >
              插入行程规划
            </button>
            {/* 插入页签 */}
            <button
              onClick={() => {
                if (!editor) return;
                // 如果光标在TabGroup内，添加新页签；否则创建新TabGroup容器
                if (editor.isActive('tabGroup')) {
                  editor.chain().focus().addTab().run();
                } else {
                  editor.chain().focus().insertTabGroup().run();
                }
                setShowInsertDropdown(false);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
            >
              插入页签
            </button>
            {/* 插入分割线 */}
            <button
              onClick={() => {
                if (!editor) return;
                editor.chain().focus().setHorizontalRule().run();
                setShowInsertDropdown(false);
              }}
              className="w-full px-4 py-2 text-sm text-left hover:bg-gray-100"
            >
              插入分割线
            </button>
            {/* 插入附件 - 已搁置 */}
            <button
              disabled
              className="w-full px-4 py-2 text-sm text-left text-gray-400 cursor-not-allowed"
            >
              插入附件
            </button>
          </div>
        )}
      </div>

      {/* 复制为图片 */}
      <div className="flex items-center gap-0.5 px-1">
        <ToolbarButton
          onClick={async () => {
            if (!editor) return;
            const sel = editor.state.selection;
            const { from, to } = sel;
            if (from === to) {
              toast.error('请先选中要复制的内容');
              return;
            }

            try {
              const editorView = editor.view;
              const editorEl = editorView.dom;
              const container = document.createElement('div');
              container.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;padding:16px;font-family:inherit;max-width:800px;';
              const computedStyle = window.getComputedStyle(editorEl);
              container.style.fontSize = computedStyle.fontSize;
              container.style.lineHeight = computedStyle.lineHeight;
              container.style.color = computedStyle.color;

              // 检测是否是表格单元格选择（CellSelection）
              const isCellSelection = !!(sel as any).ranges && (sel as any).$anchorCell;

              if (isCellSelection) {
                // CellSelection：找到包含所有选中单元格的表格，克隆整个表格但只保留选中的行/列
                const cellSel = sel as any;
                const anchorCell = cellSel.$anchorCell;
                // 找到表格节点的 DOM
                const tableNode = editorView.domAtPos(anchorCell.start(-1)).node;
                const tableEl = tableNode instanceof HTMLElement && tableNode.tagName === 'TABLE'
                  ? tableNode
                  : (tableNode as HTMLElement)?.closest?.('table') || tableNode.parentElement?.closest?.('table');

                if (tableEl) {
                  // 收集所有选中的单元格 DOM 节点
                  const selectedCells = new Set<HTMLElement>();
                  const ranges = (sel as any).ranges as { $from: any; $to: any }[];
                  for (const r of ranges) {
                    for (let pos = r.$from.pos; pos <= r.$to.pos; pos++) {
                      try {
                        const domNode = editorView.domAtPos(pos).node;
                        const cell = domNode instanceof HTMLElement
                          ? (domNode.closest('td, th') || domNode)
                          : (domNode.parentElement?.closest('td, th') || null);
                        if (cell && cell instanceof HTMLElement) selectedCells.add(cell);
                      } catch { /* skip */ }
                    }
                  }

                  // 克隆整个表格
                  const clonedTable = tableEl.cloneNode(true) as HTMLTableElement;
                  // 找出选中的行索引和列索引
                  const selectedRowIndices = new Set<number>();
                  const selectedColIndices = new Set<number>();
                  const rows = tableEl.querySelectorAll('tr');
                  rows.forEach((row, ri) => {
                    const cells = row.querySelectorAll('td, th');
                    cells.forEach((cell, ci) => {
                      if (selectedCells.has(cell as HTMLElement)) {
                        selectedRowIndices.add(ri);
                        selectedColIndices.add(ci);
                      }
                    });
                  });

                  // 移除未选中的行和列
                  const clonedRows = clonedTable.querySelectorAll('tr');
                  const sortedColIndices = Array.from(selectedColIndices).sort((a, b) => b - a);
                  clonedRows.forEach((row, ri) => {
                    if (!selectedRowIndices.has(ri)) {
                      row.remove();
                    } else {
                      const cells = row.querySelectorAll('td, th');
                      sortedColIndices.forEach(() => {}); // 保留所有列（CellSelection 通常是矩形区域）
                      // 如果不是全部列被选中，移除未选中的列
                      if (selectedColIndices.size < (rows[0]?.querySelectorAll('td, th').length || 0)) {
                        const cellsArr = Array.from(cells);
                        for (let ci = cellsArr.length - 1; ci >= 0; ci--) {
                          if (!selectedColIndices.has(ci)) {
                            cellsArr[ci].remove();
                          }
                        }
                      }
                    }
                  });

                  // 移除 colgroup 中未选中的 col（如果有）
                  const colgroup = clonedTable.querySelector('colgroup');
                  if (colgroup && selectedColIndices.size < (rows[0]?.querySelectorAll('td, th').length || 0)) {
                    const cols = Array.from(colgroup.querySelectorAll('col'));
                    for (let ci = cols.length - 1; ci >= 0; ci--) {
                      if (!selectedColIndices.has(ci)) {
                        cols[ci].remove();
                      }
                    }
                  }

                  // 移除选中高亮背景
                  clonedTable.querySelectorAll('.selectedCell').forEach(el => {
                    el.classList.remove('selectedCell');
                  });

                  container.appendChild(clonedTable);
                } else {
                  toast.error('无法识别选中的表格');
                  return;
                }
              } else {
                // 普通文本选择：使用 Range 克隆
                const domStart = editorView.domAtPos(from);
                const domEnd = editorView.domAtPos(to);
                const range = document.createRange();
                range.setStart(domStart.node, domStart.offset);
                range.setEnd(domEnd.node, domEnd.offset);
                const fragment = range.cloneContents();

                // 检查克隆的内容是否包含不完整的表格（有 td/th 但没有 table 包裹）
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(fragment);
                const orphanCells = tempDiv.querySelectorAll('td, th');
                if (orphanCells.length > 0 && !tempDiv.querySelector('table')) {
                  // 找到原始表格并完整克隆
                  const firstCellDom = editorView.domAtPos(from).node;
                  const origTable = firstCellDom instanceof HTMLElement
                    ? firstCellDom.closest('table')
                    : firstCellDom.parentElement?.closest('table');
                  if (origTable) {
                    const clonedTable = origTable.cloneNode(true) as HTMLTableElement;
                    clonedTable.querySelectorAll('.selectedCell').forEach(el => el.classList.remove('selectedCell'));
                    container.appendChild(clonedTable);
                  } else {
                    container.appendChild(tempDiv);
                  }
                } else {
                  container.appendChild(tempDiv);
                }
              }

              document.body.appendChild(container);

              // 注入完整的编辑器样式（内嵌 App.css 中所有 ProseMirror 相关规则）
              const styleEl = document.createElement('style');
              styleEl.textContent = `
                .ProseMirror { outline: none; padding: 0; max-width: 100%; box-sizing: border-box; font-size: 16px; min-width: 0; width: 100%; }
                .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.5em 0; }
                .ProseMirror img.ProseMirror-selectednode { outline: 2px solid #3b82f6; outline-offset: 2px; }
                .ProseMirror .image-wrapper { display: flex; }
                .ProseMirror .image-wrapper.align-left { justify-content: flex-start; }
                .ProseMirror .image-wrapper.align-center { justify-content: center; }
                .ProseMirror .image-wrapper.align-right { justify-content: flex-end; }
                .ProseMirror h1 { font-size: 2em; font-weight: 700; margin: 0.3em 0 0 0; line-height: normal; }
                .ProseMirror h2 { font-size: 1.5em; font-weight: 600; margin: 0.3em 0 0 0; line-height: normal; }
                .ProseMirror h3 { font-size: 1.17em; font-weight: 600; margin: 0.3em 0 0 0; line-height: normal; }
                .ProseMirror p { margin: 0; line-height: 1.5; }
                .ProseMirror ul, .ProseMirror ol { margin: 0; padding-left: 1.5em; line-height: normal; }
                .ProseMirror ul { list-style-type: disc; }
                .ProseMirror ol { list-style-type: decimal; }
                .ProseMirror ol li { padding-left: 0.25em; }
                .ProseMirror li { margin: 0; line-height: normal; }
                .ProseMirror li p { margin: 0; }
                .ProseMirror blockquote { border-left: 3px solid #3b82f6; padding-left: 1em; margin: 0.5em 0; color: #6b7280; font-style: italic; line-height: normal; }
                .ProseMirror code { background-color: #f3f4f6; border-radius: 3px; padding: 0.1em 0.3em; font-family: 'Fira Code', monospace; font-size: 0.9em; color: #e11d48; }
                .ProseMirror pre { background-color: #1f2937; color: #f9fafb; border-radius: 8px; padding: 1em; margin: 0.5em 0; overflow-x: auto; line-height: normal; }
                .ProseMirror pre code { background: none; color: inherit; padding: 0; }
                .ProseMirror a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
                .ProseMirror hr { border: none; border-top: 2px solid #e5e7eb; margin: 0.5em 0; }
                .ProseMirror table { border-collapse: collapse; margin: 0; table-layout: fixed; box-sizing: border-box; position: relative; }
                .ProseMirror th, .ProseMirror td { border: 1px solid #8C8F93 !important; padding: 0.63em 0.6em !important; font-size: 14px; line-height: 1.4; vertical-align: middle; box-sizing: border-box; position: relative; }
                .ProseMirror th { background-color: #f3f4f6; font-weight: 600; text-align: left; font-size: 14px; padding: 0.54em 0.6em !important; }
                .ProseMirror td { background-color: white; font-size: 14px; }
                .ProseMirror td p { margin: 0; line-height: normal; }
                .ProseMirror .tableWrapper { display: block; max-width: 100%; overflow-x: auto; margin: 0.5em 0; box-sizing: border-box; }
                .ProseMirror mark { background-color: #fef08a; padding: 0.1em 0; }
                .ProseMirror .text-left { text-align: left; }
                .ProseMirror .text-center { text-align: center; }
                .ProseMirror .text-right { text-align: right; }
                .ProseMirror strong { font-weight: 700; }
                .ProseMirror em { font-style: italic; }
                .ProseMirror s { text-decoration: line-through; }
                .ProseMirror u { text-decoration: underline; }
                .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; margin: 0; font-size: inherit; line-height: inherit; }
                .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; padding: 0; font-size: inherit; line-height: 1.5; }
                .ProseMirror ul[data-type="taskList"] li > label { display: flex; align-items: center; flex-shrink: 0; margin: 0; padding: 0; height: 1.5em; }
                .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 1em; height: 1em; border: 1px solid #6b7280; border-radius: 50%; background-color: transparent; cursor: pointer; margin: 0; padding: 0; position: relative; flex-shrink: 0; }
                .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked { background-color: transparent; border-color: #6b7280; }
                .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 0.5em; height: 0.5em; border-radius: 50%; background-color: #6b7280; }
                .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: #9ca3af; }
                .ProseMirror ul[data-type="taskList"] li > div { flex: 1; font-size: inherit; line-height: 1.5; word-wrap: break-word; overflow-wrap: break-word; }
                .ProseMirror td ul[data-type="taskList"] { margin: 0; padding: 0; font-size: inherit; }
                .ProseMirror td ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.3em; font-size: inherit; margin: 0; padding: 0; }
                .ProseMirror td ul[data-type="taskList"] li > label { display: flex; align-items: center; flex-shrink: 0; margin: 0; padding: 0; height: 1.3em; margin-top: 1px; }
                .ProseMirror td ul[data-type="taskList"] li > label input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 1em; height: 1em; border: 1px solid #6b7280; border-radius: 50%; background-color: transparent; margin: 0; padding: 0; position: relative; flex-shrink: 0; }
                .ProseMirror td ul[data-type="taskList"] li > label input[type="checkbox"]:checked { background-color: transparent; border-color: #6b7280; }
                .ProseMirror td ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 0.5em; height: 0.5em; border-radius: 50%; background-color: #6b7280; }
                .ProseMirror td ul[data-type="taskList"] li > div { flex: 1; font-size: inherit; line-height: 1.3; }
                .ProseMirror td ul[data-type="taskList"] li > div p { line-height: 1.3; }
              `;
              container.prepend(styleEl);
              container.classList.add('ProseMirror');

              const canvas = await html2canvas(container, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false,
              });

              document.body.removeChild(container);

              // 三级剪贴板策略：Tauri API → Web Clipboard API → 下载降级
              const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  const dataUrl = reader.result as string;
                  resolve(dataUrl.split(',')[1]); // 去掉 data:image/png;base64, 前缀
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
              });

              canvas.toBlob(async (blob) => {
                if (!blob) {
                  toast.error('生成图片失败');
                  return;
                }

                // 策略1: Tauri 原生剪贴板（APP环境）
                const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;
                if (isTauri) {
                  try {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const base64 = await blobToBase64(blob);
                    await invoke('plugin:clipboard-manager|write_image', { base64 });
                    toast.success('已复制为图片');
                    return;
                  } catch (err) {
                    console.warn('Tauri 剪贴板写入失败:', err);
                  }
                }

                // 策略2: Web Clipboard API（需要 HTTPS 或 localhost）
                if (typeof navigator.clipboard?.write === 'function' && typeof ClipboardItem !== 'undefined') {
                  try {
                    await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': blob })
                    ]);
                    toast.success('已复制为图片');
                    return;
                  } catch (err) {
                    console.warn('Web 剪贴板写入失败:', err);
                  }
                }

                // 策略3: 下载降级
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'selection.png';
                a.click();
                URL.revokeObjectURL(url);
                toast.success('图片已下载');
              }, 'image/png');
            } catch (err) {
              console.error('复制为图片失败:', err);
              toast.error('复制为图片失败');
            }
          }}
          disabled={disabled}
          title="复制为图片"
        >
          <Camera className="w-4 h-4" />
        </ToolbarButton>
      </div>

      {/* 表格编辑按钮 - 仅在表格激活时显示 */}
      {isTableActive && (
        <div className="flex items-center gap-[2px] px-2 bg-blue-50 rounded py-0">

          {/* 插入下拉菜单 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowTableInsertDropdown(!showTableInsertDropdown); setShowDeleteDropdown(false); setShowCellOpDropdown(false); setShowInsertDropdown(false); }} disabled={disabled} title="插入" isActive={showTableInsertDropdown}>
              <Plus className="w-4 h-4" />
            </ToolbarButton>
            {showTableInsertDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[120px]">
                <button onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableInsertDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">上方插入行</button>
                <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableInsertDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">下方插入行</button>
                <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableInsertDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">左侧插入列</button>
                <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableInsertDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">右侧插入列</button>
              </div>
            )}
          </div>

          {/* 删除下拉菜单 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowDeleteDropdown(!showDeleteDropdown); setShowTableInsertDropdown(false); setShowInsertDropdown(false); setShowCellOpDropdown(false); }} disabled={disabled} title="删除" isActive={showDeleteDropdown}>
              <Minus className="w-4 h-4" />
            </ToolbarButton>
            {showDeleteDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[100px]">
                <button onClick={() => { editor.chain().focus().deleteRow().run(); setShowDeleteDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">删除行</button>
                <button onClick={() => { editor.chain().focus().deleteColumn().run(); setShowDeleteDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">删除列</button>
              </div>
            )}
          </div>

          {/* 单元格操作下拉菜单 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowCellOpDropdown(!showCellOpDropdown); setShowTableInsertDropdown(false); setShowInsertDropdown(false); setShowDeleteDropdown(false); }} disabled={disabled} title="单元格操作" isActive={showCellOpDropdown}>
              <TableIcon className="w-4 h-4" />
            </ToolbarButton>
            {showCellOpDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[100px]">
                <button onClick={() => { editor.chain().focus().mergeCells?.().run(); setShowCellOpDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">合并</button>
                <button onClick={() => { editor.chain().focus().splitCell?.().run(); setShowCellOpDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">拆分</button>
              </div>
            )}
          </div>

          {/* 单元格底色 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowColorPicker(!showColorPicker); setShowTableInsertDropdown(false); setShowInsertDropdown(false); setShowDeleteDropdown(false); setShowCellOpDropdown(false); }} disabled={disabled} title="单元格底色" isActive={showColorPicker}>
              <PaintBucket className="w-4 h-4" />
            </ToolbarButton>
            {showColorPicker && (
              <div className="absolute top-full mt-1 right-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-50 min-w-[200px]">
                <p className="text-xs font-medium text-gray-700 mb-2">选择单元格底色</p>
                <div className="grid grid-cols-6 gap-1.5">
                  {colors.map((color, i) => (
                    <button
                      key={i}
                      onClick={() => handleCellColor(color)}
                      className="w-6 h-6 rounded border border-gray-200 hover:scale-110 hover:border-blue-500 transition-all"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 单元格垂直对齐 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowCellAlignDropdown(!showCellAlignDropdown); setShowTableInsertDropdown(false); setShowInsertDropdown(false); setShowDeleteDropdown(false); setShowCellOpDropdown(false); }} disabled={disabled} title="单元格垂直对齐">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="3" x2="12" y2="21"/>
                <polyline points="8 7 12 3 16 7"/>
                <polyline points="8 17 12 21 16 17"/>
              </svg>
            </ToolbarButton>
            {showCellAlignDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[100px]">
                <button onClick={() => { handleCellVerticalAlign('top'); setShowCellAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">顶部对齐</button>
                <button onClick={() => { handleCellVerticalAlign('center'); setShowCellAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">垂直居中</button>
                <button onClick={() => { handleCellVerticalAlign('bottom'); setShowCellAlignDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">底部对齐</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 思维导图专属工具栏 - 仅在思维导图激活时显示 */}
      {isMindmapActive && (
        <div className="flex items-center gap-[2px] px-2 bg-purple-100 border border-purple-200 rounded py-0">

          {/* 新增节点下拉菜单 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowMindmapAddDropdown(!showMindmapAddDropdown); setShowMindmapExportDropdown(false); }} disabled={disabled} title="新增节点" isActive={showMindmapAddDropdown}>
              <CirclePlus className="w-4 h-4" />
            </ToolbarButton>
            {showMindmapAddDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[120px]">
                <button onClick={() => { getActiveMindmapActions()?.addChild(); setShowMindmapAddDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">子节点</button>
                <button onClick={() => { getActiveMindmapActions()?.addSibling(); setShowMindmapAddDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100">同级节点</button>
              </div>
            )}
          </div>

          {/* 全屏 */}
          <ToolbarButton onClick={() => { getActiveMindmapActions()?.toggleFullscreen(); }} disabled={disabled} title="全屏">
            <Maximize2 className="w-4 h-4" />
          </ToolbarButton>

          {/* 导出下拉菜单 */}
          <div className="relative">
            <ToolbarButton onClick={() => { setShowMindmapExportDropdown(!showMindmapExportDropdown); setShowMindmapAddDropdown(false); }} disabled={disabled} title="导出" isActive={showMindmapExportDropdown}>
              <Download className="w-4 h-4" />
            </ToolbarButton>
            {showMindmapExportDropdown && (
              <div className="absolute top-full mt-1 left-0 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[120px]">
                <button onClick={() => { getActiveMindmapActions()?.exportImage(); setShowMindmapExportDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 flex items-center gap-2">
                  <Image className="w-3 h-3" /> 导出为图片
                </button>
                <button onClick={() => { getActiveMindmapActions()?.exportMarkdown(); setShowMindmapExportDropdown(false); }} className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 flex items-center gap-2">
                  <FileText className="w-3 h-3" /> 导出为 Markdown
                </button>
              </div>
            )}
          </div>

          {/* 分隔线 */}
          <div className="w-px h-4 bg-purple-300 mx-1" />

          {/* 删除思维导图 */}
          <ToolbarButton onClick={() => { getActiveMindmapActions()?.deleteMindmap(); }} disabled={disabled} title="删除思维导图">
            <Trash2 className="w-4 h-4 text-red-500" />
          </ToolbarButton>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />
    </div>
  );
});

EditorToolbar.displayName = 'EditorToolbar';

export const NoteEditor: React.FC = () => {
  const { user } = useAuth();
  const selectedNoteId = useNoteStore((state) => state.selectedNoteId);
  const notes = useNoteStore((state) => state.notes);
  const updateNote = useNoteStore((state) => state.updateNote);
  const dbReady = useNoteStore((state) => state.dbReady);
  const lockNote = useNoteStore((state) => state.lockNote);
  const unlockNote = useNoteStore((state) => state.unlockNote);
  const isNoteLockedByOther = useNoteStore((state) => state.isNoteLockedByOther);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showAutoSaveIndicator, setShowAutoSaveIndicator] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [isSharedNotebook, setIsSharedNotebook] = useState(false);
  const [confirmOpts, setConfirmOpts] = useState<{ msg: string; onOk: () => void } | null>(null);

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;

  // 获取用户信息
  const userId = user?.id || 'anonymous';
  const userName = user?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '访客';

  // 检查页面是否被锁定
  const isLocked = selectedNote?.lockedBy != null;
  const isLockedByMe = selectedNote?.lockedBy === userId;
  const isLockedByOther = selectedNote ? isNoteLockedByOther(selectedNote.id, userId) : false;

  // 处理锁定/解锁
  const handleLock = useCallback(() => {
    if (!selectedNoteId) return;
    lockNote(selectedNoteId, userId, userName);
    toast.success('页面已锁定');
  }, [selectedNoteId, userId, userName, lockNote]);

  const handleUnlock = useCallback(() => {
    if (!selectedNoteId) return;
    // 确认弹窗避免误操作
    setConfirmOpts({
      msg: '确定要解锁此页面吗？解锁后其他用户可以编辑。',
      onOk: () => {
        unlockNote(selectedNoteId);
        toast.success('页面已解锁');
      }
    });
  }, [selectedNoteId, unlockNote]);

  // 计算字数函数
  const calculateWordCount = useCallback((content: any): number => {
    if (!content) return 0;
    try {
      // 如果是 JSON 格式，提取纯文本
      if (typeof content === 'object' && content.type === 'doc') {
        const extractText = (node: any): string => {
          if (!node) return '';
          if (node.text) return node.text;
          if (node.content) {
            return node.content.map(extractText).join('');
          }
          return '';
        };
        const text = extractText(content);
        // 移除空白字符，统计字符数
        return text.replace(/\s/g, '').length;
      }
      return 0;
    } catch (e) {
      console.error('计算字数失败:', e);
      return 0;
    }
  }, []);

  // 检查是否可编辑（未被锁定或由自己锁定）
  const canEdit = !isLocked || isLockedByMe;

  // 检查当前页面是否属于共享笔记本
  useEffect(() => {
    const checkSharedStatus = async () => {
      if (!selectedNote) {
        setIsSharedNotebook(false);
        return;
      }
      if (selectedNote.type !== 'page') {
        setIsSharedNotebook(false);
        return;
      }

      // 找到父分区
      const section = notes.find((n) => n.id === selectedNote.parentId && n.type === 'section');
      if (!section) {
        setIsSharedNotebook(false);
        return;
      }

      // 找到父笔记本
      const notebook = notes.find((n) => n.id === section.parentId && n.type === 'notebook');
      if (!notebook) {
        setIsSharedNotebook(false);
        return;
      }

      // 查询 note_shares 表
      const result = await apiGetNotebookShares(notebook.id);
      setIsSharedNotebook(result.success && result.data && result.data.length > 0);
    };

    checkSharedStatus();
  }, [selectedNote, notes]);

  const lastSavedContentRef = useRef<string>('');
  const isLoadingRef = useRef(false);
  const editorRef = useRef<any>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingContentRef = useRef<string | null>(null); // 待保存的内容（debounce）

  const editor = useEditor({
    extensions: [
      StarterKit,
      ResizableImage.configure({
        HTMLAttributes: {
          class: 'rounded-lg',
        },
      }),
      TableWithDefaultWidth.configure({
        resizable: true,
        handleWidth: 3,
      }),
      TableRowWithTextSelection,
      TableCellWithColor.configure({
        HTMLAttributes: {
          class: 'relative',
        },
      }),
      TableHeaderWithColor,
      // 允许表格单元格内原生文字选择
      TextSelectionInTablePlugin,
      // 页签扩展
      TabGroup,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      FontSize.configure({
        types: ['textStyle'],
      }),
      Highlight,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: '开始输入...' }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'not-prose pl-0 list-none',
        },
      }),
      TaskItem.configure({
        HTMLAttributes: {
          class: 'flex items-start gap-2 py-1',
        },
      }),
      // 思维导图扩展
      MindmapExtension,
      // 行程规划扩展
      RouteBlock,
      // 附件块扩展
      AttachmentBlock,
      // 列表快捷键（Tab/Shift+Tab缩进）
      ListKeymap.configure({
        listTypes: [
          { itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
          { itemName: 'taskItem', wrapperNames: ['taskList'] },
        ],
      }),
      // Markdown 语法支持
      Markdown.configure({
        html: false,
        tightLists: true,
        tightListClass: 'tight',
        bulletListMarker: '-',
        linkify: false,
        breaks: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
    ],
    content: '',
    editable: canEdit, // 只读模式：禁用编辑但允许滚动、选择、表格拖动等查看操作
    editorProps: {
      attributes: {
        class: 'outline-none',
      },
    },
    immediatelyRender: false, // Safari 兼容性修复
    onUpdate: ({ editor }) => {
      if (selectedNoteId && !isLoadingRef.current) {
        // 检查页面是否被其他用户锁定
        if (isLockedByOther) {
          // 页面被锁定时，清除 pending 的 auto-save，避免触发保存
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
            autoSaveTimeoutRef.current = null;
          }
          pendingContentRef.current = null;
          return;
        }
        const content = JSON.stringify(editor.getJSON());
        // 计算字数
        const count = calculateWordCount(editor.getJSON());
        setWordCount(count);

        // 标记笔记正在被编辑（防止远程数据覆盖）
        markNoteAsEditing(selectedNoteId);

        // 内容变化时，重置 debounce 定时器（1秒后保存）
        if (content !== lastSavedContentRef.current) {
          pendingContentRef.current = content;
          if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
          }
          autoSaveTimeoutRef.current = setTimeout(() => {
            // 再次检查页面是否被锁定，避免在等待期间被锁定的情况
            if (isNoteLockedByOther(selectedNoteId, userId)) {
              console.log('[AutoSave] 页面已被锁定，取消保存');
              pendingContentRef.current = null;
              return;
            }
            if (pendingContentRef.current !== null && pendingContentRef.current !== lastSavedContentRef.current) {
              lastSavedContentRef.current = pendingContentRef.current;
              updateNote(selectedNoteId, { content: pendingContentRef.current }, { silent: true });
              pendingContentRef.current = null;
            }
          }, 1000);
        }
      }
    },
  });

  // 保存 editor 实例引用
  editorRef.current = editor;

  // 动态更新编辑器的 editable 状态（锁定/解锁时切换）
  useEffect(() => {
    if (editor) {
      editor.setEditable(canEdit);
    }
  }, [editor, canEdit]);

  // 编辑器失去焦点时，标记结束编辑（允许远程更新）
  useEffect(() => {
    if (!editor) return;

    const handleBlur = () => {
      // 延迟执行，等待 focus 事件完成（防止切换笔记时误触发）
      setTimeout(() => {
        // 检查是否 focus 到了其他元素
        const activeElement = document.activeElement;
        const editorElement = editor.view?.dom;

        // 如果焦点移到了编辑器外部，标记结束编辑
        if (editorElement && !editorElement.contains(activeElement) && selectedNoteId) {
          console.log('[Editor] 编辑器失去焦点，标记结束编辑:', selectedNoteId);
          markNoteAsEditingEnd(selectedNoteId);
        }
      }, 100);
    };

    const editorElement = editor.view?.dom;
    if (editorElement) {
      editorElement.addEventListener('blur', handleBlur, true);
      return () => {
        editorElement.removeEventListener('blur', handleBlur, true);
      };
    }
  }, [editor, selectedNoteId]);

  // 键盘快捷键
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+Shift+R: 强制刷新编辑器视图
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'r') {
        event.preventDefault();
        // 触发 selectionUpdate 事件，更新工具栏状态
        editor.emit('selectionUpdate', editor.state);
        return;
      }
      // Cmd+. for unordered list
      if ((event.metaKey || event.ctrlKey) && event.key === '.') {
        event.preventDefault();
        editor.chain().focus().toggleBulletList().run();
        return;
      }
      // Cmd+1 for task list toggle
      if ((event.metaKey || event.ctrlKey) && event.key === '1') {
        event.preventDefault();
        editor.chain().focus().toggleTaskList().run();
        return;
      }
      // Tab: 列表缩进
      if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const inListItem = editor.isActive('listItem');
        if (event.shiftKey) {
          // Shift+Tab: 提升层级
          event.preventDefault();
          editor.chain().focus().liftListItem('listItem').run();
          return;
        } else if (inListItem) {
          // Tab: 嵌套层级，仅在列表项内拦截
          event.preventDefault();
          editor.chain().focus().sinkListItem('listItem').run();
          return;
        }
        // 不在列表内时，不拦截，让浏览器默认处理（插入tab或切换焦点）
      }
    };

    // Safari 兼容性：安全地添加事件监听器（capture阶段，优先于浏览器快捷键）
    const editorElement = editor.view?.dom;
    if (!editorElement) return;

    editorElement.addEventListener('keydown', handleKeyDown, true); // true = capture
    return () => {
      if (editorElement) {
        editorElement.removeEventListener('keydown', handleKeyDown, true);
      }
    };
  }, [editor]);

  // 当切换笔记时，加载对应内容
  useEffect(() => {
    if (!editor || !selectedNoteId) return;

    // 标记新的笔记开始被编辑
    markNoteAsEditing(selectedNoteId);

    const loadContent = () => {
      // 从 store 获取最新状态
      const note = useNoteStore.getState().notes.find(n => n.id === selectedNoteId);
      if (!note || !editor) return;

      isLoadingRef.current = true;

      try {
        // 解析内容
        const rawContent = note.content;
        let editorContent: any;

        if (typeof rawContent === 'string' && rawContent) {
          try {
            editorContent = JSON.parse(rawContent);
          } catch {
            editorContent = { type: 'doc', content: [{ type: 'paragraph' }] };
          }
        } else if (rawContent && typeof rawContent === 'object') {
          editorContent = rawContent;
        } else {
          editorContent = { type: 'doc', content: [{ type: 'paragraph' }] };
        }

        // 确保内容有效
        if (!editorContent || !editorContent.type) {
          editorContent = { type: 'doc', content: [{ type: 'paragraph' }] };
        }

        // 更新编辑器内容
        editor.commands.setContent(editorContent);
        lastSavedContentRef.current = JSON.stringify(editorContent);
        // 计算字数
        const count = calculateWordCount(editorContent);
        setWordCount(count);
      } catch (e) {
        console.error('加载笔记内容失败:', e);
        // 出错时设置空内容
        try {
          editor.commands.setContent({ type: 'doc', content: [{ type: 'paragraph' }] });
        } catch (e2) {
          console.error('重置编辑器失败:', e2);
        }
      } finally {
        isLoadingRef.current = false;
      }
    };

    // 延迟执行，等待状态稳定
    const timeoutId = setTimeout(loadContent, 50);
    return () => {
      clearTimeout(timeoutId);
      // 切换离开时标记结束编辑
      markNoteAsEditingEnd(selectedNoteId);
    };
  }, [selectedNoteId, editor]);

  const handleCellColor = useCallback((color: string) => {
    if (editor) {
      try {
        // 更新表格单元格背景色（包括表头和普通单元格）
        editor.chain().focus().updateAttributes('tableCell', { backgroundColor: color }).run();
        editor.chain().focus().updateAttributes('tableHeader', { backgroundColor: color }).run();
      } catch (e) {
        console.error('设置单元格底色失败:', e);
      }

      setShowColorPicker(false);
    }
  }, [editor]);

  const handleMindmapClick = () => {
    if (editor) {
      editor.chain().focus().insertMindmap().run();
      toast.success('思维导图已添加');
    }
  };

  // 处理插入附件点击（先检测绑定状态）
  const handleAttachmentClick = async () => {
    if (!user) return;
    const result = await checkOneDriveBinding(user.id);
    if (!result.bound) {
      toast.error('请先绑定 OneDrive 账号');
      return;
    }
    setShowAttachmentModal(true);
  };

  if (!selectedNote) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
        <div className="text-center text-gray-400">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="text-lg font-medium mb-1">选择一个笔记</p>
          <p className="text-sm">从左侧选择一个笔记开始编辑</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white relative max-w-full overflow-hidden h-full">
      {/* 顶部操作栏 - 紧凑布局 */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 border-b border-gray-100 bg-white overflow-visible shrink-0 z-50 relative">
        <div className="flex items-center gap-2 pl-4">
          <h1 className="text-lg font-bold text-gray-800 truncate">{selectedNote.title}</h1>
          {/* 页面锁按钮 - 仅共享笔记本的页面显示 */}
          {selectedNote.type === 'page' && isSharedNotebook && (
            <button
              onClick={isLocked ? handleUnlock : handleLock}
              className={`p-1 rounded transition-colors ${
                isLocked
                  ? 'text-red-500 hover:bg-red-50'
                  : 'text-green-500 hover:bg-green-50'
              }`}
              title={isLocked
                ? (isLockedByMe ? '点击解锁' : `已被 ${selectedNote.lockedByName || '其他人'} 锁定，点击解锁`)
                : '锁定页面'
              }
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
          )}
        </div>
        <EditorToolbar
          editor={editor}
          onMindmapClick={handleMindmapClick}
          onAttachmentClick={handleAttachmentClick}
          showColorPicker={showColorPicker}
          setShowColorPicker={setShowColorPicker}
          handleCellColor={handleCellColor}
          disabled={!canEdit}
          wordCount={wordCount}
        />
      </div>

      {/* 底部信息栏 - 放在编辑区上方 */}
      <div className="px-4 py-1.5 text-xs text-gray-400 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 pl-4">
          <span>最后修改: {new Date(selectedNote.updatedAt).toLocaleString('zh-CN')}</span>
          <span className="text-gray-300">|</span>
          <span>字数: {wordCount.toLocaleString()}</span>
        </div>
        <span className="text-gray-400">按 <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">Ctrl+S</kbd> / <kbd className="px-1 py-0.5 bg-gray-100 rounded text-gray-500">⌘+S</kbd> 保存到云端</span>
      </div>
      {/* 编辑区 - flex-1 填充剩余空间，overflow-auto 内部滚动 */}
      <div
        className="flex-1 min-h-0 pl-9 px-5 pt-6 overflow-auto editor-scroll"
        style={{ maxWidth: '100%', boxSizing: 'border-box' }}
      >
        <EditorContent editor={editor} />
      </div>

      {/* 修改日志面板 */}
      {showHistory && (
        <HistoryPanel
          noteId={selectedNoteId}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* 附件插入弹窗 */}
      {showAttachmentModal && (
        <AttachmentInsertModal
          noteId={selectedNoteId}
          onClose={() => setShowAttachmentModal(false)}
          onInsert={(attrs) => {
            if (editor) {
              editor.chain().focus().insertAttachmentBlock(attrs).run();
            }
          }}
        />
      )}

      {/* 确认弹窗 */}
      {confirmOpts && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1001]">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
              <AlertCircle className="w-6 h-6 text-white" />
              <span className="text-white font-medium">确认操作</span>
            </div>
            <div className="p-6">
              <p className="text-gray-700 mb-6">{confirmOpts.msg}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmOpts(null)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-all"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    confirmOpts.onOk();
                    setConfirmOpts(null);
                  }}
                  className="flex-1 py-2.5 bg-amber-500 text-white font-medium rounded-lg hover:bg-amber-600 transition-all"
                >
                  确定
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 底部版权信息 */}
      <div className="px-4 py-2 text-xs text-gray-400 text-center border-t border-gray-100 shrink-0">
        献给热爱知识管理的你——彬
      </div>

    </div>
  );
};
