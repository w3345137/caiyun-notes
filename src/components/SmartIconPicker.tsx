import React, { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface IconOption {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
}

interface SmartIconPickerProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  currentIcon: string;
  onSelectIcon: (iconId: string) => void;
  icons: IconOption[];
}

export const SmartIconPicker: React.FC<SmartIconPickerProps> = ({
  isOpen, onClose, triggerRef, currentIcon, onSelectIcon, icons
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'bottom' | 'top'>('bottom');
  const [horizontalAlign, setHorizontalAlign] = useState<'right' | 'left'>('right');

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const timer = setTimeout(() => {
      if (!triggerRef.current || !dropdownRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const dropdownRect = dropdownRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const wouldOverflowRight = triggerRect.right + dropdownRect.width > viewportWidth - 8;
      setHorizontalAlign(wouldOverflowRight ? 'left' : 'right');

      const wouldOverflowBottom = triggerRect.bottom + dropdownRect.height > viewportHeight - 8;
      setPosition(wouldOverflowBottom ? 'top' : 'bottom');
    }, 10);

    return () => clearTimeout(timer);
  }, [isOpen, triggerRef]);

  if (!isOpen) return null;

  return (
    <div
      ref={dropdownRef}
      className="absolute bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-[99999]"
      style={{
        minWidth: '220px',
        ...(position === 'bottom'
          ? { top: '100%', marginTop: '4px' }
          : { bottom: '100%', marginBottom: '4px' }),
        ...(horizontalAlign === 'right'
          ? { right: 0 }
          : { left: 0 })
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-gray-500">选择图标</p>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-0.5 hover:bg-gray-100 rounded"
        >
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5 max-h-[300px] overflow-y-auto">
        {icons.map((iconData) => {
          const IconComponent = iconData.icon;
          return (
            <button
              key={iconData.id}
              onClick={(e) => { e.stopPropagation(); onSelectIcon(iconData.id); }}
              className={`p-2 rounded-lg hover:bg-gray-100 transition-colors ${
                currentIcon === iconData.id ? 'bg-blue-50 ring-2 ring-blue-400' : ''
              }`}
              title={iconData.name}
            >
              <IconComponent className="w-5 h-5 mx-auto" style={{ color: iconData.color }} />
            </button>
          );
        })}
      </div>
    </div>
  );
};
