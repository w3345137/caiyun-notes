import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronDown, BookOpen, Folder, AlertCircle, Check, MapPin, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { getUserNotebooksAndSections, ParsedNote, OriginalLocationInfo } from '../lib/importService';
import { getCurrentUserId } from '../lib/auth';

// 导入方式
export type ImportMode = 'original' | 'new_location';

interface ImportTargetSelectorProps {
  isOpen: boolean;
  notes: ParsedNote[];
  issues: {
    fileName: string;
    issueType: string;
    message: string;
  }[];
  onConfirm: (targetNotebookId: string, targetSectionId: string | null, mode: ImportMode) => void;
  onCancel: () => void;
}

export const ImportTargetSelector: React.FC<ImportTargetSelectorProps> = ({
  isOpen,
  notes,
  issues,
  onConfirm,
  onCancel,
}) => {
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; title: string; parentId: string | null }[]>([]);
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(new Set());
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('new_location');
  const [originalLocationInfo, setOriginalLocationInfo] = useState<Map<string, OriginalLocationInfo>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[导入调试] ImportTargetSelector isOpen 变为', isOpen);
    if (isOpen) {
      setIsLoading(true);
      loadUserData().finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  const loadUserData = async () => {
    const user = getCurrentUserId();
    console.log('[导入调试] loadUserData 获取用户:', user);
    if (!user) {
      toast.error('请先登录');
      onCancel();
      return;
    }
    setUserId(user);

    const { notebooks, sections } = await getUserNotebooksAndSections(user);
    setNotebooks(notebooks);
    setSections(sections);

    // 默认选择第一个笔记本
    if (notebooks.length > 0) {
      setSelectedNotebookId(notebooks[0].id);
      setSelectedSectionId(null);
    }

    // 收集原位置信息
    const originalInfo = new Map<string, OriginalLocationInfo>();
    for (const note of notes) {
      if (note.parentId) {
        const parentSection = sections.find(s => s.id === note.parentId);
        if (parentSection) {
          originalInfo.set(note.id, {
            parentId: note.parentId,
            isOwner: true,
            canUse: true,
          });
          continue;
        }
        const parentNotebook = notebooks.find(n => n.id === note.parentId);
        if (parentNotebook) {
          originalInfo.set(note.id, {
            parentId: note.parentId,
            isOwner: true,
            canUse: true,
          });
          continue;
        }
        originalInfo.set(note.id, {
          parentId: note.parentId,
          isOwner: false,
          canUse: false,
          reason: '父节点不存在',
        });
      } else {
        originalInfo.set(note.id, {
          parentId: null,
          isOwner: true,
          canUse: true,
        });
      }
    }
    setOriginalLocationInfo(originalInfo);
  };

  const toggleNotebook = (notebookId: string) => {
    const newExpanded = new Set(expandedNotebooks);
    if (newExpanded.has(notebookId)) {
      newExpanded.delete(notebookId);
    } else {
      newExpanded.add(notebookId);
    }
    setExpandedNotebooks(newExpanded);
  };

  const getSectionsForNotebook = (notebookId: string) => {
    return sections.filter(s => s.parentId === notebookId);
  };

  const selectNotebookAndSection = (notebookId: string, sectionId: string | null) => {
    setSelectedNotebookId(notebookId);
    setSelectedSectionId(sectionId);
  };

  const handleModeChange = (mode: ImportMode) => {
    setImportMode(mode);
  };

  const handleConfirm = () => {
    if (importMode === 'new_location') {
      if (!selectedNotebookId) {
        toast.error('请选择目标笔记本');
        return;
      }
    }
    onConfirm(selectedNotebookId, selectedSectionId, importMode);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">选择导入方式</h2>
            <p className="text-sm text-gray-500 mt-1">
              请选择笔记的导入方式
            </p>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 问题提示 */}
          {issues.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-yellow-700">发现问题 {issues.length} 个</p>
                  <ul className="text-xs text-yellow-600 mt-1 space-y-1">
                    {issues.slice(0, 3).map((issue, idx) => (
                      <li key={idx}>
                        <span className="font-medium">{issue.fileName}:</span> {issue.message}
                      </li>
                    ))}
                    {issues.length > 3 && (
                      <li>...还有 {issues.length - 3} 个问题</li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 笔记预览 */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">待导入笔记 ({notes.length})</h3>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {notes.map(note => (
                <div key={note.id} className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded px-3 py-2">
                  {note.type === 'notebook' || note.type === 'email_notebook' ? (
                    <BookOpen className="w-4 h-4 text-purple-500" />
                  ) : note.type === 'section' || note.type === 'email_account' ? (
                    <Folder className="w-4 h-4 text-blue-500" />
                  ) : (
                    <FileText className="w-4 h-4 text-gray-400" />
                  )}
                  <span className="truncate">{note.title}</span>
                  <span className="text-xs text-gray-400">({note.type === 'notebook' || note.type === 'email_notebook' ? '笔记本' : note.type === 'section' || note.type === 'email_account' ? '分区' : '页面'})</span>
                </div>
              ))}
            </div>
          </div>

          {/* 导入方式选择 */}
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">导入方式</h3>
            <div className="grid grid-cols-2 gap-2">
              {/* 原位置 */}
              <button
                onClick={() => handleModeChange('original')}
                className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all ${
                  importMode === 'original'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <MapPin className={`w-6 h-6 mb-2 ${importMode === 'original' ? 'text-purple-500' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${importMode === 'original' ? 'text-purple-700' : 'text-gray-700'}`}>原位置</span>
                <span className="text-xs text-gray-500 mt-1 text-center">保留原 ID 和结构</span>
              </button>

              {/* 新位置 */}
              <button
                onClick={() => handleModeChange('new_location')}
                className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all ${
                  importMode === 'new_location'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <FileText className={`w-6 h-6 mb-2 ${importMode === 'new_location' ? 'text-purple-500' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${importMode === 'new_location' ? 'text-purple-700' : 'text-gray-700'}`}>新位置</span>
                <span className="text-xs text-gray-500 mt-1 text-center">选择目标笔记本和分区</span>
              </button>
            </div>
          </div>

          {/* 原位置模式 */}
          {importMode === 'original' && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">原位置信息</h4>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {notes.map(note => {
                  const info = originalLocationInfo.get(note.id);
                  const canUse = info?.canUse ?? false;
                  return (
                    <div
                      key={note.id}
                      className={`flex items-center gap-2 px-4 py-3 ${canUse ? 'bg-green-50' : 'bg-red-50'}`}
                    >
                      {note.type === 'notebook' || note.type === 'email_notebook' ? (
                        <BookOpen className={`w-4 h-4 ${canUse ? 'text-green-500' : 'text-red-400'}`} />
                      ) : note.type === 'section' || note.type === 'email_account' ? (
                        <Folder className={`w-4 h-4 ${canUse ? 'text-green-500' : 'text-red-400'}`} />
                      ) : (
                        <FileText className={`w-4 h-4 ${canUse ? 'text-green-500' : 'text-red-400'}`} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${canUse ? 'text-gray-700' : 'text-red-600'}`}>
                          {note.title}
                        </p>
                        {info?.parentId && (
                          <p className="text-xs text-gray-400 truncate">
                            父节点: {info.parentId.substring(0, 20)}...
                          </p>
                        )}
                        {!canUse && info?.reason && (
                          <p className="text-xs text-red-500">{info.reason}</p>
                        )}
                      </div>
                      {canUse ? (
                        <span className="text-xs text-green-600 font-medium">可用</span>
                      ) : (
                        <span className="text-xs text-red-600 font-medium">不可用</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {Array.from(originalLocationInfo.values()).some(v => !v.canUse) && (
                <p className="text-xs text-orange-600">
                  ⚠️ 部分笔记无法导入到原位置，将跳过这些笔记
                </p>
              )}
            </div>
          )}

          {/* 新位置模式 */}
          {importMode === 'new_location' && (
            <div>
              <div className="mb-2">
                <h4 className="text-sm font-medium text-gray-700">选择目标笔记本和分区</h4>
                <p className="text-xs text-gray-500 mt-1">
                  页面将放到所选分区下，分区将在笔记本下新建
                </p>
              </div>

              {/* 笔记本列表 */}
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {notebooks.map(notebook => (
                  <div key={notebook.id}>
                    <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                      {/* 展开/折叠按钮 */}
                      <button
                        onClick={() => toggleNotebook(notebook.id)}
                        className="p-0.5 hover:bg-gray-200 rounded"
                      >
                        {expandedNotebooks.has(notebook.id) ? (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                      {/* 笔记本行 - 点击选择 */}
                      <div
                        onClick={() => selectNotebookAndSection(notebook.id, null)}
                        className={`flex-1 flex items-center gap-2 cursor-pointer ${
                          selectedNotebookId === notebook.id && selectedSectionId === null ? 'bg-purple-50 rounded' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          checked={selectedNotebookId === notebook.id && selectedSectionId === null}
                          onChange={() => selectNotebookAndSection(notebook.id, null)}
                          className="w-4 h-4 text-purple-600"
                        />
                        <BookOpen className="w-4 h-4 text-purple-500" />
                        <span className="text-sm text-gray-700">{notebook.title}</span>
                        <span className="text-xs text-gray-400">（笔记本）</span>
                      </div>
                    </div>

                    {/* 分区 */}
                    {expandedNotebooks.has(notebook.id) && (
                      <div className="bg-gray-50">
                        {getSectionsForNotebook(notebook.id).length === 0 ? (
                          <div className="px-8 py-2 text-sm text-gray-400 italic">无分区</div>
                        ) : (
                          getSectionsForNotebook(notebook.id).map(section => (
                            <div
                              key={section.id}
                              onClick={() => selectNotebookAndSection(notebook.id, section.id)}
                              className={`flex items-center gap-2 px-8 py-2 cursor-pointer hover:bg-gray-100 ${
                                selectedNotebookId === notebook.id && selectedSectionId === section.id ? 'bg-purple-50' : ''
                              }`}
                            >
                              <input
                                type="radio"
                                checked={selectedNotebookId === notebook.id && selectedSectionId === section.id}
                                onChange={() => selectNotebookAndSection(notebook.id, section.id)}
                                className="w-4 h-4 text-purple-600"
                              />
                              <Folder className="w-4 h-4 text-blue-400" />
                              <span className="text-sm text-gray-600">{section.title}</span>
                              <span className="text-xs text-gray-400">（导入页面用）</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {notebooks.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-400 text-sm">
                    暂无笔记本，请先创建一个
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            className="px-5 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            确认导入
          </button>
        </div>
      </div>
    </div>
  );
};
