/**
 * Generic amber-styled custom select — visual language matches the
 * AmberSelect dropdowns in the professor Settings portal (amber focus ring,
 * rounded-xl, white popover, amber selected state instead of system blue).
 *
 * Minimal label+value props so it can back any simple dropdown
 * (e.g. the course pickers on the student profile page).
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AmberSelectOption {
  value: string;
  label: string;
  /** Optional group name — used with the `groups` prop for sectioned popovers */
  group?: string;
}

export const AmberSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  options: AmberSelectOption[];
  placeholder?: string;
  className?: string;
  /** Grey out and block interaction (e.g. while an upload is running) */
  disabled?: boolean;
  /** Smaller trigger/options for inline editing contexts */
  compact?: boolean;
  /** Red border for required-field validation */
  error?: boolean;
  /** Ordered group names — options with matching `group` render under sticky headers */
  groups?: readonly string[];
}> = ({ value, onChange, options, placeholder = '— Select —', className = '', disabled = false, compact = false, error = false, groups }) => {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);

  // Flatten options into visual order (grouped first, ungrouped last) so
  // keyboard navigation always matches what's on screen.
  const ordered = useMemo(() => {
    if (!groups) return options.map(opt => ({ opt, header: null as string | null }));
    const out: { opt: AmberSelectOption; header: string | null }[] = [];
    for (const g of groups) {
      options.filter(o => o.group === g).forEach((o, i) => {
        out.push({ opt: o, header: i === 0 ? g : null });
      });
    }
    options
      .filter(o => !o.group || !groups.includes(o.group))
      .forEach(o => out.push({ opt: o, header: null }));
    return out;
  }, [options, groups]);

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
    if (open) setHighlight(ordered.findIndex(({ opt }) => opt.value === value));
  }, [open, ordered, value]);

  const selected = options.find(o => o.value === value);

  const choose = (idx: number) => {
    const entry = ordered[idx];
    if (!entry) return;
    onChange(entry.opt.value);
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
      setHighlight(h => Math.min(ordered.length - 1, Math.max(0, h + dir)));
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
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        onKeyDown={onKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`w-full flex items-center justify-between gap-2 bg-white border text-left outline-none transition-all ${
          compact ? 'rounded-lg px-2 py-1 text-xs' : 'rounded-xl px-3 py-2 text-sm'
        } ${
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
        } ${
          error
            ? 'border-red-400'
            : open
              ? 'border-amber-400 ring-2 ring-amber-200/60 shadow-sm'
              : 'border-stone-200 hover:border-stone-300'
        }`}
      >
        <span className={selected ? 'text-stone-700' : 'text-stone-400'}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown
          size={compact ? 12 : 14}
          className={`text-stone-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className={`absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-200 shadow-lg shadow-stone-900/8 overflow-hidden py-0.5 max-h-64 overflow-y-auto animate-selectOpen ${
            compact ? 'rounded-lg' : 'rounded-xl'
          }`}
        >
          {ordered.map(({ opt, header }, idx) => (
            <React.Fragment key={opt.value}>
              {header && (
                <div className="px-3 py-1.5 text-[10px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50/80 sticky top-0">
                  {header}
                </div>
              )}
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                onClick={() => choose(idx)}
                onMouseEnter={() => setHighlight(idx)}
                className={`w-full text-left transition-colors ${
                  compact ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm'
                } ${
                  opt.value === value
                    ? 'bg-amber-50 text-amber-800 font-medium'
                    : idx === highlight
                      ? 'bg-stone-50 text-stone-700'
                      : 'text-stone-700'
                }`}
              >
                {opt.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

export default AmberSelect;
