import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import React, { useState } from 'react';
import { Download, Trash2, FileText, Image, Video, Volume2, FileCode, Link, Cloud } from 'lucide-react';
import { downloadFromOneDrive, formatFileSize, getFileIconType } from '../lib/onedriveService';
import { useAuth } from '../components/AuthProvider';
import toast from 'react-hot-toast';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachmentBlock: {
      insertAttachmentBlock: (attrs: {
        attachmentId: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        onedrivePath: string;
        category: string;
      }) => ReturnType;
    };
  }
}

interface AttachmentBlockAttrs {
  attachmentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  onedrivePath: string;
  category: string;
}

const AttachmentBlockView: React.FC<{
  node: { attrs: AttachmentBlockAttrs };
  deleteNode: () => void;
}> = ({ node, deleteNode }) => {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const attrs = node.attrs;

  const handleDownload = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const result = await downloadFromOneDrive(attrs.attachmentId);
      if (result.success && result.blob) {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.fileName || attrs.fileName;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('下载成功');
      } else {
        toast.error(result.error || '下载失败');
      }
    } finally {
      setDownloading(false);
    }
  };

  const getFileIcon = () => {
    const category = getFileIconType(attrs.mimeType);
    switch (category) {
      case 'image': return <Image className="w-6 h-6 text-pink-500" />;
      case 'video': return <Video className="w-6 h-6 text-red-500" />;
      case 'audio': return <Volume2 className="w-6 h-6 text-yellow-500" />;
      case 'document': return <FileText className="w-6 h-6 text-blue-500" />;
      default: return <FileCode className="w-6 h-6 text-gray-500" />;
    }
  };

  return (
    <NodeViewWrapper>
      <div
        className="my-2 border border-gray-200 rounded-lg p-3 bg-gradient-to-r from-blue-50 to-white hover:border-blue-300 transition-colors"
        data-drag-handle
      >
        <div className="flex items-center gap-4">
          {/* 左侧：图标 */}
          <div className="flex-shrink-0">
            {getFileIcon()}
          </div>

          {/* 中间：文件信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-800 truncate">{attrs.fileName}</span>
              <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">
                <Cloud className="w-3 h-3" />
                OneDrive
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
              <span>{formatFileSize(attrs.fileSize)}</span>
              {attrs.onedrivePath && (
                <span className="flex items-center gap-1 truncate max-w-[200px]">
                  <Link className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{attrs.onedrivePath}</span>
                </span>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="p-2 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
              title="下载"
            >
              {downloading ? (
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-blue-500" />
              )}
            </button>
            <button
              onClick={deleteNode}
              className="p-2 hover:bg-red-50 rounded-lg transition-colors"
              title="从笔记中移除"
            >
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const AttachmentBlock = Node.create({
  name: 'attachmentBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      attachmentId: { default: '' },
      fileName: { default: '' },
      fileSize: { default: 0 },
      mimeType: { default: '' },
      onedrivePath: { default: '' },
      category: { default: 'other' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-attachment-block]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-attachment-block': '' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentBlockView);
  },

  addCommands() {
    return {
      insertAttachmentBlock:
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