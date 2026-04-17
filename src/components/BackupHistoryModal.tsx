/**
 * 历史版本弹窗
 * 
 * 功能：
 * - 显示页面的所有本地备份版本
 * - 预览备份内容
 * - 恢复到指定版本
 */
import React, { useState, useEffect } from 'react';
import { History, RefreshCw, Trash2, Eye, X, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getBackups,
  getBackup,
  deleteBackup,
  formatSize,
  type BackupRecord,
} from '../lib/localBackup';

interface BackupHistoryModalProps {
  noteId: string;
  noteTitle: string;
  onRestore: (content: string) => void;
  onClose: () => void;
}

export const BackupHistoryModal: React.FC<BackupHistoryModalProps> = ({
  noteId,
  noteTitle,
  onRestore,
  onClose,
}) => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [selectedBackup, setSelectedBackup] = useState<BackupRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);

  // 加载备份列表
  useEffect(() => {
    const loadBackups = async () => {
      setLoading(true);
      const backupList = await getBackups(noteId);
      setBackups(backupList);
      setLoading(false);
    };
    loadBackups();
  }, [noteId]);

  // 查看备份内容
  const handleViewBackup = async (backup: BackupRecord) => {
    const fullBackup = await getBackup(backup.id);
    if (fullBackup) {
      setSelectedBackup(fullBackup);
      // 简单预览：提取文本内容
      try {
        const content = JSON.parse(fullBackup.content);
        const extractText = (node: any): string => {
          if (node.type === 'text') return node.text || '';
          if (node.content) return node.content.map(extractText).join('');
          return '';
        };
        const text = extractText(content);
        setPreviewContent(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
      } catch {
        setPreviewContent('无法解析内容');
      }
      setShowPreview(true);
    }
  };

  // 恢复备份
  const handleRestore = () => {
    if (!selectedBackup) return;
    
    if (!confirm(`确定要将页面恢复到 ${new Date(selectedBackup.createdAt).toLocaleString('zh-CN')} 的版本吗？\n\n当前内容将被替换！`)) {
      return;
    }

    onRestore(selectedBackup.content);
    onClose();
    toast.success('已恢复到历史版本');
  };

  // 删除备份
  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm('确定要删除这个备份吗？')) {
      return;
    }

    const result = await deleteBackup(backupId);
    if (result.success) {
      setBackups(backups.filter(b => b.id !== backupId));
      if (selectedBackup?.id === backupId) {
        setSelectedBackup(null);
        setShowPreview(false);
      }
      toast.success('备份已删除');
    } else {
      toast.error('删除失败');
    }
  };

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
              <History className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">历史版本</h2>
              <p className="text-xs text-gray-400 truncate max-w-xs">{noteTitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex h-[400px]">
          {/* 左侧备份列表 */}
          <div className="w-1/2 border-r border-gray-100 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
              </div>
            ) : backups.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <History className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">暂无历史版本</p>
                <p className="text-xs mt-1">保存页面时将自动创建备份</p>
              </div>
            ) : (
              <div className="p-2">
                {backups.map((backup) => (
                  <div
                    key={backup.id}
                    className={`p-3 rounded-xl cursor-pointer transition-colors mb-2 ${
                      selectedBackup?.id === backup.id
                        ? 'bg-purple-50 border border-purple-200'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleViewBackup(backup)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {formatDate(backup.createdAt)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          版本 v{backup.version} · {formatSize(backup.size)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteBackup(backup.id);
                        }}
                        className="p-1.5 hover:bg-red-100 rounded-lg transition-colors"
                        title="删除此备份"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 右侧预览 */}
          <div className="w-1/2 p-4 bg-gray-50 overflow-y-auto">
            {!showPreview ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <Eye className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">点击左侧版本查看内容</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-medium text-gray-500">内容预览</p>
                  <button
                    onClick={handleRestore}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-600 transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    恢复此版本
                  </button>
                </div>
                <div className="bg-white rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {previewContent}
                </div>
                <div className="mt-4 flex items-start gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <p>恢复将用历史版本替换当前内容。建议先备份当前内容。</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
