/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { Select } from '../components/ui/Select';
import type { SelectOption } from '../components/ui/Select';

// ─── Backend API helpers ──────────────────────────────────────────────────────

const API_BASE = '/api/settings/keys';

async function postKeysToBackend(payload: Record<string, string>): Promise<void> {
  try {
    await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('Settings: could not reach backend', e);
  }
}

async function fetchBackendKeys(): Promise<Record<string, string | null>> {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarSection = 'ai-models' | 'preferences' | 'account';

// ─── Model option lists ───────────────────────────────────────────────────────

const GPT_MODELS: SelectOption[] = [
  { value: 'gpt-4o',       label: 'gpt-4o',       desc: 'default' },
  { value: 'gpt-4o-mini',  label: 'gpt-4o-mini' },
  { value: 'gpt-4.1',      label: 'gpt-4.1' },
  { value: 'gpt-5',        label: 'gpt-5' },
  { value: 'other-custom', label: 'Custom' },
];

const GEMINI_MODELS: SelectOption[] = [
  { value: 'gemini-2.5-flash', label: 'gemini-2.5-flash', desc: 'default' },
  { value: 'gemini-2.5-pro',   label: 'gemini-2.5-pro' },
  { value: 'gemini-3.1-pro',   label: 'gemini-3.1-pro' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash' },
  { value: 'other-custom',     label: 'Custom' },
];

const CLAUDE_MODELS: SelectOption[] = [
  { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6', desc: 'default' },
  { value: 'claude-opus-4-6',   label: 'claude-opus-4-6' },
  { value: 'claude-haiku-4-5',  label: 'claude-haiku-4-5' },
  { value: 'claude-sonnet-4-5', label: 'claude-sonnet-4-5' },
  { value: 'other-custom',      label: 'Custom' },
];

// ─── Model Selector ───────────────────────────────────────────────────────────

interface ModelSelectorProps {
  options: SelectOption[];
  storageKey: string;
  defaultValue: string;
  label: string;
  icon: React.ReactNode;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ options, storageKey, defaultValue, label, icon }) => {
  const [selected, setSelected] = useState(() => localStorage.getItem(storageKey) ?? defaultValue);
  const [customValue, setCustomValue] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      // If it's not one of the known options, treat it as custom
      const known = options.find(o => o.value === stored);
      if (known) {
        setSelected(stored);
      } else {
        setSelected('other-custom');
        setCustomValue(stored);
      }
    }
  }, [storageKey]);

  const handleChange = (v: string) => {
    setSelected(v);
    if (v !== 'other-custom') {
      localStorage.setItem(storageKey, v);
    }
  };

  const handleCustomChange = (v: string) => {
    setCustomValue(v);
    if (v.trim()) {
      localStorage.setItem(storageKey, v.trim());
    }
  };

  return (
    <div className="pt-1">
      <Select
        id={`model-select-${storageKey}`}
        label={label}
        icon={icon}
        value={selected}
        onChange={handleChange}
        options={options}
        allowCustom
        onCustomChange={handleCustomChange}
        customValue={customValue}
        placeholder="Select model…"
      />
    </div>
  );
};

// ─── API Key Card ─────────────────────────────────────────────────────────────

interface ApiKeyCardProps {
  provider: string;
  icon: string;
  description: string;
  storageKey: string;
  modelOptions?: SelectOption[];
  modelStorageKey?: string;
  modelDefault?: string;
  /** Field name sent to POST /api/settings/keys (e.g. "tavily_key") */
  backendKeyField?: string;
  /** True when backend has a key but localStorage doesn't */
  serverKeyConfigured?: boolean;
}

