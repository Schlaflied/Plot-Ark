/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, HelpCircle, Star, BookOpen } from 'lucide-react';
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
  annotation?: AnnotationState;
  onAnnotate?: (type: 'confused' | 'important' | 'exam_focus') => void;
}

const NodeDetailPanel: React.FC<NodeDetailPanelProps> = ({ node, onClose, role, annotation, onAnnotate }) => {
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

        {node.description && (
          <div>
            <div className="text-xs uppercase tracking-widest mb-1.5" style={{ color: TEXT_MUTED }}>Description</div>
            <p className="text-sm leading-relaxed" style={{ color: TEXT_PRIMARY }}>{node.description}</p>
          </div>
        )}

        {/* ── Annotation buttons ── */}
        {role && onAnnotate && (
          <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, paddingTop: '12px' }}>
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: TEXT_MUTED }}>
              {role === 'professor' ? 'Mark this concept' : 'How do you feel about this?'}
            </div>

            {role === 'student' && (
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
              </div>
            )}

            {role === 'professor' && (
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

                {annotation?.confusionCount !== undefined && annotation.confusionCount > 0 && (
                  <div className="text-xs rounded-lg px-3 py-2" style={{ background: '#450a0a', color: '#fca5a5', border: '1px solid #7f1d1d' }}>
                    ⚠ {annotation.confusionCount} student{annotation.confusionCount > 1 ? 's' : ''} ({annotation.confusionPct}%) marked this as confusing
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NodeDetailPanel;
