/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, HelpCircle, Star, BookOpen, Users } from 'lucide-react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT } from '../constants/theme';

export interface AnnotationState {
  isConfused: boolean;
  isImportant: boolean;
  isExamFocus: boolean;  // professor only
  confusionCount?: number;
  confusionPct?: number;
}

export interface NodeDetailPanelProps {
  node: {
    id: string;
    label: string;
    description: string;
    degree?: number;
  };
  onClose: () => void;
  role?: 'student' | 'professor';
  moduleLabel?: string;
  masteryLevel?: string;
  annotation?: AnnotationState;
  onAnnotate?: (type: 'confused' | 'important' | 'exam_focus') => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose, role, moduleLabel, masteryLevel, annotation, onAnnotate }) => {
  const masteryColor = masteryLevel === 'mastered' ? '#22c55e'
    : masteryLevel === 'learning' ? '#eab308'
    : masteryLevel === 'struggling' ? '#f97316'
    : '#9ca3af';
  const masteryBg = masteryLevel === 'mastered' ? '#052e16'
    : masteryLevel === 'learning' ? '#1c1408'
    : masteryLevel === 'struggling' ? '#1c0a00'
    : '#1c1917';
  const masteryBorder = masteryLevel === 'mastered' ? 'rgba(34,197,94,0.3)'
    : masteryLevel === 'learning' ? 'rgba(234,179,8,0.3)'
    : masteryLevel === 'struggling' ? 'rgba(249,115,22,0.3)'
    : BORDER_COLOR;
  const masteryLabel = masteryLevel === 'mastered' ? 'Mastered'
    : masteryLevel === 'learning' ? 'Learning'
    : masteryLevel === 'struggling' ? 'Struggling'
    : '';
  return (
    <div
      className="flex flex-col"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        height: '100%',
        width: '280px',
        zIndex: 10,
        borderLeft: `1px solid ${BORDER_COLOR}`,
        background: PANEL_BG,
        overflowY: 'auto',
      }}
    >
      <div
        className="flex items-start justify-between p-4"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-xs font-semibold tracking-widest uppercase mb-1"
            style={{ color: ACCENT }}
          >
            Node Detail
          </div>
          <h3
            className="text-base font-semibold leading-snug"
            style={{ color: TEXT_PRIMARY, wordBreak: 'break-word' }}
          >
            {node.label}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="ml-2 mt-0.5 shrink-0"
          style={{ color: TEXT_MUTED, background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TEXT_MUTED }}>ID</div>
          <div className="text-xs font-mono px-2 py-1 rounded truncate" style={{ background: DARK_BG, color: TEXT_MUTED }}>
            {String(node.id)}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TEXT_MUTED }}>Connections</div>
          <div className="text-sm" style={{ color: TEXT_PRIMARY }}>{node.degree ?? 0}</div>
        </div>

        {moduleLabel && (
          <div>
            <div className="text-xs uppercase tracking-widest mb-1" style={{ color: TEXT_MUTED }}>Related module</div>
            <div className="text-sm font-medium" style={{ color: TEXT_PRIMARY }}>{moduleLabel}</div>
          </div>
        )}

        {masteryLevel && masteryLabel && (
          <div className="rounded-lg px-3 py-2.5 flex items-center gap-2" style={{ background: masteryBg, border: `1px solid ${masteryBorder}` }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: masteryColor, flexShrink: 0 }} />
            <div>
              <div className="text-xs font-semibold" style={{ color: masteryColor }}>Cohort: {masteryLabel}</div>
              <div className="text-xs" style={{ color: TEXT_MUTED }}>Class average mastery for this concept</div>
            </div>
          </div>
        )}

        {node.description && (
          <div>
            <div className="text-xs uppercase tracking-widest mb-1.5" style={{ color: TEXT_MUTED }}>Description</div>
            <p className="text-sm leading-relaxed" style={{ color: TEXT_PRIMARY }}>{node.description}</p>
          </div>
        )}

        {/* ── Annotation buttons ── */}
        {role && onAnnotate && (
          <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>

            {/* Student annotation — shown to both roles (anonymous) */}
            <div>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: TEXT_MUTED }}>
                How do you feel about this?
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => onAnnotate('confused')}
                  className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: annotation?.isConfused ? '#7f1d1d' : DARK_BG,
                    color: annotation?.isConfused ? '#fca5a5' : TEXT_MUTED,
                    border: `1px solid ${annotation?.isConfused ? '#ef4444' : BORDER_COLOR}`,
                    cursor: 'pointer',
                  }}
                >
                  <HelpCircle size={14} />
                  {annotation?.isConfused ? "I'm confused (marked)" : "I'm confused here"}
                </button>
                <button
                  onClick={() => onAnnotate('important')}
                  className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors"
                  style={{
                    background: annotation?.isImportant ? '#1c1917' : DARK_BG,
                    color: annotation?.isImportant ? '#fbbf24' : TEXT_MUTED,
                    border: `1px solid ${annotation?.isImportant ? '#f59e0b' : BORDER_COLOR}`,
                    cursor: 'pointer',
                  }}
                >
                  <Star size={14} />
                  {annotation?.isImportant ? 'Marked as important' : 'This seems important'}
                </button>

                {/* Social signal — normalizes confusion, not a performance metric */}
                {(annotation?.confusionPct ?? 0) > 0 && (
                  <div className="rounded-lg px-3 py-2.5 flex flex-col gap-1" style={{ background: '#1c1408', border: '1px solid rgba(245,158,11,0.3)' }}>
                    <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: '#fbbf24' }}>
                      <Users size={12} />
                      {annotation!.confusionPct}% of your classmates feel the same
                    </div>
                    <div className="text-xs" style={{ color: '#92400e' }}>
                      You're not alone — this concept trips up a lot of people.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Professor-only section */}
            {role === 'professor' && (
              <div>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: TEXT_MUTED }}>
                  Mark this concept
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => onAnnotate('exam_focus')}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg transition-colors"
                    style={{
                      background: annotation?.isExamFocus ? '#1c1410' : DARK_BG,
                      color: annotation?.isExamFocus ? '#fbbf24' : TEXT_MUTED,
                      border: `1px solid ${annotation?.isExamFocus ? '#f59e0b' : BORDER_COLOR}`,
                      cursor: 'pointer',
                    }}
                  >
                    <BookOpen size={14} />
                    {annotation?.isExamFocus ? '★ Exam focus (marked)' : 'Mark as exam focus'}
                  </button>

                  {(annotation?.confusionCount ?? 0) > 0 && (
                    <div className="rounded-lg px-3 py-2.5 flex flex-col gap-2" style={{ background: '#450a0a', border: '1px solid #7f1d1d' }}>
                      <div className="flex items-center justify-between text-xs" style={{ color: '#fca5a5' }}>
                        <span className="flex items-center gap-1.5"><Users size={12} /> Class confusion</span>
                        <span className="font-semibold">{annotation!.confusionPct}%</span>
                      </div>
                      <div className="rounded-full overflow-hidden" style={{ height: '4px', background: '#7f1d1d' }}>
                        <div style={{ width: `${annotation!.confusionPct}%`, height: '100%', background: '#ef4444', borderRadius: '9999px' }} />
                      </div>
                      <div className="text-xs" style={{ color: '#f87171' }}>
                        {annotation!.confusionCount} student{annotation!.confusionCount! > 1 ? 's' : ''} flagged this concept
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
