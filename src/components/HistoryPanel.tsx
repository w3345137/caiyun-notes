import React, { useState, useEffect, useRef } from 'react';
import { X, Clock, User } from 'lucide-react';
import { useNoteStore } from '../store/noteStore';
import { useAuth } from './AuthProvider';
import toast from 'react-hot-toast';

interface HistoryEntry {
  id: string;
  noteId: string;
  userId: string;
  userName: string;
  timestamp: Date | string;
  action: 'create' | 'update' | 'delete';
}

export const HistoryPanel: React.FC<{
  noteId: string | null;
  onClose: () => void;
}> = ({ noteId, onClose }) => {
  const { user } = useAuth();
  const notes = useNoteStore((state) => state.notes);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  const userName = user?.display_name || user?.user_metadata?.display_name || user?.email?.split('@')[0] || '未知用户';

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // 添加延迟，避免初始化时触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  useEffect(() => {
    if (noteId) {
      // 从笔记数据生成历史记录，使用真实的创建者和修改者信息
      const note = notes.find(n => n.id === noteId);
      if (note) {
        const mockHistory: HistoryEntry[] = [];

        // 添加修改记录（如果存在修改者信息）
        if (note.updatedBy) {
          mockHistory.push({
            id: '1',
            noteId: note.id,
            userId: note.updatedBy || '',
            userName: note.updatedByName || '未知用户',
            timestamp: note.updatedAt,
            action: 'update',
          });
        }

        // 添加创建记录（如果存在创建者信息）
        if (note.createdBy) {
          mockHistory.push({
            id: '2',
            noteId: note.id,
            userId: note.createdBy || '',
            userName: note.createdByName || '未知用户',
            timestamp: note.createdAt,
            action: 'create',
          });
        }

        setHistory(mockHistory.sort((a, b) =>
          new Date(b.timestamp as string).getTime() - new Date(a.timestamp as string).getTime()
        ));
      }
    }
  }, [noteId, notes]);

  const getActionText = (action: HistoryEntry['action']) => {
    switch (action) {
      case 'create':
        return '创建';
      case 'update':
        return '修改';
      case 'delete':
        return '删除';
      default:
        return '操作';
    }
  };

  const getActionColor = (action: HistoryEntry['action']) => {
    switch (action) {
      case 'create':
        return 'bg-green-100 text-green-600';
      case 'update':
        return 'bg-blue-100 text-blue-600';
      case 'delete':
        return 'bg-red-100 text-red-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const formatTime = (date: Date | string) => {
    const d = new Date(date as string);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    if (diffDays < 7) return `${diffDays}天前`;
    return d.toLocaleDateString('zh-CN');
  };

  if (!noteId) return null;

  return (
    <div ref={panelRef} className="absolute right-0 top-0 bottom-0 w-[320px] bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-500" />
          <span className="font-medium text-gray-800">修改日志</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-200 rounded transition-colors"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      {/* 历史记录列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        {history.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无修改记录</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div
                key={entry.id}
                className="bg-gray-50 rounded-lg p-3 border border-gray-100 hover:border-gray-200 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${getActionColor(entry.action)}`}>
                    {getActionText(entry.action)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatTime(entry.timestamp)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <User className="w-4 h-4" />
                  <span>{entry.userName}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {new Date(entry.timestamp as string).toLocaleString('zh-CN')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
        <p className="text-xs text-gray-400 text-center">
          显示最近的修改记录
        </p>
      </div>
    </div>
  );
};
