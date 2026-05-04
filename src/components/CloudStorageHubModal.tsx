import React, { useState, useEffect } from 'react';
import { X, Cloud, HardDrive, Database, CheckCircle, Settings } from 'lucide-react';
import { checkOneDriveBinding } from '../lib/onedriveService';
import { checkBaiduBinding } from '../lib/baiduService';
import { checkQiniuConfig } from '../lib/qiniuService';
import { OneDriveModal } from './OneDriveModal';
import { BaiduModal } from './BaiduModal';
import { QiniuModal } from './QiniuModal';

interface CloudStorageHubModalProps {
  onClose: () => void;
}

interface ProviderStatus {
  onedrive: boolean;
  baidu: boolean;
  qiniu: boolean;
}

const PROVIDERS = [
  {
    key: 'onedrive' as const,
    name: 'OneDrive',
    icon: Cloud,
    color: 'from-blue-500 to-blue-600',
    textColor: 'text-blue-600',
    bgColor: 'bg-blue-50',
    checkFn: checkOneDriveBinding,
  },
  {
    key: 'baidu' as const,
    name: '百度网盘',
    icon: HardDrive,
    color: 'from-green-500 to-teal-600',
    textColor: 'text-green-600',
    bgColor: 'bg-green-50',
    checkFn: checkBaiduBinding,
  },
  {
    key: 'qiniu' as const,
    name: '七牛云',
    icon: Database,
    color: 'from-orange-500 to-red-500',
    textColor: 'text-orange-600',
    bgColor: 'bg-orange-50',
    checkFn: checkQiniuConfig,
  },
];

export const CloudStorageHubModal: React.FC<CloudStorageHubModalProps> = ({ onClose }) => {
  const [subModal, setSubModal] = useState<'onedrive' | 'baidu' | 'qiniu' | null>(null);
  const [status, setStatus] = useState<ProviderStatus>({ onedrive: false, baidu: false, qiniu: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAllStatus();
  }, []);

  const fetchAllStatus = async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      PROVIDERS[0].checkFn(),
      PROVIDERS[1].checkFn(),
      PROVIDERS[2].checkFn(),
    ]);
    setStatus({
      onedrive: results[0].status === 'fulfilled' ? results[0].value.bound : false,
      baidu: results[1].status === 'fulfilled' ? results[1].value.bound : false,
      qiniu: results[2].status === 'fulfilled' ? results[2].value.bound : false,
    });
    setLoading(false);
  };

  const handleSubModalClose = () => {
    setSubModal(null);
    fetchAllStatus();
  };

  if (subModal === 'onedrive') {
    return <OneDriveModal onClose={handleSubModalClose} />;
  }
  if (subModal === 'baidu') {
    return <BaiduModal onClose={handleSubModalClose} />;
  }
  if (subModal === 'qiniu') {
    return <QiniuModal onClose={handleSubModalClose} />;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[480px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-medium text-base">绑定个人云盘</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-gray-500">
            选择一个云盘服务绑定，绑定后你拥有的笔记本可以使用该云盘作为存储空间。
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-3">
              {PROVIDERS.map(provider => {
                const Icon = provider.icon;
                const isBound = status[provider.key];
                return (
                  <div
                    key={provider.key}
                    className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${isBound ? 'border-green-300 bg-green-50/50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${provider.color} flex items-center justify-center flex-shrink-0`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{provider.name}</p>
                      <p className="text-xs mt-0.5">
                        {isBound ? (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            已绑定
                          </span>
                        ) : (
                          <span className="text-gray-400">未绑定</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => setSubModal(provider.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${isBound ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : `bg-gradient-to-r ${provider.color} text-white hover:opacity-90`}`}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      配置
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 leading-relaxed">
            <p className="font-medium text-gray-600 mb-1">说明</p>
            <p>• 每个笔记本的拥有者需要绑定自己的云盘</p>
            <p>• 共享笔记本的用户上传的文件将使用拥有者的云盘空间</p>
            <p>• 可以随时解绑并切换到其他云盘</p>
          </div>
        </div>
      </div>
    </div>
  );
};
