/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Globe, Moon, Settings, BookOpen } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';

// ─── Extracted modules ────────────────────────────────────────────────────────

import type { Module, CourseDetail, Source } from '../utils/courseExport';
import CurriculumApplyModal from '../components/analytics/CurriculumApplyModal';
import CurriculumDrawer from '../components/analytics/CurriculumDrawer';
import StudentChangesDrawer from '../components/analytics/StudentChangesDrawer';
import {
  formatCitation,
  exportPDF,
  downloadMarkdown,
  downloadDOCX,
  copyMarkdownToClipboard,
} from '../utils/courseExport';
import ModuleSidebar from '../components/ModuleSidebar';
import ModuleCard from '../components/ModuleCard';


// ─── Draggable Floating Action Button ─────────────────────────────────────────

interface DraggableFabProps {
  variant: 'professor' | 'student';
  badge: number;
  onFabClick: () => void;
  onDismiss: () => void;
}

const DraggableFab: React.FC<DraggableFabProps> = ({ variant, badge, onFabClick, onDismiss }) => {
  const isProfessor = variant === 'professor';
  const fabRef = React.useRef<HTMLDivElement>(null);
  const dragState = React.useRef({ dragging: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0, moved: false });
  const [pos, setPos] = React.useState({ x: 0, y: 0 });   // offset from default bottom-right
  const [isDragging, setIsDragging] = React.useState(false);

  const onMouseDown = (e: React.MouseEvent) => {
    // Ignore if target is the close button
    if ((e.target as HTMLElement).closest('[data-fab-close]')) return;
    e.preventDefault();
    const ds = dragState.current;
    ds.dragging = true;
    ds.moved = false;
    ds.startX = e.clientX;
    ds.startY = e.clientY;
    ds.offsetX = pos.x;
    ds.offsetY = pos.y;

    const onMove = (ev: MouseEvent) => {
      if (!ds.dragging) return;
      const dx = ev.clientX - ds.startX;
      const dy = ev.clientY - ds.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        ds.moved = true;
        setIsDragging(true);
      }
      if (ds.moved) {
        setPos({ x: ds.offsetX + dx, y: ds.offsetY + dy });
      }
    };
    const onUp = () => {
      ds.dragging = false;
      setIsDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // Only fire click if we didn't drag
      if (!ds.moved) {
        onFabClick();
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      ref={fabRef}
      className="fixed z-[60] group"
      style={{
        bottom: `${24 - pos.y}px`,
        right: `${24 - pos.x}px`,
        animation: pos.x === 0 && pos.y === 0 ? 'fabSlideIn 0.35s cubic-bezier(.4,0,.2,1)' : undefined,
        cursor: isDragging ? 'grabbing' : 'grab',
        userSelect: 'none',
      }}
    >
      {/* Close FAB button */}
      <button
        data-fab-close
        onClick={onDismiss}
        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-600/80 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-stone-800 shadow-md z-10"
        title="Permanently dismiss"
      >
        ✕
      </button>
      {/* FAB body */}
      <div
        onMouseDown={onMouseDown}
        className={`w-12 h-12 rounded-full text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center text-lg relative ${
          isProfessor
            ? 'bg-gradient-to-br from-amber-400 to-amber-600'
            : 'bg-gradient-to-br from-blue-400 to-blue-600'
        }`}
        title={isProfessor ? 'AI Curriculum Suggestions' : 'Module Updates'}
      >
        {isProfessor ? '🤖' : '✨'}
        <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
          {badge}
        </span>
      </div>
      {/* Inline keyframes */}
      <style>{`
        @keyframes fabSlideIn {
          from { opacity: 0; transform: translateY(20px) scale(0.8); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
};

// ─── CoursePage ───────────────────────────────────────────────────────────────

const CoursePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isStudent = searchParams.get('view') === 'student';
  const [curriculum, setCurriculum] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'objectives' | 'resources' | 'assessment' | 'ai-suggestion'>('objectives');
  const [search, setSearch] = useState('');
  const [citationFormat, setCitationFormat] = useState<'apa' | 'mla' | 'chicago'>('apa');
  const [copiedCitation, setCopiedCitation] = useState<number | null>(null);
  const [copyMdDone, setCopyMdDone] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [exportOpen, setExportOpen] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editedModules, setEditedModules] = useState<Record<number, Partial<Module>>>({});
  const [showEditHint, setShowEditHint] = useState(true);
  const [moduleFeedback, setModuleFeedback] = useState<Record<string, string>>({});
  const [currSuggestions, setCurrSuggestions] = useState<any[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [applyingSuggestion, setApplyingSuggestion] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moduleChanges, setModuleChanges] = useState<any[]>([]);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [studentDrawerOpen, setStudentDrawerOpen] = useState(false);
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [profFabDismissed, setProfFabDismissed] = useState(false);
  const [studentFabDismissed, setStudentFabDismissed] = useState(false);
  const isResizing = React.useRef(false);
  const navigate = useNavigate();

  // ── Resize ──────────────────────────────────────────────────────────────────

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(360, Math.max(160, startWidth + e.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-export-dropdown]')) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`/api/history/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CourseDetail) => { setCurriculum(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [id]);

  useEffect(() => {
    if (!showEditHint) return;
    const timer = setTimeout(() => setShowEditHint(false), 4000);
    return () => clearTimeout(timer);
  }, [showEditHint]);

  // Fetch curriculum suggestions from cached analysis (professor only)
  useEffect(() => {
    if (isStudent || !id) return;
    setSuggestionsLoading(true);
    fetch(`/api/curriculum/suggestions/${id}`)
      .then(r => r.ok ? r.json() : { suggestions: [] })
      .then(data => setCurrSuggestions(data.suggestions || []))
      .catch(() => setCurrSuggestions([]))
      .finally(() => setSuggestionsLoading(false));
  }, [id, isStudent]);

  // Fetch recent module changes (for student view)
  useEffect(() => {
    if (!isStudent || !id) return;
    fetch(`/api/curriculum/changes/${id}`)
      .then(r => r.ok ? r.json() : { changes: [] })
      .then(data => setModuleChanges(data.changes || []))
      .catch(() => setModuleChanges([]));
  }, [id, isStudent]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const modules = curriculum?.modules ?? [];
  const mergedModules = modules.map((m, i) =>
    editedModules[i] ? { ...m, ...editedModules[i] } : m,
  );
  const filteredModules = search.trim()
    ? mergedModules.filter(m => m.title.toLowerCase().includes(search.toLowerCase()))
    : mergedModules;
  const currentModule = mergedModules[currentModuleIndex] ?? null;

  const navigateModule = (dir: -1 | 1) => {
    const next = currentModuleIndex + dir;
    if (next >= 0 && next < modules.length) {
      setCurrentModuleIndex(next);
      setActiveTab('objectives');
    }
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleEditField = (field: string, value: any) => {
    setEditedModules(prev => ({
      ...prev,
      [currentModuleIndex]: { ...prev[currentModuleIndex], [field]: value },
    }));
    setAutoSaveStatus('saving');
    setTimeout(() => setAutoSaveStatus('saved'), 1000);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !curriculum) return;
    const oldIndex = mergedModules.findIndex((_, i) => `module-${i}` === active.id);
    const newIndex = mergedModules.findIndex((_, i) => `module-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newModules = arrayMove([...mergedModules], oldIndex, newIndex);
    setCurriculum({ ...curriculum, modules: newModules });
    setEditedModules({});
    setCurrentModuleIndex(newIndex);
  };

  const handleDeleteModule = (idx: number) => {
    if (!curriculum || mergedModules.length <= 1 || isStudent) return;
    const newModules = mergedModules.filter((_, i) => i !== idx);
    setCurriculum({ ...curriculum, modules: newModules });
    setEditedModules({});
    setCurrentModuleIndex(Math.min(idx, newModules.length - 1));
  };

  const handleAddModule = () => {
    if (!curriculum || isStudent) return;
    const newModule: Module = {
      title: 'New Module',
      complexity_level: 1,
      learning_objectives: [''],
      narrative_preview: '',
      recommended_readings: [],
      assignments: [],
    };
    const newModules = [...modules, newModule];
    setCurriculum({ ...curriculum, modules: newModules });
    setCurrentModuleIndex(newModules.length - 1);
    setActiveTab('objectives');
  };

  const copyCitation = async (src: Source, i: number) => {
    await navigator.clipboard.writeText(formatCitation(src, citationFormat));
    setCopiedCitation(i);
    setTimeout(() => setCopiedCitation(null), 2000);
  };

  // ── Loading / Error ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F4] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-400 text-sm">Loading course…</p>
        </div>
      </div>
    );
  }

  if (error || !curriculum) {
    return (
      <div className="min-h-screen bg-[#F9F8F4] flex flex-col items-center justify-center">
        <p className="text-stone-400 text-sm mb-4">{error ? `Error: ${error}` : 'Course not found.'}</p>
        <Link to="/courses" className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 transition-colors">
          <ChevronLeft size={16} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const sources = curriculum.sources ?? [];
  const courseTitle = [curriculum.topic, curriculum.course_code].filter(Boolean).join(' — ');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* Student Banner */}
      {isStudent && (
        <div className="w-full bg-green-50 border-b border-green-200 flex items-center justify-between px-6 py-2.5 text-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="font-semibold text-green-900 tracking-wide">Student View</span>
            <span className="text-xs text-green-600 font-normal">— read only</span>
          </div>
          <button
            onClick={() => navigate(`/course/${id}`)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-green-300 bg-white hover:bg-green-100 transition-colors text-green-800 font-medium text-xs"
          >
            Back to Professor View
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
      )}

      {/* Professor Banner + AI Notification Bar */}
      {!isStudent && (
        <>
          <div className="w-full bg-orange-50 border-b border-orange-200 flex items-center justify-between px-6 py-2 text-sm shrink-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
              <span className="font-semibold text-orange-900 tracking-wide">Professor View</span>
            </div>
            <button
              onClick={() => navigate(`/course/${id}?view=student`)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-orange-300 bg-white hover:bg-orange-100 transition-colors text-orange-800 font-medium text-xs"
            >
              Student Preview
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>

          {/* AI Suggestions Notification Bar */}
          {currSuggestions.length > 0 && !notifDismissed && (
            <div className="w-full bg-amber-50 border-b border-amber-200 flex items-center justify-between px-6 py-2.5 text-sm shrink-0 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex items-center gap-2.5">
                <span className="text-base">🤖</span>
                <span className="text-amber-900 font-medium">
                  {currSuggestions.filter(s => s.status !== 'applied').length} curriculum suggestion{currSuggestions.filter(s => s.status !== 'applied').length !== 1 ? 's' : ''} available
                </span>
                <span className="text-xs text-amber-600">based on student performance data</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNotifDismissed(true)}
                  className="text-amber-400 hover:text-amber-600 transition-colors text-xs px-2 py-1"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs transition-colors shadow-sm"
                >
                  Review
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Student — Module Update Banner */}
      {isStudent && moduleChanges.length > 0 && changesExpanded && (
        <div className="w-full bg-blue-50 border-b border-blue-200 flex items-center justify-between px-6 py-2.5 text-sm shrink-0 animate-[fadeIn_0.3s_ease-out]">
          <div className="flex items-center gap-2.5">
            <span className="text-base">✨</span>
            <span className="text-blue-900 font-medium">
              {moduleChanges.length} module{moduleChanges.length !== 1 ? 's' : ''} updated
            </span>
            <span className="text-xs text-blue-500">based on instructor optimization</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChangesExpanded(false)}
              className="text-blue-400 hover:text-blue-600 transition-colors text-xs px-2 py-1"
            >
              Dismiss
            </button>
            <button
              onClick={() => setStudentDrawerOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white font-medium text-xs transition-colors shadow-sm"
            >
              Review
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Top Bar */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link
          to={`/courses${isStudent ? '?view=student' : ''}`}
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
        >
          <ChevronLeft size={16} /> Dashboard
        </Link>
        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">{courseTitle}</span>
        </div>
        <div className="flex items-center gap-1">
          {[Globe, Moon, Settings].map((Icon, i) => (
            <button key={i} className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors">
              <Icon size={16} />
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Left Sidebar */}
        <ModuleSidebar
          courseId={id}
          curriculum={curriculum}
          modules={modules}
          mergedModules={mergedModules}
          filteredModules={filteredModules}
          currentModuleIndex={currentModuleIndex}
          search={search}
          isStudent={isStudent}
          sidebarWidth={sidebarWidth}
          onSelectModule={(idx) => { setCurrentModuleIndex(idx); setActiveTab('objectives'); }}
          onDeleteModule={handleDeleteModule}
          onAddModule={handleAddModule}
          onSearchChange={setSearch}
          onDragEnd={handleDragEnd}
          onStartResize={startResize}
        />

        {/* Main Content */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-[#F9F8F4] p-8 lg:p-12">
          {currentModule ? (
            <>
              {/* Navigation */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => navigateModule(-1)}
                  disabled={currentModuleIndex === 0}
                  className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-lg text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="font-serif text-stone-600">
                  Module <span className="text-stone-900 font-bold">{currentModuleIndex + 1}</span>
                  <span className="text-stone-400"> of {modules.length}</span>
                </span>
                <button
                  onClick={() => navigateModule(1)}
                  disabled={currentModuleIndex === modules.length - 1}
                  className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-lg text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>

              {/* Module Card */}
              <ModuleCard
                module={currentModule}
                moduleIndex={currentModuleIndex}
                activeTab={activeTab}
                isStudent={isStudent}
                autoSaveStatus={autoSaveStatus}
                showEditHint={showEditHint}
                onTabChange={setActiveTab}
                onEditField={handleEditField}
                onDismissHint={() => setShowEditHint(false)}
              />

              {/* Student Feedback / Professor Export Bar */}
              {isStudent ? (
                <div className="mt-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4">How are you feeling about this module?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'got-it', emoji: '🟢', label: 'Got it — I could explain this', base: 'bg-white border-stone-200 text-stone-700 hover:bg-green-50', active: 'bg-green-50 border-green-500 text-green-800 ring-1 ring-green-400 shadow-sm' },
                      { key: 'mostly', emoji: '🟡', label: 'Mostly got it, but unclear on parts', base: 'bg-white border-stone-200 text-stone-700 hover:bg-amber-50', active: 'bg-amber-50 border-amber-500 text-amber-800 ring-1 ring-amber-400 shadow-sm' },
                      { key: 'off', emoji: '🔴', label: "Something's off, not sure what", base: 'bg-white border-stone-200 text-stone-700 hover:bg-red-50', active: 'bg-red-50 border-red-500 text-red-800 ring-1 ring-red-400 shadow-sm' },
                      { key: 'not-read', emoji: '⚫', label: "Didn't really read it", base: 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50', active: 'bg-stone-100 border-stone-500 text-stone-700 ring-1 ring-stone-400 shadow-sm' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setModuleFeedback(prev => ({ ...prev, [currentModuleIndex]: opt.key }))}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer ${
                          moduleFeedback[currentModuleIndex] === opt.key ? opt.active : opt.base
                        }`}
                      >
                        <span className="text-base shrink-0">{opt.emoji}</span>
                        <span className="text-left leading-snug">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  {(moduleFeedback[currentModuleIndex] === 'mostly' || moduleFeedback[currentModuleIndex] === 'off') && (
                    <textarea
                      className="w-full mt-4 px-4 py-3 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 bg-stone-50/50 focus:bg-white focus:border-amber-300 outline-none resize-none transition-all"
                      rows={2}
                      placeholder="Anything on your mind? (optional)"
                      value={(moduleFeedback[`${currentModuleIndex}-comment`] as string) || ''}
                      onChange={e => setModuleFeedback(prev => ({ ...prev, [`${currentModuleIndex}-comment`]: e.target.value }))}
                    />
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={async () => {
                        const sentiment = moduleFeedback[currentModuleIndex];
                        if (!sentiment) return;
                        const comment = moduleFeedback[`${currentModuleIndex}-comment`] || '';
                        try {
                          await fetch('/api/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ course_id: Number(id), module_index: currentModuleIndex, module_title: currentModule.title, sentiment, comment, student_id: 'anonymous' }),
                          });
                          setModuleFeedback(prev => ({ ...prev, [`${currentModuleIndex}-submitted`]: 'true' }));
                        } catch (err) { console.error('Feedback submit error:', err); }
                      }}
                      disabled={!moduleFeedback[currentModuleIndex] || moduleFeedback[`${currentModuleIndex}-submitted`] === 'true'}
                      className={`px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-all ${
                        moduleFeedback[`${currentModuleIndex}-submitted`] === 'true'
                          ? 'bg-green-600 text-white cursor-default'
                          : moduleFeedback[currentModuleIndex] ? 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer' : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      }`}
                    >
                      {moduleFeedback[`${currentModuleIndex}-submitted`] === 'true' ? '✓ Submitted' : 'Submit'}
                    </button>
                    <button
                      onClick={() => navigateModule(1)}
                      disabled={currentModuleIndex === modules.length - 1}
                      className="text-sm text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-30"
                    >Skip</button>
                  </div>
                </div>
              ) : (
                <div className="mt-8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Export your curriculum</p>
                  <div className="flex items-center gap-3">
                    <button onClick={() => alert('IMSCC export requires backend — coming soon')} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-sm font-semibold transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                      IMSCC
                    </button>
                    <button
                      onClick={async () => { await copyMarkdownToClipboard(curriculum); setCopyMdDone(true); setTimeout(() => setCopyMdDone(false), 2000); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-colors"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
                      {copyMdDone ? 'Copied!' : 'Copy'}
                    </button>
                    <div className="relative" data-export-dropdown>
                      <button onClick={() => setExportOpen(v => !v)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-colors">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                        Export
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                      {exportOpen && (
                        <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-10">
                          <button onClick={() => { exportPDF(curriculum, citationFormat); setExportOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                            Export PDF
                          </button>
                          <button onClick={() => { downloadDOCX(curriculum); setExportOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            Export DOCX
                          </button>
                          <button onClick={() => { downloadMarkdown(curriculum); setExportOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            Export Markdown
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400">
              <BookOpen size={48} className="mb-4 opacity-20" />
              <p className="font-serif text-xl">No modules found.</p>
            </div>
          )}
        </main>

        {/* Right Panel — Sources */}
        <aside className="w-64 shrink-0 bg-white border-l border-stone-200 overflow-y-auto flex flex-col">
          <div className="px-5 py-5 border-b border-stone-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Course Info</p>
            <dl className="space-y-2">
              <div><dt className="text-xs text-stone-400 uppercase tracking-wide font-bold">Level</dt><dd className="text-sm text-stone-700 capitalize">{curriculum.level}</dd></div>
              <div><dt className="text-xs text-stone-400 uppercase tracking-wide font-bold">Type</dt><dd className="text-sm text-stone-700 capitalize">{curriculum.course_type}</dd></div>
              <div><dt className="text-xs text-stone-400 uppercase tracking-wide font-bold">Modules</dt><dd className="text-sm text-stone-700">{modules.length}</dd></div>
            </dl>
          </div>


          <div className="px-5 py-5 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
              Sources <span className="text-stone-300 font-normal">({sources.length})</span>
            </p>
            {sources.length > 0 && (
              <div className="flex items-center gap-1 mb-4">
                <div className="group relative mr-1">
                  <div className="w-4 h-4 rounded-full bg-stone-200 text-stone-500 text-[10px] font-bold flex items-center justify-center cursor-help hover:bg-amber-100 hover:text-amber-600 transition-colors">?</div>
                  <div className="absolute left-6 top-0 w-52 bg-stone-800 text-stone-200 text-[10px] leading-relaxed rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                    Select a format to copy formatted references for your syllabus or course materials.
                  </div>
                </div>
                {(['apa', 'mla', 'chicago'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setCitationFormat(fmt)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      citationFormat === fmt
                        ? 'bg-amber-100 text-amber-700 border border-amber-300'
                        : 'bg-stone-100 text-stone-400 border border-stone-200 hover:text-stone-600'
                    }`}
                  >{fmt}</button>
                ))}
              </div>
            )}
            {sources.length > 0 ? (
              <div className="space-y-3">
                {sources.map((src, i) => (
                  <div key={i} className="group">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-100 text-stone-400">
                        {src.type === 'video' ? '🎬' : src.type === 'news' ? '📰' : '📄'} {src.type || 'web'}
                      </span>
                    </div>
                    <a href={src.url} target="_blank" rel="noopener noreferrer" className="block text-xs font-semibold text-stone-700 hover:text-amber-600 transition-colors leading-snug mb-1">
                      {src.title || src.domain}
                    </a>
                    <span className="block text-[10px] text-stone-400 truncate mb-1">{src.domain}</span>
                    <button onClick={() => copyCitation(src, i)} className="text-[10px] text-stone-400 hover:text-amber-600 transition-colors">
                      {copiedCitation === i ? '✓ Copied' : 'Copy citation'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400 italic">No sources attached to this course.</p>
            )}
          </div>
        </aside>
      </div>

      {/* Curriculum Apply Modal */}
      {applyingSuggestion && (
        <CurriculumApplyModal
          suggestion={applyingSuggestion}
          onClose={() => setApplyingSuggestion(null)}
          onApply={async (suggestion) => {
            const res = await fetch('/api/curriculum/suggestions/apply', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                course_id: suggestion.course_id,
                module_id: suggestion.module_id,
              }),
            });
            if (!res.ok) throw new Error('Failed to apply suggestion');
            // Refresh suggestions list
            const refreshRes = await fetch(`/api/curriculum/suggestions/${id}`);
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              setCurrSuggestions(data.suggestions || []);
            }
            // Refresh curriculum data so module content updates in the UI
            const currRes = await fetch(`/api/history/${id}`);
            if (currRes.ok) {
              const currData = await currRes.json();
              setCurriculum(currData);
              setEditedModules({});
            }
          }}
        />
      )}

      {/* Curriculum Suggestions Drawer */}
      <CurriculumDrawer
        open={drawerOpen}
        suggestions={currSuggestions}
        loading={suggestionsLoading}
        courseId={id}
        onClose={() => setDrawerOpen(false)}
        onApply={(s) => {
          setDrawerOpen(false);
          setApplyingSuggestion({ ...s, course_id: id });
        }}
        onRedo={async (s) => {
          try {
            const res = await fetch('/api/curriculum/suggestions/redo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ course_id: id, module_id: s.module_id }),
            });
            if (!res.ok) throw new Error('Failed to redo');
            // Refresh suggestions
            const refreshRes = await fetch(`/api/curriculum/suggestions/${id}`);
            if (refreshRes.ok) {
              const data = await refreshRes.json();
              setCurrSuggestions(data.suggestions || []);
            }
            // Refresh curriculum data to revert module content in UI
            const currRes = await fetch(`/api/history/${id}`);
            if (currRes.ok) {
              const currData = await currRes.json();
              setCurriculum(currData);
              setEditedModules({});
            }
          } catch (e) {
            console.error('Redo failed:', e);
          }
        }}
        onNavigateAnalytics={() => {
          setDrawerOpen(false);
          navigate(`/student-data?course=${id}`);
        }}
      />

      {/* ── Professor FAB (floating action button, draggable) ── */}
      {!isStudent && notifDismissed && !profFabDismissed && currSuggestions.filter(s => s.status !== 'applied').length > 0 && (
        <DraggableFab
          variant="professor"
          badge={currSuggestions.filter(s => s.status !== 'applied').length}
          onFabClick={() => setDrawerOpen(true)}
          onDismiss={() => setProfFabDismissed(true)}
        />
      )}

      {/* ── Student FAB (floating action button, draggable) ── */}
      {isStudent && !changesExpanded && !studentFabDismissed && moduleChanges.length > 0 && (
        <DraggableFab
          variant="student"
          badge={moduleChanges.length}
          onFabClick={() => setStudentDrawerOpen(true)}
          onDismiss={() => setStudentFabDismissed(true)}
        />
      )}

      {/* Student Changes Drawer */}
      <StudentChangesDrawer
        open={studentDrawerOpen}
        changes={moduleChanges}
        onClose={() => setStudentDrawerOpen(false)}
        onNavigateToModule={(moduleId) => {
          // Find module index by module_id pattern (module_1 -> index 0)
          const match = moduleId.match(/module_(\d+)/);
          if (match && curriculum?.modules) {
            const idx = parseInt(match[1], 10) - 1;
            if (idx >= 0 && idx < curriculum.modules.length) {
              setCurrentModuleIndex(idx);
            }
          }
          setStudentDrawerOpen(false);
        }}
      />
    </div>
  );
};

export default CoursePage;
