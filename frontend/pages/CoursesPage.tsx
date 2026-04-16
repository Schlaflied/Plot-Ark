/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Globe, Moon, Sun, Settings, Network, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// ─── Extracted components ─────────────────────────────────────────────────────

import { CourseCard, SpecialCard, AddCourseCard } from '../components/dashboard/CourseCard';
import type { HistoryEntry } from '../components/dashboard/CourseCard';
import MiniCalendar from '../components/dashboard/MiniCalendar';
import ToolbarDropdown from '../components/ui/ToolbarDropdown';
import type { DropdownItem } from '../components/ui/ToolbarDropdown';

// ─── Types ────────────────────────────────────────────────────────────────────

type Language = 'EN' | 'CN' | 'FR';
type ModelProvider = 'GPT + API' | 'Gemini + API' | 'Claude + API';

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

const MiniBarChart: React.FC = () => {
  const bars = [40, 70, 55, 80, 60, 90, 45];
  return (
    <div className="flex items-end gap-1 h-14 mt-2">
      {bars.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-amber-400 opacity-80"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
};

// ─── Settings button ──────────────────────────────────────────────────────────

const SettingsButton: React.FC = () => (
  <Link
    to="/settings"
    title="Settings"
    className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors inline-flex items-center"
  >
    <Settings size={18} />
  </Link>
);



// ─── Side panel section ───────────────────────────────────────────────────────

const SideSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="pb-5 border-b border-stone-100 last:border-b-0">
    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">{title}</h3>
    {children}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const CoursesPage: React.FC = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [demoSeeding, setDemoSeeding] = useState(false);
  const [demoStep, setDemoStep] = useState('');
  const [demoDone, setDemoDone] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  // Auth role is the source of truth; professors can temporarily preview student view
  const [viewMode, setViewMode] = useState<'professor' | 'student'>(
    auth?.role === 'student' || searchParams.get('view') === 'student' ? 'student' : 'professor'
  );
  const isStudent = viewMode === 'student';
  // Students can never switch to professor view
  const canSwitchView = auth?.role === 'professor';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Toolbar state
  const [language, setLanguage] = useState<Language>('EN');
  const [modelProvider, setModelProvider] = useState<ModelProvider>('GPT + API');
  const [darkMode, setDarkMode] = useState(false);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistoryEntries(data.history || []);
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => { fetchHistory(); }, []);

  const loadDemoData = async () => {
    setDemoSeeding(true);
    setDemoStep('Starting…');
    try {
      const res = await fetch('/api/demo/seed', { method: 'POST' });
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            setDemoStep(payload.message || '');
            if (payload.status === 'done') {
              setDemoDone(true);
              await fetchHistory();
            }
          } catch { /* ignore parse errors */ }
        }
      }
    } catch {
      setDemoStep('Something went wrong. Please try again.');
    } finally {
      setDemoSeeding(false);
    }
  };

  const deleteHistory = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await fetch(`/api/history/${id}`, { method: 'DELETE' });
    setHistoryEntries(prev => prev.filter(h => h.id !== id));
  };

  const toggleFavorite = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const res = await fetch(`/api/history/${id}/favorite`, { method: 'POST' });
    const data = await res.json();
    setHistoryEntries(prev =>
      prev.map(h => (h.id === id ? { ...h, is_favorite: data.is_favorite } : h))
    );
  };

  const languageItems: DropdownItem[] = [
    { label: 'English (EN)', value: 'EN' },
    { label: '中文 (CN)', value: 'CN' },
    { label: 'Français (FR)', value: 'FR' },
  ];

  const modelItems: DropdownItem[] = [
    { label: 'GPT + API', value: 'GPT + API' },
    { label: 'Gemini + API', value: 'Gemini + API' },
    { label: 'Claude + API', value: 'Claude + API' },
  ];

  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? 'bg-stone-900' : 'bg-[#F9F8F4]'}`}>

      {/* ── View Banner ─────────────────────────────────────────────────── */}
      <div className={`w-full border-b flex items-center justify-between px-6 py-3 text-sm ${
        isStudent
          ? 'bg-green-50 border-green-200'
          : 'bg-amber-50 border-amber-200'
      }`}>
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full inline-block ${isStudent ? 'bg-green-500' : 'bg-amber-500'}`} />
          <span className={`font-semibold tracking-wide ${isStudent ? 'text-green-900' : 'text-amber-900'}`}>
            {isStudent ? 'Student View' : 'Professor View'}
          </span>
          {isStudent && <span className="text-xs text-green-600 font-normal">— read only</span>}
        </div>
        <div className="flex items-center gap-3">
          {auth?.email && (
            <span className={`text-xs font-normal ${isStudent ? 'text-green-600' : 'text-amber-700'}`}>
              {auth.email}
            </span>
          )}
          {canSwitchView && (
            <button
              onClick={() => {
                const next = isStudent ? 'professor' : 'student';
                setViewMode(next);
                setSearchParams(next === 'student' ? { view: 'student' } : {});
              }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg border bg-white transition-colors font-medium text-xs ${
                isStudent
                  ? 'border-green-300 hover:bg-green-100 text-green-800'
                  : 'border-amber-300 hover:bg-amber-100 text-amber-800'
              }`}
            >
              {isStudent ? 'Back to Professor View' : 'Switch to Student View'}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          )}
        </div>
      </div>
      {/* ── Body (Main + Side) ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

      {/* ── Main Panel ──────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col px-8 py-8 overflow-y-auto">

        {/* Heading row with toolbar icons right-aligned */}
        <div className="flex items-center justify-between mb-6">
          <h1
            className={`text-4xl font-bold font-serif ${darkMode ? 'text-stone-100' : 'text-stone-900'}`}
          >
            Dashboard
          </h1>

          {/* Icon toolbar — 4 icons */}
          <div className="flex items-center gap-1">
            <ToolbarDropdown
              icon={<Globe size={18} />}
              items={languageItems}
              selected={language}
              onSelect={v => setLanguage(v as Language)}
              title="Language"
            />
            <button
              onClick={() => setDarkMode(p => !p)}
              title={darkMode ? 'Light mode' : 'Dark mode'}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {!isStudent && <SettingsButton />}
            <button
              onClick={handleLogout}
              title="Sign out"
              className="p-1.5 rounded-lg text-stone-500 hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Onboarding banner — shown when DB is empty (or ?preview_banner=1 for QA) */}
        {!historyLoading && (historyEntries.length === 0 || searchParams.get('preview_banner') === '1') && !demoDone && !isStudent && (
          <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 relative">
            <button
              onClick={() => setDemoDone(true)}
              className="absolute top-3 right-3 text-amber-400 hover:text-amber-700 transition-colors"
              aria-label="Dismiss"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
            <div className="flex-1 pr-4">
              <p className="font-semibold text-amber-900 mb-1">No courses yet</p>
              <p className="text-sm text-amber-700 leading-relaxed">
                Load sample data to see the full system — courses, student behaviour, curriculum agent suggestions, and analytics — all pre-populated and ready to explore.
              </p>
              {demoSeeding && (
                <p className="mt-2 text-xs text-amber-600 animate-pulse">{demoStep}</p>
              )}
            </div>
            {!demoSeeding && (
              <button
                onClick={loadDemoData}
                className="shrink-0 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-medium text-sm transition-colors shadow-sm"
              >
                Load Demo Data
              </button>
            )}
          </div>
        )}

        {/* Search input */}
        <input
          type="text"
          placeholder="Search courses…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full max-w-sm bg-white border border-stone-200 rounded-xl px-4 py-2 text-sm text-stone-700 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-amber-300 transition mb-6"
        />

        {/* Course grid */}
        {historyLoading ? (
          <div className="flex items-center justify-center py-24 text-stone-400 text-sm">
            Loading…
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {historyEntries
              .filter(entry =>
                entry.topic.toLowerCase().includes(search.toLowerCase())
              )
              .map(entry => (
                <CourseCard
                  key={entry.id}
                  entry={entry}
                  onDelete={deleteHistory}
                  onToggleFavorite={toggleFavorite}
                  viewMode={viewMode}
                />
              ))}
            {search && historyEntries.filter(entry =>
              entry.topic.toLowerCase().includes(search.toLowerCase())
            ).length === 0 && (
              <p className="col-span-full text-sm text-stone-400 italic">No courses found.</p>
            )}
            {!isStudent && <AddCourseCard />}
            <SpecialCard
              title="Knowledge Graph"
              description="Visualise concept relationships across all your courses"
              icon={<Network size={18} />}
              to="/graph"
            />
            {!isStudent && (
              <SpecialCard
                title="Student Data"
                description="Analytics, progress tracking, and assessment insights"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <path d="M3 9h18M9 21V9"/>
                  </svg>
                }
                to="/student-data"
              />
            )}
          </div>
        )}
      </main>

      {/* ── Side Panel ──────────────────────────────────────────────────────── */}
      <aside className="w-64 shrink-0 border-l border-stone-200 bg-white flex flex-col gap-0 px-5 py-6 overflow-y-auto">

        {!isStudent && (
          <SideSection title="Student Data Overview">
            <MiniBarChart />
            <p className="text-xs text-stone-400 italic mt-2">
              Course data will appear after generation
            </p>
          </SideSection>
        )}

        <div className={isStudent ? '' : 'pt-5'}>
          <SideSection title="Assignments Due">
            <div className="space-y-2">
              {['Module 3 Quiz — Apr 2', 'Essay Draft — Apr 8', 'Final Project — Apr 20'].map(item => (
                <div key={item} className="flex items-center gap-2 text-xs text-stone-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  {item}
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-400 italic mt-2">
              Course assignments will appear here
            </p>
          </SideSection>
        </div>

        <div className="pt-5">
          <SideSection title="Calendar">
            <MiniCalendar />
          </SideSection>
        </div>

      </aside>
      </div>
    </div>
  );
};

export default CoursesPage;
