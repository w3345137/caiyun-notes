import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Cloud, Download, Trash2, Image, Video, FileText, FileCode, CheckCircle, Volume2, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './authContext';
import { getAttachments, getOneDriveAuthUrl, downloadFromOneDrive, deleteAttachment, formatFileSize, checkOneDriveBinding, Attachment } from '../lib/onedriveService';
import { ConfirmModal } from './ConfirmModal';

interface OneDriveModalProps {
  onClose: () => void;
}

export const OneDriveModal: React.FC<OneDriveModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'bind' | 'files'>('bind');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [cloudType, setCloudType] = useState<'international' | '世纪互联'>('世纪互联');
  const [isBinding, setIsBinding] = useState(false);
  const [isBound, setIsBound] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [showDebug, setShowDebug] = useState(false);
  const [debugLog, setDebugLog] = useState<Array<{ step: string; status: 'pending' | 'ok' | 'error'; detail: string }>>([]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (messageHandlerRef.current) window.removeEventListener('message', messageHandlerRef.current);
    };
  }, []);

  const checkBindingStatus = useCallback(async () => {
    if (!user) return;
    const result = await checkOneDriveBinding();
    setIsBound(result.bound);
  }, [user]);

  const addDebug = (step: string, status: 'pending' | 'ok' | 'error', detail: string) => {
    setDebugLog(prev => {
      const filtered = prev.filter(d => d.step !== step);
      return [...filtered, { step, status, detail }];
    });
  };
  const clearDebug = () => setDebugLog([]);

  const loadAttachments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const result = await getAttachments();
    if (result.success) {
      setAttachments(result.data || []);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkBindingStatus();
  }, [checkBindingStatus]);

  const isTauriApp = typeof (window as any).__TAURI__ !== 'undefined' ||
    (navigator.userAgent || '').includes('Tauri') ||
    (navigator.userAgent || '').includes('彩云笔记');

  const handleBind = async () => {
    if (!user || !clientId.trim() || !clientSecret.trim()) {
      toast.error('请填写完整的 Client ID 和 Client Secret');
      return;
    }
    if (cloudType === '世纪互联' && !tenantId.trim()) {
      toast.error('请填写世纪互联的租户 ID');
      return;
    }
    setIsBinding(true);
    clearDebug();

    try {
      addDebug('① 获取授权 URL', 'pending', '发送请求...');
      const result = await getOneDriveAuthUrl(clientId.trim(), cloudType, cloudType === '世纪互联' ? tenantId.trim() : undefined);
      const authUrl = result.authUrl;

      if (!authUrl) {
        addDebug('① 获取授权 URL', 'error', '返回无 authUrl');
        toast.error('获取授权 URL 失败');
        setIsBinding(false);
        return;
      }

      addDebug('① 获取授权 URL', 'ok', `URL: ${(result.redirectUrl || authUrl).slice(0, 100)}...`);

      // Tauri/nw.js 使用 server 代理跳转（绕过 CSP）; 普通浏览器直接用 authUrl
      const openUrl = result.redirectUrl || authUrl;

      if (isTauriApp) {
        addDebug('② 打开授权页', 'ok', '正在唤起系统浏览器...');
        toast.success('正在打开系统浏览器，请完成授权后返回...');
        try {
          const { open } = await import('@tauri-apps/plugin-shell');
          await open(openUrl);
        } catch { window.open(openUrl, '_blank'); }
        setIsBinding(false);

        let pollCount = 0;
        const maxPoll = 20;
        const tauriPollTimer = setInterval(async () => {
          pollCount++;
          addDebug('③ 检查绑定', 'pending', `第 ${pollCount}/${maxPoll} 次检查...`);
          const checkResult = await checkOneDriveBinding();
          if (checkResult.bound) {
            clearInterval(tauriPollTimer);
            pollTimerRef.current = null;
            addDebug('③ 授权成功', 'ok', '检测到绑定状态');
            toast.success('OneDrive 绑定成功！');
            setIsBound(true);
            setActiveTab('files');
            loadAttachments();
          } else if (pollCount >= maxPoll) {
            clearInterval(tauriPollTimer);
            pollTimerRef.current = null;
            addDebug('③ 授权超时', 'error', '60秒内未检测到绑定');
            toast.error('授权超时，请重试');
          }
        }, 3000);
        pollTimerRef.current = tauriPollTimer;
        return;
      }

      const popup = window.open('about:blank', 'onedrive_auth', 'width=600,height=700,left=200,top=100,toolbar=no,menubar=no');

      if (!popup) {
        addDebug('② 打开授权窗口', 'error', '弹窗被浏览器拦截');
        toast.error('弹窗被浏览器拦截，请允许弹窗后重试');
        setIsBinding(false);
        return;
      }

      addDebug('② 导航到授权页', 'ok', '弹窗已打开，正在跳转...');
      toast.success('正在打开授权页面，请在弹窗中完成授权...');
      popup.location.href = openUrl;
      setIsBinding(false);

      const pollTimer = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollTimer);
          pollTimerRef.current = null;
          if (messageHandlerRef.current) {
            window.removeEventListener('message', messageHandlerRef.current);
            messageHandlerRef.current = null;
          }
        }
      }, 500);
      pollTimerRef.current = pollTimer;

      const messageHandler = (event: MessageEvent) => {
        if (!event.data || typeof event.data !== 'object') return;
        if (event.data.type !== 'onedrive_success' && event.data.type !== 'onedrive_error') return;

        clearInterval(pollTimer);
        pollTimerRef.current = null;
        window.removeEventListener('message', messageHandler);
        messageHandlerRef.current = null;
        if (!popup.closed) popup.close();

        if (event.data.type === 'onedrive_success') {
          addDebug('③ 授权成功', 'ok', '收到 postMessage');
          toast.success('OneDrive 绑定成功！');
          setIsBound(true);
          setActiveTab('files');
          loadAttachments();
        } else {
          addDebug('③ 授权失败', 'error', event.data.error || '未知错误');
          toast.error(event.data.error || '授权失败');
        }
      };
      window.addEventListener('message', messageHandler);
      messageHandlerRef.current = messageHandler;
    } catch (error) {
      console.error('Bind error:', error);
      toast.error('绑定失败');
      setIsBinding(false);
    }
  };

  const handleDownload = async (attachment: Attachment) => {
    if (!user) return;
    const result = await downloadFromOneDrive(attachment.id);
    if (result.success && result.blob) {
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.fileName || attachment.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.error(result.error || '下载失败');
    }
  };

  const handleDelete = async (attachment: Attachment) => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: '删除附件',
      message: `确定要删除 "${attachment.file_name}" 吗？`,
      onConfirm: async () => {
        const result = await deleteAttachment(attachment.id);
        if (result.success) {
          toast.success('删除成功');
          loadAttachments();
        } else {
          toast.error(result.error || '删除失败');
        }
      }
    });
  };

  const getFileIcon = (category: string) => {
    switch (category) {
      case 'image': return <Image className="w-5 h-5 text-pink-500" />;
      case 'video': return <Video className="w-5 h-5 text-red-500" />;
      case 'audio': return <Volume2 className="w-5 h-5 text-yellow-500" />;
      case 'document': return <FileText className="w-5 h-5 text-blue-500" />;
      default: return <FileCode className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-white" />
            <span className="text-white font-medium">OneDrive 云盘</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('bind')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'bind' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            绑定设置
          </button>
          <button
            onClick={() => { setActiveTab('files'); loadAttachments(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            文件管理
          </button>
        </div>

        {activeTab === 'bind' && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isBound ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">OneDrive 已绑定</h3>
                  <p className="text-sm text-gray-500 mb-6">你可以开始在笔记中插入附件了</p>
                  <button
                    onClick={() => { setActiveTab('files'); loadAttachments(); }}
                    className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    查看附件
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      选择云版本
                    </label>
                    <div className="flex gap-3">
                      <label className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${cloudType === '世纪互联' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        <input
                          type="radio"
                          name="cloudType"
                          value="世纪互联"
                          checked={cloudType === '世纪互联'}
                          onChange={() => setCloudType('世纪互联')}
                          className="sr-only"
                        />
                        <span className={`text-sm ${cloudType === '世纪互联' ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>OneDrive 世纪互联版</span>
                      </label>
                      <label className={`flex-1 flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${cloudType === 'international' ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}>
                        <input
                          type="radio"
                          name="cloudType"
                          value="international"
                          checked={cloudType === 'international'}
                          onChange={() => setCloudType('international')}
                          className="sr-only"
                        />
                        <span className={`text-sm ${cloudType === 'international' ? 'text-blue-700 font-medium' : 'text-gray-600'}`}>OneDrive 国际版</span>
                      </label>
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700">
                    将 Azure 门户的三个值用换行分隔，一次粘贴进来即可自动填入
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      应用程序(客户端) ID
                    </label>
                    <input
                      type="text"
                      value={clientId}
                      onChange={e => setClientId(e.target.value)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                        if (lines.length >= 1) setClientId(lines[0]);
                        if (lines.length >= 2) setTenantId(lines[1]);
                        if (lines.length >= 3) setClientSecret(lines[2]);
                        e.preventDefault();
                      }}
                      placeholder='即 Azure 门户"应用程序(客户端) ID"'
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {cloudType === '世纪互联' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">
                        目录(租户) ID
                      </label>
                      <input
                        type="text"
                        value={tenantId}
                        onChange={e => setTenantId(e.target.value)}
                        placeholder='即 Azure 门户"概述"页面的"租户 ID"'
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      客户端密码值
                    </label>
                    <input
                      type="text"
                      value={clientSecret}
                      onChange={e => setClientSecret(e.target.value)}
                      placeholder='即 Azure 门户"证书和密码"中的客户端密码值'
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setShowGuide(!showGuide)}
                      className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {showGuide ? '收起配置指南' : '查看配置指南'}
                    </button>
                  </div>

                  <button
                    onClick={handleBind}
                    disabled={isBinding || !clientId.trim() || !clientSecret.trim() || (cloudType === '世纪互联' && !tenantId.trim())}
                    className="w-full py-2.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isBinding ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />授权中...</>
                    ) : (
                      <><Cloud className="w-4 h-4" />绑定 OneDrive 账号</>
                    )}
                  </button>

                  {debugLog.length > 0 && (
                    <div className="mt-3">
                      <button
                        onClick={() => setShowDebug(!showDebug)}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                      >
                        调试信息 {showDebug ? '▲' : '▼'}
                      </button>
                      {showDebug && (
                        <div className="mt-2 bg-gray-900 rounded-lg p-3 text-xs font-mono space-y-1.5 max-h-64 overflow-y-auto">
                          {debugLog.map((d, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <span className="flex-shrink-0 mt-0.5">
                                {d.status === 'pending' ? '⏳' : d.status === 'ok' ? '✅' : '❌'}
                              </span>
                              <div className="min-w-0">
                                <div className="text-gray-300">{d.step}</div>
                                <div className={`mt-0.5 break-all ${d.status === 'pending' ? 'text-yellow-400' : d.status === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                                  {d.detail}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {showGuide && (
              <div className="w-[280px] border-l border-gray-200 overflow-y-auto bg-amber-50 p-4 space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">配置指南（{cloudType === '世纪互联' ? '世纪互联版' : '国际版'}）</p>
                  <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-2 text-xs text-amber-700">
                  <p>在 Azure 门户注册应用，授权本应用访问你的 OneDrive：</p>
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第一步：注册应用</p>
                    <p>1. 访问 <a href={cloudType === '世纪互联' ? 'https://portal.azure.cn' : 'https://portal.azure.com'} target="_blank" className="text-blue-600 underline">{cloudType === '世纪互联' ? 'portal.azure.cn' : 'portal.azure.com'}</a></p>
                    <p>2. 搜索 <strong>"应用注册"</strong>  <strong>"+ 新注册"</strong></p>
                    <p>3. 名称填 <code className="bg-amber-100 px-1 rounded">彩云笔记</code></p>
                    <p className="text-red-600 font-semibold">账户类型必须选 <strong>"任何目录" - 多租户</strong></p>
                  </div>
                  <p className="text-amber-600">如需管理员同意，请用个人账号或联系管理员审批</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : attachments.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Cloud className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无附件</p>
                <p className="text-xs mt-1">在笔记中插入附件即可在此看到</p>
              </div>
            ) : (
              <div className="space-y-2">
                {attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group">
                    {getFileIcon(attachment.category)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{attachment.file_name}</p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(attachment.file_size)} . {new Date(attachment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(attachment)} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors" title="下载">
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                      <button onClick={() => handleDelete(attachment)} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors" title="删除">
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDanger={true}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};
