/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import ReportSections from '../components/analytics/ReportSections';

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
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('summary');
  const [noiseRatio, setNoiseRatio] = useState<number>(0.15);
  const [seeding, setSeeding] = useState(false);
  const [seedDone, setSeedDone] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const exportRef = useRef<HTMLDivElement>(null);
  const courseDropdownRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    fetch('/api/history').then(r => r.json()).then(d => setCourses(d.history || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (courseDropdownRef.current && !courseDropdownRef.current.contains(e.target as Node)) setCourseDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const reseedData = async (ratio: number) => {
    setSeeding(true);
    setSeedDone(false);
    try {
      await fetch(`/api/xapi/seed?noise=${ratio}`, { method: 'POST' });
      setSeedDone(true);
      setTimeout(() => setSeedDone(false), 3000);
    } catch {}
    setSeeding(false);
  };

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

      {/* Top Bar */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link to="/courses" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium">
          <ChevronLeft size={16} /> Dashboard
        </Link>
        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">Student Data Analytics</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside style={{ width: sidebarWidth }} className="bg-stone-900 flex flex-col shrink-0 overflow-y-auto relative">
          {/* Course selector */}
          <div className="p-3 border-b border-stone-700">
            <label className="text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 block">Select Course</label>
            <div className="relative" ref={courseDropdownRef}>
              <button
                onClick={() => setCourseDropdownOpen(o => !o)}
                className="w-full flex items-center justify-between text-xs bg-stone-800 text-stone-200 border border-stone-600 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-amber-500 hover:border-stone-500 transition-colors"
              >
                <span className="truncate">
                  {selectedCourse ? selectedCourse.topic : 'Choose…'}
                </span>
                <svg className={`ml-1 shrink-0 transition-transform ${courseDropdownOpen ? 'rotate-180' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              {courseDropdownOpen && (
                <div className="absolute z-50 mt-1 w-full bg-stone-800 border border-stone-700 rounded-lg shadow-xl overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <button
                      onClick={() => { setSelectedCourseId(null); setReport(null); setEvents([]); setCourseDropdownOpen(false); }}
                      className="w-full text-left px-3 py-2 text-xs text-stone-500 hover:bg-stone-700 transition-colors"
                    >
                      Choose…
                    </button>
                    {courses.map(c => (
                      <button
                        key={c.id}
                        onClick={() => { setSelectedCourseId(c.id); setReport(null); setEvents([]); setCourseDropdownOpen(false); }}
                        className={`w-full text-left px-3 py-2 text-xs transition-colors truncate block ${
                          selectedCourseId === c.id
                            ? 'border-l-2 border-amber-500 bg-amber-500/10 text-amber-400 pl-2.5'
                            : 'text-stone-300 hover:bg-stone-700 border-l-2 border-transparent'
                        }`}
                        title={`${c.topic} (${c.level})`}
                      >
                        {c.topic} ({c.level})
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
              {selectedCourse.course_code && <p className="text-[10px] text-stone-500">{selectedCourse.course_code}</p>}
            </div>
          )}

          {/* Noise level selector */}
          <div className="p-3 border-b border-stone-700 space-y-2">
            <label className="text-[10px] uppercase tracking-wider text-stone-500 block">Mock Data Noise Level</label>
            <div className="grid grid-cols-4 gap-1">
              {[0.05, 0.10, 0.15, 0.20].map(n => (
                <button
                  key={n}
                  disabled={seeding}
                  onClick={() => { setNoiseRatio(n); reseedData(n); }}
                  className={`py-1.5 rounded text-[10px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    noiseRatio === n
                      ? seedDone ? 'bg-green-600 text-white' : seeding ? 'bg-amber-600 text-white' : 'bg-amber-500 text-white'
                      : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                  }`}
                >
                  {noiseRatio === n && seeding
                    ? <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : noiseRatio === n && seedDone
                    ? '✓'
                    : `${(n * 100).toFixed(0)}%`}
                </button>
              ))}
            </div>
          </div>

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
                <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg> Run Full Analysis</>
              )}
            </button>
            <div className="relative" ref={exportRef}>
              <button
                id="sd-btn-export"
                disabled={!selectedCourseId}
                onClick={() => setExportOpen(!exportOpen)}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-stone-700 text-stone-300 hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                Export Report ▾
              </button>
              {exportOpen && selectedCourseId && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-stone-800 border border-stone-600 rounded-lg shadow-xl z-30 py-1">
                  {[
                    { label: '📄 PDF Report', path: 'pdf' },
                    { label: '📝 DOCX Report', path: 'docx' },
                    { label: '📊 Excel Data', path: 'excel' },
                  ].map(exp => (
                    <a key={exp.path} href={`/api/analytics/export/${exp.path}/${selectedCourseId}`} className="block px-3 py-2 text-xs text-stone-300 hover:bg-stone-700 hover:text-amber-400 transition-colors" onClick={() => setExportOpen(false)}>
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
          <div onMouseDown={startResize} className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-amber-500/30 active:bg-amber-500/50 transition-colors z-10" />
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {!selectedCourseId ? (
            <div className="flex flex-col items-center justify-center h-full text-stone-400 gap-3">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stone-300">
                <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
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
                <ReportSections report={report} activeSection={activeSection} selectedCourse={selectedCourse} />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default StudentDataPage;
