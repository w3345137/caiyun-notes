import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Trash2, Edit3, Check, X, Move, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface MindmapNode {
  id: string;
  text: string;
  children: MindmapNode[];
  x: number;
  y: number;
  color: string;
}

interface MindmapEditorProps {
  content: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

const NODE_COLORS = [
  '#4a90e2', '#e54d4d', '#57b894', '#f7c948', '#9c27b0', '#ff9800',
  '#00bcd4', '#e91e63', '#8bc34a', '#3f51b5', '#ff5722', '#607d8b'
];

const generateId = () => `node-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

const createNode = (text: string, x: number, y: number, color?: string): MindmapNode => ({
  id: generateId(),
  text,
  children: [],
  x,
  y,
  color: color || NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)]
});

const parseContent = (content: string): MindmapNode[] => {
  if (!content) {
    const center = createNode('中心主题', 400, 300);
    const child1 = createNode('分支主题 1', 600, 200);
    const child2 = createNode('分支主题 2', 600, 400);
    center.children.push(child1, child2);
    return [center];
  }

  try {
    const data = JSON.parse(content);
    return data;
  } catch {
    const center = createNode('中心主题', 400, 300);
    return [center];
  }
};

const serializeContent = (nodes: MindmapNode[]): string => {
  return JSON.stringify(nodes);
};

export const MindmapEditor: React.FC<MindmapEditorProps> = ({ content, onSave, onCancel }) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<MindmapNode[]>(() => parseContent(content));
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [dragging, setDragging] = useState<{ nodeId: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState<{ startX: number; startY: number; panStartX: number; panStartY: number } | null>(null);

  const updateNodePosition = useCallback((nodeId: string, x: number, y: number) => {
    const updateNode = (nodes: MindmapNode[]): MindmapNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, x, y };
        }
        if (node.children.length > 0) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });
    };
    setNodes(prev => updateNode(prev));
  }, []);

  const findNode = useCallback((nodeId: string): MindmapNode | null => {
    const search = (nodes: MindmapNode[]): MindmapNode | null => {
      for (const node of nodes) {
        if (node.id === nodeId) return node;
        const found = search(node.children);
        if (found) return found;
      }
      return null;
    };
    return search(nodes);
  }, [nodes]);

  const deleteNode = useCallback((nodeId: string) => {
    const deleteFromNodes = (nodes: MindmapNode[]): MindmapNode[] => {
      return nodes
        .filter(node => node.id !== nodeId)
        .map(node => ({
          ...node,
          children: deleteFromNodes(node.children)
        }));
    };
    setNodes(deleteFromNodes);
    setSelectedNode(null);
  }, []);

  const addChildNode = useCallback((parentId: string) => {
    const parent = findNode(parentId);
    if (!parent) return;

    const childCount = parent.children.length;
    const offsetAngle = ((childCount - (parent.children.length) / 2) * 45);
    const angle = -90 + offsetAngle;
    const distance = 150;
    const newX = parent.x + Math.cos(angle * Math.PI / 180) * distance;
    const newY = parent.y + Math.sin(angle * Math.PI / 180) * distance;

    const newChild: MindmapNode = {
      ...createNode('新主题', newX, newY),
      color: NODE_COLORS[Math.floor(Math.random() * NODE_COLORS.length)]
    };

    const addChild = (nodes: MindmapNode[]): MindmapNode[] => {
      return nodes.map(node => {
        if (node.id === parentId) {
          return { ...node, children: [...node.children, newChild] };
        }
        return { ...node, children: addChild(node.children) };
      });
    };

    setNodes(addChild);
    setSelectedNode(newChild.id);
    setEditingNode(newChild.id);
    setEditText(newChild.text);
  }, [findNode]);

  const updateNodeText = useCallback((nodeId: string, text: string) => {
    const updateNode = (nodes: MindmapNode[]): MindmapNode[] => {
      return nodes.map(node => {
        if (node.id === nodeId) {
          return { ...node, text };
        }
        return { ...node, children: updateNode(node.children) };
      });
    };
    setNodes(prev => updateNode(prev));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = findNode(nodeId);
    if (!node) return;

    setSelectedNode(nodeId);
    setDragging({
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: node.x,
      offsetY: node.y
    });
  }, [findNode]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === canvasRef.current) {
      setSelectedNode(null);
      setDragging(null);
      setPanning({
        startX: e.clientX,
        startY: e.clientY,
        panStartX: pan.x,
        panStartY: pan.y
      });
    }
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const dx = (e.clientX - dragging.startX) / zoom;
      const dy = (e.clientY - dragging.startY) / zoom;
      updateNodePosition(dragging.nodeId, dragging.offsetX + dx, dragging.offsetY + dy);
    }
    if (panning) {
      const dx = e.clientX - panning.startX;
      const dy = e.clientY - panning.startY;
      setPan({
        x: panning.panStartX + dx,
        y: panning.panStartY + dy
      });
    }
  }, [dragging, panning, zoom, updateNodePosition]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setPanning(null);
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = findNode(nodeId);
    if (node) {
      setEditingNode(nodeId);
      setEditText(node.text);
    }
  }, [findNode]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditText(e.target.value);
  }, []);

  const handleTextSave = useCallback(() => {
    if (editingNode && editText.trim()) {
      updateNodeText(editingNode, editText.trim());
    }
    setEditingNode(null);
    setEditText('');
  }, [editingNode, editText, updateNodeText]);

  const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTextSave();
    } else if (e.key === 'Escape') {
      setEditingNode(null);
      setEditText('');
    }
  }, [handleTextSave]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.min(Math.max(prev * delta, 0.3), 3));
    }
  }, []);

  const handleSave = useCallback(() => {
    onSave(serializeContent(nodes));
  }, [nodes, onSave]);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const renderConnections = (nodes: MindmapNode[], parentX?: number, parentY?: number): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];

    for (const node of nodes) {
      if (parentX !== undefined && parentY !== undefined) {
        elements.push(
          <line
            key={`line-${parentX}-${parentY}-${node.x}-${node.y}`}
            x1={parentX}
            y1={parentY}
            x2={node.x}
            y2={node.y}
            stroke={node.color}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      }
      elements.push(...renderConnections(node.children, node.x, node.y));
    }

    return elements;
  };

  const renderNodes = (nodes: MindmapNode[]): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];

    for (const node of nodes) {
      elements.push(
        <g key={node.id}>
          {/* 节点 */}
          <foreignObject
            x={node.x - 75}
            y={node.y - 20}
            width={150}
            height={50}
            onMouseDown={(e) => handleMouseDown(e as unknown as React.MouseEvent, node.id)}
            onDoubleClick={(e) => handleDoubleClick(e as unknown as React.MouseEvent, node.id)}
            style={{ cursor: dragging?.nodeId === node.id ? 'grabbing' : 'grab' }}
          >
            <div
              className={`flex items-center justify-center h-full px-3 py-2 rounded-full shadow-md transition-all select-none ${
                selectedNode === node.id ? 'ring-2 ring-offset-2 scale-110' : ''
              }`}
              style={{
                backgroundColor: node.color,
                color: 'white',
                minWidth: '100px',
                textAlign: 'center'
              }}
            >
              {editingNode === node.id ? (
                <input
                  type="text"
                  value={editText}
                  onChange={handleTextChange}
                  onKeyDown={handleTextKeyDown}
                  onBlur={handleTextSave}
                  autoFocus
                  className="w-full bg-transparent text-center text-white outline-none"
                />
              ) : (
                <span className="text-sm font-medium truncate block">{node.text}</span>
              )}
            </div>
          </foreignObject>

          {/* 操作按钮 */}
          {selectedNode === node.id && !editingNode && (
            <>
              <circle
                cx={node.x + 70}
                cy={node.y - 15}
                r={12}
                fill="#10b981"
                className="cursor-pointer"
                onClick={() => addChildNode(node.id)}
              >
                <title>添加子节点</title>
              </circle>
              <text
                x={node.x + 70}
                y={node.y - 11}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                className="pointer-events-none"
              >+</text>

              {nodes.filter(n => n.id !== node.id).length > 0 || node.children.length > 0 ? (
                <>
                  <circle
                    cx={node.x - 70}
                    cy={node.y - 15}
                    r={12}
                    fill="#ef4444"
                    className="cursor-pointer"
                    onClick={() => deleteNode(node.id)}
                  >
                    <title>删除节点</title>
                  </circle>
                  <text
                    x={node.x - 70}
                    y={node.y - 11}
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                    className="pointer-events-none"
                  >×</text>
                </>
              ) : null}
            </>
          )}
        </g>
      );
      elements.push(...renderNodes(node.children));
    }

    return elements;
  };

  // 获取所有连接线
  const getAllConnections = (): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];

    const traverse = (nodes: MindmapNode[], parent?: MindmapNode) => {
      for (const node of nodes) {
        if (parent) {
          elements.push(
            <path
              key={`path-${parent.id}-${node.id}`}
              d={`M ${parent.x} ${parent.y} Q ${(parent.x + node.x) / 2} ${(parent.y + node.y) / 2 + (node.y > parent.y ? 20 : -20)} ${node.x} ${node.y}`}
              stroke={node.color}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
          );
        }
        traverse(node.children, node);
      }
    };

    traverse(nodes);
    return elements;
  };

  return (
    <div className="bg-white rounded-xl shadow-2xl w-[90vw] h-[85vh] max-w-6xl overflow-hidden flex flex-col">
      {/* 顶部工具栏 */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50 flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-gray-800">思维导图</h3>
          <p className="text-sm text-gray-500 mt-0.5">双击节点编辑文本，拖拽移动节点</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
            title="重置视图"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setZoom(prev => Math.min(prev * 0.9, 3))}
              className="p-2 hover:bg-white rounded transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="px-2 text-sm font-medium text-gray-600 min-w-[50px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom(prev => Math.max(prev * 1.1, 0.3))}
              className="p-2 hover:bg-white rounded transition-colors"
              title="放大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 画布区域 */}
      <div
        ref={canvasRef}
        className="flex-1 overflow-hidden bg-[radial-gradient(circle_at_center,#f8fafc_0%,#e2e8f0_100%)] cursor-grab active:cursor-grabbing relative"
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg
          width="100%"
          height="100%"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center'
          }}
        >
          {/* 连接线 */}
          {getAllConnections()}

          {/* 节点 */}
          {nodes.map(node => (
            <g key={node.id}>
              {/* 节点背景 */}
              <ellipse
                cx={node.x}
                cy={node.y}
                rx={80}
                ry={30}
                fill={node.color}
                filter="url(#shadow)"
                className="cursor-grab"
                onMouseDown={(e) => handleMouseDown(e as unknown as React.MouseEvent, node.id)}
                onDoubleClick={(e) => handleDoubleClick(e as unknown as React.MouseEvent, node.id)}
                style={{ cursor: dragging?.nodeId === node.id ? 'grabbing' : 'grab' }}
              />

              {/* 节点文字 */}
              <text
                x={node.x}
                y={node.y + 5}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="500"
                className="pointer-events-none select-none"
              >
                {editingNode === node.id ? '' : node.text.length > 10 ? node.text.slice(0, 10) + '...' : node.text}
              </text>

              {/* 编辑输入框 */}
              {editingNode === node.id && (
                <foreignObject
                  x={node.x - 80}
                  y={node.y - 15}
                  width={160}
                  height={40}
                >
                  <input
                    type="text"
                    value={editText}
                    onChange={handleTextChange}
                    onKeyDown={handleTextKeyDown}
                    onBlur={handleTextSave}
                    autoFocus
                    className="w-full h-full px-3 py-2 text-center text-sm rounded-full bg-transparent text-white border-2 border-white/50 focus:border-white outline-none"
                  />
                </foreignObject>
              )}

              {/* 选中状态 */}
              {selectedNode === node.id && !editingNode && (
                <>
                  {/* 添加子节点按钮 */}
                  <g
                    className="cursor-pointer"
                    onClick={() => addChildNode(node.id)}
                  >
                    <circle cx={node.x + 85} cy={node.y} r={14} fill="#10b981" filter="url(#shadow)" />
                    <text x={node.x + 85} y={node.y + 5} textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">+</text>
                    <title>添加子节点</title>
                  </g>

                  {/* 删除节点按钮 */}
                  {nodes.length > 1 || node.children.length > 0 ? (
                    <g
                      className="cursor-pointer"
                      onClick={() => deleteNode(node.id)}
                    >
                      <circle cx={node.x - 85} cy={node.y} r={14} fill="#ef4444" filter="url(#shadow)" />
                      <text x={node.x - 85} y={node.y + 5} textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">×</text>
                      <title>删除节点</title>
                    </g>
                  ) : null}
                </>
              )}

              {/* 递归渲染子节点 */}
              {node.children.map(child => {
                const dx = child.x - node.x;
                const dy = child.y - node.y;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;

                return (
                  <g key={child.id}>
                    {/* 连接线 */}
                    <path
                      d={`M ${node.x + Math.cos(Math.atan2(dy, dx)) * 80} ${node.y + Math.sin(Math.atan2(dy, dx)) * 30} Q ${(node.x + child.x) / 2} ${(node.y + child.y) / 2 + (child.y > node.y ? 30 : -30)} ${child.x - Math.cos(Math.atan2(dy, dx)) * 80} ${child.y - Math.sin(Math.atan2(dy, dx)) * 30}`}
                      stroke={child.color}
                      strokeWidth={2}
                      fill="none"
                      strokeLinecap="round"
                    />

                    {/* 子节点背景 */}
                    <ellipse
                      cx={child.x}
                      cy={child.y}
                      rx={70}
                      ry={25}
                      fill={child.color}
                      filter="url(#shadow)"
                      className="cursor-grab"
                      onMouseDown={(e) => handleMouseDown(e as unknown as React.MouseEvent, child.id)}
                      onDoubleClick={(e) => handleDoubleClick(e as unknown as React.MouseEvent, child.id)}
                      style={{ cursor: dragging?.nodeId === child.id ? 'grabbing' : 'grab' }}
                    />

                    {/* 子节点文字 */}
                    <text
                      x={child.x}
                      y={child.y + 4}
                      textAnchor="middle"
                      fill="white"
                      fontSize="13"
                      fontWeight="500"
                      className="pointer-events-none select-none"
                    >
                      {editingNode === child.id ? '' : child.text.length > 8 ? child.text.slice(0, 8) + '...' : child.text}
                    </text>

                    {/* 编辑输入框 */}
                    {editingNode === child.id && (
                      <foreignObject
                        x={child.x - 70}
                        y={child.y - 12}
                        width={140}
                        height={35}
                      >
                        <input
                          type="text"
                          value={editText}
                          onChange={handleTextChange}
                          onKeyDown={handleTextKeyDown}
                          onBlur={handleTextSave}
                          autoFocus
                          className="w-full h-full px-3 py-1 text-center text-sm rounded-full bg-transparent text-white border-2 border-white/50 focus:border-white outline-none"
                        />
                      </foreignObject>
                    )}

                    {/* 选中状态 */}
                    {selectedNode === child.id && !editingNode && (
                      <>
                        {/* 添加子节点按钮 */}
                        <g
                          className="cursor-pointer"
                          onClick={() => addChildNode(child.id)}
                        >
                          <circle cx={child.x + 75} cy={child.y} r={12} fill="#10b981" filter="url(#shadow)" />
                          <text x={child.x + 75} y={child.y + 4} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">+</text>
                        </g>

                        {/* 删除节点按钮 */}
                        <g
                          className="cursor-pointer"
                          onClick={() => deleteNode(child.id)}
                        >
                          <circle cx={child.x - 75} cy={child.y} r={12} fill="#ef4444" filter="url(#shadow)" />
                          <text x={child.x - 75} y={child.y + 4} textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">×</text>
                        </g>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          ))}

          {/* SVG 滤镜 */}
          <defs>
            <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.2" />
            </filter>
          </defs>
        </svg>

        {/* 提示信息 */}
        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-md">
          <p className="text-sm text-gray-600">
            <span className="font-medium">提示：</span>
            双击节点编辑 · 拖拽移动节点 · Ctrl+滚轮缩放
          </p>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
        <button
          onClick={onCancel}
          className="px-5 py-2.5 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors font-medium"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="px-5 py-2.5 bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600 rounded-lg transition-colors font-medium shadow-md"
        >
          保存思维导图
        </button>
      </div>
    </div>
  );
};

// 思维导图渲染组件（用于在笔记中显示）
export interface MindmapViewProps {
  content: string;
  onEdit?: () => void;
}

export const MindmapView: React.FC<MindmapViewProps> = ({ content, onEdit }) => {
  const [nodes, setNodes] = useState<MindmapNode[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (content) {
      try {
        const data = JSON.parse(content);
        setNodes(data);
      } catch {
        setNodes([]);
      }
    }
  }, [content]);

  // 获取所有连接线
  const getAllConnections = useCallback((): React.ReactNode[] => {
    const elements: React.ReactNode[] = [];

    const traverse = (nodes: MindmapNode[], parent?: MindmapNode) => {
      for (const node of nodes) {
        if (parent) {
          elements.push(
            <path
              key={`path-${parent.id}-${node.id}`}
              d={`M ${parent.x} ${parent.y} Q ${(parent.x + node.x) / 2} ${(parent.y + node.y) / 2 + (node.y > parent.y ? 20 : -20)} ${node.x} ${node.y}`}
              stroke={node.color}
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
            />
          );
        }
        traverse(node.children, node);
      }
    };

    traverse(nodes);
    return elements;
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 bg-gray-50 rounded-lg">
        <p className="text-gray-400">暂无思维导图内容</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden ${onEdit ? 'cursor-pointer group' : ''}`}
      onClick={onEdit}
    >
      <svg
        width="100%"
        height={400}
        viewBox="0 0 800 400"
        style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
      >
        <defs>
          <filter id="viewShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.15" />
          </filter>
        </defs>

        {/* 连接线 */}
        {getAllConnections()}

        {/* 中心节点 */}
        {nodes.map(node => (
          <g key={node.id}>
            <ellipse
              cx={node.x}
              cy={node.y}
              rx={80}
              ry={30}
              fill={node.color}
              filter="url(#viewShadow)"
            />
            <text
              x={node.x}
              y={node.y + 5}
              textAnchor="middle"
              fill="white"
              fontSize="14"
              fontWeight="600"
              className="select-none"
            >
              {node.text.length > 12 ? node.text.slice(0, 12) + '...' : node.text}
            </text>

            {/* 子节点 */}
            {node.children.map(child => {
              const dx = child.x - node.x;
              const dy = child.y - node.y;

              return (
                <g key={child.id}>
                  <path
                    d={`M ${node.x + Math.cos(Math.atan2(dy, dx)) * 80} ${node.y + Math.sin(Math.atan2(dy, dx)) * 30} Q ${(node.x + child.x) / 2} ${(node.y + child.y) / 2 + (child.y > node.y ? 30 : -30)} ${child.x - Math.cos(Math.atan2(dy, dx)) * 70} ${child.y - Math.sin(Math.atan2(dy, dx)) * 25}`}
                    stroke={child.color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                  />
                  <ellipse
                    cx={child.x}
                    cy={child.y}
                    rx={70}
                    ry={25}
                    fill={child.color}
                    filter="url(#viewShadow)"
                  />
                  <text
                    x={child.x}
                    y={child.y + 4}
                    textAnchor="middle"
                    fill="white"
                    fontSize="13"
                    fontWeight="500"
                    className="select-none"
                  >
                    {child.text.length > 10 ? child.text.slice(0, 10) + '...' : child.text}
                  </text>
                </g>
              );
            })}
          </g>
        ))}
      </svg>

      {onEdit && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-2 bg-white rounded-lg shadow-lg hover:bg-gray-50 transition-colors">
            <Edit3 className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
};
