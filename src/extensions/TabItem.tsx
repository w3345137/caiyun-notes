import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import React, { useRef, useEffect } from 'react';

/**
 * TabItemView - TabItem 的 NodeView 组件
 * 为每个 TabItem 的内容提供一个独立的容器
 */
const TabItemView: React.FC<any> = ({ node, getPos, editor }) => {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contentRef.current) {
      // 设置 data 属性
      contentRef.current.setAttribute('data-tab-item', '');
      contentRef.current.setAttribute('data-title', node.attrs.title || '页签');
    }
  }, [node.attrs.title]);

  return (
    <NodeViewWrapper>
      <div ref={contentRef} className="tab-item-content">
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
};

/**
 * TabItem - 页签内容项节点
 * 作为 TabGroup 的子节点，每个 TabItem 包含一个独立的内容区域
 */
export interface TabItemOptions {
  HTMLAttributes: Record<string, any>;
}

export const TabItem = Node.create<TabItemOptions>({
  name: 'tabItem',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  content: 'block+',

  addAttributes() {
    return {
      title: {
        default: '页签1',
        parseHTML: (element) =>
          element.getAttribute('data-title') || '页签1',
        renderHTML: (attributes) => ({
          'data-title': attributes.title,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-tab-item]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-tab-item': '',
        'data-title': node.attrs.title,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabItemView);
  },
});

export default TabItem;