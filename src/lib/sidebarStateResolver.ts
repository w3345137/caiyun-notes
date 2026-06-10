type SidebarNoteLike = {
  id: string;
  title?: string;
  type?: string;
  parent_id?: string | null;
  parentId?: string | null;
  root_notebook_id?: string | null;
  rootNotebookId?: string | null;
};

type SidebarStateLike = {
  selectedNoteId?: string | null;
  expandedNodes?: string[];
};

const JIANGSU_ORG_NOTEBOOK_ID = 'jiangsu-company';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function parentIdOf(note: SidebarNoteLike) {
  return note.parent_id || note.parentId || null;
}

function stripProjectCount(title: string) {
  return title.replace(/（\d+）$/, '');
}

function rootIdOf(note: SidebarNoteLike, byId: Map<string, SidebarNoteLike>) {
  const explicitRoot = note.root_notebook_id || note.rootNotebookId;
  if (explicitRoot) return explicitRoot;
  if (note.type === 'notebook') return note.id;

  const visited = new Set<string>();
  let current: SidebarNoteLike | undefined = note;
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    if (current.type === 'notebook') return current.id;
    const parentId = parentIdOf(current);
    if (!parentId) break;
    current = byId.get(parentId);
  }

  return '';
}

function normalizedTitle(note: SidebarNoteLike, byId: Map<string, SidebarNoteLike>) {
  const title = text(note.title);
  const rootId = rootIdOf(note, byId);
  if (rootId === JIANGSU_ORG_NOTEBOOK_ID && note.type === 'section') {
    return stripProjectCount(title);
  }
  return title;
}

function parentTitleOf(note: SidebarNoteLike, byId: Map<string, SidebarNoteLike>) {
  const parentId = parentIdOf(note);
  if (!parentId) return '';
  const parent = byId.get(parentId);
  return parent ? normalizedTitle(parent, byId) : '';
}

function stableKey(note: SidebarNoteLike, byId: Map<string, SidebarNoteLike>) {
  const rootId = rootIdOf(note, byId);
  const type = text(note.type || 'page');
  const title = normalizedTitle(note, byId);
  const parentTitle = type === 'section' || type === 'notebook' ? '' : parentTitleOf(note, byId);
  return [rootId, type, parentTitle, title].join('\u0000');
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

export function resolveSidebarStateForNotes(
  nextNotes: SidebarNoteLike[],
  previousNotes: SidebarNoteLike[],
  state: SidebarStateLike,
): { selectedNoteId: string | null; expandedNodes: string[] } {
  const nextIds = new Set(nextNotes.map((note) => note.id));
  const previousById = new Map(previousNotes.map((note) => [note.id, note]));
  const nextById = new Map(nextNotes.map((note) => [note.id, note]));
  const nextIdByStableKey = new Map<string, string>();

  for (const note of nextNotes) {
    nextIdByStableKey.set(stableKey(note, nextById), note.id);
  }

  const resolveId = (id: string | null | undefined) => {
    if (!id) return null;
    if (nextIds.has(id)) return id;
    const previous = previousById.get(id);
    if (!previous) return null;
    return nextIdByStableKey.get(stableKey(previous, previousById)) || null;
  };

  return {
    selectedNoteId: resolveId(state.selectedNoteId) || null,
    expandedNodes: unique((state.expandedNodes || []).map(resolveId).filter(Boolean) as string[]),
  };
}
