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
    return ReactNodeViewRenderer(ResizableImageView);
  },
});

const ResizableImageView: React.FC<{ node: any; updateAttributes: any; selected: boolean; deleteNode: () => void }> = ({
  node,
  updateAttributes,
  selected,
  deleteNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [size, setSize] = useState({ width: node.attrs.width || 300, height: node.attrs.height || 'auto' });
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

  const handleResizeStart = useCallback((corner: string, e: React.MouseEvent) => {
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
      updateAttributes({ width: size.width, height: Math.round(size.height) });
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
        className={`relative inline-block ${isSelected ? 'ring-1 ring-blue-500 z-50' : ''}`}
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
            {/* 四角拖动点 */}
            <div
              className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-white border border-blue-500 rounded-sm cursor-nw-resize"
              onMouseDown={(e) => handleResizeStart('nw', e)}
            />
            <div
              className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-white border border-blue-500 rounded-sm cursor-ne-resize"
              onMouseDown={(e) => handleResizeStart('ne', e)}
            />
            <div
              className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-white border border-blue-500 rounded-sm cursor-sw-resize"
              onMouseDown={(e) => handleResizeStart('sw', e)}
            />
            <div
              className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-white border border-blue-500 rounded-sm cursor-se-resize"
              onMouseDown={(e) => handleResizeStart('se', e)}
            />
            {/* 删除按钮 */}
            <button
              onClick={handleDelete}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-600"
            >
              ×
            </button>
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
};