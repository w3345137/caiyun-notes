import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import MindElixir from 'mind-elixir';
import 'mind-elixir/style.css';
import './MindmapExtension.css';

// ============================================================
// 数据格式兼容
// ============================================================

interface MindElixirNodeData {
  id: string;
  topic: string;
  children?: MindElixirNodeData[];
  expanded?: boolean;
  direction?: number;
  style?: Record<string, string>;
  branchColor?: string;
}

interface MindElixirData {
  nodeData: MindElixirNodeData;
  direction?: number;
  theme?: any;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

// 分支调色板 — 参考图风格
const BRANCH_PALETTE = [
  '#c0392b', // 红
  '#d4a017', // 金/棕
  '#27ae60', // 绿
  '#2980b9', // 蓝
  '#8e44ad', // 紫
  '#e67e22', // 橙
  '#16a085', // 青
  '#c0392b', // 深红
];

function createDefaultData(): MindElixirData {
  return {
    nodeData: {
      id: 'root',
      topic: '中心主题',
      expanded: true,
      children: [
        { id: generateId(), topic: '分支主题 1', children: [], branchColor: BRANCH_PALETTE[0] },
        { id: generateId(), topic: '分支主题 2', children: [], branchColor: BRANCH_PALETTE[1] },
        { id: generateId(), topic: '分支主题 3', children: [], branchColor: BRANCH_PALETTE[2] },
      ],
    },
  };
}

/** 兼容旧格式 */
function normalizeData(raw: string): MindElixirData {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.nodeData) return parsed as MindElixirData;
    if (parsed.data && parsed.format === 'node_tree') {
      return { nodeData: convertJsMindNode(parsed.data) };
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { nodeData: convertOldArrayNode(parsed[0]) };
    }
  } catch {}
  return createDefaultData();
}

function convertJsMindNode(node: any): MindElixirNodeData {
  return {
    id: node.id || generateId(),
    topic: node.topic || '主题',
    expanded: node.expanded !== false,
    children: (node.children || []).map((c: any, i: number) => {
      const child = convertJsMindNode(c);
      if (!node.parent && !child.branchColor) child.branchColor = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
      return child;
    }),
  };
}

function convertOldArrayNode(node: any): MindElixirNodeData {
  return {
    id: node.id || generateId(),
    topic: node.text || node.topic || '主题',
    expanded: true,
    children: (node.children || []).map((c: any, i: number) => {
      const child = convertOldArrayNode(c);
      if (!child.branchColor) child.branchColor = BRANCH_PALETTE[i % BRANCH_PALETTE.length];
      return child;
    }),
  };
}

// 自定义主题 — 参考图风格
const CUSTOM_THEME = {
  name: 'CaiyunNotes',
  type: 'light' as const,
  palette: BRANCH_PALETTE,
  cssVar: {
    '--node-gap-x': '30px',
    '--node-gap-y': '6px',
    '--main-gap-x': '60px',
    '--main-gap-y': '30px',
    '--root-radius': '8px',
    '--main-radius': '6px',
    '--root-color': '#ffffff',
    '--root-bgcolor': '#2c3e50',
    '--root-border-color': '#1a252f',
    '--main-color': '#333333',
    '--main-bgcolor': '#ffffff',
    '--main-bgcolor-transparent': 'rgba(255,255,255,0.9)',
    '--topic-padding': '6px 12px',
    '--color': '#444444',
    '--bgcolor': '#fafbfc',
    '--selected': '#3b82f6',
    '--accent-color': '#e64553',
    '--panel-color': '#444446',
    '--panel-bgcolor': '#ffffff',
    '--panel-border-color': '#e2e8f0',
    '--map-padding': '40px 60px',
  },
};

// ============================================================
// 自定义连线样式 — 自然曲线（参考图风格）
// ============================================================

/**
 * 主分支连线：根节点 → 一级节点
 * 三次贝塞尔曲线，水平出发自然弯曲到子节点
 */
