import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import TabGroupView from '../components/TabGroupView';

/**
 * TabGroup - 单层页签组节点
 * 所有 Tab 内容存在 attrs.contents 中，切换时只替换编辑器内容，不操作 DOM
 */
export interface TabGroupOptions {
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tabGroup: {
      insertTabGroup: () => ReturnType;
      setActiveTab: (index: number) => ReturnType;
    };
  }
}

export const TabGroup = Node.create<TabGroupOptions>({
  name: 'tabGroup',

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  group: 'block',

  // 不再嵌套 tabItem，内容直接存在 attrs.contents 里
  content: undefined,

  // 移除 isolating，内部有自己的编辑器

  addAttributes() {
    return {
      activeIndex: {
        default: 0,
        parseHTML: (element) =>
          parseInt(element.getAttribute('data-active-index') || '0', 10),
        renderHTML: (attributes) => ({
          'data-active-index': attributes.activeIndex,
        }),
      },
      // tabs: [{ id, title }]
      tabs: {
        default: [
          { id: '1', title: '页签1' },
        ],
        parseHTML: (element) => {
          const data = element.getAttribute('data-tabs');
          return data ? JSON.parse(data) : [{ id: '1', title: '页签1' }];
        },
        renderHTML: (attributes) => ({
          'data-tabs': JSON.stringify(attributes.tabs),
        }),
      },
      // contents: { '1': { doc }, '2': { doc } }
      contents: {
        default: {
          '1': { type: 'doc', content: [{ type: 'paragraph' }] },
        },
        parseHTML: (element) => {
          const data = element.getAttribute('data-contents');
          return data ? JSON.parse(data) : { '1': { type: 'doc', content: [{ type: 'paragraph' }] } };
        },
        renderHTML: (attributes) => ({
          'data-contents': JSON.stringify(attributes.contents),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-tab-group]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    return [
      'div',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        'data-tab-group': '',
      }),
      0, // 不渲染子节点，内容存在 attrs 里（HTMLAttributes 已包含 data-* 属性）
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabGroupView);
  },

  addCommands() {
    return {
      insertTabGroup:
        () =>
        ({ chain }) => {
          return chain()
            .insertContent({
              type: this.name,
              attrs: {
                activeIndex: 0,
                tabs: [{ id: '1', title: '页签1' }],
                contents: {
                  '1': { type: 'doc', content: [{ type: 'paragraph' }] },
                },
              },
            })
            .run();
        },

      setActiveTab:
        (index: number) =>
        ({ tr, state, dispatch }) => {
          const { selection } = state;
          const { $from } = selection;

          // 找到当前的 TabGroup 节点
          let tabGroupPos = -1;
          let tabGroupNode = null;

          for (let d = $from.depth; d >= 0; d--) {
            const node = $from.node(d);
            if (node?.type.name === 'tabGroup') {
              tabGroupPos = $from.start(d);
              tabGroupNode = node;
              break;
            }
          }

          if (!tabGroupNode) return false;

          const tabs = tabGroupNode.attrs.tabs || [];
          if (index < 0 || index >= tabs.length) return false;

          if (dispatch) {
            tr.setNodeMarkup(tabGroupPos, undefined, {
              ...tabGroupNode.attrs,
              activeIndex: index,
            });
            dispatch(tr);
          }

          return true;
        },
    };
  },
});

export default TabGroup;
