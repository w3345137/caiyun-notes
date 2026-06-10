import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { FontSize } from '@tiptap/extension-font-size';
import { ListKeymap } from '@tiptap/extension-list-keymap';
import { Markdown } from '@tiptap/markdown';
import { Lock, RefreshCw, Send, ShieldCheck, Unlock } from 'lucide-react';
import toast from 'react-hot-toast';
import { TableWithDefaultWidth } from '../extensions/TableWithDefaultWidth';
import { TableRowWithTextSelection } from '../extensions/TableRowWithTextSelection';
import { TableCellWithColor } from '../extensions/TableCellWithColor';
import { TableHeaderWithColor } from '../extensions/TableHeaderWithColor';
import { TextSelectionInTableExtension } from '../extensions/TextSelectionInTablePlugin';
import { ResizableImage } from '../extensions/ResizableImage';
import {
  apiOrgPlanGetTabContent,
  apiOrgPlanListTabs,
  apiOrgPlanLockTab,
  apiOrgPlanSaveTabContent,
  apiOrgPlanSendIdentityCode,
  apiOrgPlanSync,
  apiOrgPlanUnlockTab,
  apiOrgPlanVerifyIdentityCode,
} from '../lib/edgeApi';
import { useAuth } from './authContext';
import { useNoteStore } from '../store/noteStore';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };

interface OrgPlanTab {
  assignmentId: string;
  employeeId: string;
  title: string;
  employeeName: string;
  positionName?: string;
  departmentName?: string;
  archived?: boolean;
  canView?: boolean;
  canEdit?: boolean;
  lockedBy?: string | null;
  lockedByName?: string | null;
  updatedAt?: string | null;
}

interface OrgPlanPageViewProps {
  noteId: string;
  pageTitle: string;
}

function parseDoc(raw: unknown) {
  if (!raw) return EMPTY_DOC;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed?.type === 'doc' ? parsed : EMPTY_DOC;
  } catch {
    return EMPTY_DOC;
  }
}

