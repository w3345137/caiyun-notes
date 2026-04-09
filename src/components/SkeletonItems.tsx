import React from 'react';

/**
 * 骨架屏动画样式 - 轻微渐入闪烁
 */
const skeletonClass = `
  animate-pulse-skeleton
`;

// 添加全局动画样式
if (typeof document !== 'undefined') {
  const styleId = 'skeleton-animation-style';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes skeleton-shimmer {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }
      .animate-pulse-skeleton {
        animation: skeleton-shimmer 1.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * 笔记本骨架屏 - 灰色长条+折叠图标样式
 */
export const NotebookSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center px-3 py-1.5 mx-2 my-0.5 rounded-lg ${skeletonClass}`}
          style={{
            backgroundColor: '#f3f4f6',
            height: '36px', // 与实际笔记本行高一致
          }}
        >
          {/* 折叠图标占位 */}
          <div
            className="w-4 h-4 rounded flex-shrink-0 mr-2"
            style={{ backgroundColor: '#d1d5db' }}
          />
          {/* 颜色条占位 */}
          <div
            className="w-1 h-5 rounded mr-2 flex-shrink-0"
            style={{ backgroundColor: '#e5e7eb' }}
          />
          {/* 标题占位 */}
          <div
            className="h-4 rounded flex-1"
            style={{
              backgroundColor: '#d1d5db',
              width: `${40 + Math.random() * 40}%`,
            }}
          />
        </div>
      ))}
    </>
  );
};

/**
 * 分区骨架屏 - 缩进+图标+标题
 */
export const SectionSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center px-3 py-1.5 pl-6 ${skeletonClass}`}
          style={{
            height: '32px', // 与实际分区行高一致
          }}
        >
          {/* 图标占位 */}
          <div
            className="w-4 h-4 rounded flex-shrink-0 mr-2"
            style={{ backgroundColor: '#d1d5db' }}
          />
          {/* 标题占位 */}
          <div
            className="h-3.5 rounded flex-1"
            style={{
              backgroundColor: '#e5e7eb',
              width: `${50 + Math.random() * 30}%`,
            }}
          />
        </div>
      ))}
    </>
  );
};

/**
 * 页面骨架屏 - 缩进+图标+标题
 */
export const PageSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center px-3 py-1.5 pl-6 ${skeletonClass}`}
          style={{
            height: '32px', // 与实际页面行高一致
          }}
        >
          {/* 图标占位 */}
          <div
            className="w-4 h-4 rounded flex-shrink-0 mr-2"
            style={{ backgroundColor: '#d1d5db' }}
          />
          {/* 标题占位 */}
          <div
            className="h-3.5 rounded flex-1"
            style={{
              backgroundColor: '#e5e7eb',
              width: `${60 + Math.random() * 25}%`,
            }}
          />
        </div>
      ))}
    </>
  );
};
