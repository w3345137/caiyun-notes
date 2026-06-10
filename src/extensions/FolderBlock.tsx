import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Download, Trash2, FileText, Image, Video, Volume2, FileCode, Cloud, Upload, FolderOpen, Loader2, Plus, X, Eye, ArrowUpDown, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { downloadFromOneDrive, uploadToOneDrive, formatFileSize, getFileIconType, getAttachments, deleteAttachment } from '../lib/onedriveService';
import { downloadFromBaidu, uploadToBaidu, deleteBaiduAttachment, getBaiduAttachments } from '../lib/baiduService';
import { downloadFromQiniu, uploadToQiniu, deleteQiniuAttachment, getQiniuAttachments } from '../lib/qiniuService';
import { downloadFromAnyShare, uploadToAnyShare, deleteAnyShareAttachment, getAnyShareAttachments } from '../lib/anyshareService';
import { renameAttachment } from '../lib/attachmentService';
import {
  getCachedFolderFiles,
  getFolderFilesCacheKey,
  getFreshFolderFilesFromCache,
  getOrLoadFolderFiles,
  invalidateFolderFilesCache,
} from '../lib/folderFilesCache';
import { compareNaturalText } from '../lib/naturalSort';
import { useAuth } from '../components/authContext';
import { useNoteStore } from '../store/noteStore';
import toast from 'react-hot-toast';

type StorageProvider = 'onedrive' | 'baidu' | 'qiniu' | 'anyshare';

interface FolderFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  onedrive_path?: string;
  category: string;
  created_at: string;
  storage_provider?: StorageProvider;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    folderBlock: {
      insertFolderBlock: (attrs: { noteId: string; folderName: string; storageProvider?: StorageProvider }) => ReturnType;
    };
  }
}

interface FolderBlockAttrs {
  noteId: string;
  folderName: string;
  storageProvider?: StorageProvider;
}

const getProvider = (provider?: string): StorageProvider => {
  return provider === 'baidu' || provider === 'qiniu' || provider === 'anyshare' ? provider : 'onedrive';
};

const getFileExtension = (fileName: string) => {
  const name = fileName.trim();
  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === name.length - 1) return '';
  return name.slice(dotIndex).toLowerCase();
};

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result as string;
    resolve(result.split(',')[1] || '');
  };
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const uploadFile = async (provider: StorageProvider, file: File, noteId: string, folderName: string) => {
  if (provider === 'baidu') {
    return uploadToBaidu(noteId, file.name, await fileToBase64(file));
  }
  if (provider === 'qiniu') {
    return uploadToQiniu(noteId, file.name, await fileToBase64(file));
  }
  if (provider === 'anyshare') {
    return uploadToAnyShare(file, noteId);
  }
  return uploadToOneDrive(file, noteId, '/彩云笔记', folderName);
};

const downloadFile = (provider: StorageProvider, attachmentId: string) => {
  if (provider === 'baidu') return downloadFromBaidu(attachmentId);
  if (provider === 'qiniu') return downloadFromQiniu(attachmentId);
  if (provider === 'anyshare') return downloadFromAnyShare(attachmentId);
  return downloadFromOneDrive(attachmentId);
};

const deleteFile = (provider: StorageProvider, attachmentId: string) => {
  if (provider === 'baidu') return deleteBaiduAttachment(attachmentId);
  if (provider === 'qiniu') return deleteQiniuAttachment(attachmentId);
  if (provider === 'anyshare') return deleteAnyShareAttachment(attachmentId);
  return deleteAttachment(attachmentId);
};

const listFiles = async (provider: StorageProvider, noteId: string): Promise<FolderFile[]> => {
  const result =
    provider === 'baidu' ? await getBaiduAttachments(noteId) :
    provider === 'qiniu' ? await getQiniuAttachments(noteId) :
    provider === 'anyshare' ? await getAnyShareAttachments(noteId) :
    await getAttachments(noteId);

  if (!result.success) {
    throw new Error(result.error || '获取附件列表失败');
  }

  return (result.data || []).map((file) => ({
    ...file,
    storage_provider: file.storage_provider || provider,
  }));
};

