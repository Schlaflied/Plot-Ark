/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Send, Loader2, AlertCircle } from 'lucide-react';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT, stripMarkdown } from '../constants/theme';

export interface QueryHistoryItem {
  id: number;
  question: string;
  answer: string;
  subject: string;
  starred: boolean;
  matchedNodeId: string | null;
  timestamp?: number;
}

export interface QueryPanelProps {
  question: string;
  setQuestion: (q: string) => void;
  queryLoading: boolean;
  queryAnswer: string | null;
  queryError: string | null;
  queryHistory: QueryHistoryItem[];
  setQueryHistory: React.Dispatch<React.SetStateAction<QueryHistoryItem[]>>;
  showHistory: boolean;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  activeSubject: string;
  subjectTabs: { key: string; label: string }[];
  onSubmitQuery: (e: React.FormEvent) => void;
  onHistoryClick: (item: QueryHistoryItem) => void;
}

const QueryPanel: React.FC<QueryPanelProps> = ({
  question,
  setQuestion,
  queryLoading,
  queryAnswer,
  queryError,
  queryHistory,
  setQueryHistory,
  showHistory,
  setShowHistory,
  activeSubject,
  subjectTabs,
  onSubmitQuery,
  onHistoryClick,
}) => {
  return (
    <div
      className="flex flex-col gap-3 p-4"
      style={{ borderTop: `1px solid ${BORDER_COLOR}`, background: PANEL_BG }}
    >
      <form onSubmit={onSubmitQuery} className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder="e.g. tort law, what is consideration, CALL vs TELL…"
            disabled={queryLoading}
            style={{
              width: '100%',
              background: DARK_BG,
              border: `1px solid ${BORDER_COLOR}`,
              color: TEXT_PRIMARY,
              borderRadius: '0.5rem',
              padding: '0.5rem 2rem 0.5rem 0.75rem',
              fontSize: '0.8125rem',
              outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
          />
          {question && (
            <button
              type="button"
              onClick={() => setQuestion('')}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: TEXT_MUTED, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}
            >
              <X size={13} />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={queryLoading || !question.trim()}
          className="flex items-center justify-center rounded-lg shrink-0 transition-opacity"
          style={{
            width: '36px',
            height: '36px',
            background: ACCENT,
            color: DARK_BG,
            border: 'none',
            opacity: queryLoading || !question.trim() ? 0.4 : 1,
            cursor: queryLoading || !question.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {queryLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Send size={15} />
          )}
        </button>
      </form>

      {queryAnswer && (
        <div
          className="text-sm leading-relaxed rounded-lg p-3"
          style={{
            background: 'rgba(129,140,248,0.08)',
            border: '1px solid rgba(129,140,248,0.2)',
            color: TEXT_PRIMARY,
            whiteSpace: 'pre-wrap',
          }}
        >
          {stripMarkdown(queryAnswer)}
        </div>
      )}

      {queryError && (
        <div
          className="text-sm rounded-lg p-3 flex items-center gap-2"
          style={{
            background: 'rgba(248,113,113,0.08)',
            border: '1px solid rgba(248,113,113,0.2)',
            color: '#fca5a5',
          }}
        >
          <AlertCircle size={14} className="shrink-0" />
          {queryError}
        </div>
      )}

      {/* Query history */}
      {queryHistory.length > 0 && (
        <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, paddingTop: '0.75rem' }}>
          <button
            onClick={() => setShowHistory(h => !h)}
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest w-full text-left"
            style={{ color: TEXT_MUTED, background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span>{showHistory ? '▾' : '▸'}</span>
            Query History ({queryHistory.length})
          </button>
          {showHistory && (
            <div className="flex flex-col gap-2 mt-2" style={{ maxHeight: '240px', overflowY: 'auto' }}>
              {[...queryHistory]
                .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0))
                .map((item) => {
                  const knownTab = subjectTabs.find(t => t.key === item.subject);
                  const subjectLabel =
                    item.subject === 'business-law' ? 'Business Law'
                    : item.subject === 'call' ? 'CALL'
                    : item.subject === 'all' ? 'All'
                    : knownTab ? knownTab.label
                    : item.subject;
                  const subjectStyle: React.CSSProperties =
                    item.subject === 'business-law'
                      ? { background: 'rgba(139,94,60,0.15)', color: '#8B5E3C' }
                      : item.subject === 'call'
                      ? { background: 'rgba(79,120,120,0.15)', color: '#4f7878' }
                      : item.subject === 'all'
                      ? { background: 'rgba(107,101,96,0.12)', color: TEXT_MUTED }
                      : { background: 'rgba(107,101,96,0.1)', color: TEXT_MUTED };
                  return (
                    <div
                      key={item.id}
                      className="rounded-lg p-3 text-xs"
                      style={{ background: DARK_BG, border: `1px solid ${item.starred ? ACCENT : BORDER_COLOR}`, cursor: 'pointer', transition: 'background 0.15s' }}
                      onClick={() => onHistoryClick(item)}
                      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = PANEL_BG; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = DARK_BG; }}
                      title="Click to restore this query"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span style={{ color: ACCENT, fontWeight: 600 }}>Q</span>
                        {/* Subject badge */}
                        <span
                          className="rounded-full"
                          style={{
                            ...subjectStyle,
                            fontSize: '0.65rem',
                            fontWeight: 600,
                            padding: '1px 7px',
                            letterSpacing: '0.02em',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {subjectLabel}
                        </span>
                        <span style={{ color: TEXT_PRIMARY, fontWeight: 500, flex: 1 }}>{item.question}</span>
                        {/* Star toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQueryHistory(prev =>
                              prev.map(h => h.id === item.id ? { ...h, starred: !h.starred } : h)
                            );
                          }}
                          title={item.starred ? 'Unstar' : 'Star'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0 2px',
                            fontSize: '0.85rem',
                            lineHeight: 1,
                            color: item.starred ? '#f59e0b' : TEXT_MUTED,
                            flexShrink: 0,
                          }}
                        >
                          {item.starred ? '★' : '☆'}
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setQueryHistory(prev => prev.filter(h => h.id !== item.id));
                          }}
                          title="Delete"
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0 2px',
                            fontSize: '0.8rem',
                            lineHeight: 1,
                            color: TEXT_MUTED,
                            flexShrink: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ color: TEXT_MUTED, lineHeight: 1.5, paddingLeft: '1rem' }}>
                        {item.answer}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QueryPanel;
