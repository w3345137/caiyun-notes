import React, { useRef, useState, useEffect } from 'react';

interface SmartDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
  minWidth?: number;
}

export const SmartDropdown: React.FC<SmartDropdownProps> = ({
  isOpen, onClose, triggerRef, children, minWidth = 140
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
      className="absolute bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50"
      style={{
        minWidth: `${minWidth}px`,
        ...(position === 'bottom'
          ? { top: '100%', marginTop: '4px' }
          : { bottom: '100%', marginBottom: '4px' }),
        ...(horizontalAlign === 'right'
          ? { right: 0 }
          : { left: 0 })
      }}
    >
      {children}
    </div>
  );
};
