import React, { useState, useEffect } from 'react';
import { X, Database, Download, Trash2, Image, Video, FileText, FileCode, CheckCircle, Volume2, HelpCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './AuthProvider';
import { saveQiniuConfig, checkQiniuConfig, deleteQiniuConfig, getQiniuAttachments, downloadFromQiniu, deleteQiniuAttachment, formatFileSize, QiniuAttachment } from '../lib/qiniuService';
import { ConfirmModal } from './ConfirmModal';

interface QiniuModalProps {
  onClose: () => void;
}

const REGIONS: Record<string, string> = {
  'z0': '华东 (z0)',
  'z1': '华北 (z1)',
  'z2': '华南 (z2)',
  'na0': '北美 (na0)',
  'as0': '东南亚 (as0)',
};

export const QiniuModal: React.FC<QiniuModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'config' | 'files'>('config');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [bucket, setBucket] = useState('');
  const [region, setRegion] = useState('z0');
  const [domain, setDomain] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isBound, setIsBound] = useState(false);
  const [attachments, setAttachments] = useState<QiniuAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  useEffect(() => {
    checkBindingStatus();
  }, []);

  const checkBindingStatus = async () => {
    if (!user) return;
    const result = await checkQiniuConfig();
    setIsBound(result.bound);
  };

  const loadAttachments = async () => {
    if (!user) return;
    setLoading(true);
    const result = await getQiniuAttachments();
    if (result.success) {
      setAttachments(result.data || []);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!user || !accessKey.trim() || !secretKey.trim() || !bucket.trim()) {
      toast.error('请填写 Access Key、Secret Key 和 Bucket 名称');
      return;
    }
    setIsSaving(true);
    try {
      const result = await saveQiniuConfig({
        access_key: accessKey.trim(),
        secret_key: secretKey.trim(),
        bucket: bucket.trim(),
        region,
        domain: domain.trim(),
      });
      if (result.success) {
        toast.success('七牛云配置已保存');
        setIsBound(true);
        checkBindingStatus();
      } else {
        toast.error(result.error || '保存失败');
      }
    } catch (error) {
      console.error('Save Qiniu config error:', error);
      toast.error('保存配置失败');
    }
    setIsSaving(false);
  };

  const handleDeleteConfig = async () => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: '删除七牛云配置',
      message: '确定要删除七牛云存储配置吗？已上传的文件将无法访问。',
      onConfirm: async () => {
        const result = await deleteQiniuConfig();
        if (result.success) {
          toast.success('配置已删除');
          setIsBound(false);
          setAccessKey('');
          setSecretKey('');
          setBucket('');
          setDomain('');
          checkBindingStatus();
        } else {
          toast.error('删除失败');
        }
      }
    });
  };

  const handleDownload = async (attachment: QiniuAttachment) => {
    if (!user) return;
    const result = await downloadFromQiniu(attachment.id);
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

  const handleDelete = async (attachment: QiniuAttachment) => {
    if (!user) return;
    setConfirmModal({
      isOpen: true,
      title: '删除附件',
      message: `确定要删除 "${attachment.file_name}" 吗？`,
      onConfirm: async () => {
        const result = await deleteQiniuAttachment(attachment.id);
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
        <div className="bg-gradient-to-r from-orange-500 to-red-500 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-white" />
            <span className="text-white font-medium">七牛云对象存储</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'config' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            存储配置
          </button>
          <button
            onClick={() => { setActiveTab('files'); loadAttachments(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-orange-600 border-b-2 border-orange-500' : 'text-gray-500 hover:text-gray-700'}`}
          >
            文件管理
          </button>
        </div>

        {activeTab === 'config' && (
          <div className="flex flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {isBound ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="w-8 h-8 text-green-500" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">七牛云已配置</h3>
                  <p className="text-sm text-gray-500 mb-6">你可以开始在笔记中插入附件了</p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { setActiveTab('files'); loadAttachments(); }}
                      className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      查看附件
                    </button>
                    <button
                      onClick={handleDeleteConfig}
                      className="px-4 py-2 bg-red-100 text-red-600 text-sm font-medium rounded-lg hover:bg-red-200 transition-colors"
                    >
                      删除配置
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                    <p className="text-sm font-medium text-orange-800 mb-1">七牛云对象存储</p>
                    <p className="text-xs text-orange-600 leading-relaxed">
                      配置后，你拥有的笔记本可以使用七牛云作为存储空间，共享者通过你的笔记本上传/下载文件都会使用你的配额。
                    </p>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    <span className="font-semibold">一键粘贴：</span>将七牛云的 Access Key 和 Secret Key 用换行分隔，一次粘贴进来即可自动填入。
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Access Key
                    </label>
                    <input
                      type="password"
                      value={accessKey}
                      onChange={e => setAccessKey(e.target.value)}
                      onPaste={e => {
                        const text = e.clipboardData.getData('text');
                        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
                        if (lines.length >= 1) setAccessKey(lines[0]);
                        if (lines.length >= 2) setSecretKey(lines[1]);
                        e.preventDefault();
                      }}
                      placeholder='七牛云 Access Key'
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Secret Key
                    </label>
                    <input
                      type="password"
                      value={secretKey}
                      onChange={e => setSecretKey(e.target.value)}
                      placeholder='七牛云 Secret Key'
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Bucket 名称
                    </label>
                    <input
                      type="text"
                      value={bucket}
                      onChange={e => setBucket(e.target.value)}
                      placeholder='例如：my-notes-bucket'
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      存储区域
                    </label>
                    <select
                      value={region}
                      onChange={e => setRegion(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    >
                      {Object.entries(REGIONS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      绑定域名
                      <span className="text-gray-400 font-normal ml-1">(可选)</span>
                    </label>
                    <input
                      type="text"
                      value={domain}
                      onChange={e => setDomain(e.target.value)}
                      placeholder='自定义下载域名，如：https://cdn.example.com'
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-400 mt-1">不填则使用七牛云默认测试域名（有有效期限制）</p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={() => setShowGuide(!showGuide)}
                      className="text-xs text-orange-500 hover:text-orange-700 flex items-center gap-1"
                    >
                      <HelpCircle className="w-3.5 h-3.5" />
                      {showGuide ? '收起配置指南' : '查看配置指南'}
                    </button>
                  </div>

                  <button
                    onClick={handleSave}
                    disabled={isSaving || !accessKey.trim() || !secretKey.trim() || !bucket.trim()}
                    className="w-full py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />保存中...</>
                    ) : (
                      <><Database className="w-4 h-4" />保存配置</>
                    )}
                  </button>
                </>
              )}
            </div>

            {showGuide && (
              <div className="w-[300px] border-l border-gray-200 overflow-y-auto bg-amber-50 p-4 space-y-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-800">七牛云配置指南</p>
                  <button onClick={() => setShowGuide(false)} className="text-gray-400 hover:text-gray-600">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs text-amber-700 leading-relaxed">
                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第一步：注册并登录</p>
                    <p>1. 访问 <a href="https://portal.qiniu.com/" target="_blank" className="text-blue-600 underline">portal.qiniu.com</a></p>
                    <p>2. 注册七牛云账号并登录</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第二步：获取密钥</p>
                    <p>1. 进入控制台 <strong>"密钥管理"</strong></p>
                    <p>2. 复制 <strong>Access Key</strong></p>
                    <p>3. 复制 <strong>Secret Key</strong></p>
                    <p>4. 粘贴到左侧表单中（支持一键粘贴）</p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第三步：创建存储空间</p>
                    <p>1. 进入 <strong>"对象存储"</strong> → <strong>"空间管理"</strong></p>
                    <p>2. 点击 <strong>"新建空间"</strong></p>
                    <p>3. 填写 Bucket 名称（全局唯一）</p>
                    <p>4. 选择存储区域</p>
                    <p>5. 访问控制选择 <strong>"公开空间"</strong></p>
                  </div>

                  <div className="space-y-1.5">
                    <p className="font-semibold text-amber-800">第四步：填写并保存</p>
                    <p>1. 回到左侧表单</p>
                    <p>2. 填写 Bucket 名称和存储区域</p>
                    <p>3. 点击 <strong>"保存配置"</strong> 按钮</p>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-2.5 text-xs text-red-700 space-y-1">
                    <p className="font-semibold">注意事项：</p>
                    <p>• 测试域名有 30 天有效期，生产环境建议绑定自定义域名</p>
                    <p>• 公开空间的文件可以通过 URL 直接访问</p>
                    <p>• Access Key 和 Secret Key 请妥善保管，不要泄露</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'files' && (
          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : attachments.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <Database className="w-12 h-12 mx-auto mb-2 opacity-50" />
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
