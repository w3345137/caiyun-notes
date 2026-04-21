import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import MindMap from 'simple-mind-map';
import Drag from 'simple-mind-map/src/plugins/Drag.js';
import Select from 'simple-mind-map/src/plugins/Select.js';
import Export from 'simple-mind-map/src/plugins/Export.js';
import RainbowLines from 'simple-mind-map/src/plugins/RainbowLines.js';
import './MindmapExtension.css';

MindMap.usePlugin(Drag);
MindMap.usePlugin(Select);
MindMap.usePlugin(Export);
MindMap.usePlugin(RainbowLines);

export interface MindmapActions {
  addChild: () => void;
  addSibling: () => void;
  removeSelected: () => void;
  deleteMindmap: () => void;
  toggleFullscreen: () => void;
  exportImage: () => void;
  exportMarkdown: () => void;
}

const mindmapRegistry = new Map<string, MindmapActions>();
let registryCounter = 0;
function registerMindmap(actions: MindmapActions): string { const id = `mindmap-${++registryCounter}`; mindmapRegistry.set(id, actions); return id; }
function unregisterMindmap(id: string) { mindmapRegistry.delete(id); }
export function getActiveMindmapActions(): MindmapActions | null { const e = Array.from(mindmapRegistry.values()); return e.length > 0 ? e[e.length - 1] : null; }

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
  } catch {}
  return createDefaultSmmData();
}

const CAIYUN_THEME_CONFIG = {
  backgroundColor: '#fafbfc', lineWidth: 2, lineColor: '#94a3b8', lineStyle: 'curve', lineRadius: 8, rootLineKeepSameInCurve: true,
  root: { shape: 'rectangle', fillColor: '#2c3e50', color: '#ffffff', fontSize: 17, fontWeight: 'bold', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: '#1a252f', borderWidth: 3, borderRadius: 8, paddingX: 20, paddingY: 10, marginX: 100, marginY: 40 },
  second: { shape: 'rectangle', fillColor: '#ffffff', color: '#333333', fontSize: 16, fontWeight: '600', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: '#94a3b8', borderWidth: 1.5, borderRadius: 6, paddingX: 14, paddingY: 6, marginX: 80, marginY: 20 },
  node: { shape: 'rectangle', fillColor: '#f8fafc', color: '#475569', fontSize: 14, fontWeight: 'normal', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif', borderColor: 'transparent', borderWidth: 0, borderRadius: 4, paddingX: 10, paddingY: 4, marginX: 60, marginY: 10 },
  generalization: { fillColor: '#f1f5f9', color: '#64748b', fontSize: 13, fontWeight: 'normal', borderColor: '#e2e8f0', borderWidth: 1, borderRadius: 4 },
};

export const MindmapExtension = Node.create({
  name: 'mindmap', group: 'block', atom: true, draggable: false, selectable: true,
  addAttributes() { return { content: { default: JSON.stringify(createDefaultSmmData()) } }; },
  parseHTML() { return [{ tag: 'div[data-mindmap]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-mindmap': HTMLAttributes.content, 'data-type': 'mindmap', class: 'mindmap-wrapper' })]; },
  addNodeView() {
    return ReactNodeViewRenderer(MindmapNodeView, {
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
  if (mountCountRef.current <= 3) console.log('[MM-DEBUG] COMPONENT RENDER #' + mountCountRef.current);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const mmRef = useRef<MindMap | null>(null);
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

  useEffect(() => {
    registryIdRef.current = registerMindmap({ addChild: handleAddChild, addSibling: handleAddSibling, removeSelected: handleRemoveSelected, deleteMindmap: handleDeleteMindmap, toggleFullscreen, exportImage: handleExportImage, exportMarkdown: handleExportMarkdown });
    return () => { if (registryIdRef.current) unregisterMindmap(registryIdRef.current); };
  }, [handleAddChild, handleAddSibling, handleRemoveSelected, handleDeleteMindmap, toggleFullscreen, handleExportImage, handleExportMarkdown]);

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
        rainbowLinesConfig: { open: true, colorsList: ['rgb(192,57,43)', 'rgb(212,160,23)', 'rgb(39,174,96)', 'rgb(41,128,185)', 'rgb(142,68,173)', 'rgb(230,126,34)', 'rgb(22,160,133)'] },
      });

      mmRef.current = mm;
      lastSavedContentRef.current = content;
      initDoneRef.current = true;

      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const saveHandler = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { saveTimer = null; saveDataRef.current(); }, 500);
      };

      mm.on('node_active', saveHandler);
      mm.on('data_change', saveHandler);
      mm.on('before_show_text_edit', () => {
        isEditingRef.current = true;
        if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      });
      mm.on('hide_text_edit', () => {
        isEditingRef.current = false;
        if (pendingSaveRef.current) {
          pendingSaveRef.current = false;
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(() => { saveTimer = null; saveDataRef.current(); }, 800);
        }
      });

      setTimeout(() => { container.focus(); }, 100);
    }, 80);

    return () => {
      clearTimeout(timer);
      const oldMm = mmRef.current;
      console.log('[MM-DEBUG] EFFECT 1 CLEANUP, mm exists:', !!oldMm);
      if (oldMm) {
        try { oldMm.destroy(); } catch {}
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
    console.log('[MM-DEBUG] EFFECT 2: external content change, calling setData');
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
