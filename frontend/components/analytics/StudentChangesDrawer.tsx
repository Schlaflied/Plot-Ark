/**
 * StudentChangesDrawer — Slide-out drawer panel for student-facing module updates.
 *
 * Shows a list of modules that were recently updated by the professor
 * based on AI curriculum suggestions, along with the reason for each change.
 */

import React, { useState, useRef, useCallback } from 'react';

interface ModuleChange {
  module_id: string;
  module_name?: string;
  recommendation: string;
  reasons?: string[];
  status?: string;
  changed_at?: string;
}

interface StudentChangesDrawerProps {
  open: boolean;
  changes: ModuleChange[];
  onClose: () => void;
  onNavigateToModule?: (moduleId: string) => void;
}

const StudentChangesDrawer: React.FC<StudentChangesDrawerProps> = ({
  open,
  changes,
  onClose,
  onNavigateToModule,
}) => {
  const [drawerWidth, setDrawerWidth] = useState(() => Math.min(Math.max(480, window.innerWidth * 0.35), window.innerWidth * 0.5));
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
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
          className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-blue-400/30 active:bg-blue-400/50 transition-colors"
        />
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">✨</span>
            <div>
              <h2 className="font-serif text-lg font-semibold text-stone-900">Module Updates</h2>
              <p className="text-[10px] text-stone-400 uppercase tracking-widest mt-0.5">
                Recent curriculum changes by your instructor
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
          {changes.filter(c => !dismissedIds.has(c.module_id + c.recommendation)).length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-3">
                Updated Modules ({changes.filter(c => !dismissedIds.has(c.module_id + c.recommendation)).length})
              </p>
              {changes.filter(c => !dismissedIds.has(c.module_id + c.recommendation)).map((c, i) => (
                <div
                  key={i}
                  className="group relative rounded-xl p-4 bg-blue-50/70 border border-blue-200/60 hover:shadow-sm transition-shadow"
                >
                  <button
                    onClick={() => setDismissedIds(prev => new Set(prev).add(c.module_id + c.recommendation))}
                    className="absolute right-3 top-3 w-5 h-5 flex items-center justify-center rounded text-stone-400 hover:text-stone-600 hover:bg-blue-100 transition-colors"
                    title="Dismiss update"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                  {/* Module name + Go to button */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
                      <p className="text-sm font-semibold text-stone-800">
                        {c.module_name || c.module_id}
                      </p>
                    </div>
                    {onNavigateToModule && (
                      <button
                        onClick={() => onNavigateToModule(c.module_id)}
                        className="text-xs px-3 py-1 rounded-lg font-medium transition-colors shadow-sm bg-blue-500 text-white hover:bg-blue-600"
                      >
                        Go to Module
                      </button>
                    )}
                  </div>

                  {/* Change description */}
                  <p className="text-sm text-stone-600 leading-relaxed mb-2.5">
                    {c.recommendation}
                  </p>

                  {/* Reason tags */}
                  {c.reasons && c.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {c.reasons.map((r, j) => (
                        <span
                          key={j}
                          className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-white border border-blue-200 text-blue-700"
                        >
                          {r.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Timestamp */}
                  {c.changed_at && (
                    <p className="text-[10px] text-stone-400 mt-2">
                      Updated {new Date(c.changed_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-stone-400 gap-3">
              <span className="text-4xl">📚</span>
              <p className="text-sm text-center leading-relaxed">
                No recent module updates.<br />
                Your curriculum is up to date.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 shrink-0">
          <p className="text-[10px] text-stone-400 text-center">
            Your instructor optimized these modules based on class performance data
          </p>
        </div>
      </div>
    </>
  );
};

export default StudentChangesDrawer;
