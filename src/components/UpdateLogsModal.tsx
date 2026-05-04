import React, { useState, useEffect } from 'react';
import { Plus, X, Trash2, GitBranch, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getUpdateLogsCache, setUpdateLogsCache } from '../store/noteStore';
import { getUpdateLogs, updateUpdateLog, addUpdateLog, deleteUpdateLog } from '../lib/initDatabase';
import { ConfirmModal } from './ConfirmModal';

interface UpdateLogsModalProps {
  onClose: () => void;
  isAdmin: boolean;
}

export const UpdateLogsModal: React.FC<UpdateLogsModalProps> = ({ onClose, isAdmin }) => {
  const [updates, setUpdates] = useState<Array<{id?: string; version: string; date: string; items: string[]}>>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editVersion, setEditVersion] = useState('');
  const [editDate, setEditDate] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [newDate, setNewDate] = useState(new Date().toISOString().split('T')[0]);
  const [newItems, setNewItems] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDanger?: boolean;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const sortByVersion = (logs: any[]) => {
    return [...logs].sort((a, b) => {
      const parseVersion = (v: string) => {
        const match = v.replace('v', '').split('.').map(Number);
        while (match.length < 3) match.push(0);
        return match;
      };
      const aParts = parseVersion(a.version);
      const bParts = parseVersion(b.version);
      for (let i = 0; i < 3; i++) {
        if (aParts[i] !== bParts[i]) return bParts[i] - aParts[i];
      }
      return 0;
    });
  };

  useEffect(() => {
    const loadLogs = async () => {
      const logs = await getUpdateLogs();
      if (logs.length > 0) {
        setUpdates(sortByVersion(logs));
        setUpdateLogsCache(logs);
      } else {
        const defaultLogs = [
          { version: 'v2.0.1', date: '2026-04-09', items: ['本地备份功能：保存时自动备份，每个页面保留10个版本', '备份恢复锁定检查：被锁页面无权限用户无法恢复', 'APP端备份路径：固定存储在应用数据目录', '删除意见反馈入口'] },
          { version: 'v1.9', date: '2026-04-02', items: ['RLS 行级安全启用：所有数据库表启用 RLS 策略', '加载体验优化：去掉转圈动画，直接显示进度条', '加载进度细化：每个步骤显示具体操作，方便调试卡顿问题'] },
        ];
        for (const log of defaultLogs) {
          await addUpdateLog(log);
        }
        setUpdates(defaultLogs);
        setUpdateLogsCache(defaultLogs);
      }
      setLoading(false);
    };
    loadLogs();
  }, []);

  const startEdit = (update: {id?: string; version: string; date: string; items: string[]}, index: number) => {
    setEditingId(update.id || `new-${index}`);
    setEditVersion(update.version);
    setEditDate(update.date);
    setEditText(update.items.join('\n'));
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    const newItems = editText.split('\n').filter(s => s.trim());
    const updateIndex = updates.findIndex(u => (u.id || '') === editingId);
    if (updateIndex !== -1) {
      const update = updates[updateIndex];
      const result = await updateUpdateLog(update.id!, {
        version: editVersion.trim(),
        date: editDate.trim(),
        items: newItems,
      });
      if (result.success) {
        const updatedLogs = updates.map((u, i) =>
          i === updateIndex ? { ...u, version: editVersion.trim(), date: editDate.trim(), items: newItems } : u
        );
        setUpdates(updatedLogs);
        setUpdateLogsCache(updatedLogs);
        toast.success('更新日志已保存');
      } else {
        toast.error('保存失败');
      }
    }
    setEditingId(null);
    setEditText('');
    setEditVersion('');
    setEditDate('');
  };

  const handleAddVersion = async () => {
    if (!newVersion.trim() || !newDate.trim()) {
      toast.error('请填写版本号和日期');
      return;
    }
    const items = newItems.split('\n').filter(s => s.trim());
    const result = await addUpdateLog({
      version: newVersion.trim(),
      date: newDate.trim(),
      items,
    });
    if (result.success && result.data) {
      const updatedLogs = sortByVersion([{ ...result.data, items }, ...updates]);
      setUpdates(updatedLogs);
      setUpdateLogsCache(updatedLogs);
      setNewVersion('');
      setNewDate(new Date().toISOString().split('T')[0]);
      setNewItems('');
      setShowAddForm(false);
      toast.success('版本已添加');
    } else {
      toast.error('添加失败');
    }
  };

  const handleDeleteVersion = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: '删除版本',
      message: '确定要删除此版本吗？',
      isDanger: true,
      onConfirm: async () => {
        const result = await deleteUpdateLog(id);
        if (result.success) {
          const updatedLogs = sortByVersion(updates.filter(u => u.id !== id));
          setUpdates(updatedLogs);
          setUpdateLogsCache(updatedLogs);
          toast.success('版本已删除');
        } else {
          toast.error('删除失败');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-8 text-center">
          <div className="animate-pulse">加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden max-h-[80vh] flex flex-col">
        <div className="bg-gradient-to-r from-purple-500 to-blue-600 px-6 py-5 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-3">
            <GitBranch className="w-6 h-6 text-white" />
            <div>
              <h2 className="text-xl font-bold text-white">更新日志</h2>
              <p className="text-purple-200 text-sm">了解最新功能和改进</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && !showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="text-white/80 hover:text-white flex items-center gap-1 text-sm"
              >
                <Plus className="w-4 h-4" />
                添加版本
              </button>
            )}
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isAdmin && showAddForm && (
            <div className="border-2 border-dashed border-purple-300 rounded-lg p-4 space-y-3 bg-purple-50">
              <h3 className="text-sm font-semibold text-purple-700">添加新版本</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newVersion}
                  onChange={(e) => setNewVersion(e.target.value)}
                  placeholder="版本号，如 v1.5"
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1.5"
                />
              </div>
              <textarea
                value={newItems}
                onChange={(e) => setNewItems(e.target.value)}
                placeholder="更新内容（每行一条）"
                className="w-full text-xs border border-gray-300 rounded p-2 resize-none"
                rows={3}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAddVersion}
                  className="text-xs bg-purple-500 text-white px-4 py-1.5 rounded hover:bg-purple-600"
                >
                  确定添加
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewVersion('');
                    setNewItems('');
                  }}
                  className="text-xs bg-gray-200 text-gray-700 px-4 py-1.5 rounded hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {updates.map((update, index) => (
            <div key={update.id || index} className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {update.version}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{update.date}</span>
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteVersion(update.id!)}
                      className="text-xs text-red-500 hover:text-red-700"
                      title="删除版本"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && editingId !== (update.id || `new-${index}`) && (
                    <button
                      onClick={() => startEdit(update, index)}
                      className="text-xs text-purple-600 hover:text-purple-800"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>
              {editingId === (update.id || `new-${index}`) ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editVersion}
                      onChange={(e) => setEditVersion(e.target.value)}
                      placeholder="版本号"
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                    />
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="text-xs border border-gray-300 rounded px-2 py-1"
                    />
                  </div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded p-2 leading-relaxed resize-none"
                    rows={4}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="text-xs bg-purple-500 text-white px-3 py-1 rounded hover:bg-purple-600"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="space-y-1">
                  {update.items.map((item, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-gray-600 leading-relaxed">
                      <CheckCircle className="w-3 h-3 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDanger={confirmModal.isDanger}
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};
