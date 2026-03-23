/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Cpu,
  Moon,
  Settings,
  BookOpen,
} from 'lucide-react';
import jsPDF from 'jspdf';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface Reading {
  title: string;
  url?: string;
  type?: string;
  estimated_time?: string;
  key_points: string[];
  rationale: string;
  reading_type?: 'required' | 'optional';
}

interface Assignment {
  title: string;
  type: string;
  coverage?: string;
  task_description?: string;
  deliverable?: string;
  estimated_time?: string;
  covers_objectives?: string;
  rubric_highlights?: string[];
}

interface Module {
  title: string;
  complexity_level: number;
  learning_objectives: string[];
  narrative_preview: string;
  recommended_readings: Reading[];
  assignments: Assignment[];
}

interface Source {
  title?: string;
  url: string;
  domain: string;
  type?: string;
  estimated_time?: string;
  retrieved_at: string;
}

interface CourseDetail {
  topic: string;
  level: string;
  audience?: string;
  course_code: string;
  course_type: string;
  modules: Module[];
  sources: Source[];
}

// ─── CoursePage ───────────────────────────────────────────────────────────────

const CoursePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [curriculum, setCurriculum] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'objectives' | 'resources' | 'assessment'>('objectives');
  const [search, setSearch] = useState('');
  const [citationFormat, setCitationFormat] = useState<'apa' | 'mla' | 'chicago'>('apa');
  const [copiedCitation, setCopiedCitation] = useState<number | null>(null);
  const [copyMdDone, setCopyMdDone] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(224); // 224px = w-56
  const [exportOpen, setExportOpen] = useState(false);
  const isResizing = React.useRef(false);

  const startResize = (e: React.MouseEvent) => {
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(360, Math.max(160, startWidth + e.clientX - startX));
      setSidebarWidth(newWidth);
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
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-export-dropdown]')) setExportOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    fetch(`/api/history/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: CourseDetail) => {
        setCurriculum(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const modules = curriculum?.modules ?? [];
  const filteredModules = search.trim()
    ? modules.filter(m => m.title.toLowerCase().includes(search.toLowerCase()))
    : modules;

  const currentModule = modules[currentModuleIndex] ?? null;

  const navigateModule = (dir: -1 | 1) => {
    const next = currentModuleIndex + dir;
    if (next >= 0 && next < modules.length) {
      setCurrentModuleIndex(next);
      setActiveTab('objectives');
    }
  };

  // ── Loading / Error ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F8F4] flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-stone-300 border-t-amber-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-stone-400 text-sm">Loading course…</p>
        </div>
      </div>
    );
  }

  if (error || !curriculum) {
    return (
      <div className="min-h-screen bg-[#F9F8F4] flex flex-col items-center justify-center">
        <p className="text-stone-400 text-sm mb-4">{error ? `Error: ${error}` : 'Course not found.'}</p>
        <Link to="/courses" className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-900 transition-colors">
          <ChevronLeft size={16} /> Back to Dashboard
        </Link>
      </div>
    );
  }

  const sources = curriculum.sources ?? [];
  const courseTitle = [curriculum.topic, curriculum.course_code].filter(Boolean).join(' — ');

  // ── Citation & Export Helpers ─────────────────────────────────────────────────

  const formatCitation = (src: Source, format: 'apa' | 'mla' | 'chicago'): string => {
    const title = src.title || src.domain;
    const domain = src.domain;
    const year = new Date(src.retrieved_at).getFullYear() || new Date().getFullYear();
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    if (format === 'apa') {
      return `${title}. (${year}). Retrieved from ${src.url}`;
    } else if (format === 'mla') {
      return `"${title}." ${domain}, ${year}, ${src.url}.`;
    } else {
      return `"${title}." ${domain}. Accessed ${today}. ${src.url}.`;
    }
  };

  const generateMarkdown = (): string => {
    if (!curriculum) return '';
    const lines: string[] = [
      `# ${curriculum.topic}`,
      `**Level:** ${curriculum.level} | **Type:** ${curriculum.course_type} | **Code:** ${curriculum.course_code}`,
      '',
    ];
    curriculum.modules.forEach((mod, i) => {
      lines.push(`## Module ${i + 1}: ${mod.title}`);
      lines.push(`**Complexity:** ${mod.complexity_level}/5`);
      lines.push('');
      if (mod.narrative_preview) {
        lines.push(`> ${mod.narrative_preview}`);
        lines.push('');
      }
      if (mod.learning_objectives?.length) {
        lines.push('**Learning Objectives**');
        mod.learning_objectives.forEach(o => lines.push(`- ${o}`));
        lines.push('');
      }
      if (mod.recommended_readings?.length) {
        lines.push('**Resources**');
        mod.recommended_readings.forEach(r => {
          lines.push(`- [${r.title}](${r.url || '#'}) *(${r.type || 'reading'})*`);
        });
        lines.push('');
      }
      if (mod.assignments?.length) {
        lines.push('**Assessment**');
        mod.assignments.forEach(a => lines.push(`- **${a.type}:** ${a.title}`));
        lines.push('');
      }
    });
    if (curriculum.sources?.length) {
      lines.push('---');
      lines.push('## Sources');
      curriculum.sources.forEach(s => lines.push(`- [${s.title || s.domain}](${s.url})`));
    }
    return lines.join('\n');
  };

  const generateCurriculumHTML = (forWord = false): string => {
    if (!curriculum) return '';
    const modules = curriculum.modules ?? [];

    const moduleSections = modules.map((mod, i) => {
      const objectives = (mod.learning_objectives || [])
        .map(o => `<li>${o}</li>`).join('');

      const readings = (mod.recommended_readings || []).map(r => {
        const link = r.url ? `<a href="${r.url}">${r.title}</a>` : r.title;
        return `<li>${link}</li>`;
      }).join('');

      const assignments = (mod.assignments || []).map(a =>
        `<div class="assessment"><strong>${a.title}</strong><p>${a.task_description || a.coverage || ''}</p></div>`
      ).join('');

      return `
      <div class="module">
        <h2>Module ${i + 1}: ${mod.title}</h2>
        ${objectives ? `<h3>Learning Objectives</h3><ul>${objectives}</ul>` : ''}
        ${readings ? `<h3>Readings</h3><ul>${readings}</ul>` : ''}
        ${assignments ? `<h3>Assessment</h3>${assignments}` : ''}
      </div>
    `;
    }).join('');

    const sources = (curriculum.sources ?? []).map(s =>
      `<li><a href="${s.url}">${s.title || s.domain}</a></li>`
    ).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${curriculum.topic}</title>
<style>
  body { font-family: Georgia, serif; max-width: 740px; margin: 40px auto; padding: 0 32px; color: #1a1a1a; font-size: 14px; line-height: 1.7; }
  .meta { color: #888; font-size: 12px; margin-bottom: 40px; border-bottom: 1px solid #eee; padding-bottom: 16px; }
  h1 { font-size: 26px; font-weight: bold; margin-bottom: 6px; }
  h2 { font-size: 18px; color: #92400e; margin-top: 36px; margin-bottom: 8px; border-bottom: 1px solid #f0e6d3; padding-bottom: 4px; }
  h3 { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: #555; margin-top: 16px; margin-bottom: 6px; }
  ul { margin: 0 0 12px 0; padding-left: 20px; }
  li { margin-bottom: 4px; }
  a { color: #92400e; }
  .assessment { background: #fafafa; border-left: 3px solid #d97706; padding: 10px 14px; margin-top: 8px; border-radius: 2px; }
  .assessment strong { display: block; margin-bottom: 4px; }
  .assessment p { margin: 0; color: #555; font-size: 13px; }
  .module { margin-bottom: 32px; }
  .sources { margin-top: 40px; border-top: 1px solid #eee; padding-top: 20px; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${curriculum.topic}</h1>
  <div class="meta">${curriculum.level} · ${curriculum.course_type} · ${modules.length} modules</div>
  ${moduleSections}
  ${sources ? `<div class="sources"><h3>Sources</h3><ul>${sources}</ul></div>` : ''}
</body>
</html>`;
  };

  const exportPDF = () => {
  if (!curriculum) return;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;
  const contentW = pageW - margin * 2;
  let y = margin;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
  };

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(28, 25, 23);
  doc.text(curriculum.topic, margin, y);
  y += 28;

  // Meta
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 113, 108);
  doc.text(`${curriculum.level} · ${curriculum.course_type} · ${(curriculum.modules || []).length} modules`, margin, y);
  y += 24;

  // Divider
  doc.setDrawColor(220, 215, 210);
  doc.line(margin, y, pageW - margin, y);
  y += 20;

  (curriculum.modules || []).forEach((mod, i) => {
    checkPage(60);

    // Module heading
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(146, 64, 14); // amber-800
    const heading = `Module ${i + 1}: ${mod.title}`;
    const headingLines = doc.splitTextToSize(heading, contentW);
    doc.text(headingLines, margin, y);
    y += headingLines.length * 18 + 10;

    // Learning Objectives
    if (mod.learning_objectives?.length) {
      checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 73, 68);
      doc.text('LEARNING OBJECTIVES', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 36, 33);
      mod.learning_objectives.forEach(obj => {
        checkPage(20);
        const lines = doc.splitTextToSize(`• ${obj}`, contentW - 10);
        doc.text(lines, margin + 6, y);
        y += lines.length * 14 + 2;
      });
      y += 6;
    }

    // Readings
    if (mod.recommended_readings?.length) {
      checkPage(30);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 73, 68);
      doc.text('READINGS', margin, y);
      y += 14;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 36, 33);
      mod.recommended_readings.forEach(r => {
        checkPage(20);
        const lines = doc.splitTextToSize(`• ${r.title}`, contentW - 10);
        doc.text(lines, margin + 6, y);
        y += lines.length * 14 + 2;
      });
      y += 6;
    }

    // Assessment
    if (mod.assignments?.length) {
      checkPage(40);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(80, 73, 68);
      doc.text('ASSESSMENT', margin, y);
      y += 14;
      mod.assignments.forEach(a => {
        checkPage(30);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(40, 36, 33);
        doc.text(a.title, margin + 6, y);
        y += 14;
        const desc = a.task_description || a.coverage || '';
        if (desc) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(90, 82, 76);
          const lines = doc.splitTextToSize(desc, contentW - 10);
          checkPage(lines.length * 13);
          doc.text(lines, margin + 6, y);
          y += lines.length * 13 + 4;
        }
      });
      y += 6;
    }

    y += 16;
  });

  // ── References section (from curriculum.sources — full Tavily list) ──
  const allSources: Source[] = curriculum.sources ?? [];
  if (allSources.length > 0) {
    checkPage(60);
    doc.setDrawColor(220, 215, 210);
    doc.line(margin, y, pageW - margin, y);
    y += 20;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(146, 64, 14);
    doc.text('References', margin, y);
    y += 20;
    allSources.forEach(src => {
      const citation = formatCitation(src, citationFormat);
      checkPage(24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(40, 36, 33);
      const citLines = doc.splitTextToSize(citation, contentW);
      doc.text(citLines, margin, y);
      y += citLines.length * 13 + 4;
    });
  }

  const filename = `${(curriculum.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}_curriculum.pdf`;
  doc.save(filename);
};

  const downloadJSON = () => {
    const blob = new Blob([JSON.stringify(curriculum, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(curriculum?.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadMarkdown = () => {
    const blob = new Blob([generateMarkdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(curriculum?.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyMarkdown = async () => {
    await navigator.clipboard.writeText(generateMarkdown());
    setCopyMdDone(true);
    setTimeout(() => setCopyMdDone(false), 2000);
  };

  const copyCitation = async (src: Source, i: number) => {
    await navigator.clipboard.writeText(formatCitation(src, citationFormat));
    setCopiedCitation(i);
    setTimeout(() => setCopiedCitation(null), 2000);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* ── Top Bar ─────────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-4 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link
          to="/courses"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
        >
          <ChevronLeft size={16} />
          Dashboard
        </Link>

        <div className="flex-1 min-w-0 px-2">
          <span className="font-serif text-stone-900 text-sm truncate block">{courseTitle}</span>
        </div>

        {/* 4-icon toolbar */}
        <div className="flex items-center gap-1">
          {[Globe, Cpu, Moon, Settings].map((Icon, i) => (
            <button
              key={i}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left Sidebar ──────────────────────────────────────────────────── */}
        <aside style={{ width: sidebarWidth }} className="shrink-0 bg-stone-900 text-stone-100 flex flex-col border-r border-stone-800 overflow-hidden relative">

          {/* Course title */}
          <div className="px-4 pt-5 pb-3 border-b border-stone-800">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">
              {curriculum.course_code || 'Course'}
            </p>
            <p className="font-serif text-sm text-stone-100 leading-snug line-clamp-3">
              {curriculum.topic}
            </p>
          </div>

          {/* Search */}
          <div className="px-3 py-2 border-b border-stone-800">
            <input
              type="text"
              placeholder="Search modules…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-stone-800 text-stone-200 placeholder:text-stone-600 text-xs rounded-md px-2.5 py-1.5 outline-none focus:ring-1 focus:ring-amber-500/50 border border-stone-700 transition"
            />
          </div>

          {/* Module list */}
          <div className="flex-1 overflow-y-auto p-2">
            {filteredModules.length > 0 ? (
              <div className="space-y-0.5">
                {filteredModules.map((mod, listIdx) => {
                  // When search is active, find original index for navigation
                  const origIdx = modules.indexOf(mod);
                  const isActive = origIdx === currentModuleIndex;
                  return (
                    <button
                      key={origIdx}
                      onClick={() => { setCurrentModuleIndex(origIdx); setActiveTab('objectives'); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3 ${
                        isActive
                          ? 'bg-stone-700 text-white'
                          : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                      }`}
                    >
                      <span className="font-mono text-xs opacity-40 w-4 shrink-0">{origIdx + 1}</span>
                      <span className="flex-1 leading-snug text-xs break-words" title={mod.title}>{mod.title}</span>
                      {/* Complexity dots */}
                      <span className="flex gap-0.5 shrink-0">
                        {[1, 2, 3, 4, 5].map(n => (
                          <span
                            key={n}
                            className={`w-1.5 h-1.5 rounded-full ${
                              n <= Number(mod.complexity_level)
                                ? isActive ? 'bg-amber-400' : 'bg-stone-500'
                                : isActive ? 'bg-white/20' : 'bg-stone-700'
                            }`}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-stone-600 text-xs">No modules found</p>
            )}
          </div>

          {/* Resize handle */}
          <div
            onMouseDown={startResize}
            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-amber-500/40 transition-colors"
          />
        </aside>

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-[#F9F8F4] p-8 lg:p-12">
          {currentModule ? (
            <>
              {/* Navigation */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => navigateModule(-1)}
                  disabled={currentModuleIndex === 0}
                  className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-lg text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span className="font-serif text-stone-600">
                  Module <span className="text-stone-900 font-bold">{currentModuleIndex + 1}</span>
                  <span className="text-stone-400"> of {modules.length}</span>
                </span>
                <button
                  onClick={() => navigateModule(1)}
                  disabled={currentModuleIndex === modules.length - 1}
                  className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-lg text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>

              {/* Module Card */}
              <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm">

                {/* Complexity bar */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-stone-500 uppercase tracking-widest font-bold">Complexity</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <div
                        key={n}
                        className={`h-2 w-7 rounded-full transition-colors ${
                          n <= Number(currentModule.complexity_level) ? 'bg-amber-500' : 'bg-stone-200'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-stone-500 font-mono">{currentModule.complexity_level}/5</span>
                </div>

                {/* Module number + title */}
                <div className="text-amber-600 font-serif text-xl italic mb-2">
                  Module {currentModuleIndex + 1}
                </div>
                <h3 className="font-serif text-2xl text-stone-900 mb-6">{currentModule.title}</h3>

                {/* Tabs */}
                <div className="flex border-b border-stone-200 mb-6">
                  {(['objectives', 'resources', 'assessment'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                        activeTab === tab
                          ? 'border-b-2 border-amber-500 text-stone-900'
                          : 'text-stone-400 hover:text-stone-700'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* ── Tab: Objectives ── */}
                {activeTab === 'objectives' && (
                  <>
                    <ul className="space-y-2 mb-8">
                      {(currentModule.learning_objectives || []).map((obj, i) => (
                        <li key={i} className="flex items-start gap-3 text-stone-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2 flex-shrink-0" />
                          <span className="leading-relaxed">{obj}</span>
                        </li>
                      ))}
                      {(currentModule.learning_objectives || []).length === 0 && (
                        <p className="text-stone-400 italic text-sm">No learning objectives listed.</p>
                      )}
                    </ul>

                    {currentModule.narrative_preview && (
                      <div>
                        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">
                          Narrative Preview
                        </h4>
                        <p className="text-stone-600 leading-relaxed italic border-l-2 border-stone-300 pl-4">
                          "{currentModule.narrative_preview}"
                        </p>
                      </div>
                    )}
                  </>
                )}

                {/* ── Tab: Resources ── */}
                {activeTab === 'resources' && (() => {
                  const readings = currentModule.recommended_readings || [];
                  const required = readings.filter(r => r.reading_type === 'required');
                  const optional = readings.filter(r => r.reading_type !== 'required');

                  const renderReadingCard = (r: Reading, ri: number) => (
                    <div key={ri} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                          {r.type === 'video' ? '🎬' : r.type === 'news' ? '📰' : '📄'} {r.type || 'academic'}
                        </span>
                        {r.estimated_time && (
                          <span className="text-xs text-stone-400">{r.estimated_time}</span>
                        )}
                      </div>
                      {r.url ? (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-bold text-stone-900 hover:text-amber-600 transition-colors mb-3 leading-snug block underline underline-offset-2 decoration-stone-300"
                        >
                          {r.title}
                        </a>
                      ) : (
                        <h5 className="font-bold text-stone-900 mb-3 leading-snug">{r.title}</h5>
                      )}
                      {r.key_points?.length > 0 && (
                        <ul className="space-y-1 mb-3">
                          {r.key_points.map((kp, j) => (
                            <li key={j} className="text-sm text-stone-600 flex items-start gap-2">
                              <span className="text-amber-500 font-bold mt-0.5">·</span>
                              <span>{kp}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {r.rationale && (
                        <div className="text-xs text-stone-500 border-t border-stone-100 pt-3 mt-3">
                          <span className="font-bold text-stone-400 uppercase tracking-wide mr-1">Why:</span>
                          {r.rationale}
                        </div>
                      )}
                    </div>
                  );

                  return (
                    <div className="space-y-4">
                      {required.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-xs font-bold tracking-widest text-amber-600 uppercase">Required Readings</div>
                          {required.map((r, ri) => renderReadingCard(r, ri))}
                        </div>
                      )}
                      {optional.length > 0 && (
                        <div className="space-y-3">
                          <div className="text-xs font-bold tracking-widest text-stone-400 uppercase">Optional Readings</div>
                          {optional.map((r, ri) => renderReadingCard(r, required.length + ri))}
                        </div>
                      )}
                      {required.length === 0 && optional.length > 0 && null /* already rendered above */}
                      {readings.length === 0 && (
                        <p className="text-stone-400 italic text-sm">No readings recommended for this module.</p>
                      )}
                    </div>
                  );
                })()}

                {/* ── Tab: Assessment ── */}
                {activeTab === 'assessment' && (
                  <div className="space-y-4">
                    {(currentModule.assignments || []).map((a, ai) => (
                      <div key={ai} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
                        <div className="flex items-center gap-2 mb-3">
                          <span className="px-2 py-0.5 bg-stone-200 text-stone-600 text-xs font-bold rounded uppercase tracking-wide">
                            {a.type}
                          </span>
                          <h5 className="font-bold text-stone-900">{a.title}</h5>
                        </div>
                        {a.task_description ? (
                          <p className="text-sm text-stone-700 leading-relaxed mb-3">{a.task_description}</p>
                        ) : a.coverage ? (
                          <p className="text-sm text-stone-600 leading-relaxed mb-3">{a.coverage}</p>
                        ) : null}
                        {a.deliverable && (
                          <div className="mb-2">
                            <span className="text-xs font-bold tracking-widest text-stone-400 uppercase">Deliverable</span>
                            <p className="text-sm text-stone-600 mt-0.5">{a.deliverable}</p>
                          </div>
                        )}
                        {a.estimated_time && (
                          <div className="mb-2 flex items-center gap-1.5">
                            <span className="text-stone-400 text-sm">⏱</span>
                            <span className="text-sm text-stone-600">{a.estimated_time}</span>
                          </div>
                        )}
                        {a.rubric_highlights && a.rubric_highlights.length > 0 && (
                          <div className="mt-3">
                            <span className="text-xs font-bold tracking-widest text-stone-400 uppercase">Rubric</span>
                            <ul className="mt-1 space-y-1">
                              {a.rubric_highlights.map((point, pi) => (
                                <li key={pi} className="flex items-start gap-2 text-sm text-stone-600">
                                  <span className="text-stone-300 mt-0.5">•</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                    {(currentModule.assignments || []).length === 0 && (
                      <p className="text-stone-400 italic text-sm">No assignment for this module.</p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Export Bar ── */}
              <div className="mt-6 flex items-center gap-3">
                {/* IMSCC */}
                <button
                  onClick={() => alert('IMSCC export requires backend — coming soon')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white text-sm font-semibold transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  IMSCC
                </button>

                {/* Copy .md */}
                <button
                  onClick={copyMarkdown}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                  {copyMdDone ? 'Copied!' : 'Copy'}
                </button>

                {/* Export dropdown */}
                <div className="relative" data-export-dropdown>
                  <button
                    onClick={() => setExportOpen(v => !v)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-stone-200 hover:bg-stone-50 text-stone-700 text-sm font-semibold transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {exportOpen && (
                    <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden z-10">
                      <button
                        onClick={() => { exportPDF(); setExportOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
                        Export PDF
                      </button>
                      <button
                        onClick={() => {
                          const html = generateCurriculumHTML(true);
                          const blob = new Blob([html], { type: 'application/msword' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${(curriculum?.topic || 'course').replace(/\s+/g, '_').slice(0, 40)}.doc`;
                          a.click();
                          URL.revokeObjectURL(url);
                          setExportOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Export DOCX
                      </button>
                      <button
                        onClick={() => { downloadMarkdown(); setExportOpen(false); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-stone-700 hover:bg-stone-50 transition-colors"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        Export Markdown
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400">
              <BookOpen size={48} className="mb-4 opacity-20" />
              <p className="font-serif text-xl">No modules found.</p>
            </div>
          )}
        </main>

        {/* ── Right Panel ───────────────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 bg-white border-l border-stone-200 overflow-y-auto flex flex-col">

          {/* Course Info */}
          <div className="px-5 py-5 border-b border-stone-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Course Info</p>
            <dl className="space-y-2">
              <div>
                <dt className="text-xs text-stone-400 uppercase tracking-wide font-bold">Level</dt>
                <dd className="text-sm text-stone-700 capitalize">{curriculum.level}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-400 uppercase tracking-wide font-bold">Type</dt>
                <dd className="text-sm text-stone-700 capitalize">{curriculum.course_type}</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-400 uppercase tracking-wide font-bold">Modules</dt>
                <dd className="text-sm text-stone-700">{modules.length}</dd>
              </div>
            </dl>
          </div>

          {/* Sources */}
          <div className="px-5 py-5 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">
              Sources <span className="text-stone-300 font-normal">({sources.length})</span>
            </p>

            {/* Citation format selector */}
            {sources.length > 0 && (
              <div className="flex items-center gap-1 mb-4">
                <div className="group relative mr-1">
                  <div className="w-4 h-4 rounded-full bg-stone-200 text-stone-500 text-[10px] font-bold flex items-center justify-center cursor-help hover:bg-amber-100 hover:text-amber-600 transition-colors">?</div>
                  <div className="absolute left-6 top-0 w-52 bg-stone-800 text-stone-200 text-[10px] leading-relaxed rounded-lg px-3 py-2 shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20">
                    Select a format to copy formatted references for your syllabus or course materials.
                  </div>
                </div>
                {(['apa', 'mla', 'chicago'] as const).map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setCitationFormat(fmt)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide transition-colors ${
                      citationFormat === fmt
                        ? 'bg-amber-100 text-amber-700 border border-amber-300'
                        : 'bg-stone-100 text-stone-400 border border-stone-200 hover:text-stone-600'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            )}

            {sources.length > 0 ? (
              <div className="space-y-3">
                {sources.map((src, i) => (
                  <div key={i} className="group">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-mono px-1 py-0.5 rounded bg-stone-100 text-stone-400">
                        {src.type === 'video' ? '🎬' : src.type === 'news' ? '📰' : '📄'} {src.type || 'web'}
                      </span>
                    </div>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-xs font-semibold text-stone-700 hover:text-amber-600 transition-colors leading-snug mb-1"
                    >
                      {src.title || src.domain}
                    </a>
                    <span className="block text-[10px] text-stone-400 truncate mb-1">{src.domain}</span>
                    <button
                      onClick={() => copyCitation(src, i)}
                      className="text-[10px] text-stone-400 hover:text-amber-600 transition-colors"
                    >
                      {copiedCitation === i ? '✓ Copied' : 'Copy citation'}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-stone-400 italic">No sources attached to this course.</p>
            )}
          </div>
        </aside>
      </div>

    </div>
  );
};

export default CoursePage;
