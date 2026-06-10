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
let activeMindmapId: string | null = null;

export function registerMindmap(actions: MindmapActions): string {
  const id = `mindmap-${++registryCounter}`;
  mindmapRegistry.set(id, actions);
  return id;
}

export function unregisterMindmap(id: string) {
  mindmapRegistry.delete(id);
  if (activeMindmapId === id) {
    activeMindmapId = null;
  }
}

export function setActiveMindmap(id: string) {
  if (mindmapRegistry.has(id)) {
    activeMindmapId = id;
  }
}

export function getActiveMindmapActions(): MindmapActions | null {
  if (activeMindmapId) {
    const active = mindmapRegistry.get(activeMindmapId);
    if (active) return active;
  }
  const entries = Array.from(mindmapRegistry.values());
  return entries.length > 0 ? entries[entries.length - 1] : null;
}
