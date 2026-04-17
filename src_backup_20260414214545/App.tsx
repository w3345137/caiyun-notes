import { useAuth } from './components/AuthProvider';
import { useNoteStore } from './store/noteStore';
import { AuthProvider } from './components/AuthProvider'; // 引入 Provider
import { AuthModal } from './components/AuthModal';
import toast, { Toaster } from 'react-hot-toast';
import { useState, useEffect } from 'react';

// 简单的 Logo
const Logo = () => <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold">N</div>;

function AppContent() {
  const { user, loading: authLoading, logout } = useAuth();
  const { loadNotes, isLoading: notesLoading, notes, selectedNoteId } = useNoteStore();
  
  const [showLogin, setShowLogin] = useState(false);

  // 登录成功后自动加载笔记
  useEffect(() => {
    if (user) {
      console.log('[App] 用户登录，开始加载笔记...');
      loadNotes();
    }
  }, [user, loadNotes]);

  if (authLoading) return <div className="h-screen flex items-center justify-center text-gray-500">加载中...</div>;

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="mb-4"><Logo /></div>
        <h1 className="text-2xl font-bold mb-4">彩云笔记 v2.01</h1>
        <button 
          onClick={() => setShowLogin(true)}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg"
        >
          登录系统
        </button>
        <AuthModal isOpen={showLogin} onClose={() => setShowLogin(false)} />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-100">
      {/* 侧边栏 */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <span className="font-bold text-lg">笔记列表 ({notes.length})</span>
          <button onClick={logout} className="text-xs text-red-500 hover:underline">退出</button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
           {notesLoading ? <p className="text-center text-gray-400 mt-4">加载中...</p> : (
             notes.filter(n => n.type === 'notebook').map(note => (
               <div key={note.id} className="p-2 hover:bg-gray-100 rounded cursor-pointer font-medium">
                 📘 {note.title}
               </div>
             ))
           )}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col">
         <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-700">
               {notes.find(n => n.id === selectedNoteId)?.title || '欢迎使用彩云笔记'}
            </h2>
         </header>
         <main className="flex-1 p-6 overflow-y-auto">
            <div className="text-gray-500">请选择左侧笔记开始编辑</div>
         </main>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}

// 关键修复：用 Provider 包裹 AppContent
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
