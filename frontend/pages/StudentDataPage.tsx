/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: number;
  topic: string;
  level: string;
  course_code: string;
  course_type: string;
  module_count: number;
}

interface AnalyticsEvent {
  agent: string;
  status: string;
  message: string;
  result?: any;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  orchestrator: 'Orchestrator',
  behavior_analyst: 'Behavior Analyst',
  risk_detector: 'Risk Detector',
  content_optimizer: 'Content Optimizer',
  cohort_comparator: 'Cohort Comparator',
  report: 'Report',
  system: 'System',
};

const STATUS_COLORS: Record<string, string> = {
  done: 'bg-green-400',
  success: 'bg-green-400',
  error: 'bg-red-400',
  retry: 'bg-yellow-400',
  running: 'bg-amber-400 animate-pulse',
  dispatching: 'bg-blue-400 animate-pulse',
  aggregating: 'bg-purple-400 animate-pulse',
};

// ─── Page Component ───────────────────────────────────────────────────────────

const StudentDataPage: React.FC = () => {
  const [courses, setCourses] = useState<HistoryEntry[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('summary');
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const exportRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      setSidebarWidth(Math.min(400, Math.max(180, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      isResizing.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Load courses
  useEffect(() => {
    fetch('/api/history')
      .then(r => r.json())
      .then(d => setCourses(d.history || []))
      .catch(() => {});
  }, []);

  // Close export dropdown
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
  }, [events]);

  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  const runAnalysis = () => {
    if (!selectedCourseId) return;
    setLoading(true);
    setEvents([]);
    setReport(null);

    const evtSource = new EventSource(`/api/analytics/report/${selectedCourseId}`);
    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setEvents(prev => [...prev, data]);
        if (data.status === 'done' && data.agent === 'report') {
          evtSource.close();
          setLoading(false);
          if (data.result) setReport(data.result);
        }
      } catch {}
    };
    evtSource.onerror = () => {
      evtSource.close();
      setLoading(false);
      setEvents(prev => [...prev, { agent: 'system', status: 'error', message: 'Connection lost.' }]);
    };
  };

  // Also fetch sync report for when we want the full data
  const fetchReport = async () => {
    if (!selectedCourseId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/report/${selectedCourseId}/sync`);
      const data = await res.json();
      setReport(data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  // Nav items
  const sections = [
    { id: 'summary', label: 'Executive Summary', icon: '📋' },
    { id: 'behavior', label: 'Behavior Analysis', icon: '📈' },
    { id: 'risk', label: 'Risk Assessment', icon: '⚠️' },
    { id: 'content', label: 'Content Optimization', icon: '🔧' },
    { id: 'cohort', label: 'Cohort Comparison', icon: '👥' },
    { id: 'overview', label: 'Overview & Actions', icon: '📊' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link
          to="/courses"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
        >
          <ChevronLeft size={16} />
          Dashboard
        </Link>
        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">
            Student Data Analytics
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside style={{ width: sidebarWidth }} className="bg-stone-900 flex flex-col shrink-0 overflow-y-auto relative">

          {/* Course selector */}
          <div className="p-3 border-b border-stone-700">
            <label className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Select Course</label>
            <select
              id="sd-course-select"
              value={selectedCourseId ?? ''}
              onChange={e => {
                const val = e.target.value ? Number(e.target.value) : null;
                setSelectedCourseId(val);
                setReport(null);
                setEvents([]);
              }}
              className="w-full text-xs bg-stone-800 text-stone-200 border border-stone-600 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500"
              style={{ textOverflow: 'ellipsis' }}
            >
              <option value="">Choose…</option>
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.topic} ({c.level})</option>
              ))}
            </select>
          </div>

          {/* Course info */}
          {selectedCourse && (
            <div className="px-3 py-2.5 border-b border-stone-700 space-y-1">
              <p className="text-xs text-amber-400 font-medium leading-snug">{selectedCourse.topic}</p>
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">{selectedCourse.level}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">{selectedCourse.course_type}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">{selectedCourse.module_count} modules</span>
              </div>
              {selectedCourse.course_code && (
                <p className="text-[10px] text-stone-500">{selectedCourse.course_code}</p>
              )}
            </div>
          )}

          {/* Analysis actions */}
          <div className="p-3 border-b border-stone-700 space-y-2">
            <button
              id="sd-btn-run"
              disabled={!selectedCourseId || loading}
              onClick={runAnalysis}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <><span className="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full" /> Running…</>
              ) : (
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Full Analysis</>
              )}
            </button>

            {/* Export dropdown */}
            <div className="relative" ref={exportRef}>
              <button
                id="sd-btn-export"
                disabled={!selectedCourseId}
                onClick={() => setExportOpen(!exportOpen)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export Report ▾
              </button>
              {exportOpen && selectedCourseId && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-30 py-1">
                  {[
                    { label: '📄 PDF Report', path: 'pdf' },
                    { label: '📝 DOCX Report', path: 'docx' },
                    { label: '📊 Excel Data', path: 'excel' },
                  ].map(exp => (
                    <a
                      key={exp.path}
                      href={`/api/analytics/export/${exp.path}/${selectedCourseId}`}
                      className="block px-3 py-2 text-xs text-stone-300 hover:bg-stone-700 hover:text-amber-400 transition-colors"
                      onClick={() => setExportOpen(false)}
                    >
                      {exp.label}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section nav */}
          <nav className="flex-1 p-2 space-y-0.5">
            {sections.map(s => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                disabled={!report && s.id !== 'summary'}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs transition-all flex items-center gap-2 ${
                  activeSection === s.id
                    ? 'bg-stone-700 text-white'
                    : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200 disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
              >
                <span>{s.icon}</span>
                <span className="leading-snug">{s.label}</span>
              </button>
            ))}
          </nav>

          {/* Agent status */}
          {report?.agent_performance && (
            <div className="p-3 border-t border-stone-700">
              <p className="text-[10px] uppercase tracking-wider text-stone-500 mb-2">Agent Status</p>
              <div className="space-y-1">
                {Object.entries(report.agent_performance).map(([name, perf]: [string, any]) => (
                  <div key={name} className="flex items-center gap-1.5 text-[10px]">
                    <span className={`w-1.5 h-1.5 rounded-full ${perf.status === 'success' ? 'bg-green-400' : perf.status === 'fallback' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                    <span className="text-stone-400 flex-1">{AGENT_LABELS[name] || name}</span>
                    <span className="text-stone-600">{perf.duration_ms}ms</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Drag handle */}
          <div
            onMouseDown={startResize}
            className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-amber-500/30 active:bg-amber-500/50 transition-colors z-10"
          />
        </aside>

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedCourseId ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M9 21V9"/>
              </svg>
              <p className="text-sm">Select a course from the sidebar to begin analysis</p>
            </div>
          ) : !report && events.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-3">
              <p className="text-lg font-serif text-stone-700">{selectedCourse?.topic}</p>
              <p className="text-sm">Click <strong>"Run Full Analysis"</strong> to generate the report</p>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Console output */}
              {events.length > 0 && (
                <div ref={consoleRef} className="bg-stone-900 rounded-xl p-4 max-h-48 overflow-y-auto font-mono text-xs space-y-1 shadow-lg">
                  {events.map((ev, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`shrink-0 w-2 h-2 rounded-full mt-1 ${STATUS_COLORS[ev.status] || 'bg-stone-500'}`} />
                      <span className="text-stone-400">
                        <span className="text-amber-400">[{AGENT_LABELS[ev.agent] || ev.agent}]</span>{' '}
                        {ev.message}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Report sections */}
              {report && (
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
                        {/* Verb distribution */}
                        <div>
                          <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Learning Activity Distribution</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {Object.entries(report.behavior_analysis?.verb_distribution || {}).map(([verb, count]: [string, any]) => (
                              <div key={verb} className="bg-stone-50 rounded-lg p-3 text-center border border-stone-100">
                                <p className="text-lg font-semibold text-stone-800">{count}</p>
                                <p className="text-xs text-stone-500 capitalize">{verb}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Module engagement */}
                        <div>
                          <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Module Engagement</h4>
                          <div className="space-y-2">
                            {(report.behavior_analysis?.module_engagement || []).map((m: any, i: number) => (
                              <div key={i} className="flex items-center gap-3 text-sm">
                                <span className="shrink-0 max-w-[280px] text-stone-600 text-xs" title={m.module_name}>{m.module_name}</span>
                                <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-amber-400 transition-all"
                                    style={{ width: `${Math.min(100, (m.completion_rate || 0) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs text-stone-500 w-12 text-right">{((m.completion_rate || 0) * 100).toFixed(0)}%</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Peak hours */}
                        {report.behavior_analysis?.engagement_metrics?.peak_activity_hours && (
                          <div>
                            <h4 className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Peak Activity Hours</h4>
                            <div className="flex gap-2">
                              {report.behavior_analysis.engagement_metrics.peak_activity_hours.map((h: number, i: number) => (
                                <span key={i} className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-medium">
                                  {h}:00
                                </span>
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
                        {/* Distribution */}
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
                        {/* At-risk table */}
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
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        s.risk_level === 'high' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                      }`}>
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
                        {/* Insights */}
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

                  {/* Overview & Action Items */}
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
                            {/* Generate recommendations from data */}
                            {(report.risk_assessment?.at_risk_students || []).length > 5 && (
                              <ActionItem
                                priority="high"
                                text={`${report.risk_assessment.at_risk_students.length} students are at risk. Consider scheduling 1-on-1 check-ins with high-risk students and providing supplementary materials.`}
                              />
                            )}
                            {(report.content_optimization?.underperforming_content || []).map((m: any, i: number) => (
                              <ActionItem
                                key={i}
                                priority="medium"
                                text={`Module "${m.module_name}" has a ${(m.struggle_rate * 100).toFixed(0)}% struggle rate. ${m.suggestions?.[0] || 'Review and simplify content.'}`}
                              />
                            ))}
                            {report.cohort_comparison?.groups?.disengaged?.count > 3 && (
                              <ActionItem
                                priority="medium"
                                text={`${report.cohort_comparison.groups.disengaged.count} students show disengaged behavior. Consider implementing engagement incentives or reaching out personally.`}
                              />
                            )}
                            {(report.behavior_analysis?.engagement_metrics?.peak_activity_hours || []).some((h: number) => h >= 22 || h <= 5) && (
                              <ActionItem
                                priority="low"
                                text="Unusual late-night/early-morning activity detected. This may indicate students in different time zones or poor time management."
                              />
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
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

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

export default StudentDataPage;
