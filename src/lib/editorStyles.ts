/** ProseMirror 编辑器通用样式（用于 html2canvas 渲染等场景） */
export const PROSEMIRROR_CSS = `
  .ProseMirror { outline: none; padding: 0; max-width: 100%; box-sizing: border-box; font-size: 16px; min-width: 0; width: 100%; }
  .ProseMirror img { max-width: 100%; height: auto; border-radius: 8px; margin: 0.5em 0; }
  .ProseMirror img.ProseMirror-selectednode { outline: 2px solid #3b82f6; outline-offset: 2px; }
  .ProseMirror .image-wrapper { display: flex; }
  .ProseMirror .image-wrapper.align-left { justify-content: flex-start; }
  .ProseMirror .image-wrapper.align-center { justify-content: center; }
  .ProseMirror .image-wrapper.align-right { justify-content: flex-end; }
  .ProseMirror h1 { font-size: 2em; font-weight: 700; margin: 0.3em 0 0 0; line-height: normal; }
  .ProseMirror h2 { font-size: 1.5em; font-weight: 600; margin: 0.3em 0 0 0; line-height: normal; }
  .ProseMirror h3 { font-size: 1.17em; font-weight: 600; margin: 0.3em 0 0 0; line-height: normal; }
  .ProseMirror p { margin: 0; line-height: 1.5; }
  .ProseMirror ul, .ProseMirror ol { margin: 0; padding-left: 1.5em; line-height: normal; }
  .ProseMirror ul { list-style-type: disc; }
  .ProseMirror ol { list-style-type: decimal; }
  .ProseMirror ol li { padding-left: 0.25em; }
  .ProseMirror li { margin: 0; line-height: normal; }
  .ProseMirror li p { margin: 0; }
  .ProseMirror blockquote { border-left: 3px solid #3b82f6; padding-left: 1em; margin: 0.5em 0; color: #6b7280; font-style: italic; line-height: normal; }
  .ProseMirror code { background-color: #f3f4f6; border-radius: 3px; padding: 0.1em 0.3em; font-family: 'Fira Code', monospace; font-size: 0.9em; color: #e11d48; }
  .ProseMirror pre { background-color: #1f2937; color: #f9fafb; border-radius: 8px; padding: 1em; margin: 0.5em 0; overflow-x: auto; line-height: normal; }
  .ProseMirror pre code { background: none; color: inherit; padding: 0; }
  .ProseMirror a { color: #3b82f6; text-decoration: underline; cursor: pointer; }
  .ProseMirror hr { border: none; border-top: 2px solid #e5e7eb; margin: 0.5em 0; }
  .ProseMirror table { border-collapse: collapse; margin: 0; table-layout: fixed; box-sizing: border-box; position: relative; }
  .ProseMirror th, .ProseMirror td { border: 1px solid #8C8F93 !important; padding: 0.63em 0.6em !important; font-size: 14px; line-height: 1.4; vertical-align: middle; box-sizing: border-box; position: relative; }
  .ProseMirror th { background-color: #f3f4f6; font-weight: 600; text-align: left; font-size: 14px; padding: 0.54em 0.6em !important; }
  .ProseMirror td { background-color: white; font-size: 14px; }
  .ProseMirror td p { margin: 0; line-height: normal; }
  .ProseMirror .tableWrapper { display: block; max-width: 100%; overflow-x: auto; margin: 0.5em 0; box-sizing: border-box; }
  .ProseMirror mark { background-color: #fef08a; padding: 0.1em 0; }
  .ProseMirror .text-left { text-align: left; }
  .ProseMirror .text-center { text-align: center; }
  .ProseMirror .text-right { text-align: right; }
  .ProseMirror strong { font-weight: 700; }
  .ProseMirror em { font-style: italic; }
  .ProseMirror s { text-decoration: line-through; }
  .ProseMirror u { text-decoration: underline; }
  .ProseMirror ul[data-type="taskList"] { list-style: none; padding-left: 0; margin: 0; font-size: inherit; line-height: inherit; }
  .ProseMirror ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; padding: 0; font-size: inherit; line-height: 1.5; }
  .ProseMirror ul[data-type="taskList"] li > label { display: flex; align-items: center; flex-shrink: 0; margin: 0; padding: 0; height: 1.5em; }
  .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 1em; height: 1em; border: 1px solid #6b7280; border-radius: 50%; background-color: transparent; cursor: pointer; margin: 0; padding: 0; position: relative; flex-shrink: 0; }
  .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked { background-color: transparent; border-color: #6b7280; }
  .ProseMirror ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 0.5em; height: 0.5em; border-radius: 50%; background-color: #6b7280; }
  .ProseMirror ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; color: #9ca3af; }
  .ProseMirror ul[data-type="taskList"] li > div { flex: 1; font-size: inherit; line-height: 1.5; word-wrap: break-word; overflow-wrap: break-word; }
  .ProseMirror td ul[data-type="taskList"] { margin: 0; padding: 0; font-size: inherit; }
  .ProseMirror td ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.3em; font-size: inherit; margin: 0; padding: 0; }
  .ProseMirror td ul[data-type="taskList"] li > label { display: flex; align-items: center; flex-shrink: 0; margin: 0; padding: 0; height: 1.3em; margin-top: 1px; }
  .ProseMirror td ul[data-type="taskList"] li > label input[type="checkbox"] { appearance: none; -webkit-appearance: none; width: 1em; height: 1em; border: 1px solid #6b7280; border-radius: 50%; background-color: transparent; margin: 0; padding: 0; position: relative; flex-shrink: 0; }
  .ProseMirror td ul[data-type="taskList"] li > label input[type="checkbox"]:checked { background-color: transparent; border-color: #6b7280; }
  .ProseMirror td ul[data-type="taskList"] li > label input[type="checkbox"]:checked::after { content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 0.5em; height: 0.5em; border-radius: 50%; background-color: #6b7280; }
  .ProseMirror td ul[data-type="taskList"] li > div { flex: 1; font-size: inherit; line-height: 1.3; }
  .ProseMirror td ul[data-type="taskList"] li > div p { line-height: 1.3; }
`;
