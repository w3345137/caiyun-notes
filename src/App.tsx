import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NoteEditor } from './components/NoteEditor';
import { AuthProvider, useAuth } from './components/AuthProvider';
import { AuthModal } from './components/AuthModal';
import { useNoteStore, setUpdateLogsCache } from './store/noteStore';
import toast, { Toaster } from 'react-hot-toast';
import { signIn } from './lib/auth';
import { getUpdateLogs } from './lib/initDatabase';
import logoUrl from '/logo.png';
import './App.css';

// ========== 加载页面组件 ==========
function LoadingScreen({ progress, status }: { progress: number; status: string }) {
  return (
    <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="text-center w-72">
        <img src={logoUrl} alt="彩云笔记" className="w-24 h-24 object-contain mx-auto mb-4" />
        <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden mb-3">
          <div
            className="h-1.5 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-400 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-gray-500 text-sm">{status}</p>
      </div>
    </div>
  );
}

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, loading } = useAuth();
  const loadFromCloud = useNoteStore((state) => state.loadFromCloud);
  const syncToCloud = useNoteStore((state) => state.syncToCloud);
  const isLoading = useNoteStore((state) => state.isLoading);
  const loadingStatus = useNoteStore((state) => state.loadingStatus);
  const loadingProgress = useNoteStore((state) => state.loadingProgress);
  const isSyncing = useNoteStore((state) => state.isSyncing);
  const lastSyncedAt = useNoteStore((state) => state.lastSyncedAt);
  const dbReady = useNoteStore((state) => state.dbReady);
  const dbError = useNoteStore((state) => state.dbError);
  const syncError = useNoteStore((state) => state.syncError);
  const setSyncError = useNoteStore((state) => state.setSyncError);

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

  // 【Token检查】本地 JWT 有效期 7 天，检查是否即将过期
  useEffect(() => {
    const checkToken = () => {
      if (!user) return;
      try {
        const token = localStorage.getItem('notesapp_token');
        if (!token) return;
        const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const decoded = decodeURIComponent(
          atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
        );
        const payload = JSON.parse(decoded);
        const exp = payload.exp * 1000;
        const now = Date.now();
        const remaining = exp - now;
        // 如果 token 快过期了（< 1天），提示用户重新登录
        if (remaining < 24 * 60 * 60 * 1000 && remaining > 0) {
          console.log('[TokenCheck] token 即将过期，请重新登录');
          toast('登录即将过期，请保存数据后重新登录', { icon: '⚠️', duration: 10000 });
        }
        if (remaining <= 0) {
          console.log('[TokenCheck] token 已过期');
          localStorage.removeItem('notesapp_token');
          window.location.reload();
        }
      } catch (e) {
        console.warn('[TokenCheck] 检查失败:', e);
      }
    };

    const interval = setInterval(checkToken, 60 * 60 * 1000); // 每小时检查一次
    checkToken(); // 初始检查
    return () => clearInterval(interval);
  }, [user]);

  // 【APP更新检查】检测新版本并下载安装（仅 APP 环境有效）
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const checkAndUpdate = async () => {
        try {
          const { check } = await import('@tauri-apps/plugin-updater');
          const { relaunch } = await import('@tauri-apps/plugin-process');
          const update = await check();
          if (update) {
            console.log('[Updater] 发现新版本:', update.version);
            toast(`发现新版本 ${update.version}，正在下载...`, {
              icon: '🚀',
              duration: 5000,
            });
            await update.downloadAndInstall((event) => {
              if (event.event === 'Started') {
                console.log('[Updater] 开始下载...');
              } else if (event.event === 'Progress') {
                const downloaded = (event.data as any).chunkLength || 0;
                console.log('[Updater] 下载中... 已下载:', downloaded, 'bytes');
              } else if (event.event === 'Finished') {
                toast.success('下载完成，即将重启安装...', { duration: 3000 });
                console.log('[Updater] 下载完成');
              }
            });
            await relaunch();
          } else {
            console.log('[Updater] 已是最新版本');
          }
        } catch (e) {
          console.error('[Updater] 检查更新失败:', e);
        }
      };
      setTimeout(checkAndUpdate, 3000);
    }
  }, []);

  // 【已关闭】自动保存定时器 - 暂时禁用，防止空内容覆盖笔记
  // 保存改为仅在用户编辑时触发（NoteEditor onUpdate debounce）和 Ctrl+S
  // useEffect(() => {
  //   const autoSaveInterval = setInterval(() => {
  //     if (dbReady && !isSyncing && user) {
  //       syncToCloud().then(result => {
  //         if (!result.success) {
  //           console.log('自动保存失败:', result.error);
  //         }
  //       });
  //     }
  //   }, 10000);
  //   return () => clearInterval(autoSaveInterval);
  // }, [dbReady, isSyncing, syncToCloud, user]);

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

  // 未登录时显示登录页
  if (!user && !loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-24 h-24 flex items-center justify-center mx-auto mb-6">
            <img src={logoUrl} alt="彩云笔记" className="w-full h-full object-contain" />
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

  // 加载中 → 显示加载页面（进度条 + 状态文字）
  if (loading || isLoading) {
    return <LoadingScreen progress={loadingProgress} status={loadingStatus || '正在初始化...'} />;
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

        {/* Sidebar - 收起时只占图标宽度 */}
        <div className={`${sidebarCollapsed ? 'w-12' : 'w-[25%]'} min-w-0 shrink-0 transition-all duration-300`}>
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
              <p className="font-medium mb-1">无法连接数据库</p>
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

      {/* 同步/保存错误提示（如页面锁定） */}
      {syncError && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-6 py-4 rounded-xl shadow-2xl z-[200] max-w-md">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">保存失败</p>
              <p className="text-sm opacity-90">{syncError}</p>
              <button
                onClick={() => setSyncError(null)}
                className="mt-3 px-4 py-1.5 bg-white text-orange-500 rounded-lg text-sm font-medium hover:bg-orange-50 transition-colors"
              >
                知道了
              </button>
            </div>
          </div>
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
