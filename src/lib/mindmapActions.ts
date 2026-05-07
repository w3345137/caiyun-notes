export interface MindmapActions {
  addChild: () => void;
  addSibling: () => void;
  removeSelected: () => void;
  deleteMindmap: () => void;
  toggleFullscreen: () => void;
  exportImage: () => void;
  exportMarkdown: () => void;
  addSummary: () => void;
}

const mindmapRegistry = new Map<string, MindmapActions>();
let registryCounter = 0;

export function registerMindmap(actions: MindmapActions): string {
  const id = `mindmap-${++registryCounter}`;
  mindmapRegistry.set(id, actions);
  return id;
}

export function unregisterMindmap(id: string) {
  mindmapRegistry.delete(id);
}

export function getActiveMindmapActions(): MindmapActions | null {
  const entries = Array.from(mindmapRegistry.values());
  return entries.length > 0 ? entries[entries.length - 1] : null;
}
