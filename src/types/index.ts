export interface Note {
  id: string;
  title: string;
  content: string; // Tiptap JSON content - 纯文本/Markdown
  mindmapData?: string | null; // 思维导图 JSON 数据，与 content 完全分离
  parentId: string | null;
  type: 'notebook' | 'section' | 'page';
  createdAt: string;
  updatedAt: string;
  order: number;
  icon?: string;
  tag?: string; // 标签字段
  ownerId?: string; // 笔记所有者ID
  lockedBy?: string | null; // 锁定者用户ID
  lockedByName?: string | null; // 锁定者名称
  lockedAt?: string | null; // 锁定时间
  isLocked?: boolean; // 是否被锁定
  version: number; // 版本号，用于冲突解决
  createdBy?: string; // 创建者用户ID
  createdByName?: string; // 创建者名称
  updatedBy?: string; // 最后修改者用户ID
  updatedByName?: string; // 最后修改者名称
  rootNotebookId?: string | null; // 所属顶级笔记本ID（用于 RLS 共享权限判断）
}

export interface AppState {
  notes: Note[];
  selectedNoteId: string | null;
  expandedNodes: Set<string>;

  // Actions
  addNote: (parentId: string | null, type: Note['type'], title?: string) => string;
  updateNote: (id: string, updates: Partial<Note>) => void;
  deleteNote: (id: string) => void;
  selectNote: (id: string | null) => void;
  toggleExpanded: (id: string) => void;
  moveNote: (id: string, newParentId: string | null) => void;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => void;

  // Helpers
  getNoteById: (id: string) => Note | undefined;
  getChildNotes: (parentId: string | null) => Note[];
  getRootNotes: () => Note[];
}

export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
