import React, { useState, useEffect, useRef } from 'react';
import { X, HardDrive, Download, Trash2, Image, Video, FileText, FileCode, CheckCircle, Volume2, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthProvider';
import { getBaiduAttachments, getBaiduAuthUrl, downloadFromBaidu, deleteBaiduAttachment, formatFileSize, checkBaiduBinding, BaiduAttachment } from '../lib/baiduService';
import { ConfirmModal } from './ConfirmModal';

interface BaiduModalProps {
  onClose: () => void;
}

export const BaiduModal: React.FC<BaiduModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'bind' | 'files'>('bind');
  const [appKey, setAppKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [isBinding, setIsBinding] = useState(false);
  const [isBound, setIsBound] = useState(false);
  const [attachments, setAttachments] = useState<BaiduAttachment[]>([]);
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

  useEffect(() => {
    checkBindingStatus();
  }, []);

  const checkBindingStatus = async () => {
    if (!user) return;
    const result = await checkBaiduBinding();
    setIsBound(result.bound);
  };

  const addDebug = (step: string, status: 'pending' | 'ok' | 'error', detail: string) => {
    setDebugLog(prev => {
      const filtered = prev.filter(d => d.step !== step);
      return [...filtered, { step, status, detail }];
    });
  };
  const clearDebug = () => setDebugLog([]);

  const loadAttachments = async () => {
    if (!user) return;
    setLoading(true);
    const result = await getBaiduAttachments();
    if (result.success) {
      setAttachments(result.data || []);
    }
    setLoading(false);
  };

  const isTauriApp = typeof (window as any).__TAURI__ !== 'undefined' ||
    (navigator.userAgent || '').includes('Tauri') ||
    (navigator.userAgent || '').includes('彩云笔记');

  const handleBind = async () => {
    if (!user || !appKey.trim() || !secretKey.trim()) {
      toast.error('请填写完整的 App Key 和 Secret Key');
      return;
    }
    setIsBinding(true);
    clearDebug();

    try {
      addDebug('① 获取授权 URL', 'pending', '发送请求...');
      const result = await getBaiduAuthUrl(appKey.trim(), secretKey.trim());
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
          const checkResult = await checkBaiduBinding();
          if (checkResult.bound) {
            clearInterval(tauriPollTimer);
            pollTimerRef.current = null;
            addDebug('③ 授权成功', 'ok', '检测到绑定状态');
            toast.success('百度网盘绑定成功！');
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

      const popup = window.open('about:blank', 'baidu_auth', 'width=600,height=700,left=200,top=100,toolbar=no,menubar=no');

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
        if (event.data.type !== 'baidu_success' && event.data.type !== 'baidu_error') return;

        clearInterval(pollTimer);
        pollTimerRef.current = null;
        window.removeEventListener('message', messageHandler);
        messageHandlerRef.current = null;
        if (!popup.closed) popup.close();

        if (event.data.type === 'baidu_success') {
          addDebug('③ 授权成功', 'ok', '收到 postMessage');
          toast.success('百度网盘绑定成功！');
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

  const handleDownload = async (attachment: BaiduAttachment) => {
    if (!user) return;
    const result = await downloadFromBaidu(attachment.id);
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

  const handleDelete = async (attachment: BaiduAttachment) => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: '删除附件',
      message: `确定要删除 "${attachment.file_name}" 吗？`,
      onConfirm: async () => {
        const result = await deleteBaiduAttachment(attachment.id);
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
        <div className="bg-gradient-to-r from-green-500 to-teal-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-white" />
            <span className="text-white font-medium">百度网盘</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('bind')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'bind' ? 'text-green-600 border-b-2 border-green-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            绑定设置
          </button>
          <button
            onClick={() => { setActiveTab('files'); loadAttachments(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-green-600 border-b-2 border-green-500' : 'text-gray-500 hover:text-gray-700'}`}
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
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">百度网盘已绑定</h3>
                  <p className="text-sm text-gray-500 mb-6">你可以开始在笔记中插入附件了</p>
                  <button
                    onClick={() => { setActiveTab('files'); loadAttachments(); }}
                    className="px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors"
                  >
                    查看附件
                  </button>
                </div>
              ) : (
                <>
                  {/* 功能说明 */}
                  <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                    <p className="text-sm font-medium text-green-800 mb-1">百度网盘存储</p>
                    <p className="text-xs text-green-600 leading-relaxed">
                      绑定后，你拥有的笔记本可以使用百度网盘作为存储空间，共享者通过你的笔记本上传/下载文件都会使用你的配额。
                    </p>
                  </div>

                  {/* 一键粘贴提示 */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <span className="font-semibold">一键粘贴：</span>将百度开发者平台的 App Key 和 Secret Key 用换行分隔，一次粘贴进来即可自动填入。
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      App Key（API Key）
                    </label>
                    <input
                      type="text"
                      value={appKey}
                      onChange={e => setAppKey(e.target.value)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                        if (lines.length >= 1) setAppKey(lines[0]);
                        if (lines.length >= 2) setSecretKey(lines[1]);
                        e.preventDefault();
                      }}
                      placeholder='百度开发者平台 → 我的应用 → App Key'
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Secret Key
                    </label>
                    <input
                      type="text"
                      value={secretKey}
                      onChange={e => setSecretKey(e.target.value)}
                      placeholder='百度开发者平台 → 我的应用 → Secret Key'
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {/* 回调地址 */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
                    <p className="font-semibold mb-1">授权回调地址（需填入百度开发者平台）：</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-blue-100 px-2 py-1 rounded text-blue-800 font-mono text-[11px] break-all select-all">
                        https://notes.binapp.top/api/baidu/callback
                      </code>
                      <button
                        onClick={() => {
                          if (navigator.clipboard?.writeText) {
                            navigator.clipboard.writeText('https://notes.binapp.top/api/baidu/callback');
                          } else {
                            const ta = document.createElement('textarea');
                            ta.value = 'https://notes.binapp.top/api/baidu/callback';
                            document.body.appendChild(ta); ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                          }
                          toast.success('回调地址已复制');
                        }}
                        className="px-2 py-1 bg-blue-500 text-white text-[10px] rounded hover:bg-blue-600 flex-shrink-0"
                      >
                        复制
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setShowGuide(!showGuide)}
                      className="text-xs text-green-500 hover:text-green-700 flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {showGuide ? '收起详细配置指南' : '查看详细配置指南'}
                    </button>
                  </div>

                  <button
                    onClick={handleBind}
                    disabled={isBinding || !appKey.trim() || !secretKey.trim()}
                    className="w-full py-2.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isBinding ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />授权中...</>
                    ) : (
                      <><HardDrive className="w-4 h-4" />绑定百度网盘</>
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
              <div className="w-[320px] border-l border-gray-200 overflow-y-auto bg-amber-50 p-4 space-y-4 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">百度网盘配置指南</p>
                  <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                  <div className="space-y-3 text-xs text-amber-700 leading-relaxed">
                  {/* Step 0 */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 space-y-1 mb-2">
                    <p className="font-semibold">前置条件：实名认证（必须先完成）</p>
                    <p>1. 打开 <a href="https://pan.baidu.com/union/" target="_blank" className="text-blue-600 underline">pan.baidu.com/union</a></p>
                    <p>2. 右上角头像 → <strong>"账号认证"</strong> → 选择<strong>"个人开发者"</strong></p>
                    <p>3. 填写真实姓名 + 身份证号，提交后即通过</p>
                    <p className="text-red-600 font-semibold text-[11px]">未认证会提示 "user not auth, not allow create"</p>
                  </div>

                  {/* Step 1 */}
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第一步：注册百度开发者</p>
                    <p>1. 访问 <a href="https://developer.baidu.com/" target="_blank" className="text-blue-600 underline font-medium">developer.baidu.com</a></p>
                    <p>2. 使用百度账号登录（没有则注册）</p>
                    <p>3. 进入 <strong>"控制台"</strong> → <strong>"创建应用"</strong></p>
                    <p className="text-amber-600 text-[11px]">如果已有应用，可跳过此步</p>
                  </div>

                  {/* Step 2 */}
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第二步：开通百度网盘 API</p>
                    <p>1. 在应用管理页面，点击 <strong>"API 管理"</strong></p>
                    <p>2. 搜索并开通 <strong>"百度网盘"</strong> 相关 API</p>
                    <p>3. 至少需要开通：<code className="bg-amber-100 px-1 rounded">文件管理</code>、<code className="bg-amber-100 px-1 rounded">用户信息</code></p>
                    <p className="text-red-600 text-[11px]">未开通网盘 API 将导致授权后无法上传/下载文件</p>
                  </div>

                  {/* Step 3 */}
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第三步：获取密钥</p>
                    <p>1. 回到应用 <strong>"基本信息"</strong> 页面</p>
                    <p>2. 复制 <strong>App Key</strong>（API Key）</p>
                    <p>3. 复制 <strong>Secret Key</strong></p>
                    <p>4. 粘贴到左侧表单中（支持一键粘贴）</p>
                  </div>

                  {/* Step 4 */}
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第四步：配置回调地址</p>
                    <p>1. 在应用 <strong>"安全设置"</strong> 中</p>
                    <p>2. 找到 <strong>"授权回调地址"</strong> 输入框</p>
                    <p>3. 填入以下地址（点击左侧蓝色区域可复制）：</p>
                    <code className="block bg-white border border-amber-300 p-1.5 rounded text-blue-700 break-all text-[11px]">
                      https://notes.binapp.top/api/baidu/callback
                    </code>
                    <p className="text-red-600 text-[11px] font-semibold">如果回调地址不匹配，授权时会报"redirect_uri mismatch"错误</p>
                  </div>

                  {/* Step 5 */}
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第五步：上线应用</p>
                    <p>1. 确保应用状态为 <strong>"已上线"</strong></p>
                    <p>2. 如果是"开发中"状态，点击 <strong>"上线"</strong> 按钮</p>
                    <p className="text-amber-600 text-[11px]">未上线的应用只能由开发者本人授权，其他用户无法使用</p>
                  </div>

                  {/* Step 6 */}
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第六步：完成绑定</p>
                    <p>1. 在左侧表单填入 App Key 和 Secret Key</p>
                    <p>2. 点击 <strong>"绑定百度网盘"</strong> 按钮</p>
                    <p>3. 在弹出的百度授权页面点击 <strong>"同意授权"</strong></p>
                    <p>4. 授权成功后自动返回，即可开始使用</p>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 space-y-1">
                    <p className="font-semibold">常见问题：</p>
                    <p>• <strong>授权后提示"redirect_uri mismatch"</strong> → 检查回调地址是否完全一致（包括末尾的 /）</p>
                    <p>• <strong>上传失败"access token invalid"</strong> → 重新绑定（token 过期后会自动刷新）</p>
                    <p>• <strong>看不到文件列表</strong> → 文件存储在 <code className="bg-red-100 px-1 rounded">/apps/彩云笔记/</code> 目录下</p>
                    <p>• <strong>其他人无法使用</strong> → 确认应用状态为"已上线"且 API 权限已开通</p>
                  </div>

                  <p className="text-amber-600 text-[11px]">
                    提示：每个百度开发者账号可以创建多个应用。如果遇到配额限制，可以创建新应用并使用不同的 App Key。
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : attachments.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <HardDrive className="w-12 h-12 mx-auto mb-2 opacity-50" />
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
