/**
 * SkeletonReview — Step 3 of the course generation flow.
 * Displays generated module skeleton for review before saving to CoursePage.
 */

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Plus, X, Loader2, BookOpen, ChevronDown, ChevronUp,
} from 'lucide-react';

export interface SkeletonModule {
  module_number: number;
  title: string;
  complexity_level: number;
  learning_objectives: string[];
}

interface SkeletonReviewProps {
  modules: SkeletonModule[];
  courseNarrative: string;
  topic: string;
  loading: boolean;
  isExpanding?: boolean;
  onAddToCourse: (modules: SkeletonModule[], courseNarrative: string) => void;
  onBack: () => void;
}

export const SkeletonReview: React.FC<SkeletonReviewProps> = ({
  modules: initialModules,
  courseNarrative: initialNarrative,
  topic,
  loading,
  isExpanding,
  onAddToCourse,
  onBack,
}) => {
  const [modules, setModules] = useState<SkeletonModule[]>(initialModules);
  const [courseNarrative, setCourseNarrative] = useState(initialNarrative);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  useEffect(() => {
    setModules(initialModules);
    setCourseNarrative(initialNarrative);
  }, [initialModules, initialNarrative]);

  // ── Inline editing ──

  const updateTitle = (idx: number, title: string) => {
    setModules(prev => prev.map((m, i) => i === idx ? { ...m, title } : m));
  };

  const updateObjective = (modIdx: number, objIdx: number, value: string) => {
    setModules(prev => prev.map((m, i) => {
      if (i !== modIdx) return m;
      const objs = [...m.learning_objectives];
      objs[objIdx] = value;
      return { ...m, learning_objectives: objs };
    }));
  };

  const addObjective = (modIdx: number) => {
    setModules(prev => prev.map((m, i) => {
      if (i !== modIdx) return m;
      return { ...m, learning_objectives: [...m.learning_objectives, ''] };
    }));
  };

  const removeObjective = (modIdx: number, objIdx: number) => {
    setModules(prev => prev.map((m, i) => {
      if (i !== modIdx) return m;
      return { ...m, learning_objectives: m.learning_objectives.filter((_, j) => j !== objIdx) };
    }));
  };

  const removeModule = (idx: number) => {
    setModules(prev => {
      const next = prev.filter((_, i) => i !== idx);
      // Renumber
      return next.map((m, i) => ({ ...m, module_number: i + 1 }));
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={32} className="animate-spin text-amber-600" />
        <p className="text-sm text-stone-500">Generating module skeleton for <strong>{topic}</strong>…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-amber-700 uppercase mb-1">
          Step 3 of 3 — Skeleton Review
        </p>
        <h2 className="text-2xl font-bold font-serif text-stone-900 mb-1">
          Review Module Structure
        </h2>
        <p className="text-sm text-stone-500">
          Review and edit titles and objectives below, then click Add to Course Page when ready.
          This will expand each module with AI-recommended readings, assignments, and suggestions.
        </p>
      </div>

      {/* Course Narrative */}
      {courseNarrative && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
          <label className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1 block">
            Course Narrative
          </label>
          <textarea
            value={courseNarrative}
            onChange={e => setCourseNarrative(e.target.value)}
            rows={2}
            className="w-full bg-white border border-amber-200 rounded-lg px-3 py-2 text-sm text-stone-800 outline-none focus:ring-2 focus:ring-amber-300 transition resize-none"
          />
        </div>
      )}

      {/* Complexity legend */}
      <div className="flex items-center gap-2 mb-4 text-xs text-stone-400">
        <span className="inline-block w-2 h-2 rounded-full bg-amber-400" />
        <span>= complexity level — more dots means more advanced</span>
      </div>

      {/* Module list */}
      <div className="space-y-2 mb-6">
        {modules.map((mod, i) => {
          const isExpanded = expandedIdx === i;
          return (
            <div
              key={mod.module_number}
              className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-sm"
            >
              {/* Module header row */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition"
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
              >
                {/* Number */}
                <span className="text-sm font-bold text-stone-400 w-6 text-right shrink-0">
                  {mod.module_number}
                </span>

                {/* Title (editable) */}
                <input
                  type="text"
                  value={mod.title}
                  onChange={e => { e.stopPropagation(); updateTitle(i, e.target.value); }}
                  onClick={e => e.stopPropagation()}
                  className="flex-1 text-sm font-semibold text-stone-800 bg-transparent border-b border-transparent hover:border-stone-300 focus:border-amber-400 outline-none transition px-1 py-0.5"
                />

                {/* Complexity dots */}
                <div className="flex gap-0.5 shrink-0">
                  {Array.from({ length: 5 }).map((_, d) => (
                    <span
                      key={d}
                      className={`w-2 h-2 rounded-full ${
                        d < mod.complexity_level ? 'bg-amber-400' : 'bg-stone-200'
                      }`}
                    />
                  ))}
                </div>

                {/* Delete module */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeModule(i); }}
                  className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition shrink-0"
                  title="Remove module"
                >
                  <X size={14} />
                </button>

                {/* Expand chevron */}
                {isExpanded ? <ChevronUp size={14} className="text-stone-400" /> : <ChevronDown size={14} className="text-stone-400" />}
              </div>

              {/* Expanded: learning objectives */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-stone-100 bg-stone-50/50">
                  {mod.learning_objectives.map((obj, j) => (
                    <div key={j} className="flex items-start gap-2 mb-1.5">
                      <span className="text-xs text-stone-400 mt-1.5 shrink-0">•</span>
                      <input
                        type="text"
                        value={obj}
                        onChange={e => updateObjective(i, j, e.target.value)}
                        className="flex-1 text-sm text-stone-700 bg-white border border-stone-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
                      />
                      <button
                        onClick={() => removeObjective(i, j)}
                        className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 transition shrink-0 mt-0.5"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addObjective(i)}
                    className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-medium mt-1 transition"
                  >
                    <Plus size={12} /> Add objective
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          disabled={isExpanding}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 bg-white hover:bg-stone-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ArrowLeft size={14} />
          Back
        </button>
        <button
          onClick={() => onAddToCourse(modules, courseNarrative)}
          disabled={modules.length === 0 || isExpanding}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: modules.length > 0 ? '#C5A028' : '#d6d3d1' }}
        >
          {isExpanding ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}
          {isExpanding ? 'Expanding Modules...' : 'Add This Course to Course Page'}
        </button>
      </div>
    </div>
  );
};
