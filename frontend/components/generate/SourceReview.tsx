/**
 * SourceReview — Step 2 of the course generation flow.
 * Displays Tavily-researched sources for instructor review.
 * Each source can be marked Required / Optional / Exclude.
 */

import React, { useState } from 'react';
import {
  ArrowLeft, CheckCircle2, XCircle, BookOpen,
  ChevronDown, ChevronUp, ExternalLink, Loader2,
} from 'lucide-react';

export interface ReviewedSource {
  url: string;
  title: string;
  type: string;       // academic | video | news
  snippet: string;
  credibility: string; // High | Medium | Low
  tags: string[];
  priority: 'required' | 'optional' | 'exclude';
}

interface SourceReviewProps {
  sources: ReviewedSource[];
  topic: string;
  loading: boolean;
  onConfirm: (approved: ReviewedSource[]) => void;
  onBack: () => void;
}

const credibilityColor: Record<string, string> = {
  High: 'bg-green-100 text-green-700 border-green-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-red-100 text-red-700 border-red-200',
};

const typeColor: Record<string, string> = {
  academic: 'bg-indigo-100 text-indigo-700',
  video: 'bg-purple-100 text-purple-700',
  news: 'bg-sky-100 text-sky-700',
};

export const SourceReview: React.FC<SourceReviewProps> = ({
  sources: initialSources,
  topic,
  loading,
  onConfirm,
  onBack,
}) => {
  const [sources, setSources] = useState<ReviewedSource[]>(initialSources);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const setPriority = (index: number, priority: ReviewedSource['priority']) => {
    setSources(prev => prev.map((s, i) => i === index ? { ...s, priority } : s));
  };

  const setAll = (priority: 'required' | 'optional' | 'exclude') => {
    setSources(prev => prev.map(s => ({ ...s, priority })));
  };

  const approvedCount = sources.filter(s => s.priority !== 'exclude').length;

  const handleConfirm = () => {
    onConfirm(sources.filter(s => s.priority !== 'exclude'));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 size={32} className="animate-spin text-amber-600" />
        <p className="text-sm text-stone-500">Searching for real sources on <strong>{topic}</strong>…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-bold tracking-widest text-amber-700 uppercase mb-1">
          Step 2 of 3 — Source Review
        </p>
        <h2 className="text-2xl font-bold font-serif text-stone-900 mb-1">
          Review Research Sources
        </h2>
        <p className="text-sm text-stone-500">
          These sources were found by the research agent. Set each source as Required, Optional, or Excluded before generating.
        </p>
      </div>

      {/* Batch actions */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setAll('required')}
          className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline underline-offset-2 transition"
        >
          Select All Required
        </button>
        <button
          onClick={() => setAll('exclude')}
          className="text-xs font-semibold text-stone-600 hover:text-stone-900 underline underline-offset-2 transition"
        >
          Exclude All
        </button>
        <div className="flex-1" />
        <span className="text-xs text-stone-400">{approvedCount} approved</span>
      </div>

      {/* Source list */}
      <div className="space-y-3 mb-6">
        {sources.map((source, i) => {
          const isExpanded = expandedIdx === i;
          const isExcluded = source.priority === 'exclude';

          return (
            <div
              key={i}
              className={`bg-white border rounded-xl p-4 transition-all ${
                isExcluded ? 'opacity-50 border-stone-200' : 'border-stone-200 shadow-sm'
              }`}
            >
              {/* Top row: priority buttons + title + credibility */}
              <div className="flex items-start gap-3">
                {/* Priority buttons */}
                <div className="flex items-center gap-1 shrink-0 pt-0.5">
                  {(['required', 'optional', 'exclude'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setPriority(i, p)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        source.priority === p
                          ? p === 'exclude'
                            ? 'bg-red-600 text-white border-red-600'
                            : p === 'required'
                              ? 'bg-stone-800 text-white border-stone-800'
                              : 'bg-amber-500 text-white border-amber-500'
                          : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      {p === 'required' ? 'Required' : p === 'optional' ? 'Optional' : 'Exclude'}
                    </button>
                  ))}
                </div>

                {/* Credibility badge */}
                <span className={`px-2 py-0.5 rounded text-xs font-medium border shrink-0 ${credibilityColor[source.credibility] || credibilityColor.Medium}`}>
                  {source.credibility || 'Medium'}
                </span>

                {/* Title + link */}
                <div className="flex-1 min-w-0">
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-stone-800 hover:text-amber-700 transition line-clamp-2 flex items-center gap-1"
                  >
                    {source.title}
                    <ExternalLink size={12} className="shrink-0 opacity-40" />
                  </a>
                </div>
              </div>

              {/* Tags row */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColor[source.type] || 'bg-stone-100 text-stone-600'}`}>
                  {source.type || 'other'}
                </span>
                {source.tags.map((tag, j) => (
                  <span key={j} className="px-2 py-0.5 rounded bg-stone-100 text-stone-500 text-xs">
                    #{tag}
                  </span>
                ))}
              </div>

              {/* Expandable summary */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                className="flex items-center gap-1 mt-2 text-xs text-stone-400 hover:text-stone-600 transition"
              >
                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                Summary
              </button>
              {isExpanded && (
                <p className="mt-1 text-xs text-stone-500 leading-relaxed pl-4 border-l-2 border-stone-200">
                  {source.snippet || 'No summary available.'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 border border-stone-200 bg-white hover:bg-stone-50 transition"
        >
          <ArrowLeft size={14} />
          Back to Form
        </button>
        <button
          onClick={handleConfirm}
          disabled={approvedCount === 0}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ backgroundColor: approvedCount > 0 ? '#C5A028' : '#d6d3d1' }}
        >
          <CheckCircle2 size={16} />
          Confirm Sources & Generate Skeleton
        </button>
      </div>
    </div>
  );
};
