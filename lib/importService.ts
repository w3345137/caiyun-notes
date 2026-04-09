/**
 * 导入服务 - 解析和导入 md 文件
 * 逻辑：
 * 1. 解析 md 文件的 frontmatter
 * 2. 拓扑排序（按依赖顺序先父后子）
 * 3. 检测循环引用
 * 4. 权限检查（只有 owner 能导入共享笔记本）
 * 5. ID 匹配或弹窗选择目标位置
 */

import { supabase } from './supabase';
import yaml from 'js-yaml';

// 原位置信息
export interface OriginalLocationInfo {
  parentId: string | null;
  isOwner: boolean;
  canUse: boolean;
  reason?: string;
}

export interface ParsedNote {
  id: string;
  title: string;
  type: 'notebook' | 'section' | 'page';
  parentId: string | null;
  content: string;
  icon: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  originalFileName: string;
}

export interface ImportTarget {
  notebookId: string;
  notebookTitle: string;
  sectionId: string | null;
  sectionTitle: string | null;
}

export interface ImportIssue {
  fileName: string;
  issueType: 'not_owner' | 'parent_not_found' | 'cycle_detected' | 'parse_error';
  message: string;
  suggestedAction?: ImportTarget;
}

export interface ImportResult {
  success: number;
  failed: number;
  issues: ImportIssue[];
}

/**
 * 解析单个 md 文件
 */
export function parseMdFile(content: string, fileName: string): ParsedNote | null {
  try {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
      console.error(`[导入] 文件 ${fileName} 格式错误：缺少 frontmatter`);
      return null;
    }

    const meta = yaml.load(match[1]) as any;
    if (!meta) {
      console.error(`[导入] 文件 ${fileName} frontmatter 解析失败`);
      return null;
    }

    return {
      id: meta.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: meta.title || fileName.replace('.md', ''),
      type: meta.type === 'notebook' ? 'notebook' : meta.type === 'section' ? 'section' : 'page',
      parentId: meta.parentId || null,
      content: match[2] || '',
      icon: meta.icon || 'doc',
      order: meta.order || 0,
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
      originalFileName: fileName,
    };
  } catch (err) {
    console.error(`[导入] 解析文件 ${fileName} 异常:`, err);
    return null;
  }
}

/**
 * 拓扑排序 - 按依赖顺序排序（先父后子）
 */
export function topologicalSort(notes: ParsedNote[]): ParsedNote[] {
  const noteMap = new Map<string, ParsedNote>();
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // 构建图
  for (const note of notes) {
    noteMap.set(note.id, note);
    inDegree.set(note.id, 0);
    adjacency.set(note.id, []);
  }

  // 计算入度和构建邻接表
  for (const note of notes) {
    if (note.parentId && noteMap.has(note.parentId)) {
      adjacency.get(note.parentId)!.push(note.id);
      inDegree.set(note.id, (inDegree.get(note.id) || 0) + 1);
    }
  }

  // Kahn 算法
  const queue: string[] = [];
  const sorted: string[] = [];

  // 入度为0的节点（根节点）
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    sorted.push(current);

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // 如果有环（还有剩余节点），检测并处理
  if (sorted.length < notes.length) {
    const cycleNodes = notes
      .filter(n => !sorted.includes(n.id))
      .map(n => n.title || n.id);
    console.warn(`[导入] 检测到循环引用，涉及节点: ${cycleNodes.join(', ')}`);
  }

  return sorted.map(id => noteMap.get(id)!).filter(Boolean);
}

/**
 * 检测循环引用
 */
export function detectCycle(notes: ParsedNote[]): string[][] {
  const cycles: string[][] = [];
  const noteMap = new Map<string, ParsedNote>();

  for (const note of notes) {
    noteMap.set(note.id, note);
  }

  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);
    path.push(nodeId);

    const node = noteMap.get(nodeId);
    if (node?.parentId && noteMap.has(node.parentId)) {
      if (!visited.has(node.parentId)) {
        if (dfs(node.parentId)) {
          return true;
        }
      } else if (recursionStack.has(node.parentId)) {
        // 发现环
        const cycleStart = path.indexOf(node.parentId);
        cycles.push(path.slice(cycleStart));
        return true;
      }
    }

    path.pop();
    recursionStack.delete(nodeId);
    return false;
  }

  for (const note of notes) {
    if (!visited.has(note.id)) {
      dfs(note.id);
    }
  }

  return cycles;
}

/**
 * 检查用户是否是笔记的 owner
 */
export async function checkOwnership(noteId: string, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('notes')
    .select('owner_id')
    .eq('id', noteId)
    .single();

  if (error || !data) return false;
  return data.owner_id === userId;
}

/**
 * 获取用户的笔记本和分区列表
 */
