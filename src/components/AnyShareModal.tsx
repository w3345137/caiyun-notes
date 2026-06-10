import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle, Cloud, Download, FileText, RefreshCw, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from './authContext';
import { ConfirmModal } from './ConfirmModal';
import {
  AnyShareDocLib,
  checkAnyShareBinding,
  deleteAnyShareAttachment,
  downloadFromAnyShare,
  getAnyShareAttachments,
  listAnyShareDocLibs,
  saveAnyShareConfig,
  testAnyShareConfig,
  unbindAnyShare,
} from '../lib/anyshareService';
import { Attachment, formatFileSize } from '../lib/onedriveService';

interface AnyShareModalProps {
  onClose: () => void;
}

export const AnyShareModal: React.FC<AnyShareModalProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'config' | 'files'>('config');
  const [baseUrl, setBaseUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [rootDocid, setRootDocid] = useState('');
  const [rootName, setRootName] = useState('');
  const [docLibs, setDocLibs] = useState<AnyShareDocLib[]>([]);
  const [isBound, setIsBound] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

  const checkBindingStatus = useCallback(async () => {
    if (!user) return;
    const result = await checkAnyShareBinding();
    setIsBound(result.bound);
    if (result.account) {
      setBaseUrl(result.account.base_url || '');
      setClientId(result.account.client_id || '');
      setRootDocid(result.account.root_docid || '');
      setRootName(result.account.root_name || '');
    }
  }, [user]);

  const loadAttachments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const result = await getAnyShareAttachments();
    if (result.success) setAttachments(result.data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    checkBindingStatus();
  }, [checkBindingStatus]);

  const credentialsReady = baseUrl.trim() && clientId.trim() && clientSecret.trim();

  const handleLoadDocLibs = async () => {
    if (!credentialsReady) {
      toast.error('请先填写 API 地址、Client ID 和 Client Secret');
      return;
    }
    setLoading(true);
    const result = await listAnyShareDocLibs({
      base_url: baseUrl.trim(),
      client_id: clientId.trim(),
      client_secret: clientSecret,
    });
    setLoading(false);
    if (result.success) {
      setDocLibs(result.data || []);
      toast.success(`已读取 ${result.data?.length || 0} 个文档库`);
    } else {
      toast.error(result.error || '读取文档库失败');
    }
  };

  const handleTest = async () => {
    if (!credentialsReady) {
      toast.error('请先填写 API 地址、Client ID 和 Client Secret');
      return;
    }
    setLoading(true);
    const result = await testAnyShareConfig({
      base_url: baseUrl.trim(),
      client_id: clientId.trim(),
      client_secret: clientSecret,
    });
    setLoading(false);
    if (result.success) {
      setDocLibs(result.data || []);
      toast.success(result.message || '连接成功');
    } else {
      toast.error(result.error || '连接失败');
    }
  };

  const handleSave = async () => {
    if (!credentialsReady || !rootDocid.trim()) {
      toast.error('请填写连接信息并选择文档库');
      return;
    }
    setLoading(true);
    const result = await saveAnyShareConfig({
      base_url: baseUrl.trim(),
      client_id: clientId.trim(),
      client_secret: clientSecret,
      root_docid: rootDocid.trim(),
      root_name: rootName.trim(),
    });
    setLoading(false);
    if (result.success) {
      setIsBound(true);
      setClientSecret('');
      toast.success('AnyShare 配置已保存');
      checkBindingStatus();
    } else {
      toast.error(result.error || '保存失败');
    }
  };

  const handleUnbind = async () => {
    setConfirmModal({
      isOpen: true,
      title: '解绑 AnyShare',
      message: '确定要解绑 AnyShare 吗？已上传到 AnyShare 的附件将无法继续访问。',
      onConfirm: async () => {
        const result = await unbindAnyShare();
        if (result.success) {
          setIsBound(false);
          setBaseUrl('');
          setClientId('');
          setClientSecret('');
          setRootDocid('');
          setRootName('');
          toast.success('已解绑 AnyShare');
        } else {
          toast.error(result.error || '解绑失败');
        }
      },
    });
  };

  const handleDownload = async (attachment: Attachment) => {
    const result = await downloadFromAnyShare(attachment.id);
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

  const handleDelete = async (attachment: Attachment) => {
    setConfirmModal({
      isOpen: true,
      title: '删除附件',
      message: `确定要删除 "${attachment.file_name}" 吗？`,
      onConfirm: async () => {
        const result = await deleteAnyShareAttachment(attachment.id);
        if (result.success) {
          toast.success('删除成功');
          loadAttachments();
        } else {
          toast.error(result.error || '删除失败');
        }
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[640px] max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-slate-600 to-cyan-600 px-4 py-3 flex justify-between items-center flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-white" />
            <span className="text-white font-medium">AnyShare 文档云</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-gray-200 flex-shrink-0">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'config' ? 'text-cyan-700 border-b-2 border-cyan-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            连接配置
          </button>
          <button
            onClick={() => { setActiveTab('files'); loadAttachments(); }}
            className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${activeTab === 'files' ? 'text-cyan-700 border-b-2 border-cyan-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            文件管理
          </button>
        </div>

        {activeTab === 'config' ? (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {isBound && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                <CheckCircle className="w-4 h-4" />
                AnyShare 已绑定
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="API 地址，例如 https://share.example.com" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              <input value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Client ID" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
              <input value={clientSecret} onChange={e => setClientSecret(e.target.value)} placeholder={isBound ? 'Client Secret（如需更新请重新输入）' : 'Client Secret'} type="password" className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>

            <div className="flex items-center gap-2">
              <button disabled={loading} onClick={handleTest} className="px-3 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 disabled:opacity-50">测试连接</button>
              <button disabled={loading} onClick={handleLoadDocLibs} className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-50">
                <RefreshCw className="w-4 h-4" />
                读取文档库
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">根文档库</label>
              <select
                value={rootDocid}
                onChange={e => {
                  const selected = docLibs.find(lib => lib.docid === e.target.value);
                  setRootDocid(e.target.value);
                  setRootName(selected?.name || rootName);
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value={rootDocid}>{rootName || rootDocid || '请选择文档库'}</option>
                {docLibs.map(lib => <option key={lib.docid} value={lib.docid}>{lib.name}</option>)}
              </select>
              <input value={rootDocid} onChange={e => setRootDocid(e.target.value)} placeholder="或手动填写 gns://..." className="mt-2 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button disabled={loading} onClick={handleSave} className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50">保存配置</button>
              {isBound && <button onClick={handleUnbind} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100">解绑</button>}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="flex items-center justify-center py-8"><div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : attachments.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">暂无 AnyShare 附件</p>
            ) : (
              <div className="space-y-2">
                {attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                    <FileText className="w-5 h-5 text-cyan-600" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{attachment.file_name}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(attachment.file_size || 0)}</p>
                    </div>
                    <button onClick={() => handleDownload(attachment)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Download className="w-4 h-4" /></button>
                    <button onClick={() => handleDelete(attachment)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><Trash2 className="w-4 h-4" /></button>
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
        onConfirm={() => {
          confirmModal.onConfirm();
          setConfirmModal({ ...confirmModal, isOpen: false });
        }}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
};