function customMainBranch(this: any, { pT, pL, pW, pH, cT, cL, cW, cH, direction, containerHeight }: any) {
  let x1 = pL + pW / 2;
  const y1 = pT + pH / 2;
  const x2 = direction === 'lhs' ? cL + cW : cL;
  const y2 = cT + cH / 2;

  // 微调起点，让不同高度的连线从根节点不同位置出发
  const vr = containerHeight > 0 ? (1 - Math.abs(y2 - y1) / containerHeight) * 0.25 * (pW / 2) : 0;
  if (direction === 'lhs') {
    x1 = x1 - pW / 10 - vr;
  } else {
    x1 = x1 + pW / 10 + vr;
  }

  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`;
}

/**
 * 子分支连线：一级节点 → 后代节点
 * 三次贝塞尔曲线，从父节点侧边自然弯曲到子节点底部
 */
function customSubBranch(this: any, { pT, pL, pW, pH, cT, cL, cW, cH, direction, isFirst }: any) {
  const GAP = parseInt(this.container?.style?.getPropertyValue('--node-gap-x') || '30');
  const y1 = isFirst ? pT + pH / 2 : pT + pH;
  const y2 = cT + cH;
  const curvature = Math.abs(y1 - y2) / 300 * GAP;

  if (direction === 'lhs') {
    const baseX = pL;
    const startX = baseX + GAP;
    const beyondX = baseX - GAP;
    const endX = cL + GAP;
    return `M ${startX} ${y1} C ${baseX} ${y1} ${baseX + curvature} ${y2} ${beyondX} ${y2} H ${endX}`;
  } else {
    const baseX = pL + pW;
    const startX = baseX - GAP;
    const beyondX = baseX + GAP;
    const endX = cL + cW - GAP;
    return `M ${startX} ${y1} C ${baseX} ${y1} ${baseX - curvature} ${y2} ${beyondX} ${y2} H ${endX}`;
  }
}

// ============================================================
// TipTap Extension
// ============================================================

export const MindmapExtension = Node.create({
  name: 'mindmap',
  group: 'block',
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      content: { default: JSON.stringify(createDefaultData()) },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-mindmap]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-mindmap': HTMLAttributes.content,
      'data-type': 'mindmap',
      class: 'mindmap-wrapper',
    })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MindmapNodeView);
  },

  addCommands() {
    return {
      insertMindmap: (content?: string) => ({ commands }: any) => {
        const defaultContent = content || JSON.stringify(createDefaultData());
        return commands.insertContent({ type: this.name, attrs: { content: defaultContent } });
      },
    };
  },
});

// ============================================================
// NodeView Component
// ============================================================

const MindmapNodeView: React.FC<{
  node: any;
  updateAttributes: any;
  selected: boolean;
}> = ({ node, updateAttributes, selected }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixir | null>(null);
  const isSaving = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const getData = useCallback((): MindElixirData => {
    return normalizeData(node.attrs.content || '');
  }, [node.attrs.content]);

  const saveData = useCallback(() => {
    if (!meRef.current || isSaving.current) return;
    isSaving.current = true;
    try {
      const data = meRef.current.getData();
      updateAttributes({ content: JSON.stringify(data) });
    } finally {
      setTimeout(() => { isSaving.current = false; }, 100);
    }
  }, [updateAttributes]);

  // 自适应高度（不自动居中，避免抖动）
  const adjustLayout = useCallback(() => {
    const container = containerRef.current;
    const me = meRef.current;
    if (!container || !me) return;

    // 获取画布元素
    const mapCanvas = me.map;
    if (!mapCanvas) return;

    // 计算所有节点的边界（相对于画布）
    const topics = container.querySelectorAll('me-tpc');
    if (topics.length === 0) return;

    // 获取画布当前的 transform
    const transform = mapCanvas.style.transform || '';
    const match = transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
    const offsetY = match ? parseFloat(match[2]) : 0;
    const currentX = match ? parseFloat(match[1]) : 0;
    const scale = me.scaleVal || 1;

    const containerRect = container.getBoundingClientRect();
    let minRelY = Infinity, maxRelY = -Infinity;
    topics.forEach((t) => {
      const rect = (t as HTMLElement).getBoundingClientRect();
      const relY = rect.top - containerRect.top;
      const relBottom = rect.bottom - containerRect.top;
      if (relY < minRelY) minRelY = relY;
      if (relBottom > maxRelY) maxRelY = relBottom;
    });

    // 如果有内容在容器上方（minRelY < 20），需要调整画布位置
    if (minRelY < 20 && minRelY !== Infinity) {
      // 需要向下偏移，让上方内容可见
      const newOffsetY = offsetY + Math.abs(minRelY) + 40;
      mapCanvas.style.transform = `translate3d(${currentX}px, ${newOffsetY}px, 0) scale(${scale})`;
    }

    // 计算需要的高度
    const topOffset = minRelY < 0 ? Math.abs(minRelY) : 0;
    const visibleContentHeight = maxRelY + topOffset + 80;

    // 获取编辑器滚动容器
    const editorScroll = container.closest('.editor-scroll') || document.querySelector('.editor-scroll');
    const editorScrollHeight = editorScroll?.clientHeight || 600;

    // 取内容高度和编辑器可视高度的较大值
    const newHeight = Math.max(visibleContentHeight, editorScrollHeight - 100, 300);

    if (!isFullscreen) {
      container.style.height = `${newHeight}px`;
    }
  }, [isFullscreen]);

  // 初始化 mind-elixir
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    if (meRef.current) {
      meRef.current = null;
      container.innerHTML = '';
    }

    const timer = setTimeout(() => {
      const data = getData();

      const me = new MindElixir({
        el: container,
        direction: MindElixir.SIDE,
        draggable: true,
        contextMenu: true,
        toolBar: false,
        keypress: true,
        locale: 'zh_CN',
        overflowHidden: false, // 不能设为 true，会禁用所有交互（选择、拖拽等）
        handleWheel: () => {}, // 禁用 Mind Elixir 的滚轮处理（必须是空函数，false 无效），我们自己处理
        mouseSelectionButton: 0,
        theme: CUSTOM_THEME as any,
        generateMainBranch: customMainBranch as any,
        generateSubBranch: customSubBranch as any,
        before: {
          insertSibling: () => true,
          addChild: () => true,
          removeNode: () => true,
          moveNode: () => true,
        },
      });

      me.init(data);
      meRef.current = me;

      // 禁用画布拖动：覆盖 move 方法为空函数
      // 画布将固定显示，跟随编辑区滚动
      me.move = () => {};

      // 初始布局（只居中一次，后续操作不再居中）
      me.toCenter();
      adjustLayout();
      setTimeout(adjustLayout, 200);
      setTimeout(adjustLayout, 600);

      // 自动聚焦到 .map-container，启用键盘快捷键
      setTimeout(() => {
        me.container?.focus();
      }, 100);

      // 监听操作 → 自动保存 + 重新布局
      me.bus.addListener('operation', () => {
        saveData();
        setTimeout(adjustLayout, 150);
      });
    }, 80);

    return () => {
      clearTimeout(timer);
      meRef.current = null;
    };
  }, []);

  // 全屏切换
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => {
      const next = !prev;
      setTimeout(() => {
        if (meRef.current) meRef.current.toCenter();
      }, 150);
      return next;
    });
  }, []);

  // ESC 退出全屏
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
        setTimeout(() => {
          adjustLayout();
        }, 100);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullscreen, adjustLayout]);

  // 阻止 ProseMirror 拦截思维导图内的键盘事件
  // 策略：在 containerRef（包裹 .map-container 的 div）上用冒泡阶段监听
  // 事件流：capture → .map-container onkeydown（Mind Elixir 处理）→ 冒泡到此处 stopPropagation → ProseMirror 收不到
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const me = meRef.current;
      const target = e.target as HTMLElement;

      // 正在编辑节点文字时，只拦截 Tab（防止焦点跳出思维导图）
      const isEditing = target.getAttribute('contenteditable') === 'true' ||
                         target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (isEditing) {
        if (e.key === 'Tab') {
          e.stopPropagation();
          e.preventDefault();
        }
        return;
      }

      // 非编辑状态：选中节点后按空格，进入编辑模式
      if (me?.currentNode && e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        me.beginEdit(me.currentNode);
        return;
      }

      // 非编辑状态：这些键在思维导图中有特殊含义，阻止冒泡到 ProseMirror
      if (['Tab', 'Enter', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.stopPropagation();
        if (e.key === 'Tab') {
          e.preventDefault();
        }
      }
    };

    // 冒泡阶段：Mind Elixir 的 .map-container onkeydown 先执行，然后我们阻止继续冒泡
    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 滚轮事件同步：纵向 → 外部编辑器，横向 → 画布内部（类似表格）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const me = meRef.current;
      const mapCanvas = me?.map; // .map-canvas 元素

      // 找到外部编辑器的滚动容器
      const editorScroll = container.closest('.editor-scroll') ||
                           document.querySelector('.editor-scroll');

      // 纵向滚动 → 同步到外部编辑器
      if (e.deltaY !== 0 && editorScroll) {
        e.preventDefault();
        editorScroll.scrollTop += e.deltaY;
      }

      // 横向滚动 → 画布内部滚动（类似表格）
      if (e.deltaX !== 0 && mapCanvas) {
        e.preventDefault();
        // 获取当前 transform
        const transform = mapCanvas.style.transform || '';
        const match = transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
        let currentX = match ? parseFloat(match[1]) : 0;
        let currentY = match ? parseFloat(match[2]) : 0;
        let scale = me?.scaleVal || 1;

        // 更新 X 偏移
        currentX -= e.deltaX;

        // 应用新 transform
        mapCanvas.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${scale})`;
      }
    };

    // 使用 passive: false 以便能够 preventDefault
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  // 容器获得焦点时的处理 — 聚焦到 Mind Elixir 的 .map-container（键盘处理挂在那里）
  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // 聚焦到 Mind Elixir 内部的 .map-container，这样键盘快捷键才能生效
    const me = meRef.current;
    if (me?.container) {
      me.container.focus();
    }
  }, []);

  // 工具栏操作
  const addChildNode = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    const selected = me.currentNode;
    if (selected) {
      me.addChild(selected);
    }
    setTimeout(adjustLayout, 150);
  }, [adjustLayout]);

  const addSiblingNode = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    const selected = me.currentNode;
    if (selected) {
      me.insertSibling(selected);
    }
    setTimeout(adjustLayout, 150);
  }, [adjustLayout]);

  const removeNode = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    const selected = me.currentNode;
    if (selected && selected.id !== 'root') {
      me.removeNode(selected);
    }
    setTimeout(adjustLayout, 150);
  }, [adjustLayout]);

  const centerMap = useCallback(() => {
    if (meRef.current) meRef.current.toCenter();
  }, []);

  return (
    <NodeViewWrapper className="mindmap-node-view" data-drag-handle="">
      <div className={`mindmap-outer ${isFullscreen ? 'mindmap-fullscreen' : ''} ${selected ? 'mindmap-selected' : ''}`}>
        {/* Mind Elixir 容器 */}
        <div
          ref={containerRef}
          className="mindmap-container"
          tabIndex={0}
          onClick={handleContainerClick}
          onDoubleClick={(e) => {
            // 双击进入编辑模式（包括 root 节点）
            const me = meRef.current;
            if (!me) return;
            const target = e.target as HTMLElement;
            const tpc = target.closest('me-tpc') as HTMLElement | null;
            if (tpc && tpc.nodeObj) {
              e.stopPropagation();
              me.editTopic(tpc);
            }
          }}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
    </NodeViewWrapper>
  );
};
