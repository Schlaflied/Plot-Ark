/**
 * ReportSections — Analytics report display sections for StudentDataPage.
 */

import React from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnalyticsReport {
  course_id: number;
  generated_at: string;
  executive_summary: string[];
  behavior_analysis: any;
  risk_assessment: any;
  content_optimization: any;
  cohort_comparison: any;
  agent_performance: Record<string, { status: string; duration_ms: number; retries: number }>;
}

interface ReportSectionsProps {
  report: AnalyticsReport;
  activeSection: string;
  selectedCourse: { topic: string; level: string; course_type: string; module_count: number } | undefined;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; icon: string; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
    <div className="flex items-center gap-2 px-6 py-3 border-b border-stone-100 bg-stone-50">
      <span>{icon}</span>
      <h2 className="font-semibold text-sm text-stone-800">{title}</h2>
    </div>
    <div className="px-6 py-4">{children}</div>
  </div>
);

const ActionItem: React.FC<{ priority: 'high' | 'medium' | 'low'; text: string }> = ({ priority, text }) => {
  const colors = {
    high: 'border-red-200 bg-red-50 text-red-800',
    medium: 'border-yellow-200 bg-yellow-50 text-yellow-800',
    low: 'border-stone-200 bg-stone-50 text-stone-700',
  };
  const labels = { high: '🔴 HIGH', medium: '🟡 MEDIUM', low: '⚪ LOW' };
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${colors[priority]}`}>
      <span className="text-xs font-bold shrink-0 mt-0.5">{labels[priority]}</span>
      <p className="text-sm">{text}</p>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const ReportSections: React.FC<ReportSectionsProps> = ({ report, activeSection, selectedCourse }) => {
  return (
    <>
      {/* Header */}
      <div className="bg-white rounded-xl border border-stone-200 p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-serif text-stone-900 mb-1">{selectedCourse?.topic}</h1>
            <div className="flex flex-wrap gap-2 text-xs text-stone-500">
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{selectedCourse?.level}</span>
              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{selectedCourse?.course_type}</span>
              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">{selectedCourse?.module_count} modules</span>
            </div>
          </div>
          <span className="text-xs text-stone-400">{report.generated_at?.slice(0, 10)}</span>
        </div>
      </div>

      {/* Executive Summary */}
      {activeSection === 'summary' && (
        <Section title="Executive Summary" icon="📋">
          <div className="space-y-2">
            {report.executive_summary?.map((point: string, i: number) => (
              <div key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                <p className="text-sm text-stone-600">{point}</p>
              </div>
            ))}
            {(!report.executive_summary || report.executive_summary.length === 0) && (
              <p className="text-sm text-stone-400 italic">No summary data available.</p>
            )}
          </div>
        </Section>
      )}

      {/* Behavior Analysis */}
      {activeSection === 'behavior' && (
        <Section title="Behavior Analysis" icon="📈">
          <div className="space-y-4">
            <div>
              {(() => {
                const verbDist: Record<string, number> = report.behavior_analysis?.verb_distribution || {};
                const MASTERY_VERBS = ["completed", "passed"];
                const STRUGGLE_VERBS = ["struggled", "failed"];
                const total = Object.values(verbDist).reduce((sum, c) => sum + (c as number), 0);

                const groups = [
                  {
                    key: "mastery",
                    label: "Mastery",
                    verbs: MASTERY_VERBS,
                    cardCls: "border-green-300 bg-green-50",
                    countCls: "text-green-700",
                    pillCls: "bg-green-100 text-green-700",
                  },
                  {
                    key: "struggle",
                    label: "Struggle",
                    verbs: STRUGGLE_VERBS,
                    cardCls: "border-red-300 bg-red-50",
                    countCls: "text-red-700",
                    pillCls: "bg-red-100 text-red-700",
                  },
                  {
                    key: "engagement",
                    label: "Engagement",
                    verbs: Object.keys(verbDist).filter(v => !MASTERY_VERBS.includes(v) && !STRUGGLE_VERBS.includes(v)),
                    cardCls: "border-amber-200 bg-amber-50",
                    countCls: "text-amber-700",
                    pillCls: "bg-amber-100 text-amber-700",
                  },
                ];

                return (
                  <>
                    <div className="flex items-baseline justify-between mb-2">
                      <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Learning Activity Distribution</h4>
                      {total > 0 && (
                        <span className="text-xs text-stone-400">
                          Total: {total} learning events across {report.risk_assessment?.total_students_analyzed || 0} students
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {groups.map(g => {
                        const groupCount = g.verbs.reduce((sum, v) => sum + ((verbDist[v] as number) || 0), 0);
                        const pct = total > 0 ? ((groupCount / total) * 100).toFixed(1) : "0.0";
                        const breakdown = g.verbs.filter(v => verbDist[v] != null);
                        return (
                          <div key={g.key} className={`rounded-xl border p-3 ${g.cardCls}`}>
                            <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${g.countCls}`}>{g.label}</p>
                            <p className={`text-2xl font-bold leading-tight ${g.countCls}`}>{groupCount}</p>
                            <p className="text-xs text-stone-400 mb-2">{pct}% of total</p>
                            <div className="flex flex-wrap gap-1">
                              {breakdown.map(v => (
                                <span key={v} className={`px-1.5 py-0.5 rounded text-xs font-medium ${g.pillCls}`}>
                                  {v}: {verbDist[v]}
                                </span>
                              ))}
                              {breakdown.length === 0 && (
                                <span className="text-xs text-stone-400 italic">no data</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Module Engagement</h4>
              <div className="space-y-2">
                {(report.behavior_analysis?.module_engagement || []).map((m: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="shrink-0 max-w-[280px] text-stone-600 text-xs" title={m.module_name}>{m.module_name}</span>
                    <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                      <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, (m.completion_rate || 0) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-stone-500 w-12 text-right">{((m.completion_rate || 0) * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
            {report.behavior_analysis?.engagement_metrics?.peak_activity_hours && (
              <div>
                <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Peak Activity Hours</h4>
                <div className="flex gap-2">
                  {report.behavior_analysis.engagement_metrics.peak_activity_hours.map((h: number, i: number) => (
                    <span key={i} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium">{h}:00</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Risk Assessment */}
      {activeSection === 'risk' && (
        <Section title="Risk Assessment" icon="⚠️">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {['low', 'medium', 'high'].map(level => {
                const count = report.risk_assessment?.risk_distribution?.[level] || 0;
                const colors: Record<string, string> = {
                  low: 'bg-green-50 border-green-200 text-green-700',
                  medium: 'bg-yellow-50 border-yellow-200 text-yellow-700',
                  high: 'bg-red-50 border-red-200 text-red-700',
                };
                return (
                  <div key={level} className={`rounded-xl p-4 text-center border ${colors[level]}`}>
                    <p className="text-2xl font-bold">{count}</p>
                    <p className="text-xs uppercase tracking-wider font-medium">{level} Risk</p>
                  </div>
                );
              })}
            </div>
            {(report.risk_assessment?.at_risk_students || []).length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-stone-500 uppercase tracking-wider border-b border-stone-200">
                      <th className="pb-2 pr-3">Name</th>
                      <th className="pb-2 pr-3">Risk</th>
                      <th className="pb-2 pr-3">Score</th>
                      <th className="pb-2">Key Signals</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {report.risk_assessment.at_risk_students.slice(0, 20).map((s: any, i: number) => (
                      <tr key={i} className="hover:bg-stone-50">
                        <td className="py-2 pr-3 text-stone-700">{s.name}</td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {s.risk_level?.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-stone-600">{s.risk_score}</td>
                        <td className="py-2 text-xs text-stone-500">{(s.signals || []).slice(0, 2).join(' · ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Content Optimization */}
      {activeSection === 'content' && (
        <Section title="Content Optimization" icon="🔧">
          <div className="space-y-4">
            {(report.content_optimization?.underperforming_content || []).length > 0 ? (
              <>
                <h4 className="text-xs font-semibold text-red-500 uppercase tracking-wider">Modules Needing Attention</h4>
                {report.content_optimization.underperforming_content.map((m: any, i: number) => (
                  <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h5 className="font-semibold text-sm text-stone-800">{m.module_name}</h5>
                      <div className="flex gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600">Struggle: {(m.struggle_rate * 100).toFixed(0)}%</span>
                        <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600">Completion: {(m.completion_rate * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    {m.suggestions?.map((s: string, j: number) => (
                      <div key={j} className="flex items-start gap-2 text-xs text-stone-600">
                        <span className="text-amber-500">→</span>
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-stone-400 italic">No underperforming content identified. All modules performing well.</p>
            )}
            {(report.content_optimization?.high_performing_content || []).length > 0 && (
              <>
                <h4 className="text-xs font-semibold text-green-500 uppercase tracking-wider mt-4">High Performing Content</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {report.content_optimization.high_performing_content.map((m: any, i: number) => (
                    <div key={i} className="bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-sm font-medium text-stone-700">{m.module_name}</p>
                      <p className="text-xs text-green-600">Completion: {(m.completion_rate * 100).toFixed(0)}%</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {/* Cohort Comparison */}
      {activeSection === 'cohort' && (
        <Section title="Cohort Comparison" icon="👥">
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(report.cohort_comparison?.groups || {}).map(([name, data]: [string, any]) => {
                const colors: Record<string, string> = {
                  high_performers: 'border-green-200 bg-green-50',
                  average: 'border-stone-200 bg-stone-50',
                  at_risk: 'border-yellow-200 bg-yellow-50',
                  disengaged: 'border-red-200 bg-red-50',
                };
                return (
                  <div key={name} className={`rounded-xl p-4 border ${colors[name] || 'bg-stone-50 border-stone-200'}`}>
                    <p className="text-xs text-stone-500 uppercase tracking-wider mb-1">{name.replace(/_/g, ' ')}</p>
                    <p className="text-2xl font-bold text-stone-800">{data.count}</p>
                    <div className="mt-2 text-xs text-stone-500 space-y-0.5">
                      <p>Completion: {(data.avg_completion * 100).toFixed(0)}%</p>
                      <p>Struggle: {(data.avg_struggle * 100).toFixed(0)}%</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Key Insights</h4>
              <div className="space-y-2">
                {(report.cohort_comparison?.insights || []).map((insight: string, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                    <p className="text-sm text-stone-600">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Overview & Actions */}
      {activeSection === 'overview' && (
        <Section title="Overview & Recommended Actions" icon="📊">
          <div className="space-y-5">
            <div className="prose prose-sm max-w-none text-stone-600">
              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Data Summary</h4>
              <ul className="list-disc pl-4 space-y-1 text-sm">
                <li><strong>Total students analyzed:</strong> {report.risk_assessment?.total_students_analyzed || 0}</li>
                <li><strong>At-risk students:</strong> {report.risk_assessment?.at_risk_students?.length || 0} ({report.risk_assessment?.at_risk_students?.filter((s: any) => s.risk_level === 'high').length || 0} high-risk)</li>
                <li><strong>Underperforming modules:</strong> {report.content_optimization?.underperforming_content?.length || 0}</li>
                <li><strong>High-performing modules:</strong> {report.content_optimization?.high_performing_content?.length || 0}</li>
                {report.cohort_comparison?.groups?.disengaged?.count > 0 && (
                  <li><strong>Disengaged students:</strong> {report.cohort_comparison.groups.disengaged.count} ({((report.cohort_comparison.groups.disengaged.count / Math.max(report.risk_assessment?.total_students_analyzed || 1, 1)) * 100).toFixed(0)}%)</li>
                )}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Recommended Improvements</h4>
              <div className="space-y-2">
                {(report.risk_assessment?.at_risk_students || []).length > 5 && (
                  <ActionItem priority="high" text={`${report.risk_assessment.at_risk_students.length} students are at risk. Consider scheduling 1-on-1 check-ins with high-risk students and providing supplementary materials.`} />
                )}
                {(report.content_optimization?.underperforming_content || []).map((m: any, i: number) => (
                  <ActionItem key={i} priority="medium" text={`Module "${m.module_name}" has a ${(m.struggle_rate * 100).toFixed(0)}% struggle rate. ${m.suggestions?.[0] || 'Review and simplify content.'}`} />
                ))}
                {report.cohort_comparison?.groups?.disengaged?.count > 3 && (
                  <ActionItem priority="medium" text={`${report.cohort_comparison.groups.disengaged.count} students show disengaged behavior. Consider implementing engagement incentives or reaching out personally.`} />
                )}
                {(report.behavior_analysis?.engagement_metrics?.peak_activity_hours || []).some((h: number) => h >= 22 || h <= 5) && (
                  <ActionItem priority="low" text="Unusual late-night/early-morning activity detected. This may indicate students in different time zones or poor time management." />
                )}
                {(report.risk_assessment?.at_risk_students || []).length === 0 &&
                 (report.content_optimization?.underperforming_content || []).length === 0 && (
                  <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
                    ✅ No critical issues found. Continue monitoring student progress.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>
      )}
    </>
  );
};

export default ReportSections;
