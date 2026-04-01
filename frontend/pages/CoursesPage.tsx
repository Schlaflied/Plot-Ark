/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  X, Star, Globe, Cpu, Moon, Sun, Settings, Plus, Network,
  ChevronLeft, ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  created_at: string;
  topic: string;
  level: string;
  course_code: string;
  course_type: string;
  module_count: number;
  is_favorite: boolean;
}

type Language = 'EN' | 'CN' | 'FR';
type ModelProvider = 'GPT + API' | 'Gemini + API' | 'Claude + API';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

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

// ─── Toolbar dropdown ─────────────────────────────────────────────────────────

interface DropdownItem { label: string; value: string }

interface ToolbarDropdownProps {
  icon: React.ReactNode;
  items: DropdownItem[];
  selected: string;
  onSelect: (v: string) => void;
  title: string;
  alignRight?: boolean;
}

const ToolbarDropdown: React.FC<ToolbarDropdownProps> = ({
  icon, items, selected, onSelect, title, alignRight,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        title={title}
        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
      >
        {icon}
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 min-w-[150px] py-1 ${
            alignRight ? 'right-0' : 'left-1/2 -translate-x-1/2'
          }`}
        >
          {items.map(item => (
            <button
              key={item.value}
              onClick={() => { onSelect(item.value); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                selected === item.value
                  ? 'bg-amber-50 text-amber-800 font-semibold'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Settings dropdown ────────────────────────────────────────────────────────

const SettingsDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        title="Settings"
        className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
      >
        <Settings size={18} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 bg-white border border-stone-200 rounded-lg shadow-lg z-50 w-52 py-1">
          <div className="px-4 py-2 text-xs font-semibold text-stone-400 uppercase tracking-wider">
            Preferences
          </div>
          {['Long-term memory', 'Default course level', 'Export format'].map(label => (
            <button
              key={label}
              className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
            >
              {label}
            </button>
          ))}
          <div className="border-t border-stone-100 my-1" />
          <button className="w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
            Account
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Course card ──────────────────────────────────────────────────────────────

interface CourseCardProps {
  entry: HistoryEntry;
  onDelete: (e: React.MouseEvent, id: number) => void;
  onToggleFavorite: (e: React.MouseEvent, id: number) => void;
}

const CourseCard: React.FC<CourseCardProps & { viewMode?: 'professor' | 'student' }> = ({ entry, onDelete, onToggleFavorite, viewMode = 'professor' }) => {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate(`/course/${entry.id}${viewMode === 'student' ? '?view=student' : ''}`)}
      className="relative bg-white border border-stone-200 rounded-xl shadow-sm group hover:shadow-md transition-all cursor-pointer"
    >
      {/* Amber top border */}
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: '#C5A028' }} />

      {/* Delete button */}
      <button
        onClick={e => onDelete(e, entry.id)}
        className="absolute top-3 right-3 z-10 p-0.5 text-stone-300 hover:text-stone-700 opacity-0 group-hover:opacity-100 transition-all"
        title="Delete"
      >
        <X size={13} />
      </button>

      {/* Favorite button */}
      <button
        onClick={e => onToggleFavorite(e, entry.id)}
        className={`absolute top-3 right-7 z-10 p-0.5 transition-all opacity-0 group-hover:opacity-100 ${
          entry.is_favorite ? 'text-amber-500 !opacity-100' : 'text-stone-300 hover:text-amber-500'
        }`}
        title={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <Star size={12} fill={entry.is_favorite ? 'currentColor' : 'none'} />
      </button>

      <div className="p-4">
        <h3 className="font-semibold text-stone-900 text-sm leading-snug line-clamp-2 mb-1">
          {entry.topic}
        </h3>
        <p className="text-xs text-stone-400 mb-0.5">
          {entry.level}{entry.course_type ? ` · ${entry.course_type}` : ''}{entry.module_count ? ` · ${entry.module_count} modules` : ''}
        </p>
        <p className="text-xs text-stone-400 mb-3">
          {formatDate(entry.created_at)}
        </p>
        <div className="flex justify-end">
          <span className="text-xs font-semibold text-amber-700 group-hover:underline">
            Open →
          </span>
        </div>
      </div>
    </div>
  );
};

// ─── Special feature card ─────────────────────────────────────────────────────

interface SpecialCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  to: string;
  isExternal?: boolean;
}

const SpecialCard: React.FC<SpecialCardProps> = ({ title, description, icon, to, isExternal }) => {
  const inner = (
    <>
      <div className="h-1 rounded-t-xl" style={{ backgroundColor: '#C5A028' }} />
      <div className="p-4 flex items-start gap-3">
        <div className="mt-0.5" style={{ color: '#C5A028' }}>{icon}</div>
        <div>
          <h3 className="font-semibold text-sm leading-snug mb-1 group-hover:underline" style={{ color: '#C5A028' }}>
            {title}
          </h3>
          <p className="text-xs text-stone-500 leading-relaxed">{description}</p>
        </div>
      </div>
    </>
  );

  const cardClass = 'relative bg-white border border-stone-200 rounded-xl shadow-sm hover:shadow-md transition-shadow group block';

  if (isExternal) {
    return (
      <a href={to} className={cardClass}>
        {inner}
      </a>
    );
  }
  return (
    <Link to={to} className={cardClass}>
      {inner}
    </Link>
  );
};

// ─── New Course card ──────────────────────────────────────────────────────────

const AddCourseCard: React.FC = () => (
  <Link
    to="/generate"
    className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-stone-200 rounded-xl hover:border-amber-400 hover:bg-amber-50/30 transition-all group min-h-[120px]"
  >
    <Plus size={22} className="text-stone-300 group-hover:text-amber-500 transition-colors mb-1" />
    <span className="text-xs text-stone-400 group-hover:text-amber-700 transition-colors font-medium">
      New Course
    </span>
  </Link>
);

// ─── Mini Calendar ────────────────────────────────────────────────────────────

const MiniCalendar: React.FC = () => {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed

  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // First weekday of the month (0=Sun)
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  // Total days in month
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const isToday = (day: number) =>
    day === today.getDate() &&
    viewMonth === today.getMonth() &&
    viewYear === today.getFullYear();

  const cells: (number | null)[] = [
    ...Array(firstDayOfMonth).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={prevMonth}
          className="p-0.5 text-stone-400 hover:text-stone-700 transition-colors rounded"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-stone-600">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          className="p-0.5 text-stone-400 hover:text-stone-700 transition-colors rounded"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 text-center mb-0.5">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] text-stone-400 font-medium">{d}</span>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {cells.map((day, i) => (
          <span
            key={i}
            className={`text-[11px] py-0.5 rounded-full leading-5 ${
              day === null
                ? ''
                : isToday(day)
                  ? 'bg-amber-400 text-white font-bold'
                  : 'text-stone-500 hover:bg-stone-100 cursor-pointer'
            }`}
          >
            {day ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── Side panel section ───────────────────────────────────────────────────────

const SideSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="pb-5 border-b border-stone-100 last:border-b-0">
    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">{title}</h3>
    {children}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const CoursesPage: React.FC = () => {
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'professor' | 'student'>('professor');

  const isStudent = viewMode === 'student';

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
        <button
          onClick={() => setViewMode(isStudent ? 'professor' : 'student')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg border bg-white transition-colors font-medium text-xs ${
            isStudent
              ? 'border-green-300 hover:bg-green-100 text-green-800'
              : 'border-amber-300 hover:bg-amber-100 text-amber-800'
          }`}
        >
          {isStudent ? 'Back to Professor View' : 'Switch to Student View'}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
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
            <ToolbarDropdown
              icon={<Cpu size={18} />}
              items={modelItems}
              selected={modelProvider}
              onSelect={v => setModelProvider(v as ModelProvider)}
              title="Model provider"
            />
            <button
              onClick={() => setDarkMode(p => !p)}
              title={darkMode ? 'Light mode' : 'Dark mode'}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <SettingsDropdown />
          </div>
        </div>

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