// 文件预览弹窗
const FilePreviewModal: React.FC<{
  file: FolderFile | null;
  blobUrl: string | null;
  onClose: () => void;
}> = ({ file, blobUrl, onClose }) => {
  if (!file || !blobUrl) return null;

  const isImage = file.mime_type.startsWith('image/');
  const isVideo = file.mime_type.startsWith('video/');
  const isAudio = file.mime_type.startsWith('audio/');
  const isPdf = file.mime_type.includes('pdf');
  const isText = file.mime_type.startsWith('text/') || file.mime_type.includes('json') || file.mime_type.includes('javascript');

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-xl shadow-2xl max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-700 truncate">{file.file_name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(file.file_size)}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="p-4 flex items-center justify-center min-h-[200px] max-h-[calc(90vh-80px)] overflow-auto">
          {isImage && (
            <img
              src={blobUrl}
              alt={file.file_name}
              className="max-w-full max-h-[70vh] object-contain rounded-lg"
            />
          )}
          {isVideo && (
            <video
              src={blobUrl}
              controls
              className="max-w-full max-h-[70vh] rounded-lg"
            />
          )}
          {isAudio && (
            <audio src={blobUrl} controls className="w-[400px]" />
          )}
          {isPdf && (
            <iframe
              src={blobUrl}
              className="w-[80vw] h-[70vh] rounded-lg border border-gray-200"
              title={file.file_name}
            />
          )}
          {isText && (
            <pre className="w-[80vw] max-h-[70vh] overflow-auto p-4 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
              <TextPreview blobUrl={blobUrl} />
            </pre>
          )}
          {!isImage && !isVideo && !isAudio && !isPdf && !isText && (
            <div className="flex flex-col items-center gap-3 text-gray-500">
              <FileCode className="w-12 h-12 text-gray-300" />
              <span className="text-sm">该文件类型暂不支持预览</span>
              <a
                href={blobUrl}
                download={file.file_name}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
              >
                下载文件
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 文本文件预览组件
const TextPreview: React.FC<{ blobUrl: string }> = ({ blobUrl }) => {
  const [text, setText] = useState('加载中...');
  useEffect(() => {
    fetch(blobUrl)
      .then(r => r.text())
      .then(t => setText(t.slice(0, 50000)))
      .catch(() => setText('读取失败'));
  }, [blobUrl]);
  return <>{text}</>;
};

const FolderBlockView: React.FC<{
  node: { attrs: FolderBlockAttrs };
  deleteNode: () => void;
}> = ({ node, deleteNode }) => {
  const { user } = useAuth();
  const attrs = node.attrs;
  const folderRefreshTrigger = useNoteStore((state) => state.folderRefreshTrigger);
  const folderRefreshNoteId = useNoteStore((state) => state.folderRefreshNoteId);
  const provider = getProvider(attrs.storageProvider);
  const cacheKey = getFolderFilesCacheKey(provider, attrs.noteId, user?.id);
  const initialFiles = getFreshFolderFilesFromCache<FolderFile>(cacheKey);
  const [files, setFiles] = useState<FolderFile[]>(() => initialFiles || []);
  const [loading, setLoading] = useState(() => Boolean(attrs.noteId) && !initialFiles);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FolderFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [renamingFile, setRenamingFile] = useState<FolderFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'>('name-asc');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedFiles = useMemo(() => {
    const sorted = [...files];
    switch (sortBy) {
      case 'name-asc': return sorted.sort((a, b) => compareNaturalText(a.file_name, b.file_name));
      case 'name-desc': return sorted.sort((a, b) => compareNaturalText(b.file_name, a.file_name));
      case 'date-asc': return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'date-desc': return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [files, sortBy]);

  const cycleSortBy = () => {
    const order: typeof sortBy[] = ['name-asc', 'name-desc', 'date-asc', 'date-desc'];
    const idx = order.indexOf(sortBy);
    setSortBy(order[(idx + 1) % order.length]);
  };

  const sortLabel = () => {
    switch (sortBy) {
      case 'name-asc': return '名称↑';
      case 'name-desc': return '名称↓';
      case 'date-asc': return '日期↑';
      case 'date-desc': return '日期↓';
    }
  };

  const loadFiles = useCallback(async (opts: { force?: boolean } = {}) => {
    if (!attrs.noteId) return;
    const cachedFiles = opts.force ? null : getCachedFolderFiles<FolderFile>(cacheKey);
    if (cachedFiles) {
      setFiles(cachedFiles);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const nextFiles = await getOrLoadFolderFiles(
        cacheKey,
        () => listFiles(provider, attrs.noteId),
        { force: opts.force },
      );
      setFiles(nextFiles);
    } catch (e) {
      console.error('Load folder files error:', e);
    } finally {
      setLoading(false);
    }
  }, [attrs.noteId, cacheKey, provider]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (folderRefreshTrigger > 0 && (!folderRefreshNoteId || folderRefreshNoteId === attrs.noteId)) {
      invalidateFolderFilesCache(cacheKey);
      loadFiles({ force: true });
    }
  }, [attrs.noteId, cacheKey, folderRefreshNoteId, folderRefreshTrigger, loadFiles]);

  // 清理预览blob
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const result = await uploadFile(getProvider(attrs.storageProvider), file, attrs.noteId, attrs.folderName);
      if (result.success) {
        toast.success('上传成功');
        invalidateFolderFilesCache(cacheKey);
        await loadFiles({ force: true });
      } else {
        toast.error(result.error || '上传失败');
      }
    } catch (err) {
      toast.error('上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (file: FolderFile) => {
    if (!user) return;
    setDownloadingId(file.id);
    try {
      const result = await downloadFile(getProvider(file.storage_provider || attrs.storageProvider), file.id);
      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName || file.file_name;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('下载成功');
      } else {
        toast.error(result.error || '下载失败');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePreview = async (file: FolderFile) => {
    if (!user) return;
    setDownloadingId(file.id);
    try {
      const result = await downloadFile(getProvider(file.storage_provider || attrs.storageProvider), file.id);
      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob);
        setPreviewBlobUrl(url);
        setPreviewFile(file);
      } else {
        toast.error(result.error || '预览加载失败');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const closePreview = () => {
    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    setPreviewBlobUrl(null);
    setPreviewFile(null);
  };

  const handleDeleteFile = async (file: FolderFile) => {
    if (!confirm(`确定删除文件「${file.file_name}」？此操作不可撤销。`)) return;
    try {
      const result = await deleteFile(getProvider(file.storage_provider || attrs.storageProvider), file.id);
      if (result.success) {
        toast.success('已删除');
        invalidateFolderFilesCache(cacheKey);
        await loadFiles({ force: true });
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  const handleRenameFile = (file: FolderFile) => {
    setRenamingFile(file);
    setRenameValue(file.file_name);
  };

  const closeRenameDialog = () => {
    if (renameSubmitting) return;
    setRenamingFile(null);
    setRenameValue('');
  };

  const submitRenameFile = async () => {
    if (!renamingFile) return;
    const trimmedName = renameValue.trim();
    if (!trimmedName) {
      toast.error('文件名不能为空');
      return;
    }
    if (trimmedName === renamingFile.file_name) {
      closeRenameDialog();
      return;
    }
    if (getFileExtension(trimmedName) !== getFileExtension(renamingFile.file_name)) {
      toast.error('不允许修改文件扩展名');
      return;
    }

    setRenameSubmitting(true);
    try {
      const result = await renameAttachment(renamingFile.id, trimmedName);
      if (result.success) {
        toast.success('已重命名');
        setRenamingFile(null);
        setRenameValue('');
        invalidateFolderFilesCache(cacheKey);
        await loadFiles({ force: true });
      } else {
        toast.error(result.error || '重命名失败');
      }
    } catch {
      toast.error('重命名失败');
    } finally {
      setRenameSubmitting(false);
    }
  };

  const getFileIcon = (mimeType: string) => {
    const category = getFileIconType(mimeType);
    switch (category) {
      case 'image': return <Image className="w-4 h-4 text-pink-500" />;
      case 'video': return <Video className="w-4 h-4 text-red-500" />;
      case 'audio': return <Volume2 className="w-4 h-4 text-yellow-500" />;
      case 'document': return <FileText className="w-4 h-4 text-blue-500" />;
      default: return <FileCode className="w-4 h-4 text-gray-500" />;
    }
  };

  // 判断是否可预览
  const isPreviewable = (mimeType: string) => {
    return mimeType.startsWith('image/') ||
           mimeType.startsWith('video/') ||
           mimeType.startsWith('audio/') ||
           mimeType.includes('pdf') ||
           mimeType.startsWith('text/') ||
           mimeType.includes('json') ||
           mimeType.includes('javascript');
  };

  return (
    <NodeViewWrapper>
      <div
        className="my-3 border border-slate-200 rounded-lg bg-white overflow-hidden"
        data-drag-handle
      >
        {/* 文件夹头部 */}
        <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/80 border-b border-slate-100">
          <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-600">{attrs.folderName}</span>
          <span className="text-xs text-slate-400 ml-1">
            {loading ? '' : `${files.length} 个文件`}
          </span>
          <div className="flex-1" />
          {files.length > 1 && (
            <button
              onClick={cycleSortBy}
              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-slate-500 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
              title="排序"
            >
              <ArrowUpDown className="w-2.5 h-2.5" />
              {sortLabel()}
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-500 text-white rounded hover:bg-slate-600 disabled:opacity-50 transition-colors"
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            {uploading ? '上传中' : '上传'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          <button
            onClick={() => {
              const msg = files.length > 0
                ? `该文件夹中有 ${files.length} 个文件，移除文件夹不会删除文件。确定移除？`
                : '确定移除文件夹？';
              if (confirm(msg)) deleteNode();
            }}
            className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="移除文件夹"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>

        {/* 文件列表 */}
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-4 text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
              <span className="text-xs">加载中...</span>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
              <Cloud className="w-6 h-6 mb-1.5 opacity-40" />
              <span className="text-xs">暂无文件</span>
            </div>
          ) : (
            sortedFiles.map((file) => (
              <div key={file.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50/50 group border-b border-slate-50 last:border-b-0">
                <div className="flex-shrink-0">{getFileIcon(file.mime_type)}</div>
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span
                    className={`text-xs truncate ${isPreviewable(file.mime_type) ? 'text-blue-600 cursor-pointer hover:underline' : 'text-slate-600'}`}
                    onClick={() => isPreviewable(file.mime_type) && handlePreview(file)}
                  >
                    {file.file_name}
                  </span>
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{formatFileSize(file.file_size)}</span>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isPreviewable(file.mime_type) && (
                    <button
                      onClick={() => handlePreview(file)}
                      disabled={downloadingId === file.id}
                      className="p-1 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded transition-colors"
                      title="预览"
                    >
                      {downloadingId === file.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Eye className="w-3 h-3" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => handleDownload(file)}
                    disabled={downloadingId === file.id}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    title="下载"
                  >
                    {downloadingId === file.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRenameFile(file);
                    }}
                    className="p-1 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 rounded transition-colors"
                    title="重命名"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDeleteFile(file)}
                    className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 预览弹窗 */}
      <FilePreviewModal
        file={previewFile}
        blobUrl={previewBlobUrl}
        onClose={closePreview}
      />

      {renamingFile && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 px-4"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) closeRenameDialog();
          }}
        >
          <div className="w-full max-w-md rounded-xl bg-white shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">重命名文件</h3>
                <p className="text-xs text-slate-400 mt-0.5">不允许修改扩展名</p>
              </div>
              <button
                type="button"
                onClick={closeRenameDialog}
                disabled={renameSubmitting}
                className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form
              className="p-4 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitRenameFile();
              }}
            >
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeRenameDialog();
                }}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                placeholder="输入新的文件名"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRenameDialog}
                  disabled={renameSubmitting}
                  className="px-3 py-1.5 text-sm rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={renameSubmitting}
                  className="px-3 py-1.5 text-sm rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {renameSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  确定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const FolderBlock = Node.create({
  name: 'folderBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      noteId: { default: '' },
      folderName: { default: '附件文件夹' },
      storageProvider: { default: 'onedrive' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-folder-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-folder-block': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FolderBlockView as React.ComponentType<any>);
  },

  addCommands() {
    return {
      insertFolderBlock:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
