/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState } from 'react';
import { Editor } from '@tiptap/react';

interface ActiveNodeViewEditor {
  editor: Editor;
  nodeName: string;
}

interface NodeViewEditorContextValue {
  activeNodeViewEditor: ActiveNodeViewEditor | null;
  setActiveNodeViewEditor: (info: ActiveNodeViewEditor | null) => void;
}

const NodeViewEditorContext = createContext<NodeViewEditorContextValue>({
  activeNodeViewEditor: null,
  setActiveNodeViewEditor: () => {},
});

export const useNodeViewEditor = () => useContext(NodeViewEditorContext);

export const NodeViewEditorProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [activeNodeViewEditor, setActiveNodeViewEditor] = useState<ActiveNodeViewEditor | null>(null);

  return (
    <NodeViewEditorContext.Provider value={{ activeNodeViewEditor, setActiveNodeViewEditor }}>
      {children}
    </NodeViewEditorContext.Provider>
  );
};
