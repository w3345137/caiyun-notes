import React, { useState, useEffect } from 'react';
import { Plus, X, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './authContext';
import { Note } from '../types';
import { shareNotebook, unshareNotebook, getNotebookShares } from '../lib/initDatabase';
import { ConfirmModal } from './ConfirmModal';

interface NotebookShareModalProps {
  notebook: Note;
  onClose: () => void;
}

export const NotebookShareModal: React.FC<NotebookShareModalProps> = ({ notebook, onClose }) => {
  const { user } = useAuth();
  const [shares, setShares] = useState<any[]>([]);
  const [newSharerEmail, setNewSharerEmail] = useState('');
  const [newPermission, setNewPermission] = useState<'view' | 'edit'>('edit');
  const [loading, setLoading] = useState(false);
  const [loadingShares, setLoadingShares] = useState(true);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const displayName = user?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '未知用户';

  useEffect(() => {
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
  }, [notebook.id]);

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-gradient-to-r from-green-500 to-teal-600 px-6 py-5 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-white">分享设置</h2>
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