const ApiKeyCard: React.FC<ApiKeyCardProps> = ({
  provider, icon, description, storageKey,
  modelOptions, modelStorageKey, modelDefault,
  backendKeyField, serverKeyConfigured,
}) => {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey) ?? '';
    setValue(stored);
  }, [storageKey]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (trimmed) {
      localStorage.setItem(storageKey, trimmed);
    } else {
      localStorage.removeItem(storageKey);
    }
    if (backendKeyField) {
      postKeysToBackend({ [backendKeyField]: trimmed });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const connected = !!localStorage.getItem(storageKey);

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl leading-none">{icon}</span>
          <div>
            <h3 className="text-sm font-semibold text-stone-900">{provider}</h3>
            <p className="text-xs text-stone-400 mt-0.5">{description}</p>
          </div>
        </div>
        {/* Status badge */}
        {connected ? (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
            Connected
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-stone-400 bg-stone-100 border border-stone-200 rounded-full px-2.5 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" />
            Not configured
          </span>
        )}
      </div>

      {/* Server-only key notice */}
      {serverKeyConfigured && !connected && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          Key configured on server — enter it here to save locally too
        </p>
      )}

      {/* Key input */}
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Enter API key…"
          className="w-full pr-10 text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors"
          title={visible ? 'Hide' : 'Show'}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>

      {/* Model selector (only for providers that support it) */}
      {modelOptions && modelStorageKey && modelDefault && (
        <ModelSelector
          options={modelOptions}
          storageKey={modelStorageKey}
          defaultValue={modelDefault}
          label="Model"
          icon={<span className="text-stone-400 text-sm">⚙</span>}
        />
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
        >
          {saved ? '✓ Saved' : 'Save'}
        </button>
      </div>
    </div>
  );
};

// ─── Provider tab definitions ─────────────────────────────────────────────────

type AiProvider = 'gpt' | 'gemini' | 'claude';

const PROVIDER_CONFIG: Record<
  AiProvider,
  {
    label: string;
    icon: string;
    description: string;
    storageKey: string;
    modelOptions: SelectOption[];
    modelStorageKey: string;
    modelDefault: string;
  }
> = {
  gpt: {
    label: 'GPT',
    icon: '🤖',
    description: 'OpenAI GPT-4o — used for curriculum generation and A2A agents',
    storageKey: 'plotark_openai_key',
    modelOptions: GPT_MODELS,
    modelStorageKey: 'plotark_openai_model',
    modelDefault: 'gpt-4o',
  },
  gemini: {
    label: 'Gemini',
    icon: '✨',
    description: 'Google Gemini — alternative model for generation and analysis',
    storageKey: 'plotark_gemini_key',
    modelOptions: GEMINI_MODELS,
    modelStorageKey: 'plotark_gemini_model',
    modelDefault: 'gemini-2.5-flash',
  },
  claude: {
    label: 'Claude',
    icon: '🟠',
    description: 'Anthropic Claude — used for content synthesis and evaluation tasks',
    storageKey: 'plotark_claude_key',
    modelOptions: CLAUDE_MODELS,
    modelStorageKey: 'plotark_claude_model',
    modelDefault: 'claude-sonnet-4-6',
  },
};

// ─── Unified AI Models Card ───────────────────────────────────────────────────

// Map frontend provider tab → backend field name
const PROVIDER_BACKEND_KEY: Record<AiProvider, string> = {
  gpt:    'openai_key',
  gemini: 'gemini_key',
  claude: 'claude_key',
};
const PROVIDER_BACKEND_MODEL: Record<AiProvider, string> = {
  gpt:    'openai_model',
  gemini: 'gemini_model',
  claude: 'claude_model',
};

