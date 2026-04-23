import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Download, Trash2, FileText, Image, Video, Volume2, FileCode, Cloud, Upload, FolderOpen, Loader2, Plus, X, Eye, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { downloadFromOneDrive, uploadToOneDrive, formatFileSize, getFileIconType, getAttachments } from '../lib/onedriveService';
import { useAuth } from '../components/AuthProvider';
import { useNoteStore } from '../store/noteStore';
import { toast } from 'sonner';

interface FolderFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  onedrive_path: string;
  category: string;
  created_at: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    folderBlock: {
      insertFolderBlock: (attrs: { noteId: string; folderName: string }) => ReturnType;
    };
  }
}

interface FolderBlockAttrs {
  noteId: string;
  folderName: string;
}

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
  const [files, setFiles] = useState<FolderFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<FolderFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name-asc' | 'name-desc' | 'date-asc' | 'date-desc'>('name-asc');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedFiles = useMemo(() => {
    const sorted = [...files];
    switch (sortBy) {
      case 'name-asc': return sorted.sort((a, b) => a.file_name.localeCompare(b.file_name, 'zh'));
      case 'name-desc': return sorted.sort((a, b) => b.file_name.localeCompare(a.file_name, 'zh'));
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

  useEffect(() => {
    loadFiles();
  }, [attrs.noteId]);

  useEffect(() => {
    if (folderRefreshTrigger > 0) loadFiles();
  }, [folderRefreshTrigger]);

  // 清理预览blob
  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const loadFiles = async () => {
    if (!attrs.noteId) return;
    setLoading(true);
    try {
      const result = await getAttachments(attrs.noteId);
      if (result.success && result.data) {
        setFiles(result.data);
      }
    } catch (e) {
      console.error('Load folder files error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length || !user) return;
    const file = e.target.files[0];
    setUploading(true);
    try {
      const result = await uploadToOneDrive(file, attrs.noteId, '/彩云笔记', attrs.folderName);
      if (result.success) {
        toast.success('上传成功');
        await loadFiles();
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
      const result = await downloadFromOneDrive(file.id);
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
      const result = await downloadFromOneDrive(file.id);
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
      const { deleteAttachment } = await import('../lib/onedriveService');
      const result = await deleteAttachment(file.id);
      if (result.success) {
        toast.success('已删除');
        await loadFiles();
      } else {
        toast.error(result.error || '删除失败');
      }
    } catch {
      toast.error('删除失败');
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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-folder-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-folder-block': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FolderBlockView);
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
