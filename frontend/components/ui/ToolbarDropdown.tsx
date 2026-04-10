/**
 * ToolbarDropdown — A compact icon-trigger dropdown for toolbar menus
 *
 * Extracted from CoursesPage.tsx. Reusable for language, model, etc.
 */

import React, { useState, useEffect, useRef } from 'react';

export interface DropdownItem {
  label: string;
  value: string;
}

interface ToolbarDropdownProps {
  icon: React.ReactNode;
  items: DropdownItem[];
  selected: string;
  onSelect: (v: string) => void;
  title: string;
  alignRight?: boolean;
}

const ToolbarDropdown: React.FC<ToolbarDropdownProps> = ({
  icon, items, selected, onSelect, title, alignRight,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        title={title}
        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
      >
        {icon}
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 min-w-[150px] py-1 ${
            alignRight ? 'right-0' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          {items.map(item => (
            <button
              key={item.value}
              onClick={() => { onSelect(item.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                selected === item.value
                  ? 'bg-amber-50 text-amber-800 font-semibold'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ToolbarDropdown;
