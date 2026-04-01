/**
 * Reusable Select dropdown component.
 */
import React from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; desc?: string }[];
  id: string;
}

export const Select: React.FC<SelectProps> = ({ label, icon, value, onChange, options, id }) => (
  <div>
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-1.5">
      {icon} {label}
    </label>
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition cursor-pointer pr-10"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}{o.desc ? ` — ${o.desc}` : ''}
          </option>
        ))}
      </select>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
    </div>
  </div>
);
