/**
 * CurriculumDrawer — Slide-out drawer for three-layer AI curriculum suggestions.
 *
 * Layer 1 — objective_update:  AI applies directly (Apply / Redo)
 * Layer 2 — reference_suggestion: Tavily search, professor selects
 * Layer 3 — assignment_alert: read-only reminder, professor acts manually
 */

import React, { useState, useRef, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5000';

export interface Suggestion {
  module_id: string;
  module_name: string;
  recommendation: string;
  reasons?: string[];
  source?: string;
  status?: string;           // 'pending' | 'applied'
  change_type?: string;      // 'objective_update' | 'reference_suggestion' | 'assignment_alert'
}

interface RefCandidate {
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

interface CurriculumDrawerProps {
  open: boolean;
  suggestions: Suggestion[];
  loading: boolean;
  courseId: string | undefined;
  onClose: () => void;
  onApply: (suggestion: Suggestion) => void;
  onRedo: (suggestion: Suggestion) => void;
  onNavigateAnalytics: () => void;
}

const CurriculumDrawer: React.FC<CurriculumDrawerProps> = ({
  open,
  suggestions,
  loading,
  courseId,
  onClose,
  onApply,
  onRedo,
  onNavigateAnalytics,
}) => {
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [drawerWidth, setDrawerWidth] = useState(() => Math.min(Math.max(480, window.innerWidth * 0.35), window.innerWidth * 0.5));
  const isResizing = useRef(false);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = drawerWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(
        window.innerWidth * 0.8,
        Math.max(380, startWidth - (ev.clientX - startX))
      );
      setDrawerWidth(newWidth);
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [drawerWidth]);

  // Filter by change_type
  const filterByType = (list: Suggestion[]) => {
    if (activeFilter === 'all') return list;
    return list.filter(s => s.change_type === activeFilter);
  };

  const visibleSuggestions = suggestions.filter(s => !dismissedIds.has(s.module_id + s.recommendation));
  const pending = filterByType(visibleSuggestions.filter(s => s.status !== 'applied'));
  const applied = filterByType(visibleSuggestions.filter(s => s.status === 'applied'));

  // Counts for filter tabs (unfiltered)
  const allPending = visibleSuggestions.filter(s => s.status !== 'applied');
  const counts = {
    all: allPending.length,
    objective_update: allPending.filter(s => s.change_type === 'objective_update').length,
    reference_suggestion: allPending.filter(s => s.change_type === 'reference_suggestion').length,
    assignment_alert: allPending.filter(s => s.change_type === 'assignment_alert').length,
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/20 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        style={{ width: drawerWidth }}
        className={`fixed top-0 right-0 h-full max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Resize Handle */}
        <div
          onMouseDown={startResize}
          className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-amber-400/30 active:bg-amber-400/50 transition-colors"
        />
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-amber-50 to-white">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🤖</span>
            <div>
              <h2 className="font-serif text-lg font-semibold text-stone-900">AI Curriculum Suggestions</h2>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-0.5">
                Based on xAPI student data analysis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter Tabs */}
        {suggestions.length > 0 && (
          <div className="px-4 py-2 border-b border-stone-100 flex flex-wrap gap-1 shrink-0 bg-stone-50/50">
            {[
              { key: 'all', label: 'All', icon: '📋', count: counts.all },
              { key: 'objective_update', label: 'Objectives', icon: '🎯', count: counts.objective_update },
              { key: 'reference_suggestion', label: 'References', icon: '📚', count: counts.reference_suggestion },
              { key: 'assignment_alert', label: 'Assignments', icon: '📝', count: counts.assignment_alert },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activeFilter === tab.key
                    ? tab.key === 'objective_update'
                      ? 'bg-amber-100 text-amber-800 border border-amber-200 shadow-sm'
                      : tab.key === 'reference_suggestion'
                      ? 'bg-purple-100 text-purple-800 border border-purple-200 shadow-sm'
                      : tab.key === 'assignment_alert'
                      ? 'bg-blue-100 text-blue-800 border border-blue-200 shadow-sm'
                      : 'bg-stone-200 text-stone-800 border border-stone-300 shadow-sm'
                    : 'text-stone-500 hover:bg-stone-100 border border-transparent'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    activeFilter === tab.key
                      ? 'bg-white/60 text-inherit'
                      : 'bg-stone-200 text-stone-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-3">
              <span className="inline-block w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading suggestions...</p>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-6">
              {/* ── Pending Suggestions ─────────────────────────── */}
              {pending.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-3">
                    Pending Suggestions ({pending.length})
                  </p>
                  <div className="space-y-3">
                    {pending.map((s, i) => (
                      <SuggestionCard
                        key={`p-${i}`}
                        suggestion={s}
                        variant="pending"
                        courseId={courseId}
                        onApply={() => onApply(s)}
                        onRedo={() => onRedo(s)}
                        onDismiss={() => setDismissedIds(prev => new Set(prev).add(s.module_id + s.recommendation))}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Applied Changes ────────────────────────────── */}
              {applied.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3">
                    ✅ Applied Changes ({applied.length})
                  </p>
                  <div className="space-y-3">
                    {applied.map((s, i) => (
                      <SuggestionCard
                        key={`a-${i}`}
                        suggestion={s}
                        variant="applied"
                        courseId={courseId}
                        onApply={() => onApply(s)}
                        onRedo={() => onRedo(s)}
                        onDismiss={() => setDismissedIds(prev => new Set(prev).add(s.module_id + s.recommendation))}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-3">
              <span className="text-4xl">📊</span>
              <p className="text-sm text-center leading-relaxed">
                No suggestions available yet.<br />
                Run a student data analysis first.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 shrink-0 space-y-2">
          <button
            onClick={onNavigateAnalytics}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-sm font-medium transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12V7H5a2 2 0 010-4h14v4" />
              <path d="M3 5v14a2 2 0 002 2h16v-5" />
              <path d="M18 12l4 4-4 4" />
            </svg>
            View Full Analytics →
          </button>
          <p className="text-[10px] text-stone-400 text-center">
            AI-generated insights — for reference only
          </p>
        </div>
      </div>
    </>
  );
};


/* ── SuggestionCard ──────────────────────────────────────────────────────── */

interface SuggestionCardProps {
  suggestion: Suggestion;
  variant: 'pending' | 'applied';
  courseId: string | undefined;
  onApply: () => void;
  onRedo: () => void;
  onDismiss: () => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  variant,
  courseId,
  onApply,
  onRedo,
  onDismiss,
}) => {
  const isPending = variant === 'pending';
  const changeType = suggestion.change_type ?? 'objective_update';

  return (
    <div
      className={`group rounded-xl p-4 hover:shadow-sm transition-shadow ${
        changeType === 'assignment_alert'
          ? 'bg-blue-50/60 border border-blue-200/60'
          : isPending
          ? 'bg-amber-50/70 border border-amber-200/60'
          : 'bg-green-50/60 border border-green-200/60'
      }`}
    >
      {/* Module name + layer badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${
            changeType === 'assignment_alert' ? 'bg-blue-400'
            : isPending ? 'bg-amber-400'
            : 'bg-green-500'
          }`} />
          <p className="text-sm font-semibold text-stone-800">
            {suggestion.module_name || suggestion.module_id}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <LayerBadge changeType={changeType} />
          <button
            onClick={onDismiss}
            title="Dismiss suggestion"
            className="w-5 h-5 flex items-center justify-center rounded text-stone-300 hover:text-stone-500 hover:bg-stone-100 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Recommendation text */}
      <p className="text-sm text-stone-600 leading-relaxed mb-3">
        {suggestion.recommendation}
      </p>

      {/* Layer-specific CTA */}
      {changeType === 'objective_update' && suggestion.source === 'curriculum_agent' && (
        <div className="flex gap-2">
          {isPending ? (
            <button
              onClick={onApply}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-amber-500 text-white hover:bg-amber-600 transition-colors shadow-sm"
            >
              Apply Objectives
            </button>
          ) : (
            <button
              onClick={onRedo}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors"
            >
              Redo
            </button>
          )}
        </div>
      )}

      {changeType === 'reference_suggestion' && isPending && courseId && (
        <ReferenceSearchPanel
          courseId={courseId}
          moduleId={suggestion.module_id}
        />
      )}

      {changeType === 'assignment_alert' && (
        <AssignmentAlertNote />
      )}

      {/* Reason tags */}
      {suggestion.reasons && suggestion.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {suggestion.reasons.map((r, j) => {
            const isKG = typeof r === 'string' && r.startsWith('KG ');
            return (
              <span
                key={j}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  isKG
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                    : changeType === 'assignment_alert'
                    ? 'bg-white border border-blue-200 text-blue-700'
                    : isPending
                    ? 'bg-white border border-amber-200 text-amber-700'
                    : 'bg-white border border-green-200 text-green-700'
                }`}
              >
                {isKG ? `🔗 ${r}` : r.replace(/_/g, ' ')}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};


/* ── LayerBadge ─────────────────────────────────────────────────────────── */

const LayerBadge: React.FC<{ changeType: string }> = ({ changeType }) => {
  if (changeType === 'objective_update') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200">
        Objectives
      </span>
    );
  }
  if (changeType === 'reference_suggestion') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-semibold border border-violet-200">
        References
      </span>
    );
  }
  if (changeType === 'assignment_alert') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold border border-blue-200">
        Assignments
      </span>
    );
  }
  return null;
};


/* ── AssignmentAlertNote ────────────────────────────────────────────────── */

const AssignmentAlertNote: React.FC = () => (
  <div className="mt-1 flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
    <span className="shrink-0 mt-0.5">⚠️</span>
    <span>
      Assignments require manual review — please update them directly in the course editor to match the revised objectives.
    </span>
  </div>
);


/* ── ReferenceSearchPanel ───────────────────────────────────────────────── */

interface ReferenceSearchPanelProps {
  courseId: string;
  moduleId: string;
}

const ReferenceSearchPanel: React.FC<ReferenceSearchPanelProps> = ({ courseId, moduleId }) => {
  const [expanded, setExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [candidates, setCandidates] = useState<RefCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setSearching(true);
    setError('');
    setCandidates([]);
    setSelected(new Set());
    setExpanded(true);
    try {
      const res = await fetch(`${API}/api/curriculum/references/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: Number(courseId), module_id: moduleId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Search failed');
      setCandidates(data.candidates || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSearching(false);
    }
  };

  const toggleSelect = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleApply = async () => {
    const refs = candidates.filter(c => selected.has(c.url));
    if (!refs.length) return;
    setApplying(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/curriculum/references/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: Number(courseId),
          module_id: moduleId,
          references: refs,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Apply failed');
      setApplied(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  };

  if (applied) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        <span>✅</span>
        <span>{selected.size} reference{selected.size !== 1 ? 's' : ''} added to module.</span>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      <button
        onClick={handleSearch}
        disabled={searching}
        className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg font-medium bg-violet-500 text-white hover:bg-violet-600 disabled:opacity-60 transition-colors shadow-sm"
      >
        {searching ? (
          <>
            <span className="inline-block w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
            Searching…
          </>
        ) : (
          <>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            Search References
          </>
        )}
      </button>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {expanded && !searching && candidates.length === 0 && !error && (
        <p className="text-xs text-stone-500 italic">No new references found.</p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-stone-400 uppercase tracking-wide font-semibold">
            Select references to add:
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {candidates.map(c => (
              <label
                key={c.url}
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  selected.has(c.url)
                    ? 'bg-violet-50 border-violet-300'
                    : 'bg-white border-stone-200 hover:border-violet-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.url)}
                  onChange={() => toggleSelect(c.url)}
                  className="mt-0.5 accent-violet-500 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-stone-800 leading-snug">{c.title}</p>
                  <p className="text-[10px] text-violet-600 truncate">{c.domain}</p>
                  {c.snippet && (
                    <p className="text-[10px] text-stone-400 mt-0.5 line-clamp-2">{c.snippet}</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {selected.size > 0 && (
            <button
              onClick={handleApply}
              disabled={applying}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 transition-colors shadow-sm"
            >
              {applying ? 'Adding…' : `Add ${selected.size} Selected`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};


export default CurriculumDrawer;
