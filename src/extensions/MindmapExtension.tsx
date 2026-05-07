import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import MindMap from 'simple-mind-map';
import Drag from 'simple-mind-map/src/plugins/Drag.js';
import Select from 'simple-mind-map/src/plugins/Select.js';
import Export from 'simple-mind-map/src/plugins/Export.js';
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js';
import { registerMindmap, unregisterMindmap } from '../lib/mindmapActions';
import './MindmapExtension.css';

// simple-mind-map 的 usePlugin 是普通插件注册 API，不是 React Hook。
// eslint-disable-next-line react-hooks/rules-of-hooks
MindMap.usePlugin(Drag);
// eslint-disable-next-line react-hooks/rules-of-hooks
MindMap.usePlugin(Select);
// eslint-disable-next-line react-hooks/rules-of-hooks
MindMap.usePlugin(Export);
// eslint-disable-next-line react-hooks/rules-of-hooks
MindMap.usePlugin(RainbowLines);

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    mindmap: {
      insertMindmap: (content?: string) => ReturnType;
    };
  }
}

interface SmmNodeData { data: { text: string; uid?: string; expand?: boolean; }; children: SmmNodeData[]; }
interface MindElixirNodeData { id: string; topic: string; children?: MindElixirNodeData[]; expanded?: boolean; }
interface MindElixirData { nodeData: MindElixirNodeData; }

function generateId(): string { return Math.random().toString(36).substring(2, 10); }

function createDefaultSmmData(): SmmNodeData {
  return { data: { text: '中心主题', uid: 'root', expand: true }, children: [
    { data: { text: '分支主题 1', uid: generateId() }, children: [] },
    { data: { text: '分支主题 2', uid: generateId() }, children: [] },
    { data: { text: '分支主题 3', uid: generateId() }, children: [] },
  ]};
}

function elixirToSmm(d: MindElixirData): SmmNodeData {
  const c = (n: MindElixirNodeData): SmmNodeData => ({ data: { text: n.topic || '主题', uid: n.id || generateId(), expand: n.expanded !== false }, children: (n.children || []).map(c) });
  return c(d.nodeData);
}

function normalizeToSmm(raw: string): SmmNodeData {
  try {
    const p = JSON.parse(raw);
    if (p.data && p.data.text !== undefined) return p as SmmNodeData;
    if (p.nodeData) return elixirToSmm(p as MindElixirData);
    if (Array.isArray(p) && p.length > 0) {
      const c = (n: any): SmmNodeData => ({ data: { text: n.text || n.topic || '主题', uid: n.id || generateId() }, children: (n.children || []).map(c) });
      return c(p[0]);
    }
  } catch {
    // 非 JSON/旧格式内容按默认思维导图处理。
  }
  return createDefaultSmmData();
}

const CAIYUN_THEME_CONFIG = {
  backgroundColor: '#fafbfc', lineWidth: 2, lineColor: '#94a3b8', lineStyle: 'curve', lineRadius: 8, rootLineKeepSameInCurve: true,
  root: { shape: 'rectangle', fillColor: '#2c3e50', color: '#ffffff', fontSize: 17, fontWeight: 'bold', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: '#1a252f', borderWidth: 3, borderRadius: 8, paddingX: 20, paddingY: 10, marginX: 100, marginY: 40 },
  second: { shape: 'rectangle', fillColor: '#ffffff', color: '#333333', fontSize: 16, fontWeight: '600', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: '#94a3b8', borderWidth: 1.5, borderRadius: 6, paddingX: 14, paddingY: 6, marginX: 80, marginY: 20 },
  node: { shape: 'rectangle', fillColor: '#f8fafc', color: '#475569', fontSize: 14, fontWeight: 'normal', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: 'transparent', borderWidth: 0, borderRadius: 4, paddingX: 10, paddingY: 4, marginX: 60, marginY: 10 },
  generalization: { shape: 'rectangle', fillColor: '#ffffff', color: '#000000', fontSize: 14, fontWeight: '600', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: '#cccccc', borderWidth: 1.5, borderRadius: 6, paddingX: 12, paddingY: 5 },
};

