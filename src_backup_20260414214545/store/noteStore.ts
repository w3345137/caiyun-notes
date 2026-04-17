import { create } from 'zustand';
import { api } from '../lib/api';
import toast from 'react-hot-toast';

// 笔记类型定义
export interface Note {
  id: string;
  title: string;
  content: string;
  type: 'notebook' | 'section' | 'page';
  parent_id: string | null;
  owner_id: string;
  order_index: number;
  icon?: string;
  created_at?: string;
  updated_at?: string;
  // 兼容旧字段
  parentId?: string | null;
}

interface NoteState {
  notes: Note[];
  isLoading: boolean;
  selectedNoteId: string | null;

  // Actions
  loadNotes: () => Promise<void>;
  selectNote: (id: string | null) => void;
  saveNote: (note: Partial<Note>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
}

export const useNoteStore = create<NoteState>((set, get) => ({
  notes: [],
  isLoading: false,
  selectedNoteId: null,

  // 加载笔记列表
  loadNotes: async () => {
    if (get().isLoading) return;
    
    console.log('[Store] 开始加载笔记...');
    set({ isLoading: true });
    try {
      const res = await api.getNotes();
      if (res.success && res.data) {
        console.log(`[Store] 成功加载 ${res.data.length} 条笔记`);
        set({ notes: res.data });
        
        // 触发加载侧边栏状态
        try {
             const sidebarRes = await api.getSidebarState();
             if(sidebarRes.success && sidebarRes.data?.selected_note_id) {
                 set({ selectedNoteId: sidebarRes.data.selected_note_id });
             }
        } catch(e) {}
      } else {
        console.error('[Store] 加载失败:', res.error);
        toast.error('加载笔记失败');
      }
    } catch (error) {
      console.error('[Store] 异常:', error);
      toast.error('无法连接数据库');
    } finally {
      set({ isLoading: false });
    }
  },

  // 选中笔记
  selectNote: (id) => {
    console.log('[Store] 选中笔记:', id);
    set({ selectedNoteId: id });
  },

  // 保存笔记
  saveNote: async (note) => {
    console.log('[Store] 尝试保存笔记:', note.id);
    try {
      const res = await api.saveNote(note);
      if (res.success) {
        console.log('[Store] 保存成功');
        // 更新本地缓存
        const notes = [...get().notes];
        const index = notes.findIndex(n => n.id === note.id);
        if (index >= 0) {
          notes[index] = { ...notes[index], ...note } as Note;
        } else {
          notes.push(note as Note);
        }
        set({ notes });
        toast.success('已保存');
      }
    } catch (e) {
      console.error('[Store] 保存失败:', e);
      toast.error('保存失败');
    }
  },

  // 删除笔记
  deleteNote: async (id) => {
    if (!confirm('确定删除此笔记吗？')) return;
    console.log('[Store] 删除笔记:', id);
    try {
      await api.deleteNote(id);
      set({ 
        notes: get().notes.filter(n => n.id !== id),
        selectedNoteId: get().selectedNoteId === id ? null : get().selectedNoteId
      });
      toast.success('已删除');
    } catch (e) {
      console.error('[Store] 删除失败:', e);
      toast.error('删除失败');
    }
  }
}));
