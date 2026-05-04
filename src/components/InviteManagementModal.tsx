import React, { useState, useEffect } from 'react';
import { X, Users, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { getReceivedInvites, getMyInvites, respondToInvite, cancelInvite, NotebookInvite } from '../lib/inviteService';

interface InviteManagementModalProps {
  onClose: () => void;
}

export const InviteManagementModal: React.FC<InviteManagementModalProps> = ({ onClose }) => {
  const [invites, setInvites] = useState<NotebookInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received');
  const [selectedPermissions, setSelectedPermissions] = useState<Record<string, 'view' | 'edit'>>({});

  useEffect(() => {
    const loadInvites = async () => {
      setLoading(true);
      if (activeTab === 'received') {
        const data = await getReceivedInvites();
        setInvites(data);
        const initPerms: Record<string, 'view' | 'edit'> = {};
        data.forEach(invite => { initPerms[invite.id] = invite.permission; });
        setSelectedPermissions(initPerms);
      } else {
        const data = await getMyInvites();
        setInvites(data);
      }
      setLoading(false);
    };
    loadInvites();
  }, [activeTab]);

  const handlePermissionChange = (inviteId: string, permission: 'view' | 'edit') => {
    setSelectedPermissions(prev => ({ ...prev, [inviteId]: permission }));
  };

  const handleApprove = async (invite: NotebookInvite) => {
    const permission = selectedPermissions[invite.id] ?? invite.permission;
    await handleRespond(invite.id, 'approve', permission);
  };

  const handleRespond = async (inviteId: string, action: 'approve' | 'reject', grantedPermission?: 'view' | 'edit') => {
    const result = await respondToInvite(inviteId, action, grantedPermission);
    if (result.success) {
      toast.success(action === 'approve' ? '已批准申请' : '已拒绝申请');
      const data = await getReceivedInvites();
      setInvites(data);
    } else {
      toast.error(result.error || '操作失败');
    }
  };

  const handleCancel = async (inviteId: string) => {
    const result = await cancelInvite(inviteId);
    if (result.success) {
      toast.success('已取消申请');
      const data = await getMyInvites();
      setInvites(data);
    } else {
      toast.error(result.error || '操作失败');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">待处理</span>;
      case 'approved':
        return <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">已批准</span>;
      case 'rejected':
        return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">已拒绝</span>;
      default:
        return null;
    }
  };

  const getPermissionBadge = (permission: string) => {
    return permission === 'edit'
      ? <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">申请编辑</span>
      : <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">申请查看</span>;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-purple-500 to-blue-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-white" />
            <span className="text-white font-medium">申请通知</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('received')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'received' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            收到的申请
          </button>
          <button
            onClick={() => setActiveTab('sent')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'sent' ? 'text-purple-600 border-b-2 border-purple-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            我发出的申请
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{activeTab === 'received' ? '暂无收到申请' : '暂无发出的申请'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map(invite => (
                <div key={invite.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {invite.notebook_title || '未知笔记本'}
                      </p>
                      {activeTab === 'received' ? (
                        <p className="text-xs text-gray-500 mt-0.5">
                          申请人：{invite.requester_name || invite.requester_email || '未知用户'}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 mt-0.5">
                          申请时间：{new Date(invite.created_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      {getStatusBadge(invite.status)}
                      {activeTab === 'sent' && invite.status === 'pending' && getPermissionBadge(invite.permission)}
                    </div>
                  </div>
                  
                  {activeTab === 'received' && invite.status === 'pending' && (
                    <div className="flex gap-2 mt-3 items-center">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => handlePermissionChange(invite.id, 'view')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            (selectedPermissions[invite.id] ?? invite.permission) === 'view'
                              ? 'bg-blue-500 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePermissionChange(invite.id, 'edit')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            (selectedPermissions[invite.id] ?? invite.permission) === 'edit'
                              ? 'bg-green-500 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          编辑
                        </button>
                      </div>
                      <button
                        onClick={() => handleApprove(invite)}
                        className="flex-1 py-1.5 bg-green-500 text-white text-xs rounded-lg hover:bg-green-600 transition-colors"
                      >
                        批准
                      </button>
                      <button
                        onClick={() => handleRespond(invite.id, 'reject')}
                        className="flex-1 py-1.5 bg-red-500 text-white text-xs rounded-lg hover:bg-red-600 transition-colors"
                      >
                        拒绝
                      </button>
                    </div>
                  )}
                  {activeTab === 'sent' && invite.status === 'pending' && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => handleCancel(invite.id)}
                        className="px-3 py-1 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        取消申请
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