export const MindmapExtension = Node.create({
  name: 'mindmap', group: 'block', atom: true, draggable: false, selectable: true,
  addAttributes() { return { content: { default: JSON.stringify(createDefaultSmmData()) } }; },
  parseHTML() { return [{ tag: 'div[data-mindmap]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-mindmap': HTMLAttributes.content, 'data-type': 'mindmap', class: 'mindmap-wrapper' })]; },
  addNodeView() {
    return ReactNodeViewRenderer(MindmapNodeView as React.ComponentType<any>, {
      stopEvent: ({ event }: { event: Event }) => {
        if (event instanceof KeyboardEvent) return false;
        if (event.type === 'mousedown' || event.type === 'mouseup' || event.type === 'dblclick' || event.type === 'pointerdown') {
          const target = event.target as HTMLElement;
          if (target.closest('.mindmap-container')) return true;
        }
        return false;
      },
    });
  },
  addCommands() {
    return { insertMindmap: (content?: string) => ({ commands }: any) => commands.insertContent({ type: this.name, attrs: { content: content || JSON.stringify(createDefaultSmmData()) } }) };
  },
});

const MindmapNodeView: React.FC<{ node: any; updateAttributes: any; selected: boolean; deleteNode: () => void; }> = ({ node, updateAttributes, selected, deleteNode }) => {
  const mountCountRef = useRef(0);
  mountCountRef.current++;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<any>(null);
  const isSaving = useRef(false);
  const isEditingRef = useRef(false);
  const lastSavedContentRef = useRef('');
  const registryIdRef = useRef<string>('');
  const initDoneRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const initialContentRef = useRef(node.attrs.content || '');
  const saveDataRef = useRef<() => void>(() => {});

  const [isFullscreen, setIsFullscreen] = useState(false);

  const saveData = useCallback(() => {
    const mm = mmRef.current;
    if (!mm || isSaving.current || !initDoneRef.current) return;
    if (isEditingRef.current) { pendingSaveRef.current = true; return; }
    isSaving.current = true;
    try {
      const data = mm.getData();
      const newContent = JSON.stringify(data);
      if (newContent === lastSavedContentRef.current) { isSaving.current = false; return; }
      lastSavedContentRef.current = newContent;
      updateAttributes({ content: newContent });
    } finally {
      setTimeout(() => { isSaving.current = false; }, 200);
    }
  }, [updateAttributes]);

  saveDataRef.current = saveData;

  const handleAddChild = useCallback(() => { mmRef.current?.execCommand('INSERT_CHILD_NODE'); }, []);
  const handleAddSibling = useCallback(() => {
    const mm = mmRef.current; if (!mm) return;
    const active = mm.renderer?.activeNodeList || [];
    if (active.length > 0 && active[0].uid === mm.renderer?.root?.uid) return;
    mm.execCommand('INSERT_NODE');
  }, []);
  const handleRemoveSelected = useCallback(() => {
    const mm = mmRef.current; if (!mm) return;
    const active = mm.renderer?.activeNodeList || [];
    if (active.length > 0 && active[0].uid === mm.renderer?.root?.uid) return;
    mm.execCommand('REMOVE_NODE');
  }, []);
  const handleDeleteMindmap = useCallback(() => { if (window.confirm('确定要删除这个思维导图吗？')) deleteNode(); }, [deleteNode]);
  const toggleFullscreen = useCallback(() => { setIsFullscreen(prev => !prev); }, []);
  const handleExportImage = useCallback(async () => { try { await mmRef.current?.export('png', true, '思维导图'); } catch (err) { console.error('导出图片失败:', err); } }, []);
  const handleExportMarkdown = useCallback(() => {
    const mm = mmRef.current; if (!mm) return;
    const data = mm.getData(); if (!data) return;
    const toMd = (n: SmmNodeData, l: number): string => { let md = `${'#'.repeat(Math.min(l, 6))} ${n.data.text || '无标题'}\n\n`; n.children?.forEach(c => { md += toMd(c, l + 1); }); return md; };
    const blob = new Blob([toMd(data, 1)], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a'); link.download = `mindmap-${Date.now()}.md`; link.href = URL.createObjectURL(blob); link.click(); URL.revokeObjectURL(link.href);
  }, []);

  const handleAddSummary = useCallback(() => {
    const mm = mmRef.current;
    if (!mm) return;
    const activeNodes = mm.renderer?.activeNodeList || [];
    if (activeNodes.length === 0) {
      alert('请先选中一个或多个节点（按住 Ctrl 点击节点可多选）');
      return;
    }
    mm.renderer.addGeneralization({ text: '概要' }, true);
  }, []);

  useEffect(() => {
    registryIdRef.current = registerMindmap({ addChild: handleAddChild, addSibling: handleAddSibling, removeSelected: handleRemoveSelected, deleteMindmap: handleDeleteMindmap, toggleFullscreen, exportImage: handleExportImage, exportMarkdown: handleExportMarkdown, addSummary: handleAddSummary });
    return () => { if (registryIdRef.current) unregisterMindmap(registryIdRef.current); };
  }, [handleAddChild, handleAddSibling, handleRemoveSelected, handleDeleteMindmap, toggleFullscreen, handleExportImage, handleExportMarkdown, handleAddSummary]);

  useEffect(() => {
    if (!isFullscreen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setIsFullscreen(false); } };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isFullscreen]);

  useEffect(() => {
    const mm = mmRef.current; if (!mm) return;
    mm.resize();
    setTimeout(() => { mm.view?.fit(); }, 100);
  }, [isFullscreen]);

  // === Effect 1: 初始化 MindMap（只执行一次）===
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const content = initialContentRef.current;

    const timer = setTimeout(() => {
      const data = normalizeToSmm(content);

      const mm = new MindMap({
        el: container, data, layout: 'mindMapStructure', theme: 'default', themeConfig: CAIYUN_THEME_CONFIG,
        fit: true, mousewheelAction: 'zoom', mouseScaleCenterUseMousePosition: true, mousewheelZoomActionReverse: true,
        scaleRatio: 0.15, minZoomRatio: 10, maxZoomRatio: 400, fitPadding: 50,
        enableFreeDrag: true, autoMoveWhenMouseInEdgeOnDrag: true, isLimitMindMapInCanvas: false,
        defaultInsertSecondLevelNodeText: '分支主题', defaultInsertBelowSecondLevelNodeText: '子主题',
        createNewNodeBehavior: 'default', enableShortcutOnlyWhenMouseInSvg: false,
        useLeftKeySelectionRightKeyDrag: false, enableCtrlKeyNodeSelection: true, deleteNodeActive: true,
        expandBtnSize: 20, isShowExpandNum: true, notShowExpandBtn: false, alwaysShowExpandBtn: false,
        nodeTextEditZIndex: 3000, hoverRectColor: 'rgb(59, 130, 246)', hoverRectPadding: 2,
        selectTextOnEnterEditText: false, mousedownEventPreventDefault: false,
        addHistoryOnInit: true, maxHistoryCount: 500, addHistoryTime: 100,
        openRealtimeRenderOnNodeTextEdit: false, enableDragModifyNodeWidth: true,
        minNodeTextModifyWidth: 20, textAutoWrapWidth: 500, disableMouseWheelZoom: false, isDisableDrag: false, readonly: false,
        generalizationLineWidth: 3, generalizationLineColor: '#000000', generalizationLineMargin: 12, generalizationNodeMargin: 36,
        rainbowLinesConfig: { open: true, colorsList: ['rgb(192,57,43)', 'rgb(212,160,23)', 'rgb(39,174,96)', 'rgb(41,128,185)', 'rgb(142,68,173)', 'rgb(230,126,34)', 'rgb(22,160,133)'] },
      } as any);

      mmRef.current = mm;
      lastSavedContentRef.current = content;
      initDoneRef.current = true;

      // 补丁：将概要的连接线改为大括号 } 样式（顶部/底部弧形钩 + 中间小指针指向标签）
      // 注意：simple-mind-map 实际使用的是 mm.renderer.layout，不是 mm.layout
      const layoutInstance: any = (mm as any).renderer.layout;
      layoutInstance.renderGeneralization = function (list: any[]) {
        list.forEach((item: any) => {
          const isLeft = item.node.dir === 'left';
          const bounds = layoutInstance.getNodeGeneralizationRenderBoundaries(item, 'h');
          const { top, bottom, left, right, generalizationLineMargin, generalizationNodeMargin } = bounds;
          const x = isLeft ? left - generalizationLineMargin : right + generalizationLineMargin;
          const dir = isLeft ? -1 : 1;
          const midY = (top + bottom) / 2;

          // 大括号样式参数
          const armCp = 50 * dir;      // 上下端的曲率控制点（外凸距离）
          const spineCp = 4 * dir;     // 接近中点处的控制点（贴近垂直线）
          const cpVyBase = 6;          // 控制点的纵向偏移（贴近端点）
          const notchTipX = 18 * dir;  // 中间小指针的外凸距离
          const notchHMax = 14;        // 中间小指针的纵向间距上限

          // 适配较短的概要范围：若整体高度太小，自动收紧 notch 与控制点
          const totalH = bottom - top;
          const notchH = Math.min(notchHMax, totalH * 0.3);
          const upperEnd = midY - notchH / 2;
          const lowerStart = midY + notchH / 2;
          const upperSegH = upperEnd - top;
          const lowerSegH = bottom - lowerStart;
          const upperVy = Math.min(cpVyBase, Math.max(0, upperSegH * 0.4));
          const lowerVy = Math.min(cpVyBase, Math.max(0, lowerSegH * 0.4));

          const path =
            `M ${x},${top}` +
            ` C ${x + armCp},${top + upperVy}` +
            ` ${x + spineCp},${upperEnd - upperVy}` +
            ` ${x},${upperEnd}` +
            ` L ${x + notchTipX},${midY}` +
            ` L ${x},${lowerStart}` +
            ` C ${x + spineCp},${lowerStart + lowerVy}` +
            ` ${x + armCp},${bottom - lowerVy}` +
            ` ${x},${bottom}`;
          item.generalizationLine.plot(path);

          item.generalizationNode.left =
            x + (isLeft ? -generalizationNodeMargin : generalizationNodeMargin) - (isLeft ? item.generalizationNode.width : 0);
          item.generalizationNode.top = top + (bottom - top - item.generalizationNode.height) / 2;
        });
      };

      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const saveHandler = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveTimer = null; saveDataRef.current(); }, 500);
      };

      mm.on('node_active', saveHandler);
      mm.on('data_change', saveHandler);
      mm.on('before_show_text_edit', () => {
        // 进入编辑前：若有未完成的防抖保存，立即同步一次，避免新增节点/概要等结构性变更被丢弃
        if (saveTimer) {
          clearTimeout(saveTimer);
          saveTimer = null;
          saveDataRef.current();
        }
        isEditingRef.current = true;
      });
      mm.on('hide_text_edit', () => {
        isEditingRef.current = false;
        // 编辑结束后无条件触发一次保存（文本变更总是通过 hide_text_edit 提交）
        if (saveTimer) clearTimeout(saveTimer);
        pendingSaveRef.current = false;
        saveTimer = setTimeout(() => { saveTimer = null; saveDataRef.current(); }, 300);
      });

      setTimeout(() => { container.focus(); }, 100);
    }, 80);

    return () => {
      clearTimeout(timer);
      const oldMm = mmRef.current;
      if (oldMm) {
        try { oldMm.destroy(); } catch (e) { console.warn('[Mindmap] destroy failed:', e); }
        mmRef.current = null;
      }
      initDoneRef.current = false;
    };
  }, []);

  // === Effect 2: 外部内容变更同步（不销毁重建）===
  useEffect(() => {
    if (!initDoneRef.current) return;
    const currentContent = node.attrs.content || '';
    if (currentContent === lastSavedContentRef.current) return;
    const mm = mmRef.current;
    if (!mm) return;
    const data = normalizeToSmm(currentContent);
    mm.setData(data);
    lastSavedContentRef.current = currentContent;
  }, [node.attrs.content]);

  // === Effect 3: 快捷键 ===
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const mm = mmRef.current;
      if (!mm || !initDoneRef.current) return;
      const target = e.target as HTMLElement;
      const isEditing = target.getAttribute('contenteditable') === 'true' || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (isEditing) { if (e.key === 'Tab') { e.stopPropagation(); e.preventDefault(); } return; }
      const isMindmapTarget = !!target.closest('.smm-mind-map-container') || target === container;
      if (!isMindmapTarget) return;
      let handled = false;
      switch (e.key) {
        case 'Tab': mm.execCommand(e.shiftKey ? 'INSERT_PARENT_NODE' : 'INSERT_CHILD_NODE'); handled = true; break;
        case 'Enter': mm.execCommand('INSERT_NODE'); handled = true; break;
        case 'Delete': case 'Backspace': mm.execCommand(e.shiftKey ? 'REMOVE_CURRENT_NODE' : 'REMOVE_NODE'); handled = true; break;
        case 'Insert': mm.execCommand('INSERT_CHILD_NODE'); handled = true; break;
        case ' ':
          if (!e.ctrlKey && !e.metaKey) { const a = mm.renderer?.activeNodeList || []; if (a.length > 0) { mm.renderer?.textEdit?.showEditTextBox(a[0]); handled = true; } } break;
        case 'ArrowUp': if (e.ctrlKey || e.metaKey) { mm.execCommand('UP_NODE'); handled = true; } break;
        case 'ArrowDown': if (e.ctrlKey || e.metaKey) { mm.execCommand('DOWN_NODE'); handled = true; } break;
        case 'a': if (e.ctrlKey || e.metaKey) { mm.execCommand('SELECT_ALL'); handled = true; } break;
        case '=': case '+': if (e.ctrlKey || e.metaKey) { mm.view?.enlarge(); handled = true; } break;
        case '-': if (e.ctrlKey || e.metaKey) { mm.view?.narrow(); handled = true; } break;
        case 'i': if (e.ctrlKey || e.metaKey) { mm.view?.fit(); handled = true; } break;
      }
      if (handled) { e.preventDefault(); e.stopPropagation(); }
      else if (['Tab', 'Enter', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) { e.stopPropagation(); }
    };
    container.addEventListener('keydown', handleKeyDown, true);
    return () => container.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // === Effect 4: 左键拖画布时鼠标变抓手 ===
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onDown = (e: MouseEvent) => { if (e.button === 0) container.classList.add('grabbing'); };
    const onUp = () => { container.classList.remove('grabbing'); };
    container.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    return () => {
      container.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <NodeViewWrapper className="mindmap-node-view" data-drag-handle="">
      <div className={`mindmap-outer ${selected ? 'mindmap-selected' : ''} ${isFullscreen ? 'mindmap-fullscreen' : ''}`}>
        <div className="mindmap-canvas-wrapper">
          <div ref={containerRef} className="mindmap-container" tabIndex={0} onPointerDown={() => containerRef.current?.focus()} />
        </div>
      </div>
    </NodeViewWrapper>
  );
};
