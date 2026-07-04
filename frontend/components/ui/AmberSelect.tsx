/**
 * Generic amber-styled custom select — visual language matches the
 * AmberSelect dropdowns in the professor Settings portal (amber focus ring,
 * rounded-xl, white popover, amber selected state instead of system blue).
 *
 * Minimal label+value props so it can back any simple dropdown
 * (e.g. the course pickers on the student profile page).
 */
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AmberSelectOption {
  value: string;
  label: string;
}

export const AmberSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: AmberSelectOption[];
  placeholder?: string;
  className?: string;
}> = ({ value, onChange, options, placeholder = '— Select —', className = '' }) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reset highlight to current value each time the popover opens
  useEffect(() => {
    if (open) setHighlight(options.findIndex(o => o.value === value));
  }, [open, options, value]);

  const selected = options.find(o => o.value === value);

  const choose = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight(h => Math.min(options.length - 1, Math.max(0, h + dir)));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (highlight >= 0) choose(highlight);
    }
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 bg-white border rounded-xl px-3 py-2 text-sm text-left outline-none transition-all cursor-pointer ${
          open ? 'border-amber-400 ring-2 ring-amber-200/60 shadow-sm' : 'border-stone-200 hover:border-stone-300'
        }`}
      >
        <span className={selected ? 'text-stone-700' : 'text-stone-400'}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-stone-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg shadow-stone-900/8 overflow-hidden py-0.5 max-h-64 overflow-y-auto"
        >
          {options.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => choose(idx)}
              onMouseEnter={() => setHighlight(idx)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                opt.value === value
                  ? 'bg-amber-50 text-amber-800 font-medium'
                  : idx === highlight
                    ? 'bg-stone-50 text-stone-700'
                    : 'text-stone-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default AmberSelect;
