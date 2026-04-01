/**
 * Reusable custom Select dropdown component with grouped options, search,
 * keyboard navigation, and custom "Other" input support.
 */
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════════ */

export interface SelectOption {
  value: string;
  label: string;
  desc?: string;
  group?: string;
}

export interface SelectProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  id: string;
  required?: boolean;
  placeholder?: string;
  /** Allow typing a custom value (shown as "Other / Custom") */
  allowCustom?: boolean;
  /** Callback when user types custom value (if allowCustom) */
  onCustomChange?: (v: string) => void;
  /** The custom text value (controlled) */
  customValue?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════════ */

export const Select: React.FC<SelectProps> = ({
  label, icon, value, onChange, options, id, required,
  placeholder, allowCustom, onCustomChange, customValue,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Group options for rendering
  const grouped = useMemo(() => {
    const filtered = options.filter(o =>
      o.label.toLowerCase().includes(search.toLowerCase()) ||
      (o.group || '').toLowerCase().includes(search.toLowerCase())
    );

    // Collect unique groups in order of first appearance
    const groupOrder: string[] = [];
    const groupMap: Map<string, SelectOption[]> = new Map();

    for (const opt of filtered) {
      const g = opt.group || '';
      if (!groupMap.has(g)) {
        groupOrder.push(g);
        groupMap.set(g, []);
      }
      groupMap.get(g)!.push(opt);
    }

    return { groupOrder, groupMap, flatList: filtered };
  }, [options, search]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const list = grouped.flatList;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => (prev + 1) % list.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => (prev - 1 + list.length) % list.length);
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < list.length) {
      e.preventDefault();
      handleSelect(list[highlightIdx].value);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setSearch('');
    }
  }, [grouped.flatList, highlightIdx]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-option-index]');
      items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch('');
    setHighlightIdx(-1);
  };

  // Determine display label
  const selectedOpt = options.find(o => o.value === value);
  const isCustomActive = allowCustom && value === 'other-custom';
  const displayLabel = isCustomActive
    ? (customValue || 'Other / Custom')
    : selectedOpt
      ? selectedOpt.label
      : (placeholder || 'Select…');

  return (
    <div ref={wrapperRef} className="relative" id={id}>
      {/* Label */}
      <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-1.5">
        {icon} {label} {required && <span className="text-amber-500 text-xs">*</span>}
      </label>

      {/* ── Trigger ──────────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          w-full flex items-center justify-between gap-2
          bg-white border rounded-xl px-4 py-2.5 text-sm text-left
          outline-none transition-all cursor-pointer
          ${open
            ? 'border-amber-400 ring-2 ring-amber-200/60 shadow-sm'
            : 'border-stone-200 hover:border-stone-300'
          }
        `}
      >
        <span className={selectedOpt || isCustomActive ? 'text-stone-800' : 'text-stone-400'}>
          {displayLabel}
        </span>
        <ChevronDown
          size={16}
          className={`text-stone-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* ── Custom input (below trigger, when "Other / Custom" selected) */}
      {isCustomActive && onCustomChange && (
        <input
          type="text"
          value={customValue || ''}
          onChange={e => onCustomChange(e.target.value)}
          placeholder="Type your custom level…"
          className="w-full mt-2 bg-white border border-amber-300 rounded-xl px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
          autoFocus
        />
      )}

      {/* ── Dropdown panel ──────────────────────────────────────────── */}
      {open && (
        <div
          className="
            absolute z-50 left-0 right-0 mt-1.5
            bg-white border border-stone-200 rounded-xl
            shadow-lg shadow-stone-900/8
            overflow-hidden
            animate-selectOpen
          "
          onKeyDown={handleKeyDown}
        >
          {/* Search bar */}
          {options.length > 6 && (
            <div className="px-3 pt-3 pb-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={e => { setSearch(e.target.value); setHighlightIdx(0); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search options…"
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg pl-9 pr-8 py-2 text-sm text-stone-700 placeholder:text-stone-400 outline-none focus:ring-1 focus:ring-amber-300 focus:border-amber-300 transition"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); searchRef.current?.focus(); }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Options list */}
          <div
            ref={listRef}
            className="max-h-64 overflow-y-auto overscroll-contain py-1.5"
            style={{ scrollbarGutter: 'stable' }}
          >
            {grouped.flatList.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-stone-400">
                No matching options
              </div>
            )}

            {(() => {
              let flatIdx = 0;
              return grouped.groupOrder.map(groupName => {
                const items = grouped.groupMap.get(groupName)!;
                return (
                  <div key={groupName || '__ungrouped'}>
                    {/* Group header */}
                    {groupName && (
                      <div className="px-4 pt-3 pb-1.5 text-[11px] font-bold tracking-wider text-stone-400 uppercase select-none">
                        {groupName}
                      </div>
                    )}
                    {/* Items */}
                    {items.map(opt => {
                      const idx = flatIdx++;
                      const isSelected = opt.value === value;
                      const isHighlighted = idx === highlightIdx;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          data-option-index={idx}
                          onClick={() => handleSelect(opt.value)}
                          className={`
                            w-full text-left px-4 py-2.5 text-sm transition-colors
                            flex items-center gap-2
                            ${isSelected
                              ? 'bg-amber-50 text-amber-800 font-medium'
                              : isHighlighted
                                ? 'bg-stone-50 text-stone-800'
                                : 'text-stone-700 hover:bg-stone-50'
                            }
                          `}
                        >
                          {/* Left accent bar for selected */}
                          {isSelected && (
                            <span className="w-0.5 h-5 rounded-full bg-amber-500 -ml-1 mr-1 flex-shrink-0" />
                          )}
                          <span className="flex-1">{opt.label}</span>
                          {opt.desc && (
                            <span className="text-xs text-stone-400 ml-1">{opt.desc}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
