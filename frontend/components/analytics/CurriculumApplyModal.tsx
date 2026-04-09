/**
 * CurriculumApplyModal — Confirmation modal for applying AI-suggested curriculum changes.
 *
 * Shows the proposed changes, lets the professor review before confirming.
 * Phase 1: Template-based changes (adjust complexity, flag reading changes).
 * Phase 3: Will show real LLM-generated diffs.
 */

import React, { useState } from 'react';

interface ProposedChange {
  field: string;
  description: string;
  before?: string;
  after?: string;
}

interface CurriculumApplyModalProps {
  suggestion: {
    module_id: string;
    module_name: string;
    recommendation: string;
    reasons?: string[];
    source?: string;
  };
  onClose: () => void;
  onApply: (suggestion: any) => Promise<void>;
}

const CurriculumApplyModal: React.FC<CurriculumApplyModalProps> = ({
  suggestion,
  onClose,
  onApply,
}) => {
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');

  // Generate template-based proposed changes from the suggestion
  const proposedChanges: ProposedChange[] = buildProposedChanges(suggestion);

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      await onApply(suggestion);
      setApplied(true);
    } catch (e: any) {
      setError(e.message || 'Failed to apply changes.');
    }
    setApplying(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <h3 className="font-serif text-lg text-stone-900">
              AI Suggested Changes
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 transition-colors text-lg"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Module target */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Target</span>
            <span className="text-sm font-semibold text-stone-800 bg-amber-50 px-2 py-0.5 rounded">
              {suggestion.module_name || suggestion.module_id}
            </span>
          </div>

          {/* Recommendation text */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
            <p className="text-sm text-stone-700 leading-relaxed">
              {suggestion.recommendation}
            </p>
            {suggestion.reasons && suggestion.reasons.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {suggestion.reasons.map((r, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-medium">
                    {r.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Proposed changes */}
          <div>
            <p className="text-xs font-bold text-stone-400 uppercase tracking-widest mb-2">
              Proposed Changes
            </p>
            <div className="space-y-2">
              {proposedChanges.map((change, i) => (
                <div key={i} className="flex items-start gap-3 bg-amber-50/60 border border-amber-100 rounded-lg p-3">
                  <span className="text-amber-500 mt-0.5 text-sm">●</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-stone-700 mb-0.5">{change.field}</p>
                    <p className="text-xs text-stone-600 leading-relaxed">{change.description}</p>
                    {change.before && change.after && (
                      <div className="flex items-center gap-2 mt-1.5 text-[10px]">
                        <span className="line-through text-red-400">{change.before}</span>
                        <span className="text-stone-400">→</span>
                        <span className="text-green-600 font-medium">{change.after}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Status messages */}
          {applied && (
            <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
              <span>✅</span>
              <span>Changes applied successfully! The module has been updated.</span>
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex items-center justify-end gap-3">
          {!applied ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying}
                className="px-5 py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {applying ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>Confirm & Apply Changes</>
                )}
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-medium bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};


function buildProposedChanges(suggestion: any): ProposedChange[] {
  const changes: ProposedChange[] = [];
  const reasons: string[] = suggestion.reasons || [];
  const rec: string = suggestion.recommendation || '';

  // Parse the recommendation to generate specific changes
  if (rec.toLowerCase().includes('complexity') || rec.toLowerCase().includes('dense')) {
    changes.push({
      field: 'Complexity Level',
      description: 'Reduce module complexity to match student performance data.',
      before: '4/5',
      after: '3/5',
    });
  }

  if (rec.toLowerCase().includes('reading') || rec.toLowerCase().includes('source')) {
    changes.push({
      field: 'Recommended Readings',
      description: 'Add an introductory reading to help students build foundational knowledge before the main content.',
    });
  }

  if (rec.toLowerCase().includes('assessment') || rec.toLowerCase().includes('checkpoint')) {
    changes.push({
      field: 'Assessment Structure',
      description: 'Split the current assignment into two smaller checkpoints for incremental evaluation.',
    });
  }

  if (rec.toLowerCase().includes('case study') || rec.toLowerCase().includes('practical')) {
    changes.push({
      field: 'Learning Materials',
      description: 'Supplement theory-heavy sections with a real-world case study or practical exercise.',
    });
  }

  if (rec.toLowerCase().includes('peer') || rec.toLowerCase().includes('discussion') || rec.toLowerCase().includes('collaborative')) {
    changes.push({
      field: 'Learning Activities',
      description: 'Add a peer discussion activity before the main assignment to boost engagement.',
    });
  }

  if (rec.toLowerCase().includes('optional')) {
    changes.push({
      field: 'Reading Priority',
      description: 'Reclassify excess readings from "required" to "optional" to reduce cognitive load.',
    });
  }

  // Fallback if nothing matched
  if (changes.length === 0) {
    changes.push({
      field: 'Module Content',
      description: rec,
    });
  }

  // Add status update change
  changes.push({
    field: 'Change Log',
    description: 'Mark this suggestion as "applied" in the system records.',
    before: 'pending',
    after: 'applied',
  });

  return changes;
}

export default CurriculumApplyModal;
