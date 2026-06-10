import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Download, FileText, FolderOpen, Loader2, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { apiCoursewareDownload, apiCoursewareList } from '../lib/edgeApi';

interface CoursewareDirectory {
  name: string;
  prefix: string;
  key: string;
}

interface CoursewareFile {
  key: string;
  name: string;
  relativePath?: string;
  size: number;
  lastModified?: string | null;
}

interface CoursewareListData {
  prefix: string;
  directories: CoursewareDirectory[];
  files: CoursewareFile[];
}

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

const normalizePrefix = (prefix: string) => prefix.replace(/^\/+/, '').replace(/\/+/g, '/');

const parentPrefix = (prefix: string) => {
  const parts = normalizePrefix(prefix).replace(/\/$/, '').split('/').filter(Boolean);
  parts.pop();
  return parts.length ? `${parts.join('/')}/` : '';
};

const CoursewarePageView: React.FC = () => {
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [data, setData] = useState<CoursewareListData | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  const load = useCallback(async (prefix: string) => {
    setLoading(true);
    const result = await apiCoursewareList(prefix);
    setLoading(false);
    if (!result.success) {
      toast.error(result.error || '课件列表读取失败');
      return;
    }
    setData(result.data);
  }, []);

  useEffect(() => {
    load('');
  }, [load]);

  const enterDirectory = (directory: CoursewareDirectory) => {
    setCurrentPrefix(directory.prefix);
    setQuery('');
    load(directory.prefix);
  };

  const goParent = () => {
    const next = parentPrefix(currentPrefix);
    setCurrentPrefix(next);
    setQuery('');
    load(next);
  };

  const downloadFile = async (file: CoursewareFile) => {
    setDownloadingKey(file.key);
    const result = await apiCoursewareDownload(file.key);
    setDownloadingKey(null);
    if (!result.success) {
      toast.error(result.error || '下载链接生成失败');
      return;
    }
    window.open(result.data.url, '_blank', 'noopener,noreferrer');
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const directories = data?.directories || [];
    const files = data?.files || [];
    if (!keyword) return { directories, files };
    return {
      directories: directories.filter((item) => item.name.toLowerCase().includes(keyword)),
      files: files.filter((item) => item.name.toLowerCase().includes(keyword)),
    };
  }, [data, query]);

  const crumbs = currentPrefix.replace(/\/$/, '').split('/').filter(Boolean);

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>江苏公司</span>
            <ChevronRight className="w-4 h-4" />
            <span>知识库</span>
            <ChevronRight className="w-4 h-4" />
            <span className="text-gray-900 font-medium">课件</span>
            {crumbs.map((crumb) => (
              <React.Fragment key={crumb}>
                <ChevronRight className="w-4 h-4" />
                <span className="truncate max-w-[160px]">{crumb}</span>
              </React.Fragment>
            ))}
          </div>
          <h2 className="mt-1 text-xl font-semibold text-gray-900">课件资料</h2>
        </div>
        <button
          onClick={() => load(currentPrefix)}
          disabled={loading}
          className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
          title="刷新"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索课件"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
          />
        </div>
        {currentPrefix && (
          <button
            onClick={goParent}
            className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
          >
            返回上级
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div className="border border-gray-100 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_120px_180px_96px] bg-gray-50 text-xs font-medium text-gray-500 px-4 py-2">
            <span>名称</span>
            <span>大小</span>
            <span>更新时间</span>
            <span className="text-right">操作</span>
          </div>
          {loading && !data ? (
            <div className="py-16 flex items-center justify-center text-sm text-gray-500">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              正在读取课件
            </div>
          ) : filtered.directories.length === 0 && filtered.files.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-500">当前目录没有可显示的课件</div>
          ) : (
            <>
              {filtered.directories.map((directory) => (
                <button
                  key={directory.key}
                  onClick={() => enterDirectory(directory)}
                  className="w-full grid grid-cols-[1fr_120px_180px_96px] items-center px-4 py-3 text-left border-t border-gray-100 hover:bg-blue-50/40"
                >
                  <span className="min-w-0 flex items-center gap-3 text-gray-900">
                    <FolderOpen className="w-5 h-5 text-blue-500 shrink-0" />
                    <span className="truncate font-medium">{directory.name}</span>
                  </span>
                  <span className="text-sm text-gray-400">文件夹</span>
                  <span className="text-sm text-gray-400">-</span>
                  <span className="text-right text-sm text-blue-500">打开</span>
                </button>
              ))}
              {filtered.files.map((file) => (
                <div
                  key={file.key}
                  className="grid grid-cols-[1fr_120px_180px_96px] items-center px-4 py-3 border-t border-gray-100"
                >
                  <span className="min-w-0 flex items-center gap-3 text-gray-900">
                    <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                    <span className="truncate">{file.relativePath || file.name}</span>
                  </span>
                  <span className="text-sm text-gray-500">{formatFileSize(file.size)}</span>
                  <span className="text-sm text-gray-500">
                    {file.lastModified ? new Date(file.lastModified).toLocaleString('zh-CN') : '-'}
                  </span>
                  <button
                    onClick={() => downloadFile(file)}
                    disabled={downloadingKey === file.key}
                    className="justify-self-end w-8 h-8 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center disabled:opacity-50"
                    title="下载"
                  >
                    {downloadingKey === file.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CoursewarePageView;
