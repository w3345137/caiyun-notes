import { useState, useEffect } from 'react';
import { useNoteStore } from '../store/noteStore';

export function NoteEditor() {
  const { notes, selectedNoteId, saveNote } = useNoteStore();
  const note = notes.find(n => n.id === selectedNoteId);
  
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');

  // 当选中笔记变化时更新内容
  useEffect(() => {
    if (note) {
      console.log('[Editor] 加载笔记内容:', note.id);
      setTitle(note.title);
      setContent(note.content);
    }
  }, [note]);

  const handleSave = async () => {
    if (!note) return;
    console.log('[Editor] 点击保存');
    await saveNote({ ...note, title, content });
  };

  if (!note) {
    return <div className="flex-1 flex items-center justify-center text-gray-400">请选择一个笔记</div>;
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-gray-50">
      <div className="max-w-4xl mx-auto w-full bg-white rounded-lg shadow-sm p-8 min-h-[500px]">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="text-3xl font-bold w-full mb-6 border-b-2 border-gray-100 pb-2 focus:outline-none focus:border-blue-500"
          placeholder="输入笔记标题"
        />
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-64 p-4 border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="开始写作..."
        />
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            💾 保存更改
          </button>
        </div>
      </div>
    </div>
  );
}
