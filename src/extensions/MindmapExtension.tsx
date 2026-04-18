import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import MindElixir from 'mind-elixir';
import 'mind-elixir/style.css';
import './MindmapExtension.css';

// Canvas 绘制圆角矩形辅助函数
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ============================================================
// 思维导图操作注册表（供外部工具栏调用）
// ============================================================

export interface MindmapActions {
  addChild: () => void;
  addSibling: () => void;
  removeSelected: () => void;
  deleteMindmap: () => void;
  toggleFullscreen: () => void;
  exportImage: () => void;
  exportMarkdown: () => void;
}

// 全局注册表：每个思维导图实例注册自己的 actions
const mindmapRegistry = new Map<string, MindmapActions>();
let registryCounter = 0;

function registerMindmap(actions: MindmapActions): string {
  const id = `mindmap-${++registryCounter}`;
  mindmapRegistry.set(id, actions);
  return id;
}

function unregisterMindmap(id: string) {
  mindmapRegistry.delete(id);
}

/** 获取当前活跃的思维导图操作（取最后一个注册的） */
export function getActiveMindmapActions(): MindmapActions | null {
  const entries = Array.from(mindmapRegistry.values());
  return entries.length > 0 ? entries[entries.length - 1] : null;
}

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

// 分支调色板
const BRANCH_PALETTE = [
  '#c0392b', '#d4a017', '#27ae60', '#2980b9',
  '#8e44ad', '#e67e22', '#16a085', '#c0392b',
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

// 自定义主题
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

// 连线样式
function customMainBranch(this: any, { pT, pL, pW, pH, cT, cL, cW, cH, direction, containerHeight }: any) {
  let x1 = pL + pW / 2;
  const y1 = pT + pH / 2;
  const x2 = direction === 'lhs' ? cL + cW : cL;
  const y2 = cT + cH / 2;
  const vr = containerHeight > 0 ? (1 - Math.abs(y2 - y1) / containerHeight) * 0.25 * (pW / 2) : 0;
  if (direction === 'lhs') { x1 = x1 - pW / 10 - vr; } else { x1 = x1 + pW / 10 + vr; }
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`;
}

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
    return ReactNodeViewRenderer(MindmapNodeView, {
      // 让 ProseMirror 不处理来自思维导图容器内的键盘/鼠标事件
      // 这样 MindElixir 可以自己处理 Enter/Tab/Space/Delete/方向键等
      stopEvent: ({ event }: { event: Event }) => {
        if (event.type !== 'keydown' && event.type !== 'keypress' && event.type !== 'mousedown' && event.type !== 'mouseup' && event.type !== 'dblclick') {
          return false;
        }
        const target = event.target as HTMLElement;
        // 如果事件目标在思维导图容器内部，阻止 ProseMirror 处理
        const mapContainer = target.closest('.mindmap-container');
        if (mapContainer) {
          return true;
        }
        return false;
      },
    });
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
// 滚动状态管理
// ============================================================

interface ScrollState {
  scrollX: number;
  scrollY: number;
  contentWidth: number;
  contentHeight: number;
  viewWidth: number;
  viewHeight: number;
}

// ============================================================
// NodeView Component
// ============================================================

const MindmapNodeView: React.FC<{
  node: any;
  updateAttributes: any;
  selected: boolean;
  deleteNode: () => void;
}> = ({ node, updateAttributes, selected, deleteNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const meRef = useRef<MindElixir | null>(null);
  const isSaving = useRef(false);
  const lastSavedContentRef = useRef('');
  const registryIdRef = useRef<string>('');
  const [scrollState, setScrollState] = useState<ScrollState>({
    scrollX: 0, scrollY: 0, contentWidth: 0, contentHeight: 0, viewWidth: 0, viewHeight: 0,
  });
  const scaleRef = useRef(1);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const scrollStateRef = useRef(scrollState);
  scrollStateRef.current = scrollState;

  // 全屏状态
  const [isFullscreen, setIsFullscreen] = useState(false);



  const saveData = useCallback(() => {
    if (!meRef.current || isSaving.current) return;
    isSaving.current = true;
    try {
      const data = meRef.current.getData();
      const newContent = JSON.stringify(data);
      lastSavedContentRef.current = newContent;
      updateAttributes({ content: newContent });
    } finally {
      setTimeout(() => { isSaving.current = false; }, 100);
    }
  }, [updateAttributes]);

  // 计算画布内容的实际边界
  const computeContentBounds = useCallback(() => {
    const container = containerRef.current;
    const me = meRef.current;
    if (!container || !me || !me.map) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    const topics = container.querySelectorAll('me-tpc');
    if (topics.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    topics.forEach((t) => {
      const rect = (t as HTMLElement).getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const scale = scaleRef.current;
      // 转换为画布坐标
      const cx = (rect.left - containerRect.left) / scale + panOffsetRef.current.x;
      const cy = (rect.top - containerRect.top) / scale + panOffsetRef.current.y;
      const cw = rect.width / scale;
      const ch = rect.height / scale;
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx + cw > maxX) maxX = cx + cw;
      if (cy + ch > maxY) maxY = cy + ch;
    });

    return { minX, minY, maxX, maxY };
  }, []);

  // 应用画布偏移到 Mind Elixir 的 map 元素（高性能，仅修改 style）
  const applyTransform = useCallback(() => {
    const me = meRef.current;
    if (!me || !me.map) return;
    const scale = scaleRef.current;
    // 取整像素值，避免亚像素渲染导致文字模糊
    const x = Math.round(panOffsetRef.current.x);
    const y = Math.round(panOffsetRef.current.y);
    me.map.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    me.map.style.transformOrigin = '0 0';
    // 同步 MindElixir 内部的 scaleVal，防止其操作时覆盖我们的缩放
    me.scaleVal = scale;
  }, []);

  // 延迟更新滚动条状态（节流，避免频繁 DOM 查询）
  const scrollRafRef = useRef(0);
  const scheduleScrollUpdate = useCallback(() => {
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const container = containerRef.current;
      if (!container) return;
      const { minX, minY, maxX, maxY } = computeContentBounds();
      const padding = 60;
      const contentWidth = (maxX - minX) + padding * 2;
      const contentHeight = (maxY - minY) + padding * 2;
      const viewWidth = container.clientWidth;
      const viewHeight = container.clientHeight;
      const scrollX = -panOffsetRef.current.x + (minX - padding);
      const scrollY = -panOffsetRef.current.y + (minY - padding);
      setScrollState({
        scrollX: Math.max(0, scrollX),
        scrollY: Math.max(0, scrollY),
        contentWidth: Math.max(contentWidth, viewWidth),
        contentHeight: Math.max(contentHeight, viewHeight),
        viewWidth,
        viewHeight,
      });
    });
  }, [computeContentBounds]);

  // 更新滚动条状态（直接调用，用于非高频场景）
  const updateScrollState = useCallback(() => {
    scheduleScrollUpdate();
  }, [scheduleScrollUpdate]);

  // 居中画布
  const centerCanvas = useCallback(() => {
    const container = containerRef.current;
    const me = meRef.current;
    if (!container || !me) return;

    me.toCenter();

    requestAnimationFrame(() => {
      if (!me.map) return;
      const transform = me.map.style.transform || '';
      const match = transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
      if (match) {
        panOffsetRef.current = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
      }
      scaleRef.current = me.scaleVal || 1;
      applyTransform();
      scheduleScrollUpdate();
    });
  }, [applyTransform, scheduleScrollUpdate]);

  // ---- 操作方法（注册到全局注册表） ----

  // 确保当前选中节点在可视区域内，如果不在则平移画布
  const ensureCurrentNodeVisible = useCallback(() => {
    const me = meRef.current;
    const container = containerRef.current;
    if (!me || !container || !me.currentNode) return;
    const tpc = me.currentNode.querySelector('me-tpc') || me.currentNode;
    const tpcRect = (tpc as HTMLElement).getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const margin = 60;
    let dx = 0, dy = 0;
    if (tpcRect.left < containerRect.left + margin) {
      dx = containerRect.left + margin - tpcRect.left;
    } else if (tpcRect.right > containerRect.right - margin) {
      dx = containerRect.right - margin - tpcRect.right;
    }
    if (tpcRect.top < containerRect.top + margin) {
      dy = containerRect.top + margin - tpcRect.top;
    } else if (tpcRect.bottom > containerRect.bottom - margin) {
      dy = containerRect.bottom - margin - tpcRect.bottom;
    }
    if (dx !== 0 || dy !== 0) {
      panOffsetRef.current.x += dx;
      panOffsetRef.current.y += dy;
      applyTransform();
      scheduleScrollUpdate();
    }
  }, [applyTransform, scheduleScrollUpdate]);

  const handleAddChild = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    if (me.currentNode?.nodeObj) {
      me.addChild();
      // 等 MindElixir 渲染完新节点后检查可见性
      requestAnimationFrame(() => { ensureCurrentNodeVisible(); });
    }
  }, [ensureCurrentNodeVisible]);

  const handleAddSibling = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    const nodeObj = me.currentNode?.nodeObj;
    if (nodeObj && nodeObj.id !== 'root') {
      me.insertSibling();
      requestAnimationFrame(() => { ensureCurrentNodeVisible(); });
    }
  }, []);

  const handleRemoveSelected = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    const nodeObj = me.currentNode?.nodeObj;
    if (nodeObj && nodeObj.id !== 'root') me.removeNode();
  }, []);

  const handleDeleteMindmap = useCallback(() => {
    if (window.confirm('确定要删除这个思维导图吗？')) {
      deleteNode();
    }
  }, [deleteNode]);

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  // 导出为图片（Canvas 手动绘制，避免 html2canvas 对 Web Components 渲染差的问题）
  const handleExportImage = useCallback(async () => {
    const me = meRef.current;
    const container = containerRef.current;
    if (!me || !container) return;
    const data = me.getData();
    if (!data?.nodeData) return;

    try {
      // 收集所有节点信息
      interface NodeInfo {
        x: number; y: number; w: number; h: number;
        lines: string[]; // 多行文本
        bgColor: string; borderColor: string; textColor: string;
        isRoot: boolean; fontSize: number; fontWeight: string;
        branchColor: string; level: number; hasBorder: boolean;
      }
      const nodeInfos: NodeInfo[] = [];
      const containerRect = container.getBoundingClientRect();
      const scale = scaleRef.current;
      const pan = panOffsetRef.current;

      // 构建分支颜色映射：从 nodeObj.branchColor 读取（一级子节点设定颜色，子树继承）
      // 先从数据模型构建 nodeId → branchColor 的映射
      const nodeColorMap = new Map<string, string>();
      const buildColorMap = (node: any, inheritedColor: string) => {
        const color = node.branchColor || inheritedColor;
        nodeColorMap.set(node.id, color);
        if (node.children) {
          node.children.forEach((child: any) => buildColorMap(child, color));
        }
      };
      // 根节点不设颜色，一级子节点各自有 branchColor
      if (data.nodeData.children) {
        data.nodeData.children.forEach((child: any) => buildColorMap(child, ''));
      }

      // 需要一个临时 Canvas 来测量文字宽度（用于多行文本的高度重算）
      const measureCanvas = document.createElement('canvas');
      const measureCtx = measureCanvas.getContext('2d')!;
      const fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif';

      const topics = container.querySelectorAll('me-tpc');
      topics.forEach((tpc) => {
        const el = tpc as HTMLElement;
        const r = el.getBoundingClientRect();
        let x = (r.left - containerRect.left - pan.x) / scale;
        let y = (r.top - containerRect.top - pan.y) / scale;
        let w = r.width / scale;
        let h = r.height / scale;
        const isRoot = !!el.closest('me-root');

        // 从数据模型计算节点层级（DOM 的 closest('me-main') 不可靠，子节点也在 me-main 内）
        const nodeObj = (el as any).nodeObj;
        let level = 0;
        {
          let p = nodeObj?.parent;
          while (p) { level++; p = p.parent; }
        }
        // level: 0=root, 1=一级, 2=二级, 3+=三级及以下
        const isMain = level === 1;
        const fontSize = isRoot ? 17 : (isMain ? 16 : 14);
        const fontWeight = isRoot ? '700' : (isMain ? '600' : '400');

        // 从 nodeObj 读取分支色
        const nodeId = nodeObj?.id || '';
        const branchColor = nodeColorMap.get(nodeId) || nodeObj?.branchColor || '#94a3b8';

        // 提取多行文本：优先从 nodeObj.topic 读取（保留 \n）
        const lines: string[] = [];
        const topic = nodeObj?.topic || '';
        if (topic.includes('\n')) {
          lines.push(...topic.split('\n'));
        } else {
          lines.push(topic || '');
        }
        if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
          // fallback 到 DOM 文本
          const textSpan = el.querySelector('span.text') as HTMLElement | null;
          lines[0] = textSpan?.textContent?.trim() || el.textContent?.trim() || '';
        }

        // 如果有多行文本，需要重新计算节点高度（DOM 渲染不显示换行，高度不准确）
        if (lines.length > 1) {
          measureCtx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
          const lineHeight = fontSize * 1.5;
          const paddingV = isRoot ? 12 : 8; // 上下内边距
          const paddingH = isRoot ? 20 : 14; // 左右内边距
          // 计算最大行宽
          let maxLineWidth = 0;
          lines.forEach(line => {
            const measured = measureCtx.measureText(line).width;
            if (measured > maxLineWidth) maxLineWidth = measured;
          });
          // 用计算出的尺寸覆盖 DOM 尺寸
          w = Math.max(w, maxLineWidth + paddingH * 2);
          h = Math.max(h, lines.length * lineHeight + paddingV * 2);
        }

        // 颜色
        const nodeStyle = nodeObj?.style || {};
        let bgColor = nodeStyle.background || nodeStyle.backgroundColor || '#ffffff';
        let borderColor = nodeStyle['border-color'] || '';
        let textColor = nodeStyle.color || '#333333';
        const hasBorder = true; // 是否绘制边框

        if (isRoot) {
          bgColor = '#2c3e50';
          borderColor = '#1a252f';
          textColor = '#ffffff';
        } else if (level === 1) {
          // 一级节点：分支色边框
          borderColor = branchColor;
          bgColor = '#ffffff';
        } else {
          // 二级及以下：无边框
          bgColor = '#f8fafc';
          textColor = '#475569';
          borderColor = 'transparent';
        }

        nodeInfos.push({ x, y, w, h, lines, bgColor, borderColor, textColor, isRoot, fontSize, fontWeight, branchColor, level, hasBorder: isRoot || level === 1 });
      });

      // 移除调试日志，保留 nodeInfos 后续使用

      if (nodeInfos.length === 0) {
        alert('没有找到可导出的节点');
        return;
      }

      // 计算内容边界
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      nodeInfos.forEach(n => {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x + n.w > maxX) maxX = n.x + n.w;
        if (n.y + n.h > maxY) maxY = n.y + n.h;
      });

      const padding = 40;
      const imgW = Math.max(100, (maxX - minX) + padding * 2);
      const imgH = Math.max(100, (maxY - minY) + padding * 2);
      const dpr = 2;

      const canvas = document.createElement('canvas');
      canvas.width = imgW * dpr;
      canvas.height = imgH * dpr;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);

      // 白色背景
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, imgW, imgH);

      // 绘制连线（从 SVG 元素提取，保留颜色）
      const svgEls = container.querySelectorAll('svg');
      svgEls.forEach((svgEl) => {
        const svgRect = svgEl.getBoundingClientRect();
        const svgOffX = (svgRect.left - containerRect.left - pan.x) / scale - minX + padding;
        const svgOffY = (svgRect.top - containerRect.top - pan.y) / scale - minY + padding;

        svgEl.querySelectorAll('path').forEach((path) => {
          const d = path.getAttribute('d');
          if (!d) return;
          // 获取 path 的实际颜色
          const computedStroke = getComputedStyle(path).stroke;
          let strokeColor = path.getAttribute('stroke') || '';
          if (!strokeColor || strokeColor === 'none') {
            strokeColor = path.style.stroke || '';
          }
          if (!strokeColor || strokeColor === 'none') {
            strokeColor = computedStroke || '#94a3b8';
          }
          // getComputedStyle 可能返回 rgb(...) 格式，确保有效
          if (strokeColor === 'none' || strokeColor === '') {
            strokeColor = '#94a3b8';
          }
          const lineWidth = parseFloat(path.getAttribute('stroke-width') || path.style.strokeWidth || '2');

          ctx.save();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = Math.max(1, lineWidth / scale);
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.translate(svgOffX, svgOffY);
          try {
            const p = new Path2D(d);
            ctx.stroke(p);
          } catch (pathErr) {
            console.warn('Path2D 绘制失败:', pathErr);
          }
          ctx.restore();
        });
      });

      // 绘制节点
      nodeInfos.forEach(n => {
        const dx = n.x - minX + padding;
        const dy = n.y - minY + padding;

        // 背景圆角矩形
        ctx.fillStyle = n.bgColor;
        const radius = n.isRoot ? 8 : (n.hasBorder ? 6 : 4);
        roundRect(ctx, dx, dy, n.w, n.h, radius);
        ctx.fill();

        // 只对 root 和一级节点画边框
        if (n.hasBorder) {
          ctx.strokeStyle = n.borderColor;
          ctx.lineWidth = n.isRoot ? 3 : 1.5;
          roundRect(ctx, dx, dy, n.w, n.h, radius);
          ctx.stroke();
        }

        // 多行文字
        ctx.fillStyle = n.textColor;
        ctx.font = `${n.fontWeight} ${n.fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const lineHeight = n.fontSize * 1.5;
        const totalTextHeight = n.lines.length * lineHeight;
        const startTextY = dy + (n.h - totalTextHeight) / 2 + lineHeight / 2;
        n.lines.forEach((line, i) => {
          ctx.fillText(line, dx + n.w / 2, startTextY + i * lineHeight);
        });
      });

      // 下载
      const link = document.createElement('a');
      link.download = `mindmap-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('导出图片失败:', err);
      alert('导出图片失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  // 导出为 Markdown
  const handleExportMarkdown = useCallback(() => {
    const me = meRef.current;
    if (!me) return;
    const data = me.getData();
    if (!data?.nodeData) return;

    const convertNodeToMd = (node: MindElixirNodeData, level: number): string => {
      const indent = '#'.repeat(Math.min(level, 6));
      let md = `${indent} ${node.topic || '无标题'}\n\n`;
      if (node.children) {
        node.children.forEach(child => { md += convertNodeToMd(child, level + 1); });
      }
      return md;
    };

    const markdown = convertNodeToMd(data.nodeData, 1);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.download = `mindmap-${Date.now()}.md`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  // 注册/注销到全局注册表
  useEffect(() => {
    registryIdRef.current = registerMindmap({
      addChild: handleAddChild,
      addSibling: handleAddSibling,
      removeSelected: handleRemoveSelected,
      deleteMindmap: handleDeleteMindmap,
      toggleFullscreen,
      exportImage: handleExportImage,
      exportMarkdown: handleExportMarkdown,
    });
    return () => {
      if (registryIdRef.current) unregisterMindmap(registryIdRef.current);
    };
  }, [handleAddChild, handleAddSibling, handleRemoveSelected, handleDeleteMindmap, toggleFullscreen, handleExportImage, handleExportMarkdown]);

  // 全屏模式 ESC 退出
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setIsFullscreen(false); }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isFullscreen]);

  // 全屏时调整画布高度
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (isFullscreen) {
      container.style.height = '100vh';
    } else {
      // 非全屏模式：高度由 CSS 控制，清除 JS 设置的 inline style
      container.style.height = '';
    }
    setTimeout(() => { centerCanvas(); }, 100);
  }, [isFullscreen, centerCanvas]);

  // 初始化 MindElixir（首次挂载 + content 变化时 refresh）
  const lastContentRef = useRef('');
  useEffect(() => {
    const currentContent = node.attrs.content || '';
    const me = meRef.current;

    // 如果已有实例且 content 变了（页面切换），refresh 即可
    if (me && lastContentRef.current && currentContent !== lastContentRef.current) {
      // 排除自己保存触发的变化：直接比较 content 是否等于上次保存的值
      if (currentContent === lastSavedContentRef.current) {
        // 自己保存的，只更新 lastContentRef，不 refresh/centerCanvas
      } else {
        // 外部 content 变化（如页面切换），需要 refresh
        const data = normalizeData(currentContent);
        scaleRef.current = 1;
        panOffsetRef.current = { x: 0, y: 0 };
        me.refresh(data);
        setTimeout(() => { centerCanvas(); }, 150);
      }
      lastContentRef.current = currentContent;
      return;
    }
    lastContentRef.current = currentContent;

    if (!containerRef.current) return;
    const container = containerRef.current;

    if (me) {
      // 销毁旧实例
      if ((me as any)._customWheelHandler && (me as any)._customWheelContainer) {
        (me as any)._customWheelContainer.removeEventListener('wheel', (me as any)._customWheelHandler, { capture: true });
      }
      meRef.current = null;
      container.innerHTML = '';
    }

    const timer = setTimeout(() => {
      const data = normalizeData(currentContent);

      // 确保容器高度由 CSS 控制（全屏模式下会由 fullscreen effect 设置 inline style）
      container.style.height = '';

      const newMe = new MindElixir({
        el: container,
        direction: MindElixir.SIDE,
        draggable: true,
        contextMenu: true,
        toolBar: false,
        keypress: true,
        locale: 'zh_CN',
        overflowHidden: false,
        handleWheel: () => {},
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

      newMe.init(data);
      meRef.current = newMe;
      lastSavedContentRef.current = currentContent;

      // 将默认主题名改为中文
      (newMe as any).newTopicName = '新节点';

      // 禁用 Mind Elixir 的画布拖动
      newMe.move = () => {};

      // 注册自定义 wheel handler
      const mapContainer = newMe.container;
      if (mapContainer) {
        // 累积量方案区分鼠标滚轮和触控板
        // 鼠标滚轮（即使经 MOS 平滑化）在短时间内累积量大；触控板累积量小
        const wheelAccum = { totalY: 0, lastTime: 0 };

        const doZoom = (clientX: number, clientY: number, deltaY: number, step: number) => {
          const isZoomIn = deltaY < 0;
          const scaleFactor = isZoomIn ? step : 1 / step;
          let newScale = scaleRef.current * scaleFactor;
          newScale = Math.max(0.1, Math.min(5, newScale));
          if (Math.abs(newScale - scaleRef.current) < 0.001) return;

          const rect = container.getBoundingClientRect();
          const mouseX = clientX - rect.left;
          const mouseY = clientY - rect.top;
          const oldScale = scaleRef.current;
          const canvasX = (mouseX - panOffsetRef.current.x) / oldScale;
          const canvasY = (mouseY - panOffsetRef.current.y) / oldScale;

          scaleRef.current = newScale;
          panOffsetRef.current.x = mouseX - canvasX * newScale;
          panOffsetRef.current.y = mouseY - canvasY * newScale;

          applyTransform();
          scheduleScrollUpdate();
        };

        const doPan = (rawDeltaX: number, rawDeltaY: number, shiftKey: boolean) => {
          let dx = rawDeltaX;
          let dy = rawDeltaY;
          if (shiftKey) { dx = dy; dy = 0; }
          panOffsetRef.current.x -= dx;
          panOffsetRef.current.y -= dy;
          applyTransform();
          scheduleScrollUpdate();
        };

        const customWheelHandler = (e: WheelEvent) => {
          if (!newMe.map) return;
          e.preventDefault();
          e.stopPropagation();

          const now = Date.now();

          if (e.ctrlKey || e.metaKey) {
            // 触控板 pinch → 缩放
            const rawDelta = e.deltaY;
            if (rawDelta === 0) return;
            const isZoomIn = rawDelta < 0;
            const scaleFactor = isZoomIn ? 1.015 : 1 / 1.015;
            let newScale = scaleRef.current * scaleFactor;
            newScale = Math.max(0.1, Math.min(5, newScale));
            if (Math.abs(newScale - scaleRef.current) < 0.001) return;

            const rect = container.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const oldScale = scaleRef.current;
            const canvasX = (mouseX - panOffsetRef.current.x) / oldScale;
            const canvasY = (mouseY - panOffsetRef.current.y) / oldScale;

            scaleRef.current = newScale;
            panOffsetRef.current.x = mouseX - canvasX * newScale;
            panOffsetRef.current.y = mouseY - canvasY * newScale;

            applyTransform();
            scheduleScrollUpdate();
            return;
          }

          // 非 ctrlKey：需要区分鼠标滚轮和触控板双指滑动
          const rawDeltaY = e.deltaY;
          const rawDeltaX = e.deltaX;
          const absDeltaY = Math.abs(rawDeltaY);

          // 快速判断：deltaY 绝对值很大 → 肯定是鼠标滚轮（未平滑化）
          if (absDeltaY > 50) {
            wheelAccum.totalY = 0;
            doZoom(e.clientX, e.clientY, rawDeltaY, 1.05);
            return;
          }

          // 累积量判断：120ms 窗口内累积 deltaY 判断输入类型
          if (now - wheelAccum.lastTime > 120) {
            // 新的滚动序列，重置累积
            wheelAccum.totalY = 0;
          }
          wheelAccum.lastTime = now;
          wheelAccum.totalY += absDeltaY;

          // 鼠标滚轮：短时间累积量大（即使 MOS 平滑化，120ms 内也能累积到 50+）
          // 触控板双指：短时间累积量小（通常 < 30）
          const isMouseWheel = wheelAccum.totalY > 40;

          if (isMouseWheel) {
            doZoom(e.clientX, e.clientY, rawDeltaY, 1.05);
          } else {
            doPan(rawDeltaX, rawDeltaY, e.shiftKey);
          }
        };

        mapContainer.addEventListener('wheel', customWheelHandler, { capture: true, passive: false });
        (newMe as any)._customWheelHandler = customWheelHandler;
        (newMe as any)._customWheelContainer = mapContainer;
      }

      // 居中
      setTimeout(() => { centerCanvas(); }, 150);
      setTimeout(() => { newMe.container?.focus(); }, 100);

      // 监听操作 → 防抖保存 + 更新滚动条
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      newMe.bus.addListener('operation', () => {
        // 立即更新滚动条（节流）
        updateScrollState();
        // 防抖保存：500ms 内无新操作才保存，避免频繁 React 重渲染导致跳动
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          saveTimer = null;
          saveData();
        }, 500);
      });
    }, 80);

    return () => {
      clearTimeout(timer);
      const oldMe = meRef.current;
      if (oldMe) {
        // 清理自定义 wheel handler
        if ((oldMe as any)._customWheelHandler && (oldMe as any)._customWheelContainer) {
          (oldMe as any)._customWheelContainer.removeEventListener('wheel', (oldMe as any)._customWheelHandler, { capture: true });
          delete (oldMe as any)._customWheelHandler;
          delete (oldMe as any)._customWheelContainer;
        }
        // 调用 MindElixir destroy 清理键盘/上下文菜单/undo 等事件监听
        try { oldMe.destroy(); } catch {}
        meRef.current = null;
      }
    };
  }, [node.attrs.content]);

  // 键盘事件拦截
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const me = meRef.current;
      const target = e.target as HTMLElement;
      const isEditing = target.getAttribute('contenteditable') === 'true' ||
                         target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (isEditing) {
        if (e.key === 'Tab') { e.stopPropagation(); e.preventDefault(); }
        return;
      }

      if (me?.currentNode && e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault(); e.stopPropagation();
        me.beginEdit(me.currentNode);
        return;
      }

      if (['Tab', 'Enter', 'Delete', 'Backspace', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.stopPropagation();
        if (e.key === 'Tab') e.preventDefault();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 鼠标中键按住拖拽平移画布
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isPanning = false;
    let lastX = 0;
    let lastY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        isPanning = true;
        lastX = e.clientX;
        lastY = e.clientY;
        container.style.cursor = 'grabbing';
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      panOffsetRef.current.x += dx;
      panOffsetRef.current.y += dy;
      applyTransform();
      // 拖拽中不更新滚动条，避免卡顿
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isPanning) return;
      if (e.button === 1) {
        isPanning = false;
        container.style.cursor = '';
        // 拖拽结束后更新滚动条
        scheduleScrollUpdate();
      }
    };

    const handleAuxClick = (e: MouseEvent) => {
      if (e.button === 1) e.preventDefault();
    };

    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('auxclick', handleAuxClick);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      container.removeEventListener('mousedown', handleMouseDown);
      container.removeEventListener('auxclick', handleAuxClick);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [applyTransform, scheduleScrollUpdate]);

  // 滚动条拖拽
  const handleScrollbarDrag = useCallback((axis: 'x' | 'y', e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startClient = axis === 'x' ? e.clientX : e.clientY;
    const startScroll = axis === 'x' ? scrollStateRef.current.scrollX : scrollStateRef.current.scrollY;
    const contentSize = axis === 'x' ? scrollStateRef.current.contentWidth : scrollStateRef.current.contentHeight;
    const viewSize = axis === 'x' ? scrollStateRef.current.viewWidth : scrollStateRef.current.viewHeight;

    const handleMove = (moveEvent: MouseEvent) => {
      const delta = axis === 'x' ? moveEvent.clientX - startClient : moveEvent.clientY - startClient;
      const newScroll = Math.max(0, Math.min(contentSize - viewSize, startScroll + delta));
      const scrollDelta = newScroll - startScroll;

      if (axis === 'x') {
        panOffsetRef.current.x -= scrollDelta;
      } else {
        panOffsetRef.current.y -= scrollDelta;
      }
      applyTransform();
    };

    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };

    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [applyTransform]);

  // 点击滚动条轨道跳转
  const handleTrackClick = useCallback((axis: 'x' | 'y', e: React.MouseEvent) => {
    e.stopPropagation();
    const container = containerRef.current;
    if (!container) return;

    const ss = scrollStateRef.current;
    const pageSize = axis === 'x' ? ss.viewWidth : ss.viewHeight;
    const clickPos = axis === 'x' ? e.nativeEvent.offsetX : e.nativeEvent.offsetY;

    const currentScroll = axis === 'x' ? ss.scrollX : ss.scrollY;
    const newScroll = clickPos < currentScroll
      ? Math.max(0, currentScroll - pageSize)
      : Math.min(ss.contentWidth - ss.viewWidth, currentScroll + pageSize);
    const delta = newScroll - currentScroll;

    if (axis === 'x') {
      panOffsetRef.current.x -= delta;
    } else {
      panOffsetRef.current.y -= delta;
    }
    applyTransform();
  }, [applyTransform]);

  // 容器 pointerdown：聚焦画布（不阻止冒泡，让 MindElixir 内置框选器正常工作）
  const handleContainerPointerDown = useCallback((e: React.PointerEvent) => {
    const me = meRef.current;
    if (me?.container) me.container.focus();
  }, []);

  // 渲染滚动条
  const renderScrollbar = (axis: 'x' | 'y') => {
    const ss = scrollState;
    const isX = axis === 'x';
    const contentSize = isX ? ss.contentWidth : ss.contentHeight;
    const viewSize = isX ? ss.viewWidth : ss.viewHeight;
    if (contentSize <= viewSize) return null;

    const ratio = viewSize / contentSize;
    const thumbSize = Math.max(30, viewSize * ratio);
    const maxScroll = contentSize - viewSize;
    const scroll = isX ? ss.scrollX : ss.scrollY;
    const thumbOffset = maxScroll > 0 ? (scroll / maxScroll) * (viewSize - thumbSize) : 0;

    return (
      <div
        className={`mindmap-scrollbar-track mindmap-scrollbar-${axis}`}
        onClick={(e) => handleTrackClick(axis, e)}
      >
        <div
          className="mindmap-scrollbar-thumb"
          style={isX
            ? { width: thumbSize, transform: `translateX(${thumbOffset}px)` }
            : { height: thumbSize, transform: `translateY(${thumbOffset}px)` }
          }
          onMouseDown={(e) => handleScrollbarDrag(axis, e)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  };

  return (
    <NodeViewWrapper className="mindmap-node-view" data-drag-handle="">
      <div
        className={`mindmap-outer ${selected ? 'mindmap-selected' : ''} ${isFullscreen ? 'mindmap-fullscreen' : ''}`}
      >
        {/* 画布区域（含滚动条） */}
        <div className="mindmap-canvas-wrapper">
          <div
            ref={containerRef}
            className="mindmap-container"
            tabIndex={0}
            onPointerDown={handleContainerPointerDown}
            onDoubleClick={(e) => {
              const me = meRef.current;
              if (!me) return;
              const target = e.target as HTMLElement;
              const tpc = target.closest('me-tpc') as HTMLElement | null;
              if (tpc && tpc.nodeObj) {
                e.stopPropagation();
                me.editTopic(tpc);
              }
            }}
          />
          {/* 纵向滚动条 */}
          {renderScrollbar('y')}
          {/* 横向滚动条 */}
          {renderScrollbar('x')}
        </div>
      </div>
    </NodeViewWrapper>
  );
};
