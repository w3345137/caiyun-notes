import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface ResizableImageAttrs {
  src: string;
  alt?: string;
  title?: string;
  width?: number | null;
  height?: number | null;
}

type ResizeCorner = false | 'se' | 'sw' | 'ne' | 'nw';

export const ResizableImage = Node.create({
  name: 'image',
  group: 'block',
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'img' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'resizable-image' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView as React.ComponentType<any>);
  },
});

const ResizableImageView: React.FC<{ node: any; updateAttributes: any; selected: boolean; deleteNode: () => void }> = ({
  node,
  updateAttributes,
  selected,
  deleteNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState<ResizeCorner>(false);
  const [size, setSize] = useState<{ width: number; height: number | 'auto' }>({ width: node.attrs.width || 300, height: node.attrs.height || 'auto' });
  const [isSelected, setIsSelected] = useState(selected);
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0 });
  const aspectRatioRef = useRef<number>(1);

  useEffect(() => {
    setIsSelected(selected);
  }, [selected]);

  useEffect(() => {
    if (node.attrs.width) {
      setSize({ width: node.attrs.width, height: 'auto' });
    }
  }, [node.attrs.width]);

  const handleResizeStart = useCallback((corner: Exclude<ResizeCorner, false>, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(corner);

    const img = containerRef.current?.querySelector('img');
    if (img) {
      resizeStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: img.offsetWidth,
        height: img.offsetHeight,
      };
      aspectRatioRef.current = img.offsetWidth / (img.offsetHeight || 1);
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const deltaX = e.clientX - resizeStartRef.current.x;
    const deltaY = e.clientY - resizeStartRef.current.y;

    let newWidth = resizeStartRef.current.width;
    let newHeight = resizeStartRef.current.height;

    if (isResizing === 'se') {
      newWidth = Math.max(50, resizeStartRef.current.width + deltaX);
      newHeight = newWidth / aspectRatioRef.current;
    } else if (isResizing === 'sw') {
      newWidth = Math.max(50, resizeStartRef.current.width - deltaX);
      newHeight = newWidth / aspectRatioRef.current;
    } else if (isResizing === 'ne') {
      newWidth = Math.max(50, resizeStartRef.current.width + deltaX);
      newHeight = newWidth / aspectRatioRef.current;
    } else if (isResizing === 'nw') {
      newWidth = Math.max(50, resizeStartRef.current.width - deltaX);
      newHeight = newWidth / aspectRatioRef.current;
    }

    setSize({ width: Math.round(newWidth), height: Math.round(newHeight) });
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      updateAttributes({ width: size.width, height: typeof size.height === 'number' ? Math.round(size.height) : null });
      setIsResizing(false);
    }
  }, [isResizing, size, updateAttributes]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSelected(true);
  }, []);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    deleteNode();
  }, [deleteNode]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle>
      <div
        ref={containerRef}
        className={`relative inline-block ${isSelected ? 'z-50' : ''}`}
        onClick={handleClick}
      >
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || ''}
          style={{
            width: size.width,
            height: size.height === 'auto' ? 'auto' : size.height,
            maxWidth: '100%',
          }}
          className="block rounded-lg"
        />
        {isSelected && (
          <>
            {/* 选中边框 */}
            <div className="absolute inset-0 border-2 border-blue-500 rounded-lg pointer-events-none" />
            {/* 四角拖动点 — 更大更好抓 */}
            <div
              className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-nw-resize shadow-sm hover:scale-125 transition-transform"
              onMouseDown={(e) => handleResizeStart('nw', e)}
            />
            <div
              className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-ne-resize shadow-sm hover:scale-125 transition-transform"
              onMouseDown={(e) => handleResizeStart('ne', e)}
            />
            <div
              className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 rounded-full cursor-sw-resize shadow-sm hover:scale-125 transition-transform"
              onMouseDown={(e) => handleResizeStart('sw', e)}
            />
            <div
              className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 rounded-full cursor-se-resize shadow-sm hover:scale-125 transition-transform"
              onMouseDown={(e) => handleResizeStart('se', e)}
            />
            {/* 宽度指示 */}
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
              {size.width} × {size.height === 'auto' ? 'auto' : size.height}
            </div>
            {/* 删除按钮 */}
            <button
              onClick={handleDelete}
              className="absolute -top-2.5 -right-2.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs shadow-md hover:bg-red-600 hover:scale-110 transition-all"
              title="删除图片"
            >
              ×
            </button>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};
