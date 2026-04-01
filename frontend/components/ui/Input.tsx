/**
 * Reusable Input component.
 */
import React from 'react';

export interface InputProps {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  id: string;
  required?: boolean;
  type?: string;
  min?: number;
  max?: number;
}

export const Input: React.FC<InputProps> = ({ label, icon, value, onChange, placeholder, id, required, type = 'text', min, max }) => (
  <div>
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-1.5">
      {icon} {label} {required && <span className="text-amber-500 text-xs">*</span>}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      min={min}
      max={max}
      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
    />
  </div>
);
