/**
 * Shared Model Selection components — used by both StudentProfilePage and SettingsPage.
 * v2: Multi-model presets + custom model support (Plan 3A.3)
 */

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Settings2, Plus, X, Star } from 'lucide-react';

// ─── Data ─────────────────────────────────────────────────────────────────────

export interface CustomModel {
  id: string;
  name: string;
  model_id: string;
  base_url: string;
  api_key: string;
  cost: number;
}

export interface ModelConfig {
  use_own_key: boolean;
  api_keys: Record<string, string>;
  custom_models?: CustomModel[];
  roles: {
    explainer: string;
    checker: string;
    adapter: string;
  };
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  use_own_key: false,
  api_keys: { openai: '', anthropic: '', google: '' },
  custom_models: [],
  roles: { explainer: 'gpt-4o', checker: 'claude-haiku-4-5', adapter: 'gemini-2.5-flash' },
};

export interface ModelOption {
  value: string;
  label: string;
  provider: string;
  cost: number;
  arch?: 'dense' | 'moe';
  recommended?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  // ── OpenAI ──
  { value: 'gpt-4o',            label: 'GPT-4o',            provider: 'openai',    cost: 0.52, arch: 'dense', recommended: true },
  { value: 'gpt-4o-mini',       label: 'GPT-4o Mini',       provider: 'openai',    cost: 0.03, arch: 'dense' },
  // ── Anthropic ──
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6',  provider: 'anthropic', cost: 0.72, arch: 'dense', recommended: true },
  { value: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',   provider: 'anthropic', cost: 0.24, arch: 'dense' },
  { value: 'claude-opus-4-7',   label: 'Claude Opus 4.7',    provider: 'anthropic', cost: 1.20, arch: 'dense' },
  // ── Google ──
  { value: 'gemini-2.5-flash',  label: 'Gemini 2.5 Flash',   provider: 'google',    cost: 0.11, arch: 'dense', recommended: true },
  { value: 'gemini-3-flash',    label: 'Gemini 3 Flash',     provider: 'google',    cost: 0.14, arch: 'dense' },
  // ── DeepSeek ──
  { value: 'deepseek-v3',       label: 'DeepSeek V3',        provider: 'deepseek',  cost: 0.07, arch: 'moe' },
  { value: 'deepseek-r1',       label: 'DeepSeek R1',        provider: 'deepseek',  cost: 0.14, arch: 'moe' },
  // ── Mistral ──
  { value: 'mistral-large',     label: 'Mistral Large',      provider: 'mistral',   cost: 0.50, arch: 'moe' },
  { value: 'mistral-small',     label: 'Mistral Small',      provider: 'mistral',   cost: 0.10, arch: 'moe' },
  // ── xAI ──
  { value: 'grok-3',            label: 'Grok 3',             provider: 'xai',       cost: 0.60, arch: 'moe' },
  { value: 'grok-3-mini',       label: 'Grok 3 Mini',        provider: 'xai',       cost: 0.15, arch: 'moe' },
  // ── Groq ──
  { value: 'llama-3.3-70b',     label: 'Llama 3.3 70B (Groq)', provider: 'groq',   cost: 0.06, arch: 'moe' },
  // ── MiniMax ──
  { value: 'minimax-01',        label: 'MiniMax-01',         provider: 'minimax',   cost: 0.08, arch: 'moe' },
  // ── GLM (Zhipu) ──
  { value: 'glm-4-flash',       label: 'GLM-4 Flash',        provider: 'glm',       cost: 0.05, arch: 'dense' },
  { value: 'glm-4-plus',        label: 'GLM-4 Plus',         provider: 'glm',       cost: 0.20, arch: 'dense' },
];

const PROVIDER_META: Record<string, { label: string; placeholder: string }> = {
  openai:    { label: 'OpenAI',    placeholder: 'sk-...' },
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google:    { label: 'Google AI', placeholder: 'AIza...' },
  deepseek:  { label: 'DeepSeek',  placeholder: 'sk-...' },
  mistral:   { label: 'Mistral',   placeholder: 'sk-...' },
  xai:       { label: 'xAI',       placeholder: 'xai-...' },
  groq:      { label: 'Groq',      placeholder: 'gsk_...' },
  minimax:   { label: 'MiniMax',   placeholder: 'eyJh...' },
  glm:       { label: 'GLM (Zhipu)', placeholder: 'sk-...' },
};

const PROVIDER_ORDER = ['openai', 'anthropic', 'google', 'deepseek', 'glm', 'mistral', 'xai', 'groq', 'minimax'];

export const AGENT_ROLES = [
  { key: 'explainer' as const, emoji: '🧠', label: 'Primary Explainer', desc: 'Main content generation & concept explanation', warnMoE: true },
  { key: 'checker'   as const, emoji: '🔍', label: 'Fact Checker',      desc: 'Cross-validation, error correction, hallucination reduction', warnMoE: false },
  { key: 'adapter'   as const, emoji: '📝', label: 'Style Adapter',     desc: 'Rewrites content to match learning preferences', warnMoE: false },
];

// ─── ModelSelect ──────────────────────────────────────────────────────────────

export const ModelSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  customModels?: CustomModel[];
  onAddCustom?: () => void;
  /** Show MoE warning for this role */
  warnMoE?: boolean;
}> = ({ value, onChange, customModels = [], onAddCustom, warnMoE }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const allOptions = [
    ...MODEL_OPTIONS,
    ...customModels.map(cm => ({ value: cm.id, label: cm.name, provider: 'custom', cost: cm.cost, arch: undefined as any, recommended: false })),
  ];
  const selected = allOptions.find(o => o.value === value);

  // Group by provider
  const groups = PROVIDER_ORDER.filter(p => MODEL_OPTIONS.some(o => o.provider === p));

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
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg shadow-stone-900/8 overflow-hidden py-0.5 max-h-72 overflow-y-auto animate-selectOpen">
          {groups.map(provider => {
            const opts = MODEL_OPTIONS.filter(o => o.provider === provider);
            return (
              <div key={provider}>
                <div className="px-3 py-1 text-[9px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50/80 sticky top-0">
                  {PROVIDER_META[provider]?.label || provider}
                </div>
                {opts.map(opt => {
                  const isMoE = opt.arch === 'moe';
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { onChange(opt.value); setOpen(false); }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between gap-1 ${
                        value === opt.value ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700 hover:bg-stone-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{opt.label}</span>
                        {opt.recommended && (
                          <span className="flex items-center gap-0.5 text-[8px] bg-green-100 text-green-700 px-1 py-0.5 rounded font-semibold whitespace-nowrap">
                            <Star size={7} fill="currentColor" /> REC
                          </span>
                        )}
                        {isMoE && warnMoE && (
                          <span className="text-[8px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-semibold whitespace-nowrap">MoE ⚠</span>
                        )}
                      </span>
                      <span className="text-[10px] text-stone-300 flex-shrink-0">${opt.cost.toFixed(2)}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {/* Custom models section */}
          {customModels.length > 0 && (
            <div>
              <div className="px-3 py-1 text-[9px] font-bold text-stone-400 uppercase tracking-wider bg-stone-50/80 sticky top-0">
                Custom Models
              </div>
              {customModels.map(cm => (
                <button
                  key={cm.id}
                  type="button"
                  onClick={() => { onChange(cm.id); setOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                    value === cm.id ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span>{cm.name}</span>
                    <span className="text-[8px] bg-purple-100 text-purple-600 px-1 py-0.5 rounded font-semibold">CUSTOM</span>
                  </span>
                  <span className="text-[10px] text-stone-300">{cm.cost > 0 ? `$${cm.cost.toFixed(2)}` : '—'}</span>
                </button>
              ))}
            </div>
          )}
          {/* Add custom model button */}
          {onAddCustom && (
            <button
              type="button"
              onClick={() => { onAddCustom(); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-xs text-amber-600 hover:bg-amber-50 transition-colors flex items-center gap-1.5 border-t border-stone-100"
            >
              <Plus size={11} /> Add custom model...
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// ─── CustomModelForm (inline modal) ───────────────────────────────────────────

const CustomModelForm: React.FC<{
  onSave: (cm: CustomModel) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [name, setName] = useState('');
  const [modelId, setModelId] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [cost, setCost] = useState('');

  const handleSave = () => {
    if (!name.trim() || !modelId.trim() || !baseUrl.trim()) return;
    onSave({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      model_id: modelId.trim(),
      base_url: baseUrl.trim(),
      api_key: apiKey.trim(),
      cost: parseFloat(cost) || 0,
    });
  };

  const inputCls = 'w-full text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition';

  return (
    <div className="bg-white border-2 border-amber-300 rounded-2xl shadow-lg p-5 space-y-4 animate-selectOpen">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-stone-800 flex items-center gap-1.5">
          <Plus size={14} className="text-amber-500" /> Add Custom Model
        </p>
        <button type="button" onClick={onCancel} className="text-stone-400 hover:text-stone-600 transition">
          <X size={16} />
        </button>
      </div>
      <p className="text-xs text-stone-400">Supports any OpenAI-compatible API endpoint (DeepSeek, Ollama, vLLM, etc.)</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-stone-500 uppercase">Display Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="My Local Llama" className={inputCls} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-stone-500 uppercase">Model ID *</label>
          <input value={modelId} onChange={e => setModelId(e.target.value)} placeholder="llama-3-70b-chat" className={inputCls + ' font-mono'} />
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-[10px] font-semibold text-stone-500 uppercase">Base URL *</label>
        <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" className={inputCls + ' font-mono'} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-stone-500 uppercase">API Key</label>
          <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Optional for local" className={inputCls + ' font-mono'} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-semibold text-stone-500 uppercase">Cost / gen (optional)</label>
          <input value={cost} onChange={e => setCost(e.target.value)} placeholder="0.00" className={inputCls} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-500 hover:bg-stone-100 transition">Cancel</button>
        <button type="button" onClick={handleSave}
          disabled={!name.trim() || !modelId.trim() || !baseUrl.trim()}
          className="px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-40 disabled:cursor-not-allowed">
          Add Model
        </button>
      </div>
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
  const [showCustomForm, setShowCustomForm] = useState(false);
  const customModels = mc.custom_models || [];

  const allModels = [
    ...MODEL_OPTIONS,
    ...customModels.map(cm => ({ value: cm.id, label: cm.name, provider: 'custom' as string, cost: cm.cost })),
  ];

  const totalCost = AGENT_ROLES.reduce((sum, r) => {
    const m = allModels.find(o => o.value === mc.roles[r.key]);
    return sum + (m?.cost || 0);
  }, 0);

  // Detect which providers are needed based on selected models
  const usedProviders = new Set(
    Object.values(mc.roles)
      .map(v => {
        const preset = MODEL_OPTIONS.find(o => o.value === v);
        return preset?.provider;
      })
      .filter(Boolean) as string[]
  );

  const showKeys = hideSchoolDefault ? true : mc.use_own_key;

  const handleAddCustom = (cm: CustomModel) => {
    onChange('add_custom_model', JSON.stringify(cm));
    setShowCustomForm(false);
  };

  const handleRemoveCustom = (id: string) => {
    onChange('remove_custom_model', id);
  };

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
        {AGENT_ROLES.map(role => {
          const selectedModel = MODEL_OPTIONS.find(o => o.value === mc.roles[role.key]);
          const isMoE = selectedModel?.arch === 'moe';
          return (
            <div key={role.key} className="bg-stone-50/80 border border-stone-100 rounded-xl p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-base">{role.emoji}</span>
                    <span className="text-sm font-semibold text-stone-700">{role.label}</span>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">{role.desc}</p>
                  {role.warnMoE && isMoE && (
                    <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                      <span>⚠</span> MoE model — may produce inconsistent structured output
                    </p>
                  )}
                  {role.warnMoE && !isMoE && selectedModel && (
                    <p className="text-[10px] text-green-600 mt-1 flex items-center gap-1">
                      <span>✓</span> Dense architecture — recommended for this role
                    </p>
                  )}
                </div>
                <div className="w-48 flex-shrink-0">
                  <ModelSelect
                    value={mc.roles[role.key]}
                    onChange={v => onChange(role.key, v)}
                    customModels={customModels}
                    onAddCustom={() => setShowCustomForm(true)}
                    warnMoE={role.warnMoE}
                  />
                  <div className="text-[10px] text-stone-300 mt-1 text-right">
                    ~${allModels.find(o => o.value === mc.roles[role.key])?.cost.toFixed(2) || '?'}/gen
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Custom model form */}
      {showCustomForm && (
        <CustomModelForm onSave={handleAddCustom} onCancel={() => setShowCustomForm(false)} />
      )}

      {/* Custom models list */}
      {customModels.length > 0 && !showCustomForm && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Your Custom Models</p>
          {customModels.map(cm => (
            <div key={cm.id} className="flex items-center justify-between bg-stone-50/80 border border-stone-100 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-[8px] bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-semibold">CUSTOM</span>
                <span className="text-xs font-medium text-stone-700">{cm.name}</span>
                <span className="text-[10px] text-stone-300 font-mono">{cm.model_id}</span>
              </div>
              <button type="button" onClick={() => handleRemoveCustom(cm.id)}
                className="text-stone-300 hover:text-red-400 transition"><X size={13} /></button>
            </div>
          ))}
        </div>
      )}

      {/* Cost estimate */}
      <div className="flex items-center justify-between bg-amber-50/60 border border-amber-100 rounded-xl px-4 py-3">
        <span className="text-xs text-stone-500">💰 Estimated cost per generation</span>
        <span className="text-sm font-semibold text-amber-700">~${totalCost.toFixed(2)}</span>
      </div>

      {/* API Key section — dynamic based on selected providers */}
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
            {PROVIDER_ORDER
              .filter(provider => PROVIDER_META[provider])
              .map(provider => {
                const meta = PROVIDER_META[provider];
                const needed = usedProviders.has(provider);
                return (
                  <div key={provider} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-medium text-stone-400 uppercase tracking-wider">{meta.label}</label>
                      {needed && <span className="text-[9px] text-amber-500 font-medium">required</span>}
                      {!needed && <span className="text-[9px] text-stone-300">not used</span>}
                    </div>
                    <input
                      type="password"
                      value={mc.api_keys[provider] || ''}
                      onChange={e => onChange(`api_key_${provider}`, e.target.value)}
                      placeholder={meta.placeholder}
                      disabled={!needed}
                      className={`w-full text-sm border rounded-xl px-4 py-2 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition font-mono ${
                        needed ? 'bg-stone-50 border-stone-200 text-stone-800' : 'bg-stone-100 border-stone-100 text-stone-300 cursor-not-allowed'
                      }`}
                    />
                  </div>
                );
              })
            }
          </div>
        )}
      </div>
    </div>
  );
};
