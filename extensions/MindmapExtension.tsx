import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useCallback } from 'react';
import JsMind from 'jsmind';
import 'jsmind/style/jsmind.css';
import { v4 as uuidv4 } from 'uuid';
import './MindmapExtension.css';

interface JsmindNode { id: string; topic: string; children?: JsmindNode[]; expanded?: boolean; }
interface JsmindData { meta: { name: string; author: string }; format: string; data: JsmindNode; }

export const MindmapExtension = Node.create({
  name: 'mindmap',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      content: {
        default: JSON.stringify({
          meta: { name: 'mindmap', author: 'NotesApp' },
          format: 'node_tree',
          data: { id: 'root', topic: '中心主题', expanded: true, children: [
            { id: uuidv4(), topic: '分支主题 1', expanded: true, children: [] },
            { id: uuidv4(), topic: '分支主题 2', expanded: true, children: [] },
            { id: uuidv4(), topic: '分支主题 3', expanded: true, children: [] },
          ]},
        }),
      },
    };
  },

  parseHTML() { return [{ tag: 'div[data-mindmap]' }]; },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-mindmap': HTMLAttributes.content, 'data-type': 'mindmap', class: 'mindmap-wrapper' })];
  },

  addNodeView() { return ReactNodeViewRenderer(MindmapNodeView); },

  addCommands() {
    return {
      insertMindmap: (content?: string) => ({ commands }: any) => {
        const defaultContent = content || JSON.stringify({
          meta: { name: 'mindmap', author: 'NotesApp' },
          format: 'node_tree',
          data: { id: 'root', topic: '中心主题', expanded: true, children: [
            { id: uuidv4(), topic: '分支主题 1', expanded: true, children: [] },
            { id: uuidv4(), topic: '分支主题 2', expanded: true, children: [] },
            { id: uuidv4(), topic: '分支主题 3', expanded: true, children: [] },
          ]},
        });
        return commands.insertContent({ type: this.name, attrs: { content: defaultContent } });
      },
    };
  },
});

const MindmapNodeView: React.FC<{ node: any; updateAttributes: any; selected: boolean }> = ({ node, updateAttributes, selected }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const jmRef = useRef<any>(null);
  const isInternalChange = useRef(false);
  const selectedNodeIdRef = useRef<string | null>(null);

  const getData = useCallback((): JsmindData => {
    try { if (node.attrs.content) return JSON.parse(node.attrs.content); } catch {}
    return { meta: { name: 'mindmap', author: 'NotesApp' }, format: 'node_tree', data: { id: 'root', topic: '中心主题', expanded: true, children: [
      { id: uuidv4(), topic: '分支主题 1', expanded: true, children: [] },
      { id: uuidv4(), topic: '分支主题 2', expanded: true, children: [] },
      { id: uuidv4(), topic: '分支主题 3', expanded: true, children: [] },
    ]}};
  }, [node.attrs.content]);

  const saveData = useCallback((data: JsmindData) => {
    if (isInternalChange.current) return;
    isInternalChange.current = true;
    updateAttributes({ content: JSON.stringify(data) });
    setTimeout(() => { isInternalChange.current = false; }, 100);
  }, [updateAttributes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    let jm: any = null;

    const timer = setTimeout(() => {
      const data = getData();
      jm = new (JsMind as any)({
        container: container,
        editable: true,
        theme: 'default',
        mode: 'side',
        support_html: false,
        view: { hmargin: 100, vmargin: 80, line_width: 2, line_color: '#555', line_style: 'curved' },
        layout: { hspace: 60, vspace: 30, pspace: 20 },
        shortcut: { enable: true },
      });
      jm.show(data);
      jmRef.current = jm;

      // 高度自适应：多次 resize 并获取实际高度
      const adjustHeight = () => {
        jm.resize();
        // 获取 jsmind 内部画布的实际高度
        const jmView = container.querySelector('.jsmind-inner');
        if (jmView) {
          const scrollHeight = jmView.scrollHeight;
          if (scrollHeight > 0) {
            container.style.height = `${scrollHeight + 40}px`; // 40px 作为底部边距
          }
        }
      };

      adjustHeight();
      setTimeout(adjustHeight, 100);
      setTimeout(adjustHeight, 300);

      // 事件监听
      jm.add_event_listener((type: number, eventData: any) => {
        if (type === 4 && eventData.node) {
          selectedNodeIdRef.current = eventData.node;
        }
        if (type === 3) {
          const currentData = jm.get_data();
          saveData(currentData as JsmindData);
          // 数据变化时重新调整高度
          setTimeout(adjustHeight, 100);
        }
      });
    }, 50);

    return () => {
      clearTimeout(timer);
      jmRef.current = null;
    };
  }, [getData, saveData]);

  // 键盘事件处理 - 在 document 级别用 capture 模式拦截
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.tabIndex = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      // 只处理 Tab、Enter、Delete、Backspace
      if (!['Tab', 'Enter', 'Delete', 'Backspace'].includes(e.key)) return;

      // 检查事件目标是否在思维导图容器内
      if (!container.contains(e.target as Node)) return;

      if (!jmRef.current) return;

      const jm = jmRef.current;
      const selectedNodeId = selectedNodeIdRef.current;
      if (!selectedNodeId) return;

      const selectedNode = jm.get_node(selectedNodeId);
      if (!selectedNode) return;

      // Tab 添加子节点
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const newId = jm.add_node(selectedNodeId, uuidv4().substring(0, 8), '新节点');
        if (newId) {
          selectedNodeIdRef.current = newId;
          const currentData = jm.get_data();
          saveData(currentData as JsmindData);
          setTimeout(() => jm.begin_edit(newId), 50);
        }
        return;
      }

      // Enter 添加兄弟节点
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedNode.isroot) {
          const newId = jm.add_brother(selectedNodeId, uuidv4().substring(0, 8), '新节点');
          if (newId) {
            selectedNodeIdRef.current = newId;
            const currentData = jm.get_data();
            saveData(currentData as JsmindData);
            setTimeout(() => jm.begin_edit(newId), 50);
          }
        }
        return;
      }

      // Delete/Backspace 删除节点
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (!selectedNode.isroot) {
          e.preventDefault();
          e.stopPropagation();
          jm.remove_node(selectedNodeId);
          selectedNodeIdRef.current = null;
          const currentData = jm.get_data();
          saveData(currentData as JsmindData);
        }
        return;
      }
    };

    const handleResize = () => {
      if (jmRef.current) {
        jmRef.current.resize();
      }
    };

    // 在 document 级别使用 capture 模式，确保在 ProseMirror 之前拦截
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [saveData]);

  return (
    <NodeViewWrapper className="mindmap-node-view">
      <div ref={containerRef} className="mindmap-container" />
    </NodeViewWrapper>
  );
};
