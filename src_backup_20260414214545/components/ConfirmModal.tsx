import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-[90%] max-w-sm p-6">
        {/* 标题和图标 */}
        <div className="flex items-start gap-3 mb-4">
          {isDanger ? (
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="font-semibold text-gray-900 text-base">{title}</h3>
          </div>
        </div>

        {/* 消息内容 */}
        <p className="text-gray-600 text-sm leading-relaxed mb-6">{message}</p>

        {/* 按钮 */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDanger
                ? 'bg-red-500 text-white hover:bg-red-600'
                : 'bg-blue-500 text-white hover:bg-blue-600'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// 全局确认函数（使用 React Portal 或回调模式）
let globalConfirmCallback: ((result: boolean) => void) | null = null;

export const showConfirm = (
  title: string,
  message: string,
  options?: {
    confirmText?: string;
    cancelText?: string;
    isDanger?: boolean;
    onResult: (confirmed: boolean) => void;
  }
) => {
  // 通过自定义事件传递确认逻辑
  const event = new CustomEvent('show-confirm', {
    detail: {
      title,
      message,
      confirmText: options?.confirmText || '确定',
      cancelText: options?.cancelText || '取消',
      isDanger: options?.isDanger || false,
    },
  });
  window.dispatchEvent(event);

  // 监听确认结果
  const handler = (e: CustomEvent) => {
    window.removeEventListener('confirm-result', handler as EventListener);
    options?.onResult(e.detail.confirmed);
  };
  window.addEventListener('confirm-result', handler as EventListener);
};