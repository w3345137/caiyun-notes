import React, { useState, useCallback, useEffect } from 'react';
import { X, Download, Upload, ChevronRight, ChevronDown, FileText, Folder, BookOpen, Loader2, Check, Cloud, AlertCircle, Info } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useNoteStore } from '../store/noteStore';
import toast from 'react-hot-toast';
import { supabase, serviceClient } from '../lib/supabase';
import { getSharedNotebooks } from '../lib/sharing';
import yaml from 'js-yaml';
import { ImportTargetSelector } from './ImportTargetSelector';
import {
  parseMdFile,
  topologicalSort,
  detectCycle,
  checkOwnership,
  findMatchingParent,
  importNote,
  ParsedNote,
  ImportIssue,
  OriginalLocationInfo,
} from '../lib/importService';

// 下载文件函数
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// 生成笔记的 YAML frontmatter
function generateFrontmatter(note: any): string {
  const meta: any = {
    type: note.type,
    id: note.id,
    title: note.title,
    icon: note.icon || 'doc',
    order: note.order ?? 0,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
  if (note.parentId) {
    meta.parentId = note.parentId;
  }
  // js-yaml 4.x 中 safeDump 被移除，dump 默认为 safe
  return `---\n${yaml.dump(meta, { quotingType: '"', forceQuotes: true })}---\n`;
}

// 将笔记及其内容转换为 Markdown
function noteToMarkdown(note: any): string {
  const frontmatter = generateFrontmatter(note);
  const content = note.content || '';
  return frontmatter + content;
}

// 根据节点构建文件名前缀：笔记本名-分区名-页面名-id
function buildFilePrefix(node: any, allNodes: Map<string, any>): string {
  const parts: string[] = [];
  let current: any = node;

  // 向上追溯父节点，构建完整路径
  while (current) {
    parts.unshift(current.title || '无标题');
    if (current.parentId && allNodes.has(current.parentId)) {
      current = allNodes.get(current.parentId);
    } else {
      break;
    }
  }

  // 格式：笔记本名-分区名-页面名-id
  const prefix = parts.join('-');
  return `${prefix}-${node.id}`;
}

interface ExportModalProps {
  onClose: () => void;
  onImportComplete?: () => void;
}

interface TreeNode {
  id: string;
  title: string;
  content: string;
  mindmapData: any;
  parentId: string | null;
  type: string;
  createdAt: string;
  updatedAt: string;
  order: number;
  icon: string;
  lockedBy: string | null;
  lockedByName: string | null;
  version: number;
  ownerId: string;
  children: TreeNode[];
  expanded: boolean;
}

export const ExportModal: React.FC<ExportModalProps> = ({ onClose, onImportComplete }) => {
  const [mode, setMode] = useState<'export' | 'import'>('export');
  const { user } = useAuth();
  const { notes } = useNoteStore();
  
  // 导出相关状态
  const [exportTree, setExportTree] = useState<TreeNode[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // 导入相关状态
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number; issues: ImportIssue[] } | null>(null);
  const [parsedNotes, setParsedNotes] = useState<ParsedNote[]>([]);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [originalLocationInfo, setOriginalLocationInfo] = useState<Map<string, OriginalLocationInfo>>(new Map());

  // 加载笔记树
  const loadNoteTree = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      // 1. 获取当前用户拥有的笔记本 ID
      const { data: ownedNotebooks } = await supabase
        .from('notes')
        .select('id')
        .eq('owner_id', user.id)
        .eq('type', 'notebook');

      const ownedNotebookIds = new Set((ownedNotebooks || []).map((n: any) => n.id));

      // 2. 获取分享给当前用户的笔记本 ID
      const sharedNotebooks = await getSharedNotebooks();
      const sharedNotebookIds = new Set(sharedNotebooks.map((s: any) => s.note_id));

      // 合并所有可访问的笔记本 ID
      const allAccessibleNotebookIds = [...ownedNotebookIds, ...sharedNotebookIds];

      if (allAccessibleNotebookIds.length === 0) {
        setExportTree([]);
        return;
      }

      // 3. 递归获取所有笔记本及其子孙节点
      // 先获取所有可访问的笔记本（根节点）
      // 使用 serviceClient 绕过 RLS 查询（共享笔记本不属于当前用户）
      const { data: rootData, error: rootError } = await serviceClient
        .from('notes')
        .select('*')
        .in('id', allAccessibleNotebookIds)
        .not('title', 'is', null)
        .neq('title', '');

      if (rootError) {
        console.error('查询笔记本失败:', rootError);
        toast.error('加载笔记失败');
        return;
      }

      if (!rootData || rootData.length === 0) {
        setExportTree([]);
        return;
      }

      // 收集所有需要查询的节点ID（包括子孙节点）
      const allNodeIds = new Set<string>();
      const collectChildIds = (parentId: string) => {
        allNodeIds.add(parentId);
      };
      rootData.forEach(n => collectChildIds(n.id));

      // 递归收集所有子孙节点的ID（最多10层）
      const collectDescendantIds = async (parentIds: string[]): Promise<void> => {
        if (parentIds.length === 0) return;

        const { data: children } = await serviceClient
          .from('notes')
          .select('id')
          .in('parent_id', parentIds)
          .not('title', 'is', null)
          .neq('title', '');

        if (children && children.length > 0) {
          const childIds = children.map((c: any) => c.id);
          childIds.forEach(id => allNodeIds.add(id));
          await collectDescendantIds(childIds);
        }
      };

      await collectDescendantIds(rootData.map((n: any) => n.id));

      // 4. 批量查询所有节点
      const { data, error } = await serviceClient
        .from('notes')
        .select('*')
        .in('id', Array.from(allNodeIds))
        .not('title', 'is', null)
        .neq('title', '')
        .order('order_index', { ascending: true });

      if (error) {
        console.error('查询笔记失败:', error);
        toast.error('加载笔记失败');
        return;
      }

      if (!data || data.length === 0) {
        setExportTree([]);
        return;
      }

      // 4. 转换为树节点
      const map = new Map<string, TreeNode>();
      const nodes: TreeNode[] = data.map((j: any) => ({
        id: j.id,
        title: j.title || '无标题',
        content: j.content || '',
        mindmapData: j.mindmap_data || null,
        parentId: j.parent_id || null,
        type: j.type || 'page',
        createdAt: j.created_at || new Date().toISOString(),
        updatedAt: j.updated_at || new Date().toISOString(),
        order: j.order_index ?? 0,
        icon: j.icon || 'doc',
        lockedBy: j.locked_by || null,
        lockedByName: j.locked_by_name || null,
        version: j.version ?? 1,
        ownerId: j.owner_id || '',
        children: [],
        expanded: false,
      }));

      nodes.forEach(j => map.set(j.id, j));

      // 5. 构建树结构
      const roots: TreeNode[] = [];

      // 建立父子关系
      map.forEach(node => {
        if (node.parentId && map.has(node.parentId)) {
          map.get(node.parentId)!.children.push(node);
        }
      });

      // 找出有效的根节点（用户拥有或分享的笔记本）
      map.forEach(node => {
        if (!node.parentId || !map.has(node.parentId)) {
          // 这是根节点
          if ((node.type === 'notebook') &&
              (ownedNotebookIds.has(node.id) || sharedNotebookIds.has(node.id))) {
            roots.push(node);
          }
        }
      });

      // 排序子节点
      const sortChildren = (arr: TreeNode[]) => {
        arr.sort((a, b) => a.order - b.order);
        arr.forEach(node => sortChildren(node.children));
      };
      sortChildren(roots);

      console.log(`[导出树] 共加载 ${nodes.length} 条笔记，根节点 ${roots.length} 个（包含分享的笔记本）`);
      setExportTree(roots);
    } catch (err) {
      console.error('加载笔记树异常:', err);
      toast.error('加载笔记失败');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (mode === 'export') {
      loadNoteTree();
    }
  }, [mode, loadNoteTree]);

  // 切换选中状态
  const toggleSelect = (node: TreeNode, checked: boolean) => {
    const newSelected = new Set(selectedIds);
    const traverse = (n: TreeNode) => {
      if (checked) {
        newSelected.add(n.id);
      } else {
        newSelected.delete(n.id);
      }
      n.children.forEach(traverse);
    };
    traverse(node);
    setSelectedIds(newSelected);
  };

  // 切换展开状态
  const toggleExpand = (nodeId: string) => {
    const update = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.map(node => 
        node.id === nodeId 
          ? { ...node, expanded: !node.expanded }
          : { ...node, children: update(node.children) }
      );
    };
    setExportTree(update);
  };

  // 检查是否应该显示勾选框（节点本身或其后代被选中）
  const isNodeOrDescendantSelected = (node: TreeNode): boolean => {
    if (selectedIds.has(node.id)) return true;
    return node.children.length > 0 && node.children.every(child => isNodeOrDescendantSelected(child));
  };

  // 渲染树节点
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const isSelected = selectedIds.has(node.id);
    const isIndeterminate = !isSelected && isNodeOrDescendantSelected(node);
    const Icon = node.type === 'notebook' ? BookOpen : node.type === 'section' ? Folder : FileText;
    
    return (
      <div key={node.id}>
        <div 
          className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
          style={{ paddingLeft: `${depth * 20 + 12}px` }}
        >
          {node.children.length > 0 ? (
            <button 
              onClick={() => toggleExpand(node.id)}
              className="p-0.5 hover:bg-gray-200 rounded"
            >
              {node.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          <input
            type="checkbox"
            checked={isSelected}
            ref={(el) => { if (el) el.indeterminate = isIndeterminate; }}
            onChange={(e) => toggleSelect(node, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
          />
          <Icon className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-700 truncate flex-1">{node.title}</span>
          <span className="text-xs text-gray-400">{node.type === 'notebook' ? '笔记本' : node.type === 'section' ? '分区' : '页面'}</span>
        </div>
        {node.expanded && node.children.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  // 导出笔记
  const handleExport = async () => {
    if (selectedIds.size === 0) {
      toast.error('请先选择要导出的笔记');
      return;
    }
    
    if (exportTree.length === 0) {
      toast.error('笔记为空，没有任何可导出内容');
      return;
    }
    
    setIsExporting(true);
    try {
      // 收集所有选中的节点（带子节点）
      const collectSelected = (nodes: TreeNode[], result: TreeNode[]): TreeNode[] => {
        for (const node of nodes) {
          if (selectedIds.has(node.id)) {
            result.push(node);
            result = collectSelected(node.children, result);
          } else {
            result = collectSelected(node.children, result);
          }
        }
        return result;
      };
      
      const allSelected = collectSelected(exportTree, []);
      
      if (allSelected.length === 0) {
        toast.error('未找到任何笔记，请重新选择');
        setIsExporting(false);
        return;
      }
      
      // 按类型和顺序排序：notebook -> section -> page
      const byType = (type: string) => allSelected.filter(n => n.type === type);
      const sortedNodes = [...byType('notebook'), ...byType('section'), ...byType('page')];
      
      // 为每个笔记本创建文件夹，其他直接下载
      const notebooks = sortedNodes.filter(n => n.type === 'notebook');
      
      if (notebooks.length === 1) {
        // 只有一个笔记本，使用笔记本名-xxx格式下载
        // 构建所有节点的map用于buildFilePrefix
        const nodeMap = new Map<string, TreeNode>();
        const buildNodeMap = (nodes: TreeNode[]) => {
          nodes.forEach(n => {
            nodeMap.set(n.id, n);
            buildNodeMap(n.children);
          });
        };
        buildNodeMap(exportTree);

        const content = sortedNodes.map(note => noteToMarkdown(note)).join('\n\n');
        const filename = buildFilePrefix(notebooks[0], nodeMap);
        downloadFile(filename, content);
      } else if (notebooks.length > 1) {
        // 多个笔记本，依次下载每个笔记本及其内容
        const nodeMap = new Map<string, TreeNode>();
        const buildNodeMap = (nodes: TreeNode[]) => {
          nodes.forEach(n => {
            nodeMap.set(n.id, n);
            buildNodeMap(n.children);
          });
        };
        buildNodeMap(exportTree);

        for (const nb of notebooks) {
          const nbContent = [noteToMarkdown(nb), ...nb.children.map(c => noteToMarkdown(c))].join('\n\n');
          downloadFile(buildFilePrefix(nb, nodeMap), nbContent);
          // 下载子节点
          for (const child of nb.children) {
            downloadFile(buildFilePrefix(child, nodeMap), noteToMarkdown(child));
          }
        }
      } else {
        // 没有笔记本，只有页面，直接下载
        const nodeMap = new Map<string, TreeNode>();
        const buildNodeMap = (nodes: TreeNode[]) => {
          nodes.forEach(n => {
            nodeMap.set(n.id, n);
            buildNodeMap(n.children);
          });
        };
        buildNodeMap(exportTree);

        const content = sortedNodes.map(note => noteToMarkdown(note)).join('\n\n');
        const filename = buildFilePrefix(sortedNodes[0], nodeMap);
        downloadFile(filename, content);
      }
      
      toast.success(`成功导出 ${sortedNodes.length} 个项目`);
      onClose();
    } catch (err) {
      console.error('导出失败:', err);
      toast.error('导出失败');
    } finally {
      setIsExporting(false);
    }
  };

  // 处理文件选择
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      setImportFiles(Array.from(files));
      setImportResult(null);
      setParsedNotes([]);
      setIssues([]);
      setOriginalLocationInfo(new Map());

      // 预解析文件，显示预览信息
      const parsed: ParsedNote[] = [];
      const newIssues: ImportIssue[] = [];

      for (const file of Array.from(files)) {
        try {
          const content = await file.text();
          const parsedNote = parseMdFile(content, file.name);
          if (parsedNote) {
            parsed.push(parsedNote);
          } else {
            newIssues.push({
              fileName: file.name,
              issueType: 'parse_error',
              message: '文件格式错误，无法解析',
            });
          }
        } catch (err) {
          newIssues.push({
            fileName: file.name,
            issueType: 'parse_error',
            message: '读取文件失败',
          });
        }
      }

      setParsedNotes(parsed);
      setIssues(newIssues);

      // 检测循环引用
      if (parsed.length > 1) {
        const cycles = detectCycle(parsed);
        for (const cycle of cycles) {
          newIssues.push({
            fileName: cycle.join(' → '),
            issueType: 'cycle_detected',
            message: `检测到循环引用，笔记将使用新 ID 导入`,
          });
        }
        setIssues([...newIssues]);
      }

      // 收集原位置信息
      const originalInfo = new Map<string, OriginalLocationInfo>();
      for (const note of parsed) {
        if (note.parentId) {
          const parentCheck = await findMatchingParent(note.parentId, user?.id || '');
          if (parentCheck.found) {
            originalInfo.set(note.id, {
              parentId: note.parentId,
              isOwner: parentCheck.isOwner,
              canUse: parentCheck.isOwner,
              reason: parentCheck.isOwner ? undefined : '您不是此笔记本的所有者',
            });
          } else {
            originalInfo.set(note.id, {
              parentId: note.parentId,
              isOwner: false,
              canUse: false,
              reason: '父节点不存在',
            });
          }
        } else {
          // 根级别笔记本（没有 parentId）
          originalInfo.set(note.id, {
            parentId: null,
            isOwner: true,
            canUse: true,
          });
        }
      }
      setOriginalLocationInfo(originalInfo);

      // 检查权限问题（如果不是 owner 的共享笔记本）
      for (const note of parsed) {
        if (note.parentId) {
          const parentCheck = await findMatchingParent(note.parentId, user?.id || '');
          if (parentCheck.found && !parentCheck.isOwner) {
            newIssues.push({
              fileName: note.originalFileName,
              issueType: 'not_owner',
              message: `您不是此笔记本的所有者，导入时需要选择目标位置`,
            });
            setIssues([...newIssues]);
            break;
          }
        }
      }
    }
  };

  // 导入笔记 - 点按钮就弹选择框
  const handleImport = () => {
    console.log('[导入调试] handleImport 被调用', { importFilesLength: importFiles.length, parsedNotesLength: parsedNotes.length });
    if (importFiles.length === 0) {
      toast.error('请先选择要导入的文件');
      return;
    }
    if (parsedNotes.length === 0) {
      toast.error('没有可导入的笔记');
      return;
    }
    if (!user?.id) {
      toast.error('请先登录');
      return;
    }
    console.log('[导入调试] 即将设置 showTargetSelector = true');
    setShowTargetSelector(true);
    console.log('[导入调试] showTargetSelector 已设置');
  };

  // 处理目标选择确认
  const handleTargetConfirm = (targetNotebookId: string, targetSectionId: string | null, mode: 'original' | 'new_location') => {
    console.log('[导入调试] handleTargetConfirm called:', { targetNotebookId, targetSectionId, mode, parsedNotesCount: parsedNotes.length });
    setShowTargetSelector(false);

    if (mode === 'original') {
      // 原位置模式：保留原 ID 和父子关系
      const canImportNotes = parsedNotes.filter(note => {
        const info = originalLocationInfo.get(note.id);
        return info?.canUse;
      });
      if (canImportNotes.length === 0) {
        toast.error('没有可以导入到原位置的笔记');
        return;
      }
      performImportOriginal(canImportNotes);
    } else {
      // 新位置模式：根据笔记类型决定目标位置
      // - notebook → parent_id = null（完全新建笔记本）
      // - section → parent_id = targetNotebookId
      // - page → parent_id = targetSectionId
      console.log('[导入调试] 新位置模式:', { targetNotebookId, targetSectionId });
      if (!targetNotebookId) {
        toast.error('请选择目标笔记本');
        return;
      }
      performImportNewLocation(parsedNotes, targetNotebookId, targetSectionId);
    }
  };

  // 原位置导入：保留原 ID 和父子关系
  const performImportOriginal = async (notesToImport: ParsedNote[]) => {
    console.log('[导入调试] performImportOriginal called, notes:', notesToImport.length);
    setIsImporting(true);
    let success = 0;
    let failed = 0;
    const allIssues: ImportIssue[] = [...issues];

    try {
      const sortedNotes = topologicalSort(notesToImport);

      for (const note of sortedNotes) {
        console.log('[导入调试] 导入笔记:', { id: note.id, title: note.title, type: note.type, parentId: note.parentId });
        const result = await importNote(note, note.parentId, user?.id || '');
        console.log('[导入调试] importNote result:', result);
        if (result.success) {
          success++;
        } else {
          failed++;
          allIssues.push({
            fileName: note.originalFileName,
            issueType: 'parse_error',
            message: `导入失败: ${result.error}`,
          });
        }
      }

      setImportResult({ success, failed, issues: allIssues });

      if (success > 0) {
        toast.success(`成功导入 ${success} 个笔记`);
        onImportComplete?.();
        setTimeout(() => window.location.reload(), 1500);
      } else if (failed > 0) {
        toast.error(`导入完成但有 ${failed} 个失败，请查看详情`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  // 新位置导入：根据笔记类型决定目标位置
  const performImportNewLocation = async (notesToImport: ParsedNote[], targetNotebookId: string, targetSectionId: string | null) => {
    setIsImporting(true);
    let success = 0;
    let failed = 0;
    const allIssues: ImportIssue[] = [...issues];

    try {
      const sortedNotes = topologicalSort(notesToImport);

      for (const note of sortedNotes) {
        // 根据笔记类型决定 parent_id
        let targetParentId: string | null = null;
        if (note.type === 'notebook') {
          // 笔记本：完全新建，parent_id = null
          targetParentId = null;
        } else if (note.type === 'section') {
          // 分区：放到目标笔记本下
          targetParentId = targetNotebookId;
        } else {
          // 页面：放到目标分区下
          targetParentId = targetSectionId;
          if (!targetSectionId) {
            failed++;
            allIssues.push({
              fileName: note.originalFileName,
              issueType: 'parent_not_found',
              message: `页面 "${note.title}" 需要选择一个分区来放置`,
            });
            continue;
          }
        }

        const result = await importNote(note, targetParentId, user?.id || '');
        if (result.success) {
          success++;
        } else {
          failed++;
          allIssues.push({
            fileName: note.originalFileName,
            issueType: 'parse_error',
            message: `导入失败: ${result.error}`,
          });
        }
      }

      setImportResult({ success, failed, issues: allIssues });

      if (success > 0) {
        toast.success(`成功导入 ${success} 个笔记`);
        onImportComplete?.();
        setTimeout(() => window.location.reload(), 1500);
      } else if (failed > 0) {
        toast.error(`导入完成但有 ${failed} 个失败，请查看详情`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">笔记导出/导入</h2>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* 模式切换 */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setMode('export')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'export' 
                ? 'text-purple-600 border-b-2 border-purple-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            导出笔记
          </button>
          <button
            onClick={() => setMode('import')}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${
              mode === 'import' 
                ? 'text-purple-600 border-b-2 border-purple-600' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            导入笔记
          </button>
        </div>
        
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'export' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                选择要导出的笔记本、分区或页面。子节点会自动包含在导出中。
              </p>
              
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>加载笔记中...</span>
                </div>
              ) : exportTree.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无笔记可导出</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-y-auto max-h-[400px]">
                  {exportTree.map(node => renderTreeNode(node))}
                </div>
              )}
              
              {selectedIds.size > 0 && (
                <p className="text-sm text-purple-600 mt-3 text-center">
                  已选择 {selectedIds.size} 个项目
                </p>
              )}
            </div>
          )}
          
          {mode === 'import' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                选择本地导出的 md 文件，程序将读取文件中的结构信息并还原到数据库。
              </p>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl py-12 cursor-pointer hover:border-purple-400 transition-colors">
                <Upload className="w-12 h-12 text-gray-300 mb-3" />
                <span className="text-gray-500 mb-1">点击选择 md 文件</span>
                <span className="text-xs text-gray-400">支持批量选择</span>
                <input
                  type="file"
                  accept=".md"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {/* 解析结果预览 */}
              {parsedNotes.length > 0 && (
                <div className="mt-4 space-y-3">
                  {/* 文件列表 */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">待导入笔记 ({parsedNotes.length})</p>
                    {parsedNotes.map((note, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-3 py-2">
                        {note.type === 'notebook' ? (
                          <BookOpen className="w-4 h-4 text-purple-500 flex-shrink-0" />
                        ) : note.type === 'section' ? (
                          <Folder className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-700 truncate">{note.title}</p>
                          <p className="text-xs text-gray-400">
                            类型: {note.type === 'notebook' ? '笔记本' : note.type === 'section' ? '分区' : '页面'}
                            {note.parentId && ` · 父节点: ${note.parentId.substring(0, 20)}...`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 问题提示 */}
                  {issues.length > 0 && (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-yellow-700">
                            检测到 {issues.length} 个问题
                          </p>
                          <ul className="text-xs text-yellow-600 mt-1 space-y-1">
                            {issues.slice(0, 5).map((issue, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="font-medium">[{issue.issueType === 'not_owner' ? '权限' :
                                  issue.issueType === 'parent_not_found' ? '父节点' :
                                  issue.issueType === 'cycle_detected' ? '循环' : '格式'}]</span>
                                <span>{issue.message}</span>
                              </li>
                            ))}
                            {issues.length > 5 && (
                              <li className="italic">...还有 {issues.length - 5} 个问题</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-sm text-gray-500 pt-2">
                    共 {importFiles.length} 个文件待导入
                  </p>
                </div>
              )}

              {/* 导入结果 */}
              {importResult && (
                <div className={`mt-4 p-3 rounded-lg text-sm ${
                  importResult.failed === 0 ? 'bg-green-50 text-green-700' : 'bg-orange-50 text-orange-700'
                }`}>
                  <p className="font-medium">导入完成</p>
                  <p className="text-sm mt-1">成功 {importResult.success} 个
                    {importResult.failed > 0 && `，失败 ${importResult.failed} 个`}</p>
                  {importResult.issues.length > 0 && (
                    <details className="mt-2">
                      <summary className="text-xs cursor-pointer hover:underline">查看详细问题</summary>
                      <ul className="mt-1 text-xs space-y-1 list-disc list-inside">
                        {importResult.issues.map((issue, idx) => (
                          <li key={idx}>{issue.fileName}: {issue.message}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              {/* 导入说明 */}
              {parsedNotes.length === 0 && !importResult && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-700">
                      <p className="font-medium">导入说明</p>
                      <ul className="text-xs mt-1 space-y-1 list-disc list-inside">
                        <li><strong>原位置</strong>：保留原 ID 和结构（仅限父节点存在且您是所有者）</li>
                        <li><strong>新位置</strong>：保留内容，但使用新 ID</li>
                        <li><strong>新建笔记</strong>：完全新建，可自定义笔记名称</li>
                        <li>支持批量导入，自动按依赖顺序处理</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 导入位置选择弹窗 */}
          {showTargetSelector && (
            <ImportTargetSelector
              isOpen={showTargetSelector}
              notes={parsedNotes}
              issues={issues}
              onConfirm={handleTargetConfirm}
              onCancel={() => setShowTargetSelector(false)}
            />
          )}
        </div>
        
        {/* 底部按钮 */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button 
            onClick={onClose}
            className="px-5 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
          >
            取消
          </button>
          
          {mode === 'export' ? (
            <button
              onClick={handleExport}
              disabled={selectedIds.size === 0 || isExporting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  导出中...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  导出 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleImport}
              disabled={importFiles.length === 0 || isImporting}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isImporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  导入中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  导入 {importFiles.length > 0 ? `(${importFiles.length})` : ''}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
