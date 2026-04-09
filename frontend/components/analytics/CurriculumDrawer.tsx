/**
 * CurriculumDrawer — Slide-out drawer panel for AI curriculum suggestions.
 *
 * Opens from the right side when triggered by the notification bar.
 * Contains suggestion cards with Apply buttons + redirect to analytics.
 */

import React from 'react';

interface Suggestion {
  module_id: string;
  module_name: string;
  recommendation: string;
  reasons?: string[];
  source?: string;
}

interface CurriculumDrawerProps {
  open: boolean;
  suggestions: Suggestion[];
  loading: boolean;
  courseId: string | undefined;
  onClose: () => void;
  onApply: (suggestion: Suggestion) => void;
  onNavigateAnalytics: () => void;
}

const CurriculumDrawer: React.FC<CurriculumDrawerProps> = ({
  open,
  suggestions,
  loading,
  courseId,
  onClose,
  onApply,
  onNavigateAnalytics,
}) => {
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
        className={`fixed top-0 right-0 h-full w-[400px] max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
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

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-3">
              <span className="inline-block w-6 h-6 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm">Loading suggestions...</p>
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((s, i) => (
                <div
                  key={i}
                  className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-4 hover:shadow-sm transition-shadow"
                >
                  {/* Module name + Apply */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                      <p className="text-sm font-semibold text-stone-800">
                        {s.module_name || s.module_id}
                      </p>
                    </div>
                    {s.source === 'curriculum_agent' && (
                      <button
                        onClick={() => onApply(s)}
                        className="text-xs px-3 py-1 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors shadow-sm"
                      >
                        Apply
                      </button>
                    )}
                  </div>

                  {/* Recommendation text */}
                  <p className="text-sm text-stone-600 leading-relaxed mb-2.5">
                    {s.recommendation}
                  </p>

                  {/* Reason tags */}
                  {s.reasons && s.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.reasons.map((r, j) => (
                        <span
                          key={j}
                          className="text-[10px] px-2 py-0.5 bg-white border border-amber-200 text-amber-700 rounded-full font-medium"
                        >
                          {r.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
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

export default CurriculumDrawer;
