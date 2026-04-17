import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NoteEditor } from './components/NoteEditor';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { AuthModal } from './components/AuthModal';
import { useNoteStore, setUpdateLogsCache } from './store/noteStore';
import { User } from '@supabase/supabase-js';
import toast, { Toaster } from 'react-hot-toast';
import { signIn } from './lib/auth';
import { getUpdateLogs } from './lib/initDatabase';
import { supabase } from './lib/supabase';
import './App.css';

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, loading } = useAuth();
  const loadFromCloud = useNoteStore((state) => state.loadFromCloud);
  const syncToCloud = useNoteStore((state) => state.syncToCloud);
  const isLoading = useNoteStore((state) => state.isLoading);
  const isSyncing = useNoteStore((state) => state.isSyncing);
  const lastSyncedAt = useNoteStore((state) => state.lastSyncedAt);
  const dbReady = useNoteStore((state) => state.dbReady);
  const dbError = useNoteStore((state) => state.dbError);

  // 用户登录后加载数据
  // 【已修复】只在用户真正变化时加载，跳过 token 刷新的中间状态
  useEffect(() => {
    // 如果 user 存在（不是 null），则加载数据
    if (user && user.id) {
      loadFromCloud();
      // 预加载更新日志（只缓存非空结果，空结果不缓存避免阻塞 Modal 自身查询）
      getUpdateLogs().then(logs => {
        if (logs && logs.length > 0) {
          setUpdateLogsCache(logs);
        }
      }).catch(() => {});
    }
  }, [user?.id, loadFromCloud]); // 改为监听 user.id 变化，跳过 token 刷新

  // 监听刷新笔记事件
  useEffect(() => {
    const handleRefresh = () => {
      if (user && user.id) {
        loadFromCloud();
        toast.success('已刷新');
      }
    };
    window.addEventListener('refresh-notes', handleRefresh);
    return () => window.removeEventListener('refresh-notes', handleRefresh);
  }, [user, loadFromCloud]);

  // 手动保存到云端
  const handleSave = useCallback(async () => {
    if (!dbReady) {
      toast.error('数据库未就绪，请稍后重试');
      return;
    }
    try {
      const result = await syncToCloud();
      if (result.success) {
        toast.success('已保存到云端', {
          icon: '✅',
          style: { color: '#059669', fontWeight: '500' },
        });
      } else {
        toast.error(`保存失败: ${result.error || '请重试'}`, {
          icon: '❌',
          style: { color: '#dc2626', fontWeight: '500' },
        });
      }
    } catch {
      toast.error('保存失败，请重试');
    }
  }, [syncToCloud, dbReady]);

  // 【Token保活】Tauri WebView 中 visibilitychange 可能不触发 autoRefreshToken，
  // 因此手动定时刷新 token，每 50 分钟刷新一次（token 有效期 1 小时）
  useEffect(() => {
    let lastRefresh = Date.now();

    const refreshToken = async () => {
      if (!user) return;
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) return;
        // 检查 token 剩余时间，如果快过期了（< 15分钟）就主动刷新
        const payload = JSON.parse(atob(session.access_token.split('.')[1]));
        const exp = payload.exp * 1000;
        const now = Date.now();
        const remaining = exp - now;
        if (remaining < 15 * 60 * 1000) {
          console.log('[TokenKeepAlive] token 即将过期，主动刷新');
          await supabase.auth.refreshSession();
        }
      } catch (e) {
        console.warn('[TokenKeepAlive] 刷新失败:', e);
      }
    };

    const interval = setInterval(refreshToken, 50 * 60 * 1000);
    // 同时监听页面可见性和网络恢复事件
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user) {
        refreshToken();
      }
    };
    const handleOnline = () => {
      if (user) refreshToken();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [user]);

  // 【已恢复】自动保存定时器 - 每10秒自动保存一次（静默模式，不显示通知）
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      if (dbReady && !isSyncing && user) {
        syncToCloud().then(result => {
          // 只在保存失败时显示通知
          if (!result.success) {
            console.log('自动保存失败:', result.error);
          }
        });
      }
    }, 10000);

    return () => clearInterval(autoSaveInterval);
  }, [dbReady, isSyncing, syncToCloud, user]);

  // 页面离开时自动保存
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (dbReady && user) {
        const notes = useNoteStore.getState().notes;
        navigator.sendBeacon?.('/api/sync', JSON.stringify({ notes }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dbReady, user]);

  // Ctrl+S / Cmd+S 快捷键
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        await handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  // 加载中状态（永不卡死）
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">加载中...</p>
        </div>
      </div>
    );
  }

  // 未登录或加载出错时显示登录页（永不崩溃）
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6">
            <img src="/logo.png" alt="彩云笔记" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">彩云笔记</h1>
          <p className="text-gray-600 mb-8">安全可靠的云端笔记应用，让记录更轻松</p>
          <button
            onClick={() => setShowAuthModal(true)}
            className="px-8 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-medium rounded-xl hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg"
          >
            登录 / 注册
          </button>
          
          {/* 测试账号快速登录 - 放在首页 */}
          <div className="mt-8 p-2.5 bg-amber-50 border border-amber-200 rounded-xl scale-80">
            <p className="text-[10px] text-amber-700 font-medium mb-1.5">快速体验</p>
            <button
              onClick={async () => {
                try {
                  await signIn('test01@notes.app', 'test123456');
                  toast.success('测试账号登录成功');
                } catch (error: any) {
                  toast.error(error.message || '登录失败');
                }
              }}
              className="w-full py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs"
            >
              <span>👤</span>
              <span>使用 test01 测试账号登录</span>
            </button>
            <p className="text-[9px] text-amber-600 mt-1">测试账号：test01@notes.app / test123456</p>
          </div>
          
          {/* 版权信息 */}
          <p className="text-sm text-gray-400 mt-8">
            献给热爱知识管理的你——彬
          </p>
        </div>

        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => {
            loadFromCloud();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50 relative">
      {/* 主内容区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* Toast 通知组件 */}
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: {
              background: '#f9fafb',
              color: '#374151',
              border: '1px solid #e5e7eb',
              borderRadius: '10px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              fontSize: '13px',
              padding: '8px 14px',
              transform: 'scale(0.93)',
              transformOrigin: 'bottom center',
            },
            success: {
              iconTheme: {
                primary: '#10b981',
                secondary: '#fff',
              },
            },
          }}
        />

        {/* Sidebar - 固定25%宽度 */}
        <div className="w-[25%] min-w-0 shrink-0">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        </div>

        {/* Main Content - 占剩余75% */}
        <div className="flex-1 min-w-0 shrink-0 h-full overflow-hidden">
          <NoteEditor />
        </div>
      </div>

      {/* 数据库错误提示 */}
      {dbError && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-red-500 text-white px-6 py-4 rounded-xl shadow-2xl z-[200] max-w-md">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">数据库未连接</p>
              <p className="text-sm opacity-90">{dbError}</p>
              <button
                onClick={() => loadFromCloud()}
                className="mt-3 px-4 py-1.5 bg-white text-red-500 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                重试连接
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 同步状态提示 */}
      {isLoading && (
        <div className="fixed bottom-4 right-4 bg-blue-500/90 backdrop-blur-sm text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 text-sm">
          <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
          加载中...
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
