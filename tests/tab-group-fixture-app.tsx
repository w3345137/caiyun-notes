import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { TabGroup } from '../src/extensions/TabGroup';
import { useActiveInternalEditor } from '../src/lib/nodeViewEditorManager';
import OrgPlanPageView from '../src/components/OrgPlanPageView';
import { EditorToolbar } from '../src/components/NoteEditor';

import '../src/App.css';

declare global {
  interface Window {
    tabGroupEditor?: any;
    activeInternalEditor?: any;
    getTabGroupSnapshot?: () => any;
    lastToolbarTarget?: string;
  }
}

function collectTabGroups(node: any, groups: any[] = []) {
  if (!node) return groups;
  if (node.type === 'tabGroup') groups.push(node);
  for (const child of node.content || []) {
    collectTabGroups(child, groups);
  }
  return groups;
}

function ToolbarProbe({ externalEditor }: { externalEditor: any }) {
  const activeInternalEditor = useActiveInternalEditor();
  const targetEditor = activeInternalEditor || externalEditor;
  const targetName = activeInternalEditor ? 'internal' : 'external';

  useEffect(() => {
    window.activeInternalEditor = activeInternalEditor;
  }, [activeInternalEditor]);

  return (
    <button
      id="toolbar-bold"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        window.lastToolbarTarget = targetName;
        targetEditor?.chain().focus().toggleBold().run();
      }}
      style={{ marginLeft: 8, marginBottom: 12 }}
    >
      B
    </button>
  );
}

function ActiveInternalEditorProbe() {
  const activeInternalEditor = useActiveInternalEditor();

  useEffect(() => {
    window.activeInternalEditor = activeInternalEditor;
  }, [activeInternalEditor]);

  return null;
}

function FixtureApp() {
  const params = new URLSearchParams(window.location.search);
  const useCollab = params.get('collab') === '1';
  const useLockedTabs = params.get('locked') === '1';
  const useManyTabs = params.get('many') === '1';
  const useOrgTabs = params.get('org') === '1';
  const useOrgPlanPage = params.get('orgPage') === '1';
  const useDelayedOrgPermissions = params.get('delayedPerm') === '1';
  const useFullToolbar = params.get('fullToolbar') === '1';
  const [fixtureColorPicker, setFixtureColorPicker] = React.useState(false);
  const outerReadOnly = params.get('outerReadOnly') === '1';
  const ydoc = React.useMemo(() => (useCollab ? new Y.Doc() : null), [useCollab]);
  const extensions = React.useMemo(() => {
    const base: any[] = [StarterKit, TabGroup];
    if (ydoc) base.push(Collaboration.configure({ document: ydoc, field: 'default' }));
    return base;
  }, [ydoc]);
  const editor = useEditor({
    extensions,
    content: useCollab ? undefined : useLockedTabs || useManyTabs || useOrgTabs ? {
      type: 'doc',
      content: [
        {
          type: 'tabGroup',
          attrs: {
            activeIndex: 0,
            structureLocked: true,
            orgPlan: useOrgTabs ? { kind: 'org_plan_page', noteId: 'org-note-1', pageKey: '测试页面', sectionTitle: '测试分区' } : null,
            tabs: useOrgTabs ? [
              {
                id: 'org-assignment-1',
                assignmentId: 'org-assignment-1',
                title: '总经理 张三',
                ...(useDelayedOrgPermissions ? {} : { canEdit: true }),
              },
            ] : useManyTabs ? Array.from({ length: 18 }, (_, index) => ({
              id: `many-${index + 1}`,
              title: `岗位很长的人员姓名${index + 1}`,
            })) : [
              { id: 'locked-1', title: '总经理 张三' },
              { id: 'locked-2', title: '副经理 李四' },
            ],
            contents: useOrgTabs ? {
              'org-assignment-1': { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '张三内容' }] }] },
            } : useManyTabs ? Object.fromEntries(Array.from({ length: 18 }, (_, index) => [
              `many-${index + 1}`,
              { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `人员${index + 1}内容` }] }] },
            ])) : {
              'locked-1': { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '张三内容' }] }] },
              'locked-2': { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '李四内容' }] }] },
            },
          },
        },
      ],
    } : '<p>before</p>',
    immediatelyRender: false,
    onCreate: ({ editor }) => {
      if (useCollab && editor.isEmpty) {
        editor.commands.insertContent({ type: 'paragraph', content: [{ type: 'text', text: 'before' }] });
      }
    },
    editable: !outerReadOnly,
  });

  useEffect(() => {
    window.tabGroupEditor = editor;
    window.getTabGroupSnapshot = () => {
      const json = editor?.getJSON();
      return {
        json,
        tabGroups: collectTabGroups(json),
      };
    };
  }, [editor]);

  if (useOrgPlanPage) {
    return (
      <main style={{ height: '100vh' }}>
        <OrgPlanPageView noteId="org-page-note-1" pageTitle="领导班子" />
      </main>
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <button
        id="insert-tab-group"
        onClick={() => editor?.chain().focus().insertTabGroup().run()}
        style={{ marginBottom: 12 }}
      >
        插入页签
      </button>
      {useFullToolbar ? (
        <>
          <ActiveInternalEditorProbe />
          <EditorToolbar
            editor={editor}
            onMindmapClick={() => {
              const targetEditor = window.activeInternalEditor || editor;
              targetEditor?.chain?.().focus().insertMindmap().run();
            }}
            onAttachmentClick={() => {}}
            onRecorderClick={() => {}}
            showColorPicker={fixtureColorPicker}
            setShowColorPicker={setFixtureColorPicker}
            handleCellColor={(color) => {
              const targetEditor = window.activeInternalEditor || editor;
              targetEditor?.chain?.().focus().updateAttributes('tableCell', { backgroundColor: color }).run();
            }}
          />
        </>
      ) : (
        <ToolbarProbe externalEditor={editor} />
      )}
      <EditorContent editor={editor} />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<FixtureApp />);

export default FixtureApp;
