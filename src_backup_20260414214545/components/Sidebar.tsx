import { useNoteStore, Note } from '../store/noteStore';
import { useAuth } from './AuthProvider';
import { useEffect } from 'react';

export function Sidebar() {
  const { notes, loadNotes, selectNote, selectedNoteId, isLoading } = useNoteStore();
  const { logout } = useAuth();

  // 组件挂载时加载笔记
  useEffect(() => {
    loadNotes();
  }, []);

  console.log('[Sidebar] 渲染侧边栏, 笔记数量:', notes.length);

  // 过滤出笔记本类型显示在根目录
  const rootNotes = notes.filter(n => n.type === 'notebook' && !n.parent_id);

  return (
    <div className="h-full flex flex-col bg-white border-r border-gray-200">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center">
        <span className="font-bold text-lg">📚 我的笔记本</span>
        <button onClick={logout} className="text-xs text-red-500 hover:underline">退出</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="text-center text-gray-400 mt-4 animate-pulse">加载中...</div>
        ) : rootNotes.length === 0 ? (
          <div className="text-center text-gray-400 mt-4">暂无笔记</div>
        ) : (
          rootNotes.map(note => (
            <div 
              key={note.id}
              onClick={() => {
                console.log('[Sidebar] 点击笔记:', note.title);
                selectNote(note.id);
              }}
              className={`p-3 rounded cursor-pointer mb-1 transition-colors ${selectedNoteId === note.id ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
            >
              <div className="font-medium truncate">📘 {note.title}</div>
              <div className="text-xs text-gray-400 mt-1">ID: {note.id}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
