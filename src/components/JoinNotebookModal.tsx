import React, { useState } from 'react';
import { X, Users, Eye, Edit2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthProvider';
import { createInvite } from '../lib/inviteService';

interface JoinNotebookModalProps {
  onClose: () => void;
}

export const JoinNotebookModal: React.FC<JoinNotebookModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [notebookId, setNotebookId] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!notebookId.trim()) {
      toast.error('请输入笔记本ID');
      return;
    }
    setLoading(true);
    const result = await createInvite(notebookId.trim(), permission);
    setLoading(false);
    if (result.success) {
      toast.success('申请已提交，请等待笔记本所有者审批');
      onClose();
    } else {
      toast.error(result.error || '申请失败');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-80 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-white" />
            <span className="text-white font-medium">加入笔记本</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">笔记本ID <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={notebookId}
              onChange={(e) => setNotebookId(e.target.value)}
              placeholder="请输入笔记本ID"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">从笔记本的"复制笔记本ID"获取</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">申请权限</label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${permission === 'view' ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="permission"
                  value="view"
                  checked={permission === 'view'}
                  onChange={() => setPermission('view')}
                  className="sr-only"
                />
                <Eye className="w-4 h-4" />
                <span className="text-sm">查看</span>
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 border rounded-lg cursor-pointer transition-colors ${permission === 'edit' ? 'border-purple-500 bg-purple-50 text-purple-600' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="permission"
                  value="edit"
                  checked={permission === 'edit'}
                  onChange={() => setPermission('edit')}
                  className="sr-only"
                />
                <Edit2 className="w-4 h-4" />
                <span className="text-sm">编辑</span>
              </label>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={loading || !notebookId.trim()}
            className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 disabled:opacity-50 transition-all text-sm font-medium"
          >
            {loading ? '提交中...' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  );
};
