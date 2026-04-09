import React, { useState, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { uploadToOneDrive, formatFileSize, checkOneDriveBinding } from '../lib/onedriveService';
import { X, Upload, Cloud, FileText, Image, Video, Volume2, FileCode, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface AttachmentInsertModalProps {
  onClose: () => void;
  onInsert: (attrs: {
    attachmentId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    onedrivePath: string;
    category: string;
  }) => void;
  noteId: string | null;
}

export const AttachmentInsertModal: React.FC<AttachmentInsertModalProps> = ({
  onClose,
  onInsert,
  noteId,
}) => {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isBindingCheckDone, setIsBindingCheckDone] = useState(false);
  const [isBound, setIsBound] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 检查 OneDrive 绑定状态
  React.useEffect(() => {
    const checkBinding = async () => {
      if (!user) return;
      const result = await checkOneDriveBinding(user.id);
      setIsBound(result.bound);
      setIsBindingCheckDone(true);
    };
    checkBinding();
  }, [user]);

  if (!isBound && isBindingCheckDone) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-[400px] overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Cloud className="w-5 h-5 text-white" />
              <span className="text-white font-medium">插入附件</span>
            </div>
            <button onClick={onClose} className="text-white/80 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertCircle className="w-8 h-8 text-orange-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-800 mb-2">请先绑定 OneDrive 账号</h3>
            <p className="text-sm text-gray-500 mb-4">
              在使用附件功能之前，需要先绑定您的 OneDrive 账号。
            </p>
            <p className="text-xs text-gray-400">
              点击右上角头像 → OneDrive 云盘 → 绑定账号
            </p>
          </div>
          <div className="px-4 py-3 bg-gray-50 flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!user || !selectedFile) return;
    setUploading(true);

    try {
      const result = await uploadToOneDrive(user.id, noteId, selectedFile, '/彩云笔记', '彩云笔记');
      if (result.success && result.data) {
        toast.success('上传成功！');
        onInsert({
          attachmentId: result.data.onedrive_file_id,
          fileName: result.data.file_name,
          fileSize: result.data.file_size,
          mimeType: result.data.mime_type,
          onedrivePath: result.data.onedrive_path,
          category: result.data.category,
        });
        onClose();
      } else {
        toast.error(result.error || '上传失败');
      }
    } finally {
      setUploading(false);
    }
  };

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith('image/')) return <Image className="w-12 h-12 text-pink-500" />;
    if (type.startsWith('video/')) return <Video className="w-12 h-12 text-red-500" />;
    if (type.startsWith('audio/')) return <Volume2 className="w-12 h-12 text-yellow-500" />;
    if (type.includes('pdf') || type.includes('document')) return <FileText className="w-12 h-12 text-blue-500" />;
    return <FileCode className="w-12 h-12 text-gray-500" />;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-[440px] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-white" />
            <span className="text-white font-medium">插入附件</span>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-4">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
          />

          {!selectedFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
            >
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-400" />
              <p className="text-sm text-gray-600">点击选择文件</p>
              <p className="text-xs text-gray-400 mt-1">文件将上传到您的 OneDrive</p>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0">
                  {getFileIcon(selectedFile)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{selectedFile.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatFileSize(selectedFile.size)}</p>
                </div>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-3 flex items-center gap-1">
            <Cloud className="w-3 h-3" />
            文件上传到 OneDrive /彩云笔记 目录
          </p>
        </div>

        {/* 底部 */}
        <div className="px-4 py-3 bg-gray-50 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                上传中...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                上传并插入
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};