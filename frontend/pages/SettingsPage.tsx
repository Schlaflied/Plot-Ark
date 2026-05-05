/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SettingsPage — Professor-facing settings & configuration.
 * Tabs: AI Models · Prompt Templates · Preferences · Account
 * Mirrors StudentProfilePage layout (sidebar + content, amber theme).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Sparkles, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  ModelConfig,
  DEFAULT_MODEL_CONFIG,
  ModelSelectionCard,
} from '../components/ModelSelection';

// ─── Backend helpers ──────────────────────────────────────────────────────────

const API_KEYS = '/api/settings/keys';
const API_PROMPT = '/api/settings/prompt';

async function fetchBackendKeys(): Promise<Record<string, string | null>> {
  try { const r = await fetch(API_KEYS); if (!r.ok) return {}; return r.json(); }
  catch { return {}; }
}

async function postKeys(payload: Record<string, string>): Promise<void> {
  try {
    await fetch(API_KEYS, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) { console.warn('Settings: backend unreachable', e); }
}

async function fetchPrompt(): Promise<string> {
  try { const r = await fetch(API_PROMPT); if (!r.ok) return ''; const d = await r.json(); return d.prompt ?? ''; }
  catch { return ''; }
}

async function savePrompt(prompt: string): Promise<void> {
  try {
    await fetch(API_PROMPT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  } catch (e) { console.warn('Prompt save failed', e); }
}

// ─── Types ────────────────────────────────────────────────────────────────────

type SidebarSection = 'ai-models' | 'prompt' | 'preferences' | 'account';

// ─── AI Models Section ────────────────────────────────────────────────────────

const AiModelsSection: React.FC<{
  mc: ModelConfig;
  onMcChange: (next: ModelConfig) => void;
  saveStatus: 'idle' | 'saving' | 'saved';
}> = ({ mc, onMcChange, saveStatus }) => {
  // Tavily standalone card
  const [tavilyKey, setTavilyKey] = useState('');
  const [tavilyVisible, setTavilyVisible] = useState(false);
  const [tavilySaved, setTavilySaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('plotark_tavily_key') ?? '';
    setTavilyKey(stored);
  }, []);

  const saveTavily = () => {
    const v = tavilyKey.trim();
    if (v) localStorage.setItem('plotark_tavily_key', v);
    else localStorage.removeItem('plotark_tavily_key');
    postKeys({ tavily_key: v });
    setTavilySaved(true);
    setTimeout(() => setTavilySaved(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">AI Models</h2>
          <p className="text-sm text-stone-400">
            Configure default models and API keys for curriculum generation and A2A agents.
          </p>
        </div>
        <span className={`text-xs font-medium transition-all duration-300 ${
          saveStatus === 'saving' ? 'text-amber-500' :
          saveStatus === 'saved' ? 'text-green-500' : 'text-transparent'
        }`}>
          {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '·'}
        </span>
      </div>

      {/* Tavily card */}
      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl leading-none">🔍</span>
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Tavily</h3>
              <p className="text-xs text-stone-400 mt-0.5">Tavily Search API — used for research agent and source credibility scoring</p>
            </div>
          </div>
          {tavilyKey ? (
            <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" /> Connected
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs font-medium text-stone-400 bg-stone-100 border border-stone-200 rounded-full px-2.5 py-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-stone-300 inline-block" /> Not configured
            </span>
          )}
        </div>
        <div className="relative">
          <input
            type={tavilyVisible ? 'text' : 'password'}
            value={tavilyKey}
            onChange={e => setTavilyKey(e.target.value)}
            placeholder="Enter Tavily API key…"
            className="w-full pr-10 text-xs bg-stone-50 border border-stone-200 rounded-xl px-3 py-2.5 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 font-mono"
          />
          <button type="button" onClick={() => setTavilyVisible(v => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors">
            {tavilyVisible ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div className="flex justify-end">
          <button onClick={saveTavily}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors">
            {tavilySaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Shared ModelSelectionCard — professor mode: hideSchoolDefault */}
      <ModelSelectionCard mc={mc} hideSchoolDefault onChange={(field, val) => {
        const next = { ...mc };
        if (field === 'use_own_key') {
          next.use_own_key = val as boolean;
        } else if (field.startsWith('api_key_')) {
          const provider = field.replace('api_key_', '');
          next.api_keys = { ...next.api_keys, [provider]: val as string };
        } else {
          next.roles = { ...next.roles, [field]: val as string };
        }
        onMcChange(next);
      }} />
    </div>
  );
};

// ─── Prompt Templates Section ─────────────────────────────────────────────────

const PROMPT_EXAMPLES = [
  '"Focus on practical, real-world applications when generating module content."',
  '"Always include 2-3 discussion questions at the end of each module."',
  '"Use Socratic questioning style — guide students to discover answers rather than stating them."',
  '"Keep vocabulary at an undergraduate level, but don\'t oversimplify core concepts."',
];

const PromptSection: React.FC<{
  prompt: string;
  setPrompt: (v: string) => void;
  saveStatus: 'idle' | 'saving' | 'saved';
}> = ({ prompt, setPrompt, saveStatus }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">Prompt Templates</h2>
        <p className="text-sm text-stone-400">
          Custom instructions included in every AI generation across all courses.
        </p>
      </div>
      <span className={`text-xs font-medium transition-all duration-300 ${
        saveStatus === 'saving' ? 'text-amber-500' :
        saveStatus === 'saved' ? 'text-green-500' : 'text-transparent'
      }`}>
        {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : '·'}
      </span>
    </div>

    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6 space-y-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} className="text-amber-500" />
          <p className="text-sm font-semibold text-stone-800">Custom Instructions</p>
        </div>
        <p className="text-xs text-stone-400 leading-relaxed">
          Tell the AI what to keep in mind when generating curriculum, explanations, and suggestions.
          This message is included in every AI interaction.
        </p>
      </div>

      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="e.g. Focus on case-study-based learning. Always connect theory to practical scenarios. Use inclusive language."
        rows={8}
        className="w-full text-sm bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-stone-800 placeholder:text-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-400 transition resize-y leading-relaxed"
      />

      <div className="text-xs text-stone-400">
        <span className="font-medium text-stone-500">Ideas</span>
        <span className="text-stone-300 ml-1">— click to add</span>
        <div className="mt-2 flex flex-col gap-1.5">
          {PROMPT_EXAMPLES.map((ex, i) => {
            const clean = ex.replace(/^[\u201c"\u201d]+|[\u201c"\u201d]+$/g, '');
            return (
              <button key={i} type="button"
                onClick={() => setPrompt(prev => prev ? `${prev}\n${clean}` : clean)}
                className="flex items-center gap-2 text-left px-3 py-2 rounded-lg bg-stone-50 border border-stone-200 hover:border-amber-300 hover:bg-amber-50 transition-all group">
                <span className="text-amber-400 group-hover:text-amber-500 text-sm flex-shrink-0">+</span>
                <span className="italic text-stone-500 group-hover:text-amber-700 transition-colors">{ex}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

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
        <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">Preferences</h2>
        <p className="text-sm text-stone-400">Default values used when creating new courses.</p>
      </div>

      <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-5 space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Default Course Level</label>
          <select value={level} onChange={e => setLevel(e.target.value)} className={selectClass}>
            <option value="Beginner">Beginner</option>
            <option value="Intermediate">Intermediate</option>
            <option value="Advanced">Advanced</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Export Format</label>
          <select value={format} onChange={e => setFormat(e.target.value)} className={selectClass}>
            <option value="PDF">PDF</option>
            <option value="DOCX">DOCX</option>
            <option value="Excel">Excel</option>
          </select>
        </div>
        <div className="flex justify-end pt-1">
          <button onClick={handleSave}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors">
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
      <h2 className="text-xl font-serif font-semibold text-stone-900 mb-1">Account</h2>
      <p className="text-sm text-stone-400">Manage your Plot Ark account settings.</p>
    </div>
    <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-8 flex flex-col items-center justify-center gap-3 text-center">
      <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="1.5">
          <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </div>
      <p className="text-sm font-medium text-stone-500">Account management coming soon</p>
      <p className="text-xs text-stone-400 max-w-xs">
        Sign-in, profile settings, and team collaboration features will be available in a future release.
      </p>
    </div>
  </div>
);

// ─── Sidebar nav definitions ──────────────────────────────────────────────────

const NAV_ITEMS: { id: SidebarSection; label: string; icon: React.ReactNode }[] = [
  {
    id: 'ai-models', label: 'AI Models',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" /></svg>,
  },
  {
    id: 'prompt', label: 'Prompt Templates',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>,
  },
  {
    id: 'preferences', label: 'Preferences',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M12 1v2m0 18v2m-9-11h2m18 0h2m-2.64-6.36l-1.41 1.41m-12.73 12.73l-1.41 1.41m0-15.56l1.41 1.41m12.73 12.73l1.41 1.41" /></svg>,
  },
  {
    id: 'account', label: 'Account',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" /></svg>,
  },
];

// ─── Page Component ───────────────────────────────────────────────────────────

const SettingsPage: React.FC = () => {
  const { auth } = useAuth();
  const [activeSection, setActiveSection] = useState<SidebarSection>('ai-models');
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const isResizing = useRef(false);

  // ── Model config state (synced with backend via /api/settings/keys) ────────
  const [mc, setMc] = useState<ModelConfig>({ ...DEFAULT_MODEL_CONFIG, use_own_key: true });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const mcDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mcInit = useRef(true);

  // ── Prompt state (synced with backend via /api/settings/prompt) ────────────
  const [prompt, setPrompt] = useState('');
  const promptDebounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const promptInit = useRef(true);

  // ── Fetch initial data ────────────────────────────────────────────────────
  useEffect(() => {
    // Load keys from backend → populate mc
    fetchBackendKeys().then(data => {
      const next = { ...DEFAULT_MODEL_CONFIG, use_own_key: true };
      // Map backend keys to ModelConfig
      if (data.openai_key) next.api_keys.openai = '••••••••' + (data.openai_key as string).slice(-4);
      if (data.gemini_key) next.api_keys.google = '••••••••' + (data.gemini_key as string).slice(-4);
      if (data.claude_key) next.api_keys.anthropic = '••••••••' + (data.claude_key as string).slice(-4);
      if (data.openai_model) next.roles.explainer = data.openai_model as string;
      if (data.gemini_model) {
        next.roles.adapter = data.gemini_model as string;
      }
      if (data.claude_model) next.roles.checker = data.claude_model as string;
      setMc(next);
      mcInit.current = true;
    });
    // Load prompt
    fetchPrompt().then(p => { setPrompt(p); promptInit.current = true; });
  }, []);

  // ── Auto-save model config ────────────────────────────────────────────────
  const handleMcChange = useCallback((next: ModelConfig) => {
    setMc(next);
    if (mcInit.current) { mcInit.current = false; return; }
    clearTimeout(mcDebounce.current);
    mcDebounce.current = setTimeout(() => {
      setSaveStatus('saving');
      // Map ModelConfig → backend fields
      const payload: Record<string, string> = {};
      // Only send non-masked keys
      const isMasked = (v: string) => v.startsWith('••');
      if (!isMasked(next.api_keys.openai || '')) payload.openai_key = next.api_keys.openai;
      if (!isMasked(next.api_keys.anthropic || '')) payload.claude_key = next.api_keys.anthropic;
      if (!isMasked(next.api_keys.google || '')) payload.gemini_key = next.api_keys.google;
      // Always send model selections
      const openaiModel = Object.entries(next.roles).find(([, v]) => v.startsWith('gpt'))?.[1];
      const claudeModel = Object.entries(next.roles).find(([, v]) => v.startsWith('claude'))?.[1];
      const geminiModel = Object.entries(next.roles).find(([, v]) => v.startsWith('gemini'))?.[1];
      if (openaiModel) payload.openai_model = openaiModel;
      if (claudeModel) payload.claude_model = claudeModel;
      if (geminiModel) payload.gemini_model = geminiModel;
      postKeys(payload);
      setTimeout(() => setSaveStatus('saved'), 300);
      setTimeout(() => setSaveStatus('idle'), 1800);
    }, 800);
  }, []);

  // ── Auto-save prompt ──────────────────────────────────────────────────────
  useEffect(() => {
    if (promptInit.current) { promptInit.current = false; return; }
    clearTimeout(promptDebounce.current);
    promptDebounce.current = setTimeout(() => {
      setSaveStatus('saving');
      savePrompt(prompt);
      setTimeout(() => setSaveStatus('saved'), 300);
      setTimeout(() => setSaveStatus('idle'), 1800);
    }, 800);
    return () => clearTimeout(promptDebounce.current);
  }, [prompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar resize ────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">
      {/* Top Bar */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link to="/courses"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium">
          <ChevronLeft size={16} /> Dashboard
        </Link>
        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">Settings</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside style={{ width: sidebarWidth }}
          className="bg-stone-900 flex flex-col shrink-0 overflow-y-auto relative">

          {/* User info */}
          <div className="p-4 border-b border-stone-700">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-stone-700 flex items-center justify-center text-amber-400 text-sm font-semibold">
                {auth?.email?.charAt(0).toUpperCase() || 'P'}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{auth?.email?.split('@')[0] || 'Professor'}</p>
                <p className="text-[10px] text-stone-500 truncate">{auth?.email || ''}</p>
              </div>
            </div>
          </div>

          <div className="p-3 border-b border-stone-700">
            <p className="text-[10px] uppercase tracking-wider text-stone-500">Settings</p>
          </div>

          <nav className="flex-1 p-2 space-y-0.5">
            {NAV_ITEMS.map(item => (
              <button key={item.id} onClick={() => setActiveSection(item.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-base transition-all flex items-center gap-2 ${
                  activeSection === item.id
                    ? 'bg-stone-700 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                }`}>
                <span className={activeSection === item.id ? 'text-amber-400' : 'text-stone-500'}>
                  {item.icon}
                </span>
                <span className="leading-snug">{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Drag handle */}
          <div onMouseDown={startResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-amber-500/30 active:bg-amber-500/50 transition-colors z-10" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            {activeSection === 'ai-models' && (
              <AiModelsSection mc={mc} onMcChange={handleMcChange} saveStatus={saveStatus} />
            )}
            {activeSection === 'prompt' && (
              <PromptSection prompt={prompt} setPrompt={setPrompt} saveStatus={saveStatus} />
            )}
            {activeSection === 'preferences' && <PreferencesSection />}
            {activeSection === 'account' && <AccountSection />}
          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