export async function getUserNotebooksAndSections(userId: string): Promise<{
  notebooks: { id: string; title: string }[];
  sections: { id: string; title: string; parentId: string | null }[];
}> {
  // 获取用户拥有的所有笔记本和分区
  const { data, error } = await supabase
    .from('notes')
    .select('id, title, type, parent_id, owner_id')
    .eq('owner_id', userId)
    .in('type', ['notebook', 'section']);

  if (error) {
    console.error('[导入] 获取笔记本列表失败:', error);
    return { notebooks: [], sections: [] };
  }

  const notebooks = data
    .filter(n => n.type === 'notebook')
    .map(n => ({ id: n.id, title: n.title }));

  const sections = data
    .filter(n => n.type === 'section')
    .map(n => ({ id: n.id, title: n.title, parentId: n.parent_id }));

  return { notebooks, sections };
}

/**
 * 查找匹配的父节点
 */
export async function findMatchingParent(
  parentId: string,
  userId: string
): Promise<{ found: boolean; matchedId: string | null; isOwner: boolean }> {
  const { data, error } = await supabase
    .from('notes')
    .select('id, owner_id')
    .eq('id', parentId)
    .single();

  if (error || !data) {
    return { found: false, matchedId: null, isOwner: false };
  }

  return {
    found: true,
    matchedId: data.id,
    isOwner: data.owner_id === userId,
  };
}

/**
 * 导入单个笔记
 */
export async function importNote(
  note: ParsedNote,
  targetParentId: string | null,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('notes').insert({
      id: note.id,
      title: note.title,
      content: note.content,
      type: note.type,
      parent_id: targetParentId,
      owner_id: userId,
      icon: note.icon,
      order_index: note.order,
      created_at: note.createdAt,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      // 如果是 ID 冲突，尝试用新 ID
      if (error.code === '23505') {
        const newId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const { error: retryError } = await supabase.from('notes').insert({
          id: newId,
          title: note.title,
          content: note.content,
          type: note.type,
          parent_id: targetParentId,
          owner_id: userId,
          icon: note.icon,
          order_index: note.order,
          created_at: note.createdAt,
          updated_at: new Date().toISOString(),
        });
        if (retryError) {
          return { success: false, error: retryError.message };
        }
        return { success: true };
      }
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 批量导入笔记
 */
export async function importNotes(
  files: File[],
  userId: string,
  targetMapper?: (note: ParsedNote) => string | null
): Promise<ImportResult> {
  const result: ImportResult = { success: 0, failed: 0, issues: [] };

  // 1. 解析所有文件
  const parsedNotes: ParsedNote[] = [];
  for (const file of files) {
    const content = await file.text();
    const parsed = parseMdFile(content, file.name);
    if (parsed) {
      parsedNotes.push(parsed);
    } else {
      result.issues.push({
        fileName: file.name,
        issueType: 'parse_error',
        message: '文件格式错误，无法解析',
      });
      result.failed++;
    }
  }

  if (parsedNotes.length === 0) {
    return result;
  }

  // 2. 拓扑排序
  const sortedNotes = topologicalSort(parsedNotes);

  // 3. 检测循环引用
  const cycles = detectCycle(parsedNotes);
  if (cycles.length > 0) {
    for (const cycle of cycles) {
      result.issues.push({
        fileName: cycle.join(' → '),
        issueType: 'cycle_detected',
        message: `检测到循环引用: ${cycle.join(' → ')}，这些笔记将使用新 ID 导入`,
      });
    }
  }

  // 4. 检查每个笔记的父节点
  const idMapping = new Map<string, string>(); // 原始 ID → 实际 ID（可能因为冲突而改变）

  for (const note of sortedNotes) {
    let targetParentId = note.parentId;

    // 如果有自定义的 mapper，使用它
    if (targetMapper) {
      const mappedParent = targetMapper(note);
      if (mappedParent !== null) {
        targetParentId = mappedParent;
      }
    }

    // 检查父节点是否存在且用户有权限
    if (note.parentId) {
      const parentCheck = await findMatchingParent(note.parentId, userId);

      if (!parentCheck.found) {
        // 父节点不存在，尝试找到同名的笔记本/分区
        const { notebooks, sections } = await getUserNotebooksAndSections(userId);

        // 尝试匹配
        let matched = false;
        for (const nb of notebooks) {
          if (nb.title === note.title.split('-')[0]) {
            targetParentId = nb.id;
            matched = true;
            break;
          }
        }

        if (!matched) {
          for (const sec of sections) {
            if (sec.title === note.title.split('-')[1]) {
              targetParentId = sec.id;
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          result.issues.push({
            fileName: note.originalFileName,
            issueType: 'parent_not_found',
            message: `找不到父节点 "${note.parentId}"，将创建新的父节点`,
          });
          targetParentId = null;
        }
      } else if (!parentCheck.isOwner) {
        // 父节点存在但用户不是 owner，无权导入
        result.issues.push({
          fileName: note.originalFileName,
          issueType: 'not_owner',
          message: `您不是此笔记本的所有者，无法导入`,
        });
        result.failed++;
        continue;
      }
    }

    // 导入笔记
    const importResult = await importNote(note, targetParentId, userId);
    if (importResult.success) {
      result.success++;
      idMapping.set(note.id, note.id);
    } else {
      result.failed++;
      result.issues.push({
        fileName: note.originalFileName,
        issueType: 'parse_error',
        message: `导入失败: ${importResult.error}`,
      });
    }
  }

  return result;
}
