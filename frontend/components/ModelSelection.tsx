/**
 * Shared Model Selection components — used by both StudentProfilePage and SettingsPage.
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

export interface ModelConfig {
  use_own_key: boolean;
  api_keys: Record<string, string>;
  roles: {
    explainer: string;
    checker: string;
    adapter: string;
  };
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  use_own_key: false,
  api_keys: { openai: '', anthropic: '', google: '' },
  roles: { explainer: 'gpt-4o', checker: 'claude-haiku-4-5', adapter: 'gemini-2.5-flash' },
};

export const MODEL_OPTIONS = [
  { value: 'gpt-4o',           label: 'GPT-4o',           provider: 'openai',    cost: 0.52 },
  { value: 'gpt-4o-mini',      label: 'GPT-4o Mini',      provider: 'openai',    cost: 0.03 },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic', cost: 0.72 },
  { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5',  provider: 'anthropic', cost: 0.24 },
  { value: 'claude-opus-4-7',  label: 'Claude Opus 4.7',   provider: 'anthropic', cost: 1.20 },
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash',  provider: 'google',    cost: 0.11 },
  { value: 'gemini-3-flash',   label: 'Gemini 3 Flash',    provider: 'google',    cost: 0.14 },
];

export const AGENT_ROLES = [
  { key: 'explainer' as const, emoji: '🧠', label: 'Primary Explainer', desc: 'Main content generation & concept explanation', warn: 'Recommend dense architecture model' },
  { key: 'checker'   as const, emoji: '🔍', label: 'Fact Checker',      desc: 'Cross-validation, error correction, hallucination reduction', warn: null },
  { key: 'adapter'   as const, emoji: '📝', label: 'Style Adapter',     desc: 'Rewrites content to match learning preferences', warn: null },
];

// ─── ModelSelect ──────────────────────────────────────────────────────────────

export const ModelSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const selected = MODEL_OPTIONS.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between gap-1.5 bg-white border rounded-lg px-3 py-2 text-xs text-left outline-none transition-all cursor-pointer ${
          open ? 'border-amber-400 ring-2 ring-amber-200/60 shadow-sm' : 'border-stone-200 hover:border-stone-300'
        }`}
      >
        <span className="text-stone-700 truncate">{selected?.label || value}</span>
        <ChevronDown size={12} className={`text-stone-400 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg shadow-stone-900/8 overflow-hidden py-0.5 max-h-56 overflow-y-auto">
          {MODEL_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between ${
                value === opt.value ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{opt.label}</span>
              <span className="text-[10px] text-stone-300">${opt.cost.toFixed(2)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── ModelSelectionCard ────────────────────────────────────────────────────────

export const ModelSelectionCard: React.FC<{
  mc: ModelConfig;
  onChange: (field: string, value: string | boolean) => void;
  /** Hide the "Use school's default keys" option (professor is the school) */
  hideSchoolDefault?: boolean;
}> = ({ mc, onChange, hideSchoolDefault }) => {
  const totalCost = AGENT_ROLES.reduce((sum, r) => {
    const m = MODEL_OPTIONS.find(o => o.value === mc.roles[r.key]);
    return sum + (m?.cost || 0);
  }, 0);

  // For professor mode: always show API keys (no school/own toggle)
  const showKeys = hideSchoolDefault ? true : mc.use_own_key;

  return (
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings2 size={16} className="text-amber-500" />
          <p className="text-sm font-semibold text-stone-800">Model Selection</p>
        </div>
        <p className="text-xs text-stone-400 leading-relaxed">
          Configure your Agent Team — each role uses a different model optimized for its task.
        </p>
      </div>

      {/* Agent role cards */}
      <div className="space-y-3">
        {AGENT_ROLES.map(role => (
          <div key={role.key} className="bg-stone-50/80 border border-stone-100 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-base">{role.emoji}</span>
                  <span className="text-sm font-semibold text-stone-700">{role.label}</span>
                </div>
                <p className="text-xs text-stone-400 leading-relaxed">{role.desc}</p>
                {role.warn && (
                  <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                    <span>⚠</span> {role.warn}
                  </p>
                )}
              </div>
              <div className="w-44 flex-shrink-0">
                <ModelSelect value={mc.roles[role.key]} onChange={v => onChange(role.key, v)} />
                <div className="text-[10px] text-stone-300 mt-1 text-right">
                  ~${MODEL_OPTIONS.find(o => o.value === mc.roles[role.key])?.cost.toFixed(2) || '?'}/gen
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Cost estimate */}
      <div className="flex items-center justify-between bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">
        <span className="text-xs text-stone-500">💰 Estimated cost per generation</span>
        <span className="text-sm font-semibold text-amber-700">~${totalCost.toFixed(2)}</span>
      </div>

      {/* API Key section */}
      <div className="border-t border-stone-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider">API Keys</p>
        {!hideSchoolDefault && (
          <>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="radio" name="api-key-mode" checked={!mc.use_own_key}
                onChange={() => onChange('use_own_key', false)}
                className="accent-amber-500 w-3.5 h-3.5" />
              <span className="text-sm text-stone-600 group-hover:text-stone-800 transition">Use school's default keys</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input type="radio" name="api-key-mode" checked={mc.use_own_key}
                onChange={() => onChange('use_own_key', true)}
                className="accent-amber-500 w-3.5 h-3.5" />
              <span className="text-sm text-stone-600 group-hover:text-stone-800 transition">Use my own API keys</span>
            </label>
          </>
        )}
        {showKeys && (
          <div className="space-y-2 pl-6">
            {[
              { key: 'openai',    label: 'OpenAI',    placeholder: 'sk-...',     needed: Object.values(mc.roles).some(v => v.startsWith('gpt')) },
              { key: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...', needed: Object.values(mc.roles).some(v => v.startsWith('claude')) },
              { key: 'google',    label: 'Google AI', placeholder: 'AIza...',    needed: Object.values(mc.roles).some(v => v.startsWith('gemini')) },
            ].map(p => (
              <div key={p.key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">{p.label}</label>
                  {p.needed && <span className="text-[9px] text-amber-500 font-medium">required</span>}
                  {!p.needed && <span className="text-[9px] text-stone-300">not used</span>}
                </div>
                <input
                  type="password"
                  value={mc.api_keys[p.key] || ''}
                  onChange={e => onChange(`api_key_${p.key}`, e.target.value)}
                  placeholder={p.placeholder}
                  disabled={!p.needed}
                  className={`w-full text-sm border rounded-xl px-4 py-2 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition font-mono ${
                    p.needed ? 'bg-stone-50 border-stone-200 text-stone-800' : 'bg-stone-100 border-stone-100 text-stone-300 cursor-not-allowed'
                  }`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
