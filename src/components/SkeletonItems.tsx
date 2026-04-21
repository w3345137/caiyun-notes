import React from 'react';

const skeletonClass = `
  animate-pulse-skeleton
`;

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

const SKELETON_WIDTHS = ['45%', '55%', '65%', '50%', '60%', '70%', '48%', '58%', '68%'];
const SECTION_WIDTHS = ['55%', '60%', '65%', '52%', '62%', '72%', '58%', '68%'];
const PAGE_WIDTHS = ['65%', '70%', '75%', '68%', '72%', '78%', '62%', '74%', '80%'];

export const NotebookSkeleton: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center px-3 py-1.5 mx-2 my-0.5 rounded-lg ${skeletonClass}`}
          style={{
            backgroundColor: '#f3f4f6',
            height: '36px',
          }}
        >
          <div
            className="w-4 h-4 rounded flex-shrink-0 mr-2"
            style={{ backgroundColor: '#d1d5db' }}
          />
          <div
            className="w-1 h-5 rounded mr-2 flex-shrink-0"
            style={{ backgroundColor: '#e5e7eb' }}
          />
          <div
            className="h-4 rounded flex-1"
            style={{
              backgroundColor: '#d1d5db',
              width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length],
            }}
          />
        </div>
      ))}
    </>
  );
};

export const SectionSkeleton: React.FC<{ count?: number }> = ({ count = 2 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center px-3 py-1.5 pl-6 ${skeletonClass}`}
          style={{
            height: '32px',
          }}
        >
          <div
            className="w-4 h-4 rounded flex-shrink-0 mr-2"
            style={{ backgroundColor: '#d1d5db' }}
          />
          <div
            className="h-3.5 rounded flex-1"
            style={{
              backgroundColor: '#e5e7eb',
              width: SECTION_WIDTHS[i % SECTION_WIDTHS.length],
            }}
          />
        </div>
      ))}
    </>
  );
};

export const PageSkeleton: React.FC<{ count?: number }> = ({ count = 3 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center px-3 py-1.5 pl-6 ${skeletonClass}`}
          style={{
            height: '32px',
          }}
        >
          <div
            className="w-4 h-4 rounded flex-shrink-0 mr-2"
            style={{ backgroundColor: '#d1d5db' }}
          />
          <div
            className="h-3.5 rounded flex-1"
            style={{
              backgroundColor: '#e5e7eb',
              width: PAGE_WIDTHS[i % PAGE_WIDTHS.length],
            }}
          />
        </div>
      ))}
    </>
  );
};
