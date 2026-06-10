import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Key, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './authContext';
import { Note } from '../types';
import { shareNotebook, unshareNotebook, getNotebookShares } from '../lib/initDatabase';
import { apiCreateNotebookApiToken, apiListNotebookApiTokens, apiRevokeNotebookApiToken } from '../lib/edgeApi';
import { ConfirmModal } from './ConfirmModal';

interface NotebookShareModalProps {
  notebook: Note;
  onClose: () => void;
  mode?: 'share' | 'api';
}

export const NotebookShareModal: React.FC<NotebookShareModalProps> = ({ notebook, onClose, mode = 'share' }) => {
  const { user } = useAuth();
  const [shares, setShares] = useState<any[]>([]);
  const [apiTokens, setApiTokens] = useState<any[]>([]);
  const [newSharerEmail, setNewSharerEmail] = useState('');
  const [newPermission, setNewPermission] = useState<'view' | 'edit'>('edit');
  const [newTokenName, setNewTokenName] = useState('智能体 API');
  const [createdToken, setCreatedToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingShares, setLoadingShares] = useState(true);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const displayName = user?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '未知用户';
  const isApiMode = mode === 'api';

  useEffect(() => {
    if (isApiMode) return;
    const loadShares = async () => {
      setLoadingShares(true);
      try {
        const data = await getNotebookShares(notebook.id);
        setShares(data);
      } catch (error) {
        console.error('加载共享者列表失败:', error);
      } finally {
        setLoadingShares(false);
      }
    };
    loadShares();
  }, [isApiMode, notebook.id]);

  const loadApiTokens = useCallback(async () => {
    setLoadingTokens(true);
    try {
      const result = await apiListNotebookApiTokens(notebook.id);
      if (result.success) setApiTokens(result.data || []);
    } catch (error) {
      console.error('加载 API Key 失败:', error);
    } finally {
      setLoadingTokens(false);
    }
  }, [notebook.id]);

  useEffect(() => {
    if (!isApiMode) return;
    loadApiTokens();
  }, [isApiMode, loadApiTokens]);

  const handleAddSharer = async () => {
    if (!newSharerEmail) {
      toast.error('请输入邮箱地址');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newSharerEmail)) {
      toast.error('请输入有效的邮箱地址');
      return;
    }
    if (newSharerEmail === user?.email) {
      toast.error('不能将自己添加为共享者');
      return;
    }
    setLoading(true);
    try {
      const result = await shareNotebook(notebook.id, newSharerEmail, newPermission);
      if (result.success) {
        toast.success(`已添加 ${newSharerEmail}，权限：${newPermission === 'edit' ? '可编辑' : '仅查看'}`);
        const data = await getNotebookShares(notebook.id);
        setShares(data);
        setNewSharerEmail('');
      } else {
        toast.error(result.error || '添加共享者失败，请重试');
      }
    } catch (error) {
      console.error('添加共享者失败:', error);
      toast.error('添加共享者失败，请重试');
    }
    setLoading(false);
  };

  const handleRemoveSharer = async (email: string) => {
    setConfirmModal({
      isOpen: true,
      title: '取消共享',
      message: `确定要取消共享给 ${email} 吗？`,
      onConfirm: async () => {
        try {
          const result = await unshareNotebook(notebook.id, email);
          if (result.success) {
            toast.success(`已取消共享给 ${email}`);
            const data = await getNotebookShares(notebook.id);
            setShares(data);
          } else {
            toast.error(result.error || '取消共享失败，请重试');
          }
        } catch (error) {
          console.error('取消共享失败:', error);
          toast.error('取消共享失败，请重试');
        }
      }
    });
  };

  const handleCreateApiToken = async () => {
    setLoading(true);
    try {
      const result = await apiCreateNotebookApiToken(notebook.id, newTokenName || '智能体 API', 365);
      if (result.success) {
        setCreatedToken(result.data?.token || '');
        toast.success('API Key 已创建');
        loadApiTokens();
      } else {
        toast.error(result.error || '创建 API Key 失败');
      }
    } catch (error) {
      console.error('创建 API Key 失败:', error);
      toast.error('创建 API Key 失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeApiToken = async (tokenId: string) => {
    setConfirmModal({
      isOpen: true,
      title: '撤销 API Key',
      message: '撤销后，使用该 Key 的智能体将无法继续读取这个笔记本。',
      onConfirm: async () => {
        const result = await apiRevokeNotebookApiToken(tokenId);
        if (result.success) {
          toast.success('API Key 已撤销');
          loadApiTokens();
        } else {
          toast.error(result.error || '撤销失败');
        }
      },
    });
  };

  const buildAgentApiInstructions = useCallback((token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://notes.binapp.top';
    return [
      `彩云笔记笔记本智能体 API`,
      `笔记本：${notebook.title}`,
      `认证方式：Authorization: Bearer ${token}`,
      ``,
      `1. 读取笔记本目录`,
      `GET ${origin}/api/notebook-api/v1/tree`,
      ``,
      `2. 读取页面正文和附件列表`,
      `GET ${origin}/api/notebook-api/v1/notes/<noteId>`,
      ``,
      `3. 下载附件原文件`,
      `GET ${origin}/api/notebook-api/v1/attachments/<attachmentId>/download`,
      ``,
      `4. 提取附件文本`,
      `GET ${origin}/api/notebook-api/v1/attachments/<attachmentId>/text`,
      ``,
      `调用示例：`,
      `curl -H "Authorization: Bearer ${token}" "${origin}/api/notebook-api/v1/tree"`,
      ``,
      `使用顺序：先调用 tree 获取 noteId，再调用 notes/<noteId> 读取页面；页面返回的 attachments 中包含 attachmentId，可继续下载原文件或读取文本。`,
    ].join('\n');
  }, [notebook.title]);

  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  };

  const copyToken = async (token: string) => {
    await copyText(buildAgentApiInstructions(token));
    toast.success('已复制完整 API 调用说明');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-teal-600 px-6 py-5 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">{isApiMode ? '智能体 API' : '分享设置'}</h2>
            <p className="text-green-100 text-sm truncate max-w-[200px]">{notebook.title}</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-500 mb-1">所有者</p>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                <span className="text-sm font-medium text-purple-600">{displayName.charAt(0).toUpperCase()}</span>
              </div>
              <span className="font-medium text-gray-800">{displayName}</span>
            </div>
          </div>

          {!isApiMode && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">添加共享者</p>
            <div className="space-y-2">
              <input
                type="email"
                value={newSharerEmail}
                onChange={(e) => setNewSharerEmail(e.target.value)}
                placeholder="输入邮箱地址"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
              />
              <div className="flex gap-2">
                <div className="flex-1 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPermission('edit')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      newPermission === 'edit'
                        ? 'bg-green-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    可编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPermission('view')}
                    className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      newPermission === 'view'
                        ? 'bg-blue-500 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    仅查看
                  </button>
                </div>
                <button
                  onClick={handleAddSharer}
                  disabled={loading || !newSharerEmail}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm"
                >
                  添加
                </button>
              </div>
            </div>
          </div>
          )}

          {!isApiMode && (
          <>
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">已共享 ({loadingShares ? '...' : shares.length})</p>
            {loadingShares ? (
              <div className="flex items-center justify-center py-4">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                <span className="text-sm text-gray-500">加载中...</span>
              </div>
            ) : shares.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">暂无共享者</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {shares.map((share: any) => (
                  <div key={share.id || share.shared_email} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-xs text-blue-600">{(share.display_name || share.email || '?').charAt(0).toUpperCase()}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm text-gray-800 font-medium">{share.display_name || share.email}</span>
                        <span className="text-xs text-gray-400">{share.email}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded ${share.permission === 'edit' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                        {share.permission === 'edit' ? '可编辑' : '仅查看'}
                      </span>
                      <button
                        onClick={() => handleRemoveSharer(share.email)}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                        title="取消共享"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          </>
          )}

          {isApiMode && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 leading-relaxed">
                API Key 只读，可读取本笔记本正文和附件。创建者失去笔记本查看权限后，Key 会自动失效。
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-600 leading-relaxed">
                <p className="font-medium text-gray-700 mb-1">接口</p>
                <p><code>GET {window.location.origin}/api/notebook-api/v1/tree</code></p>
                <p><code>GET {window.location.origin}/api/notebook-api/v1/notes/&lt;noteId&gt;</code></p>
                <p><code>GET {window.location.origin}/api/notebook-api/v1/attachments/&lt;attachmentId&gt;/download</code></p>
                <p><code>GET {window.location.origin}/api/notebook-api/v1/attachments/&lt;attachmentId&gt;/text</code></p>
              </div>

              <div className="flex gap-2">
                <input
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="Key 名称"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <button
                  onClick={handleCreateApiToken}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  <Key className="w-4 h-4" />
                  创建
                </button>
              </div>

              {createdToken && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-700 mb-2">请立即复制完整调用说明，关闭后不会再次显示 Key 明文。</p>
                  <div className="flex gap-2">
                    <code className="flex-1 min-w-0 px-2 py-1.5 bg-white border border-amber-200 rounded text-xs text-gray-700 truncate">{createdToken}</code>
                    <button onClick={() => copyToken(createdToken)} className="p-2 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200" title="复制完整 API 调用说明">
                      <Copy className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">API Key ({loadingTokens ? '...' : apiTokens.length})</p>
                {loadingTokens ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-2"></div>
                    <span className="text-sm text-gray-500">加载中...</span>
                  </div>
                ) : apiTokens.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">暂无 API Key</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {apiTokens.map((token: any) => (
                      <div key={token.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{token.name}</p>
                          <p className="text-xs text-gray-400">
                            {token.token_prefix}... · {token.revoked_at ? '已撤销' : '有效'} · 最后使用：{token.last_used_at ? new Date(token.last_used_at).toLocaleString('zh-CN') : '从未'}
                          </p>
                        </div>
                        {!token.revoked_at && (
                          <button onClick={() => handleRevokeApiToken(token.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="撤销">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};