const UnifiedAiModelsCard: React.FC = () => {
  const [activeProvider, setActiveProvider] = useState<AiProvider>('gpt');

  const cfg = PROVIDER_CONFIG[activeProvider];

  // Per-provider key state (keyed by provider so switching preserves values)
  const [keyValues, setKeyValues] = useState<Record<AiProvider, string>>(() => ({
    gpt:    localStorage.getItem('plotark_openai_key') ?? '',
    gemini: localStorage.getItem('plotark_gemini_key') ?? '',
    claude: localStorage.getItem('plotark_claude_key') ?? '',
  }));
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);

  // Track which providers have a key on the backend but not in localStorage
  const [serverOnly, setServerOnly] = useState<Record<AiProvider, boolean>>({
    gpt: false, gemini: false, claude: false,
  });

  useEffect(() => {
    fetchBackendKeys().then(backendData => {
      setServerOnly({
        gpt:    !!backendData['openai_key'] && !localStorage.getItem('plotark_openai_key'),
        gemini: !!backendData['gemini_key'] && !localStorage.getItem('plotark_gemini_key'),
        claude: !!backendData['claude_key'] && !localStorage.getItem('plotark_claude_key'),
      });
    });
  }, []);

  // Reset visibility when switching tabs
  const handleTabSwitch = (p: AiProvider) => {
    setActiveProvider(p);
    setVisible(false);
    setSaved(false);
  };

  const handleSave = () => {
    const v = keyValues[activeProvider].trim();
    if (v) {
      localStorage.setItem(cfg.storageKey, v);
    } else {
      localStorage.removeItem(cfg.storageKey);
    }
    // Also send key + model to backend
    const modelKey = cfg.modelStorageKey;
    const modelValue = localStorage.getItem(modelKey) ?? cfg.modelDefault;
    postKeysToBackend({
      [PROVIDER_BACKEND_KEY[activeProvider]]:    v,
      [PROVIDER_BACKEND_MODEL[activeProvider]]:  modelValue,
    });
    // Update serverOnly state: if we just saved a key locally, clear the notice
    if (v) {
      setServerOnly(prev => ({ ...prev, [activeProvider]: false }));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const connected = !!localStorage.getItem(cfg.storageKey);

  const providers: AiProvider[] = ['gpt', 'gemini', 'claude'];

  return (
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 space-y-4">
      {/* Card header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">AI Models</h3>
          <p className="text-xs text-stone-400 mt-0.5">Configure your language model provider</p>
        </div>
      </div>

      {/* Provider tabs */}
      <div className="flex gap-1 bg-stone-100 rounded-lg p-1">
        {providers.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => handleTabSwitch(p)}
            className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all ${
              activeProvider === p
                ? 'bg-amber-500 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800'
            }`}
          >
            {PROVIDER_CONFIG[p].label}
          </button>
        ))}
      </div>

      {/* Provider content */}
      <div className="space-y-3">
        {/* Provider identity row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl leading-none">{cfg.icon}</span>
            <p className="text-xs text-stone-400">{cfg.description}</p>
          </div>
          {connected ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5 shrink-0 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-stone-400 bg-stone-100 border border-stone-200 rounded-full px-2.5 py-0.5 shrink-0 ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" />
              Not configured
            </span>
          )}
        </div>

        {/* Server-only key notice */}
        {serverOnly[activeProvider] && !connected && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            Key configured on server — enter it here to save locally too
          </p>
        )}

        {/* API key input */}
        <div className="relative">
          <input
            key={activeProvider}
            type={visible ? 'text' : 'password'}
            value={keyValues[activeProvider]}
            onChange={e =>
              setKeyValues(prev => ({ ...prev, [activeProvider]: e.target.value }))
            }
            placeholder="Enter API key…"
            className="w-full pr-10 text-xs bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
          />
          <button
            type="button"
            onClick={() => setVisible(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors"
            title={visible ? 'Hide' : 'Show'}
          >
            {visible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>

        {/* Model selector */}
        <ModelSelector
          key={activeProvider}
          options={cfg.modelOptions}
          storageKey={cfg.modelStorageKey}
          defaultValue={cfg.modelDefault}
          label="Model"
          icon={<span className="text-stone-400 text-sm">⚙</span>}
        />

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── AI Models Section ────────────────────────────────────────────────────────

const AiModelsSection: React.FC = () => {
  const [tavilyServerOnly, setTavilyServerOnly] = useState(false);

  useEffect(() => {
    fetchBackendKeys().then(data => {
      setTavilyServerOnly(!!data['tavily_key'] && !localStorage.getItem('plotark_tavily_key'));
    });
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-serif font-semibold text-stone-900 mb-1">AI Models</h2>
        <p className="text-xs text-stone-400">
          API keys are stored locally in your browser and sent to the backend for server-side requests.
        </p>
      </div>

      {/* Card 1: Tavily standalone */}
      <ApiKeyCard
        provider="Tavily"
        icon="🔍"
        description="Tavily Search API — used for research agent and source credibility scoring"
        storageKey="plotark_tavily_key"
        backendKeyField="tavily_key"
        serverKeyConfigured={tavilyServerOnly}
      />

      {/* Card 2: Unified AI Models with provider tabs */}
      <UnifiedAiModelsCard />
    </div>
  );
};

// ─── Preferences Section ──────────────────────────────────────────────────────

const PreferencesSection: React.FC = () => {
  const [level, setLevel] = useState(() => localStorage.getItem('plotark_default_level') ?? 'Beginner');
  const [format, setFormat] = useState(() => localStorage.getItem('plotark_export_format') ?? 'PDF');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    localStorage.setItem('plotark_default_level', level);
    localStorage.setItem('plotark_export_format', format);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const selectClass =
    'w-full text-sm bg-stone-50 border border-stone-200 rounded-lg px-3 py-2.5 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 cursor-pointer';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-serif font-semibold text-stone-900 mb-1">Preferences</h2>
        <p className="text-xs text-stone-400">Default values used when creating new courses.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-5 space-y-5">
        {/* Default course level */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Default Course Level
          </label>
          <select value={level} onChange={e => setLevel(e.target.value)} className={selectClass}>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>

        {/* Export format */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
            Export Format
          </label>
          <select value={format} onChange={e => setFormat(e.target.value)} className={selectClass}>
            <option value="PDF">PDF</option>
            <option value="DOCX">DOCX</option>
            <option value="Excel">Excel</option>
          </select>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            {saved ? '✓ Saved' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Account Section ──────────────────────────────────────────────────────────

const AccountSection: React.FC = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-lg font-serif font-semibold text-stone-900 mb-1">Account</h2>
      <p className="text-xs text-stone-400">Manage your Plot Ark account settings.</p>
    </div>
    <div className="bg-white border border-stone-200 rounded-xl shadow-sm p-8 flex flex-col items-center justify-center gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </div>
      <p className="text-sm font-medium text-stone-500">Account management coming soon</p>
      <p className="text-xs text-stone-400 max-w-xs">
        Sign-in, profile settings, and team collaboration features will be available in a future release.
      </p>
    </div>
  </div>
);

// ─── Page Component ───────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const [activeSection, setActiveSection] = useState<SidebarSection>('ai-models');
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizing = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.min(320, Math.max(160, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const navItems: { id: SidebarSection; label: string; icon: React.ReactNode }[] = [
    {
      id: 'ai-models',
      label: 'AI Models',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
    },
    {
      id: 'preferences',
      label: 'Preferences',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      ),
    },
    {
      id: 'account',
      label: 'Account',
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* Top Bar */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link
          to="/courses"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
        >
          <ChevronLeft size={16} /> Dashboard
        </Link>
        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">Settings</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className="bg-stone-900 flex flex-col shrink-0 overflow-y-auto relative"
        >
          <div className="p-3 border-b border-stone-700">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Settings</p>
          </div>

          <nav className="flex-1 p-2 space-y-0.5">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-base transition-all flex items-center gap-2 ${
                  activeSection === item.id
                    ? 'bg-stone-700 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                }`}
              >
                <span className={activeSection === item.id ? 'text-amber-400' : 'text-stone-500'}>
                  {item.icon}
                </span>
                <span className="leading-snug">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Drag handle */}
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-amber-500/30 active:bg-amber-500/50 transition-colors z-10"
          />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {activeSection === 'ai-models' && <AiModelsSection />}
            {activeSection === 'preferences' && <PreferencesSection />}
            {activeSection === 'account' && <AccountSection />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
