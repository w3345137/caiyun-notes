const { Node, mergeAttributes } = require('@tiptap/core');
const StarterKit = require('@tiptap/starter-kit').default || require('@tiptap/starter-kit').StarterKit;
const { Table } = require('@tiptap/extension-table');
const { TableRow } = require('@tiptap/extension-table-row');
const { TableCell } = require('@tiptap/extension-table-cell');
const { TableHeader } = require('@tiptap/extension-table-header');
const TaskList = require('@tiptap/extension-task-list').default || require('@tiptap/extension-task-list').TaskList;
const TaskItem = require('@tiptap/extension-task-item').default || require('@tiptap/extension-task-item').TaskItem;
const Link = require('@tiptap/extension-link').default || require('@tiptap/extension-link').Link;
const Highlight = require('@tiptap/extension-highlight').default || require('@tiptap/extension-highlight').Highlight;
const TextAlign = require('@tiptap/extension-text-align').default || require('@tiptap/extension-text-align').TextAlign;
const { TextStyle } = require('@tiptap/extension-text-style');
const { Color } = require('@tiptap/extension-color');
const { FontSize } = require('@tiptap/extension-font-size');
const { TiptapTransformer } = require('@hocuspocus/transformer');

const tableCellAttrs = {
  backgroundColor: {
    default: null,
    parseHTML: (element) => element.style.backgroundColor || element.getAttribute('data-background-color'),
    renderHTML: (attributes) => attributes.backgroundColor ? {
      'data-background-color': attributes.backgroundColor,
      style: `background-color: ${attributes.backgroundColor}`,
    } : {},
  },
  verticalAlign: {
    default: 'top',
    parseHTML: (element) => element.style.verticalAlign || element.getAttribute('data-vertical-align') || 'top',
    renderHTML: (attributes) => ({
      'data-vertical-align': attributes.verticalAlign || 'top',
      style: `vertical-align: ${attributes.verticalAlign || 'top'}`,
    }),
  },
};

const TableCellWithColor = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tableCellAttrs };
  },
});

const TableHeaderWithColor = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...tableCellAttrs };
  },
});

const atomBlock = (name, selector, attrs) => Node.create({
  name,
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return attrs;
  },
  parseHTML() {
    return [{ tag: selector }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, selector.startsWith('div[')
      ? { [selector.slice(4, -1)]: '' }
      : {})];
  },
});

const ImageNode = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
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
    return [{ tag: 'img[src]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes)];
  },
});

const TabGroup = atomBlock('tabGroup', 'div[data-tab-group]', {
  activeIndex: { default: 0 },
  tabs: { default: [{ id: '1', title: '页签1' }] },
  contents: { default: { '1': { type: 'doc', content: [{ type: 'paragraph' }] } } },
});

const Mindmap = atomBlock('mindmap', 'div[data-mindmap]', {
  content: { default: '' },
});

const AudioBlock = atomBlock('audioBlock', 'div[data-audio-block]', {
  noteId: { default: '' },
  audioAttachmentId: { default: '' },
  audioFileName: { default: '' },
  transcriptionText: { default: '' },
  uploadEnabled: { default: true },
  transcriptionEnabled: { default: true },
  storageProvider: { default: 'onedrive' },
});

const FolderBlock = atomBlock('folderBlock', 'div[data-folder-block]', {
  noteId: { default: '' },
  folderName: { default: '附件文件夹' },
  storageProvider: { default: 'onedrive' },
});

const AttachmentBlock = atomBlock('attachmentBlock', 'div[data-attachment-block]', {
  attachmentId: { default: '' },
  fileName: { default: '' },
  fileSize: { default: 0 },
  mimeType: { default: '' },
  onedrivePath: { default: '' },
  category: { default: 'other' },
});

const RouteBlock = atomBlock('routeBlock', 'div[data-route-block]', {
  points: { default: [] },
  departTime: { default: '08:00' },
  legs: { default: [] },
  mode: { default: 'route' },
  labelMode: { default: 'index' },
});

const collabExtensions = [
  StarterKit.configure({
    link: false,
  }),
  ImageNode,
  Table.configure({ resizable: true }),
  TableRow,
  TableCellWithColor,
  TableHeaderWithColor,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  TextStyle,
  Color,
  FontSize.configure({ types: ['textStyle'] }),
  Highlight,
  Link.configure({ openOnClick: false }),
  TaskList,
  TaskItem,
  TabGroup,
  Mindmap,
  RouteBlock,
  AttachmentBlock,
  FolderBlock,
  AudioBlock,
];

const collabTransformer = TiptapTransformer.extensions(collabExtensions);

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

module.exports = {
  collabExtensions,
  collabTransformer,
  EMPTY_DOC,
};
