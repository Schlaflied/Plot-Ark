/**
 * FlagModal — Displays flagged modules with details and action buttons.
 *
 * Shows when user clicks the FlagBadge. Each flagged module displays:
 * - Flag level (orange/yellow)
 * - Signal sources and details
 * - Dismiss / Run Curriculum Analysis buttons
 */

import React, { useState } from 'react';
import type { ModuleFlag } from './FlagBadge';

interface FlagModalProps {
  flags: ModuleFlag[];
  courseId: number;
  onClose: () => void;
  onDismiss: (flagId: number) => void;
  onAnalyze: (flags: ModuleFlag[]) => void;
}

const FLAG_COLORS = {
  orange: {
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badge: 'bg-orange-100 text-orange-700',
    icon: '🟠',
    label: 'Requires Review',
  },
  yellow: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-700',
    icon: '🟡',
    label: 'Monitor',
  },
};

const FlagModal: React.FC<FlagModalProps> = ({ flags, courseId, onClose, onDismiss, onAnalyze }) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [dismissing, setDismissing] = useState<number | null>(null);

  const orangeFlags = flags.filter(f => f.flag_level === 'orange');
  const yellowFlags = flags.filter(f => f.flag_level === 'yellow');

  const handleDismiss = async (flagId: number) => {
    setDismissing(flagId);
    try {
      const res = await fetch(`/api/curriculum/flags/${flagId}/dismiss`, { method: 'POST' });
      if (res.ok) {
        onDismiss(flagId);
      }
    } catch (e) {
      console.error('Dismiss error:', e);
    }
    setDismissing(null);
  };

  const handleAnalyze = async () => {
    setAnalyzing(true);
    onAnalyze(flags);
    // Don't setAnalyzing(false) here — parent will close modal and handle state
  };

  const renderSignals = (signals: any[]) => {
    if (!signals || signals.length === 0) return null;
    return (
      <div className="mt-2 space-y-1">
        {signals.map((sig: any, i: number) => (
          <div key={i} className="flex items-start gap-2 text-xs text-stone-600">
            <span className="shrink-0 px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 font-mono text-[10px]">
              {sig.source || 'system'}
            </span>
            <span>{sig.detail || JSON.stringify(sig)}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderFlag = (flag: ModuleFlag) => {
    const style = FLAG_COLORS[flag.flag_level] || FLAG_COLORS.yellow;
    const moduleName = flag.module_id.split('/').pop() || flag.module_id;

    return (
      <div key={flag.id} className={`rounded-xl border p-4 ${style.bg} ${style.border}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span>{style.icon}</span>
              <h4 className="font-semibold text-sm text-stone-800 truncate">{flag.module_id}</h4>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${style.badge}`}>
                {style.label}
              </span>
            </div>
            {renderSignals(flag.signals)}
          </div>
          <button
            onClick={() => handleDismiss(flag.id)}
            disabled={dismissing === flag.id}
            className="shrink-0 text-xs text-stone-400 hover:text-stone-600 transition-colors px-2 py-1 rounded hover:bg-white/50 disabled:opacity-40"
            title="Dismiss this flag"
          >
            {dismissing === flag.id ? (
              <span className="inline-block w-3 h-3 border-2 border-stone-300 border-t-transparent rounded-full animate-spin" />
            ) : (
              '✕'
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100 bg-stone-50">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <h3 className="font-semibold text-stone-800">
              {flags.length} Module{flags.length !== 1 ? 's' : ''} Flagged for Review
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors p-1 rounded-lg hover:bg-stone-100"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 max-h-[60vh] overflow-y-auto space-y-3">
          {orangeFlags.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-wider text-orange-600 font-semibold">Requires Review</p>
              {orangeFlags.map(renderFlag)}
            </>
          )}
          {yellowFlags.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-wider text-amber-600 font-semibold mt-3">Monitoring</p>
              {yellowFlags.map(renderFlag)}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-stone-100 bg-stone-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors"
          >
            Dismiss All
          </button>
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors shadow-sm"
          >
            {analyzing ? (
              <>
                <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Curriculum Analysis
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlagModal;
