import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { NoteEditor } from './components/NoteEditor';
import { AuthProvider } from './components/AuthProvider';
import { useAuth } from './components/authContext';
import { AuthModal } from './components/AuthModal';
import { AppUpdateModal } from './components/AppUpdateModal';
import { useNoteStore, setUpdateLogsCache } from './store/noteStore';
import toast, { Toaster } from 'react-hot-toast';
import { signIn, parseJWTPayload, refreshToken } from './lib/auth';
import {
  createAvailableUpdateState,
  createCheckingUpdateState,
  createDownloadingUpdateState,
  createErrorUpdateState,
  createIdleUpdateState,
  createRelaunchingUpdateState,
  reduceDownloadEvent,
  type AppUpdateInfo,
  type AppUpdateState,
} from './lib/appUpdateState';
import { getUpdateLogs } from './lib/initDatabase';
import { sseService } from './lib/sseService';
import logoUrl from '/logo.png';
import './App.css';

const TOKEN_REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

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
  const [appUpdateState, setAppUpdateState] = useState<AppUpdateState>(() => createIdleUpdateState());
  const { user, loading } = useAuth();
  const quickLoginEmail = import.meta.env.VITE_TEST_LOGIN_EMAIL;
  const quickLoginPassword = import.meta.env.VITE_TEST_LOGIN_PASSWORD;
  const showQuickLogin = (import.meta.env.DEV || import.meta.env.VITE_SHOW_TEST_LOGIN === 'true') && quickLoginEmail && quickLoginPassword;
  const userId = user?.id;
  const loadFromCloud = useNoteStore((state) => state.loadFromCloud);
  const syncToCloud = useNoteStore((state) => state.syncToCloud);
  const hasPendingSaves = useNoteStore((state) => state.hasPendingSaves);
  const isLoading = useNoteStore((state) => state.isLoading);
  const loadingStatus = useNoteStore((state) => state.loadingStatus);
  const loadingProgress = useNoteStore((state) => state.loadingProgress);
  const dbReady = useNoteStore((state) => state.dbReady);
  const dbError = useNoteStore((state) => state.dbError);
  const syncError = useNoteStore((state) => state.syncError);
  const setSyncError = useNoteStore((state) => state.setSyncError);
  const refreshInProgressRef = useRef(false);
  const tokenRefreshInProgressRef = useRef(false);
  const appUpdateRef = useRef<any>(null);
  const appUpdateInProgressRef = useRef(false);

  // 用户登录后加载数据
  useEffect(() => {
    if (userId) {
      loadFromCloud();
      sseService.connect();
      getUpdateLogs().then(logs => {
        if (logs && logs.length > 0) {
          setUpdateLogsCache(logs);
        }
      }).catch(() => {});
    } else {
      sseService.disconnect();
    }
  }, [userId, loadFromCloud]);

  const saveBeforeReload = useCallback(async () => {
    if (refreshInProgressRef.current) return;

    if (!userId || !hasPendingSaves()) {
      window.location.reload();
      return;
    }

    if (!dbReady) {
      toast.error('数据库未就绪，自动同步未完成，已取消刷新');
      return;
    }

    refreshInProgressRef.current = true;

    try {
      const result = await syncToCloud();
      if (!result.success) {
        refreshInProgressRef.current = false;
        toast.error(`自动同步未完成，已取消刷新: ${result.error || '请重试'}`);
        return;
      }

      window.location.reload();
    } catch {
      refreshInProgressRef.current = false;
      toast.error('自动同步未完成，已取消刷新');
    }
  }, [dbReady, hasPendingSaves, syncToCloud, userId]);

  // 监听应用内刷新事件：先确保自动同步队列完成，再重新拉取云端数据。
  useEffect(() => {
    const handleRefresh = async () => {
      if (!userId) return;
      if (!dbReady) {
        toast.error('数据库未就绪，无法刷新');
        return;
      }

      const toastId = 'refresh-notes';
      try {
        if (hasPendingSaves()) {
          const result = await syncToCloud();
          if (!result.success) {
            toast.error(`自动同步未完成，已取消刷新: ${result.error || '请重试'}`, { id: toastId });
            return;
          }
        }

        await loadFromCloud();
        toast.success('已刷新', { id: toastId });
      } catch {
        toast.error('刷新失败，请重试', { id: toastId });
      }
    };
    window.addEventListener('refresh-notes', handleRefresh);
    return () => window.removeEventListener('refresh-notes', handleRefresh);
  }, [userId, dbReady, hasPendingSaves, syncToCloud, loadFromCloud]);

  // Token 检查：30 天有效期，剩余不足 7 天时滑动续期。
  useEffect(() => {
    const checkToken = async () => {
      if (!user) return;
      if (tokenRefreshInProgressRef.current) return;
      try {
        const token = localStorage.getItem('notesapp_token');
        if (!token) return;
        const payload = parseJWTPayload(token);
        if (!payload) return;
        const exp = payload.exp * 1000;
        const now = Date.now();
        const remaining = exp - now;
        if (remaining <= 0) {
          localStorage.removeItem('notesapp_token');
          window.location.reload();
          return;
        }
        if (remaining < TOKEN_REFRESH_THRESHOLD_MS) {
          tokenRefreshInProgressRef.current = true;
          try {
            await refreshToken();
          } catch (e) {
            console.warn('[TokenCheck] 续期失败:', e);
            localStorage.removeItem('notesapp_token');
            window.location.reload();
          } finally {
            tokenRefreshInProgressRef.current = false;
          }
        }
      } catch (e) {
        console.warn('[TokenCheck] 检查失败:', e);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkToken();
      }
    };

    const interval = window.setInterval(() => void checkToken(), 60 * 60 * 1000);
    void checkToken();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  // APP 更新检查（仅 Tauri 环境有效）
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) return;

    let cancelled = false;
    const checkAndPrompt = async () => {
      setAppUpdateState((current) => current.phase === 'idle' ? createCheckingUpdateState() : current);
      try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (cancelled) return;

        if (!update) {
          setAppUpdateState(createIdleUpdateState());
          return;
        }

        appUpdateRef.current = update;
        const updateInfo: AppUpdateInfo = {
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body,
        };
        setAppUpdateState(createAvailableUpdateState(updateInfo));
      } catch (e) {
        if (!cancelled) {
          setAppUpdateState(createIdleUpdateState());
        }
        console.warn('[Updater] 检查更新失败:', e);
      }
    };

    const timer = window.setTimeout(() => void checkAndPrompt(), 3000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  const handleDismissAppUpdate = useCallback(() => {
    if (appUpdateState.phase === 'downloading' || appUpdateState.phase === 'installing' || appUpdateState.phase === 'relaunching') {
      return;
    }
    setAppUpdateState(createIdleUpdateState());
  }, [appUpdateState.phase]);

  const handleStartAppUpdate = useCallback(async () => {
    if (appUpdateInProgressRef.current) return;
    const update = appUpdateRef.current;
    const updateInfo = appUpdateState.update;
    if (!update || !updateInfo) return;

    appUpdateInProgressRef.current = true;

    try {
      if (userId && hasPendingSaves()) {
        if (!dbReady) {
          setAppUpdateState(createErrorUpdateState(updateInfo, '数据库未就绪，自动同步未完成，已取消更新'));
          return;
        }

        const result = await syncToCloud();
        if (!result.success) {
          setAppUpdateState(createErrorUpdateState(updateInfo, `自动同步未完成，已取消更新: ${result.error || '请重试'}`));
          return;
        }
      }

      setAppUpdateState(createDownloadingUpdateState(updateInfo));
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await update.downloadAndInstall((event: any) => {
        setAppUpdateState((current) => reduceDownloadEvent(current, event));
      });
      setAppUpdateState((current) => createRelaunchingUpdateState(current));
      await relaunch();
    } catch (e: any) {
      console.error('[Updater] 更新失败:', e);
      setAppUpdateState(createErrorUpdateState(updateInfo, e?.message || '更新失败，请稍后重试'));
    } finally {
      appUpdateInProgressRef.current = false;
    }
  }, [appUpdateState.update, dbReady, hasPendingSaves, syncToCloud, userId]);

  // 自动保存模式下拦截浏览器保存页面快捷键；刷新前如有未完成的自动同步任务，先静默刷完队列。
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && key === 's') {
        e.preventDefault();
        return;
      }

      if ((((e.metaKey || e.ctrlKey) && key === 'r') || e.key === 'F5') && userId && hasPendingSaves()) {
        e.preventDefault();
        await saveBeforeReload();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [hasPendingSaves, saveBeforeReload, userId]);

  // 浏览器工具栏刷新/关闭无法可靠等待异步保存，只能在还有请求未完成时提示用户。
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!userId || !hasPendingSaves()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingSaves, userId]);

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

          {showQuickLogin && (
            <div className="mt-8 p-2.5 bg-amber-50 border border-amber-200 rounded-xl scale-80">
              <p className="text-[10px] text-amber-700 font-medium mb-1.5">快速体验</p>
              <button
                onClick={async () => {
                  try {
                    await signIn(quickLoginEmail, quickLoginPassword);
                    toast.success('测试账号登录成功');
                  } catch (error: any) {
                    toast.error(error.message || '登录失败');
                  }
                }}
                className="w-full py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 text-xs"
              >
                <span>👤</span>
                <span>使用测试账号登录</span>
              </button>
            </div>
          )}

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

  // 认证初始化期间显示全屏加载；笔记树云端刷新改为后台进行，避免冷启动长时间空白。
  if (loading) {
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

        {/* Main Content */}
        <div className="flex-1 min-w-0 shrink-0 h-full overflow-hidden">
          <NoteEditor />
        </div>
      </div>

      <AppUpdateModal
        state={appUpdateState}
        onStartUpdate={handleStartAppUpdate}
        onDismiss={handleDismissAppUpdate}
      />

      {isLoading && (
        <div className="fixed right-4 bottom-4 z-[180] px-3.5 py-2 rounded-lg bg-white/95 border border-blue-100 shadow-lg text-xs text-gray-600 flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span>{loadingStatus === '正在加载...' ? '正在同步最新内容' : (loadingStatus || '正在同步')}</span>
        </div>
      )}

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

      {/* 同步错误提示 */}
      {syncError && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-6 py-4 rounded-xl shadow-2xl z-[200] max-w-md">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">自动同步失败</p>
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
