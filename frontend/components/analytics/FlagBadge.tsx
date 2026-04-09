/**
 * FlagBadge — Notification badge for flagged modules.
 *
 * Polls GET /api/curriculum/flags/<courseId> and displays a count badge
 * in the StudentDataPage header. Clicking opens the FlagModal.
 */

import React, { useState, useEffect, useCallback } from 'react';

interface ModuleFlag {
  id: number;
  module_id: string;
  flag_level: 'yellow' | 'orange';
  signals: any[];
  created_at: string;
}

interface FlagBadgeProps {
  courseId: number | null;
  onFlagsLoaded?: (flags: ModuleFlag[]) => void;
  onClick?: () => void;
}

const POLL_INTERVAL = 30_000; // 30 seconds

const FlagBadge: React.FC<FlagBadgeProps> = ({ courseId, onFlagsLoaded, onClick }) => {
  const [flags, setFlags] = useState<ModuleFlag[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFlags = useCallback(async () => {
    if (!courseId) {
      setFlags([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/curriculum/flags/${courseId}`);
      if (res.ok) {
        const data = await res.json();
        const newFlags = data.flags || [];
        setFlags(newFlags);
        onFlagsLoaded?.(newFlags);
      }
    } catch (e) {
      // Silent fail — badge just doesn't show
    }
    setLoading(false);
  }, [courseId, onFlagsLoaded]);

  useEffect(() => {
    fetchFlags();
    const interval = setInterval(fetchFlags, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchFlags]);

  if (!courseId || flags.length === 0) return null;

  const orangeCount = flags.filter(f => f.flag_level === 'orange').length;
  const hasOrange = orangeCount > 0;

  return (
    <button
      id="sd-flag-badge"
      onClick={onClick}
      className={`
        relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
        transition-all duration-200 hover:scale-105 cursor-pointer
        ${hasOrange
          ? 'bg-orange-100 text-orange-700 border border-orange-300 hover:bg-orange-200 shadow-sm shadow-orange-200/50'
          : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
        }
      `}
      title={`${flags.length} module(s) flagged for review`}
    >
      {/* Pulse dot for orange alerts */}
      {hasOrange && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500" />
        </span>
      )}

      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>

      <span>{flags.length} module{flags.length !== 1 ? 's' : ''} flagged</span>
    </button>
  );
};

export default FlagBadge;
export type { ModuleFlag };
