import React, { useEffect, useRef, useState, useCallback } from 'react';
import MindElixir from 'mind-elixir';
import 'mind-elixir/style.css';
import { X, Save, RotateCcw, Download } from 'lucide-react';

interface MindElixirEditorProps {
  content: string;
  onSave: (content: string) => void;
  onCancel: () => void;
}

export const MindElixirEditor: React.FC<MindElixirEditorProps> = ({ content, onSave, onCancel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mindRef = useRef<any>(null);
  const initialContentRef = useRef(content);
  const [isReady, setIsReady] = useState(false);

  // 初始化 Mind Elixir
  useEffect(() => {
    if (!containerRef.current) return;

    // 解析现有内容或创建新数据
    let data;
    try {
      if (initialContentRef.current) {
        data = JSON.parse(initialContentRef.current);
      } else {
        data = MindElixir.new('中心主题');
      }
    } catch {
      data = MindElixir.new('中心主题');
    }

    // 创建 MindElixir 实例
    const mind = new MindElixir({
      el: containerRef.current,
      direction: MindElixir.RIGHT,
      toolBar: true,
      keypress: true, // 启用快捷键
      locale: 'zh_CN',
      overflowHidden: false,
      mainLinkStyle: 2,
      mouseSelectionButton: 0,
      contextMenu: {
        focus: true,
        link: true,
        extend: [
          {
            name: '变更颜色',
            onclick: (nodeData: any) => {
              // 颜色选择可以通过快捷键或直接修改实现
              void nodeData;
            },
          },
        ],
      },
      // 操作前回调
      before: {
        insertSibling: () => true,
        addChild: () => true,
        removeNode: () => true,
      },
    });

    // 监听操作事件
    mind.bus.addListener('operation', () => {});

    // 初始化数据
    mind.init(data);
    mindRef.current = mind;
    setIsReady(true);

    // 清理
    return () => {
      if (mindRef.current) {
        mindRef.current = null;
      }
    };
  }, []);

  // 处理保存
  const handleSave = useCallback(() => {
    if (!mindRef.current) return;
    const data = mindRef.current.getData();
    const jsonString = JSON.stringify(data);
    onSave(jsonString);
  }, [onSave]);

  // 处理重置
  const handleReset = useCallback(() => {
    if (!mindRef.current) return;
    const data = MindElixir.new('中心主题');
    mindRef.current.init(data);
  }, []);

  // 处理导出 SVG
  const handleExportSvg = useCallback(() => {
    if (!containerRef.current) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = '思维导图.svg';
    link.click();
    URL.revokeObjectURL(url);
  }, []);

  // 处理快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!mindRef.current) return;

      // Escape 关闭
      if (e.key === 'Escape') {
        e.preventDefault();
        handleSave();
        return;
      }

      // Ctrl+S 保存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <div className="bg-white rounded-xl shadow-2xl w-[95vw] h-[90vh] max-w-7xl overflow-hidden flex flex-col">
        {/* 顶部工具栏 */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-xl font-bold text-gray-800">思维导图编辑器</h3>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              <span>• 双击节点编辑文本</span>
              <span>• Tab 添加子节点</span>
              <span>• Enter 添加同级节点</span>
              <span>• Delete 删除节点</span>
              <span>• Ctrl+S 保存</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="新建思维导图"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={handleExportSvg}
              className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              title="导出 SVG"
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={onCancel}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-lg hover:from-purple-600 hover:to-blue-600 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>

        {/* Mind Elixir 容器 */}
        <div className="flex-1 overflow-hidden bg-gray-50">
          <div 
            id="mind-elixir-container" 
            ref={containerRef} 
            className="w-full h-full"
            style={{ minHeight: '500px' }}
          />
        </div>

        {/* 底部提示 */}
        <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between text-sm text-gray-500 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#4a90e2]"></span>
              蓝色系
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#57b894]"></span>
              绿色系
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-[#9c27b0]"></span>
              紫色系
            </span>
          </div>
          <span>拖拽节点可调整位置</span>
        </div>
      </div>
    </div>
  );
};

export default MindElixirEditor;
