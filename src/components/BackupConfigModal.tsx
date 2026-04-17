/**
 * 备份配置弹窗
 *
 * 功能：
 * - 开启/关闭自动备份
 * - 查看备份路径（固定路径）
 * - 查看备份统计信息
 * - 清空所有备份
 */
import React, { useState, useEffect } from 'react';
import { HardDrive, Trash2, RefreshCw, Info, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getBackupConfig,
  setBackupConfig,
  getBackupStats,
  clearAllBackups,
  formatSize,
  getBackupPathDisplay,
  type BackupConfig,
} from '../lib/localBackup';

// 检测是否为 Tauri 环境
function isTauri(): boolean {
  return typeof window !== 'undefined' && !!window.__TAURI__;
}

interface BackupConfigModalProps {
  onClose: () => void;
}

export const BackupConfigModal: React.FC<BackupConfigModalProps> = ({ onClose }) => {
  const [config, setConfigState] = useState<BackupConfig>({ enabled: false, maxVersions: 10 });
  const [stats, setStats] = useState({ totalBackups: 0, totalSize: 0, noteCount: 0 });
  const [loading, setLoading] = useState(true);

  // 加载配置和统计
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const savedConfig = getBackupConfig();
      setConfigState(savedConfig);
      const backupStats = await getBackupStats();
      setStats(backupStats);
      setLoading(false);
    };
    loadData();
  }, []);

  // 切换备份开关
  const handleToggleBackup = async () => {
    const newConfig = { ...config, enabled: !config.enabled };
    setBackupConfig(newConfig);
    setConfigState(newConfig);
    toast.success(newConfig.enabled ? '自动备份已开启' : '自动备份已关闭');
  };

  // 清空所有备份
  const handleClearBackups = async () => {
    if (!confirm('确定要清空所有本地备份吗？此操作不可恢复！')) {
      return;
    }

    const result = await clearAllBackups();
    if (result.success) {
      setStats({ totalBackups: 0, totalSize: 0, noteCount: 0 });
      toast.success('所有备份已清空');
    } else {
      toast.error('清空失败，请重试');
    }
  };

  const isTauriApp = isTauri();
  const backupPath = getBackupPathDisplay();

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
              <HardDrive className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800">本地备份设置</h2>
              <p className="text-xs text-gray-400">
                {isTauriApp ? '备份到APP数据目录' : '备份到浏览器本地存储'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <span className="text-gray-400 text-xl">×</span>
          </button>
        </div>

        {/* 内容 */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : (
            <>
              {/* 说明 */}
              <div className="bg-blue-50 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-700">
                    <p className="font-medium mb-1">如何工作</p>
                    <ul className="text-xs space-y-1 text-blue-600">
                      <li>• 每次保存页面时自动备份到本地</li>
                      <li>• 每个页面保留最近 10 个版本</li>
                      <li>• 右键页面可查看和恢复历史版本</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 备份路径显示 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">备份路径</label>
                <div className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                  {backupPath}
                </div>
              </div>

              {/* 开关 */}
              <div className="flex items-center justify-between py-4 border-b border-gray-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">自动备份</p>
                  <p className="text-xs text-gray-400 mt-1">保存页面时自动创建本地备份</p>
                </div>
                <button
                  onClick={handleToggleBackup}
                  className={`relative w-12 h-7 rounded-full transition-colors ${
                    config.enabled ? 'bg-blue-500' : 'bg-gray-200'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      config.enabled ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* 统计信息 */}
              <div className="mt-6">
                <p className="text-xs font-medium text-gray-500 uppercase mb-3">备份统计</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-800">{stats.totalBackups}</p>
                    <p className="text-xs text-gray-400 mt-1">备份数量</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-800">{formatSize(stats.totalSize)}</p>
                    <p className="text-xs text-gray-400 mt-1">占用空间</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-gray-800">{stats.noteCount}</p>
                    <p className="text-xs text-gray-400 mt-1">备份页面</p>
                  </div>
                </div>
              </div>

              {/* 清空按钮 */}
              {stats.totalBackups > 0 && (
                <button
                  onClick={handleClearBackups}
                  className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm font-medium">清空所有备份</span>
                </button>
              )}

              {/* 提示 */}
              <div className="mt-6 flex items-start gap-2 text-xs text-gray-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                  {isTauriApp
                    ? '备份文件存储在APP数据目录中，卸载APP会删除备份。'
                    : '本地备份存储在浏览器中，清除浏览器数据会导致备份丢失。建议定期导出重要笔记。'}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
