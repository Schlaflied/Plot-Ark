/**
 * AISuggestionsSection — Rough overview of xAPI-driven curriculum suggestions
 * displayed in the StudentDataPage sidebar tab.
 *
 * Shows a brief high-level summary and a redirect button
 * to CoursePage for detailed per-module suggestions.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';

interface AISuggestionsSectionProps {
  report: any;
  courseId: number | null;
}

const AISuggestionsSection: React.FC<AISuggestionsSectionProps> = ({ report, courseId }) => {
  const navigate = useNavigate();

  // Extract high-level signals from the analysis report
  const co = report?.content_optimization || {};
  const ra = report?.risk_assessment || {};
  const ba = report?.behavior_analysis || {};

  const underperforming = co?.underperforming_content || [];
  const atRiskCount = (ra?.at_risk_students || []).length;
  const totalStudents = ra?.total_students_analyzed || 0;
  const atRiskPct = totalStudents > 0 ? Math.round((atRiskCount / totalStudents) * 100) : 0;

  // Build rough bullet points from data
  const bullets: string[] = [];

  if (atRiskPct > 10) {
    bullets.push(`${atRiskPct}% of students are at-risk — consider reviewing module pacing and difficulty progression.`);
  }

  underperforming.forEach((m: any) => {
    if (m.struggle_rate > 0.15) {
      bullets.push(`${m.module_id} has a high struggle rate (${Math.round(m.struggle_rate * 100)}%) — consider simplifying content or adding supplementary materials.`);
    }
    if (m.negative_feedback > 1) {
      bullets.push(`${m.module_id} received negative feedback signals — review student comments for actionable insights.`);
    }
  });

  // Engagement-based suggestions
  const moduleEngagement = ba?.module_engagement || [];
  moduleEngagement.forEach((m: any) => {
    if (m.completion_rate < 0.7) {
      bullets.push(`${m.module_id} has moderate completion (${Math.round(m.completion_rate * 100)}%) — consider adding engagement hooks or breaking into smaller sections.`);
    }
  });

  // General suggestions if analysis ran but nothing specific triggered
  if (bullets.length === 0 && totalStudents > 0) {
    bullets.push('All modules are performing within normal parameters. No immediate curriculum changes recommended.');
    bullets.push('Consider running the analysis again after the next assessment cycle for updated insights.');
  }

  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-6 py-3 border-b border-stone-100 bg-stone-50">
        <span>🤖</span>
        <h2 className="font-semibold text-sm text-stone-800">AI Suggestions</h2>
        <span className="ml-auto text-xs text-stone-400">Based on xAPI analysis</span>
      </div>

      <div className="px-6 py-4 space-y-4">
        {!report ? (
          <div className="text-center py-6 text-stone-400">
            <span className="text-2xl block mb-2">📊</span>
            <p className="text-sm">Run an analysis first to see AI suggestions.</p>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                  <span className="text-amber-500 mt-0.5 shrink-0">→</span>
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>

            {courseId && (
              <button
                onClick={() => navigate(`/course/${courseId}`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-sm font-medium transition-colors shadow-sm"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                View Detailed Suggestions in Course Page →
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AISuggestionsSection;