const OrgPlanPageView: React.FC<OrgPlanPageViewProps> = ({ noteId, pageTitle }) => {
  const { user } = useAuth();
  const loadFromCloud = useNoteStore((state) => state.loadFromCloud);
  const [tabs, setTabs] = useState<OrgPlanTab[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [binding, setBinding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [identityForm, setIdentityForm] = useState({ employeeId: '', employeeName: '', code: '' });
  const [codeSent, setCodeSent] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const canEditRef = useRef(false);
  const loadingContentRef = useRef(false);

  const visibleTabs = useMemo(() => {
    if (isOwner) return tabs;
    return tabs.filter((tab) => tab.canView);
  }, [isOwner, tabs]);
  const activeTab = visibleTabs.find((tab) => tab.assignmentId === activeId) || null;
  const lockedByOther = !!(activeTab?.lockedBy && activeTab.lockedBy !== user?.id);
  const activeCanEdit = !!(activeTab?.canEdit && !lockedByOther);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        listKeymap: false,
      }),
      Placeholder.configure({ placeholder: '填写本周计划、进展和需要协同的问题...' }),
      ResizableImage.configure({
        HTMLAttributes: { class: 'rounded-lg' },
      }),
      TableWithDefaultWidth.configure({
        resizable: true,
        handleWidth: 3,
      }),
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      TableRowWithTextSelection,
      TableCellWithColor.configure({
        HTMLAttributes: { class: 'relative' },
      }),
      TableHeaderWithColor,
      TextSelectionInTableExtension,
      TextStyle,
      Color,
      FontSize.configure({ types: ['textStyle'] }),
      Highlight,
      Link.configure({ openOnClick: false }),
      TaskList.configure({ HTMLAttributes: { class: 'not-prose list-none pl-0' } }),
      TaskItem.configure({ nested: true }),
      ListKeymap.configure({
        listTypes: [
          { itemName: 'listItem', wrapperNames: ['bulletList', 'orderedList'] },
          { itemName: 'taskItem', wrapperNames: ['taskList'] },
        ],
      }),
      Markdown.configure({
        markedOptions: {
          breaks: false,
        },
      }),
    ],
    content: EMPTY_DOC,
    // Tiptap Table only registers column-resize plugins during editor creation
    // when the editor is editable. The effect below still enforces per-tab locks.
    editable: true,
    onUpdate: ({ editor: currentEditor }) => {
      if (loadingContentRef.current || !canEditRef.current || !activeIdRef.current) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      const nextContent = currentEditor.getJSON();
      setSaving(true);
      saveTimerRef.current = window.setTimeout(async () => {
        const result = await apiOrgPlanSaveTabContent(noteId, activeIdRef.current, nextContent);
        setSaving(false);
        if (!result.success) {
          toast.error(result.error || '页签自动保存失败');
        }
      }, 800);
    },
  });

  const loadTabs = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await apiOrgPlanListTabs(noteId);
    setLoading(false);
    if (!result.success) {
      setError(result.error || '加载组织页签失败');
      return;
    }
    const nextTabs: OrgPlanTab[] = result.data?.tabs || [];
    const nextVisible = result.data?.isOwner ? nextTabs : nextTabs.filter((tab) => tab.canView);
    setTabs(nextTabs);
    setIsOwner(!!result.data?.isOwner);
    setBinding(result.data?.binding || null);
    setActiveId((current) => {
      if (current && nextVisible.some((tab) => tab.assignmentId === current)) return current;
      return nextVisible[0]?.assignmentId || null;
    });
  }, [noteId]);

  useEffect(() => {
    loadTabs();
  }, [loadTabs]);

  useEffect(() => {
    activeIdRef.current = activeId;
    canEditRef.current = activeCanEdit;
    editor?.setEditable(activeCanEdit);
  }, [activeCanEdit, activeId, editor]);

  useEffect(() => {
    if (!editor || !activeId) return;
    loadingContentRef.current = true;
    apiOrgPlanGetTabContent(activeId).then((result) => {
      if (activeIdRef.current !== activeId) return;
      if (!result.success) {
        setError(result.error || '加载页签内容失败');
        editor.commands.setContent(EMPTY_DOC, { emitUpdate: false });
        return;
      }
      editor.commands.setContent(parseDoc(result.data?.content), { emitUpdate: false });
    }).finally(() => {
      loadingContentRef.current = false;
    });
  }, [activeId, editor]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    const result = await apiOrgPlanSync();
    setSyncing(false);
    if (!result.success) {
      toast.error(result.error || 'HCM 同步失败');
      return;
    }
    toast.success(`已同步 ${result.data?.active || 0} 条当前任职`);
    await loadTabs();
    loadFromCloud();
  };

  const handleSendCode = async () => {
    const result = await apiOrgPlanSendIdentityCode(identityForm.employeeId, identityForm.employeeName);
    if (!result.success) {
      toast.error(result.error || '验证码发送失败');
      return;
    }
    setCodeSent(true);
    toast.success('验证码已发送到中建通');
  };

  const handleVerify = async () => {
    const result = await apiOrgPlanVerifyIdentityCode(identityForm.employeeId, identityForm.employeeName, identityForm.code);
    if (!result.success) {
      toast.error(result.error || '验证失败');
      return;
    }
    toast.success('身份验证成功');
    setCodeSent(false);
    await loadTabs();
    loadFromCloud();
  };

  const handleLock = async () => {
    if (!activeId) return;
    const result = await apiOrgPlanLockTab(activeId, user?.display_name || user?.email || '');
    if (!result.success) {
      toast.error(result.error || '锁定失败');
      return;
    }
    await loadTabs();
  };

  const handleUnlock = async () => {
    if (!activeId) return;
    const result = await apiOrgPlanUnlockTab(activeId);
    if (!result.success) {
      toast.error(result.error || '解锁失败');
      return;
    }
    await loadTabs();
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-sm text-gray-400">正在加载组织页签...</div>;
  }

  if (!binding && !isOwner) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">中建通身份验证</h2>
              <p className="mt-1 text-xs text-gray-500">验证后仅能编辑你自己的当前任职页签。</p>
            </div>
          </div>
          <div className="space-y-3">
            <input
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              placeholder="员工编号"
              value={identityForm.employeeId}
              onChange={(event) => setIdentityForm((prev) => ({ ...prev, employeeId: event.target.value }))}
            />
            <input
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              placeholder="姓名"
              value={identityForm.employeeName}
              onChange={(event) => setIdentityForm((prev) => ({ ...prev, employeeName: event.target.value }))}
            />
            {codeSent && (
              <input
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                placeholder="中建通验证码"
                value={identityForm.code}
                onChange={(event) => setIdentityForm((prev) => ({ ...prev, code: event.target.value }))}
              />
            )}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button
              onClick={handleSendCode}
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800"
            >
              <Send className="h-4 w-4" />
              发送验证码
            </button>
            {codeSent && (
              <button
                onClick={handleVerify}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
              >
                完成验证
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex bg-white">
      <aside className="w-64 shrink-0 border-r border-gray-100 bg-gray-50/60 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-xs text-gray-400">组织页面</div>
          <div className="mt-1 truncate font-semibold text-gray-800">{pageTitle}</div>
          {isOwner && (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
              HCM 同步
            </button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto p-2">
          {visibleTabs.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-gray-400">当前页面没有你的可查看页签</div>
          ) : visibleTabs.map((tab) => (
            <button
              key={tab.assignmentId}
              onClick={() => setActiveId(tab.assignmentId)}
              className={`mb-1 w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                activeId === tab.assignmentId
                  ? 'bg-blue-100 text-blue-900'
                  : 'text-gray-700 hover:bg-white'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                {tab.lockedBy && <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" />}
              </div>
              <div className="mt-0.5 truncate text-xs text-gray-400">{tab.archived ? '归档' : tab.departmentName}</div>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-gray-900">{activeTab?.title || '未选择页签'}</div>
            <div className="mt-0.5 text-xs text-gray-400">
              {activeTab?.updatedAt ? `最后保存: ${new Date(activeTab.updatedAt).toLocaleString('zh-CN')}` : '尚未保存'}
              {saving ? ' · 正在自动保存' : ''}
            </div>
          </div>
          {activeTab && (activeCanEdit || activeTab.lockedBy === user?.id || isOwner) && (
            <button
              onClick={activeTab.lockedBy ? handleUnlock : handleLock}
              className="inline-flex items-center gap-2 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              {activeTab.lockedBy ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {activeTab.lockedBy ? '解锁页签' : '锁定页签'}
            </button>
          )}
        </div>
        {error && <div className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-600">{error}</div>}
        {lockedByOther && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-2 text-sm text-amber-700">
            该页签已被 {activeTab?.lockedByName || '其他人'} 锁定，只能查看。
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-auto px-8 py-6">
          <div className="mx-auto max-w-4xl">
            <EditorContent editor={editor} className="org-plan-editor" />
          </div>
        </div>
      </section>
    </div>
  );
};

export default OrgPlanPageView;
