/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Cpu,
  Moon,
  Settings,
  BookOpen,
  Network,
} from 'lucide-react';
import jsPDF from 'jspdf';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// ─── SortableModuleItem ───────────────────────────────────────────────────────

interface SortableModuleItemProps {
  id: string;
  index: number;
  module: Module;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

const SortableModuleItem: React.FC<SortableModuleItemProps> = ({ id, index, module, isActive, onSelect, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1 group">
      <button
        {...attributes}
        {...listeners}
        className="p-1 text-stone-600 hover:text-stone-400 cursor-grab active:cursor-grabbing shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Drag to reorder"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
          <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
          <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
          <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
        </svg>
      </button>
      <button
        onClick={onSelect}
        className={`flex-1 text-left px-2 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 min-w-0 ${
          isActive ? 'bg-stone-700 text-white' : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
        }`}
      >
        <span className="font-mono text-xs opacity-40 w-4 shrink-0">{index + 1}</span>
        <span className="flex-1 leading-snug text-xs break-words min-w-0" title={module.title}>{module.title}</span>
        <span className="flex gap-0.5 shrink-0">
          {[1, 2, 3, 4, 5].map(n => (
            <span key={n} className={`w-1.5 h-1.5 rounded-full ${
              n <= Number(module.complexity_level)
                ? isActive ? 'bg-amber-400' : 'bg-stone-500'
                : isActive ? 'bg-white/20' : 'bg-stone-700'
            }`} />
          ))}
        </span>
      </button>
      <button
        onClick={onDelete}
        className="p-1 text-stone-700 hover:text-red-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Delete module"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  );
};

// ─── CoursePage ───────────────────────────────────────────────────────────────

const CoursePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isStudent = searchParams.get('view') === 'student';
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
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [editedModules, setEditedModules] = useState<Record<number, Partial<Module>>>({});
  const [showEditHint, setShowEditHint] = useState(true);
  const [moduleFeedback, setModuleFeedback] = useState<Record<string, string>>({});
  const isResizing = React.useRef(false);
  const navigate = useNavigate();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  useEffect(() => {
    if (!showEditHint) return;
    const timer = setTimeout(() => setShowEditHint(false), 4000);
    return () => clearTimeout(timer);
  }, [showEditHint]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const modules = curriculum?.modules ?? [];
  const mergedModules = modules.map((m, i) =>
    editedModules[i] ? { ...m, ...editedModules[i] } : m
  );
  const filteredModules = search.trim()
    ? mergedModules.filter(m => m.title.toLowerCase().includes(search.toLowerCase()))
    : mergedModules;

  const currentModule = mergedModules[currentModuleIndex] ?? null;

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

  const handleEditField = (field: string, value: any) => {
    setEditedModules(prev => ({
      ...prev,
      [currentModuleIndex]: { ...prev[currentModuleIndex], [field]: value }
    }));
    setAutoSaveStatus('saving');
    setTimeout(() => setAutoSaveStatus('saved'), 1000);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !curriculum) return;
    const oldIndex = mergedModules.findIndex((_, i) => `module-${i}` === active.id);
    const newIndex = mergedModules.findIndex((_, i) => `module-${i}` === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    // Merge edits into curriculum before reordering so nothing is lost
    const newModules = arrayMove([...mergedModules], oldIndex, newIndex);
    setCurriculum({ ...curriculum, modules: newModules });
    setEditedModules({});
    setCurrentModuleIndex(newIndex);
  };

  const handleDeleteModule = (idx: number) => {
    if (!curriculum || mergedModules.length <= 1 || isStudent) return;
    const newModules = mergedModules.filter((_, i) => i !== idx);
    setCurriculum({ ...curriculum, modules: newModules });
    setEditedModules({});
    setCurrentModuleIndex(Math.min(idx, newModules.length - 1));
  };

  const handleAddModule = () => {
    if (!curriculum || isStudent) return;
    const newModule: Module = {
      title: 'New Module',
      complexity_level: 1,
      learning_objectives: [''],
      narrative_preview: '',
      recommended_readings: [],
      assignments: [],
    };
    const newModules = [...modules, newModule];
    setCurriculum({ ...curriculum, modules: newModules });
    setCurrentModuleIndex(newModules.length - 1);
    setActiveTab('objectives');
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* ── Student Banner ──────────────────────────────────────────────── */}
      {isStudent && (
        <div className="w-full bg-green-50 border-b border-green-200 flex items-center justify-between px-6 py-2.5 text-sm shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
            <span className="font-semibold text-green-900 tracking-wide">Student View</span>
            <span className="text-xs text-green-600 font-normal">— read only</span>
          </div>
          <button
            onClick={() => navigate(`/course/${id}`)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg border border-green-300 bg-white hover:bg-green-100 transition-colors text-green-800 font-medium text-xs"
          >
            Back to Professor View
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      )}

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
            {isStudent && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-1.5">
                Course Structure
              </p>
            )}
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-500 mb-1">
              {curriculum.course_code || 'Course'}
            </p>
            <p className="font-serif text-sm text-stone-100 leading-snug line-clamp-3">
              {curriculum.topic}
            </p>
            {isStudent && (
              <p className="text-[10px] text-stone-500 mt-1">
                {modules.length} modules
              </p>
            )}
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

          {/* Knowledge Graph shortcut */}
          <div className="px-3 py-2 border-b border-stone-800">
            <button
              onClick={() => navigate('/graph', {
                state: {
                  fromCourse: id,
                  courseCode: curriculum?.course_code,
                  courseTopic: curriculum?.topic,
                }
              })}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition-colors text-xs font-semibold border border-amber-500/20"
            >
              <Network size={14} />
              Knowledge Graph
            </button>
          </div>

          {/* Module list */}
          <div className="flex-1 overflow-y-auto p-2">
            {/* Drag hint — professor only */}
            {!isStudent && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-lg bg-stone-800/60 text-stone-500 text-[10px]">
                <svg width="8" height="12" viewBox="0 0 10 14" fill="currentColor" className="shrink-0 opacity-60">
                  <circle cx="3" cy="2" r="1.2"/><circle cx="7" cy="2" r="1.2"/>
                  <circle cx="3" cy="7" r="1.2"/><circle cx="7" cy="7" r="1.2"/>
                  <circle cx="3" cy="12" r="1.2"/><circle cx="7" cy="12" r="1.2"/>
                </svg>
                Drag to reorder modules
              </div>
            )}
            {isStudent ? (
              /* ── Student view: simple read-only list ── */
              <div className="space-y-0.5">
                {mergedModules.map((mod, idx) => {
                  const isActive = idx === currentModuleIndex;
                  return (
                    <button
                      key={idx}
                      onClick={() => { setCurrentModuleIndex(idx); setActiveTab('objectives'); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-2 min-w-0 ${
                        isActive ? 'bg-stone-700 text-white' : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                      }`}
                    >
                      <span className="font-mono text-xs opacity-40 w-4 shrink-0">{idx + 1}</span>
                      <span className="flex-1 leading-snug text-xs break-words min-w-0" title={mod.title}>{mod.title}</span>
                      <span className="flex gap-0.5 shrink-0">
                        {[1, 2, 3, 4, 5].map(n => (
                          <span key={n} className={`w-1.5 h-1.5 rounded-full ${
                            n <= Number(mod.complexity_level)
                              ? isActive ? 'bg-amber-400' : 'bg-stone-500'
                              : isActive ? 'bg-white/20' : 'bg-stone-700'
                          }`} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : search.trim() ? (
              <div className="space-y-0.5">
                {filteredModules.length > 0 ? filteredModules.map((mod) => {
                  const origIdx = modules.indexOf(mod);
                  const isActive = origIdx === currentModuleIndex;
                  return (
                    <button
                      key={origIdx}
                      onClick={() => { setCurrentModuleIndex(origIdx); setActiveTab('objectives'); }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3 ${
                        isActive ? 'bg-stone-700 text-white' : 'text-stone-400 hover:bg-stone-800 hover:text-stone-200'
                      }`}
                    >
                      <span className="font-mono text-xs opacity-40 w-4 shrink-0">{origIdx + 1}</span>
                      <span className="flex-1 leading-snug text-xs break-words" title={mod.title}>{mod.title}</span>
                    </button>
                  );
                }) : <p className="py-8 text-center text-stone-600 text-xs">No modules found</p>}
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={mergedModules.map((_, i) => `module-${i}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-0.5">
                    {mergedModules.map((mod, idx) => (
                      <SortableModuleItem
                        key={`module-${idx}`}
                        id={`module-${idx}`}
                        index={idx}
                        module={mod}
                        isActive={idx === currentModuleIndex}
                        onSelect={() => { setCurrentModuleIndex(idx); setActiveTab('objectives'); }}
                        onDelete={() => handleDeleteModule(idx)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {!isStudent && (
              <button
                onClick={handleAddModule}
                className="w-full mt-2 px-3 py-2 rounded-lg text-xs text-stone-500 hover:text-amber-400 hover:bg-stone-800 transition-colors flex items-center gap-2"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add module
              </button>
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

              {/* Edit Hint — professor only */}
              {!isStudent && showEditHint && (
                <div className="flex items-center justify-between mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  <div className="flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Click any field to edit — changes save automatically
                  </div>
                  <button onClick={() => setShowEditHint(false)} className="text-amber-400 hover:text-amber-600 transition-colors">✕</button>
                </div>
              )}

              {/* Module Card */}
              <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm">

                {/* Complexity bar */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-stone-500 uppercase tracking-widest font-bold">Complexity</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      isStudent ? (
                        <div
                          key={n}
                          className={`h-2 w-7 rounded-full ${n <= Number(currentModule.complexity_level) ? 'bg-amber-500' : 'bg-stone-200'}`}
                        />
                      ) : (
                        <button
                          key={n}
                          title={`Set complexity to ${n}`}
                          onClick={() => handleEditField('complexity_level', n)}
                          className={`h-2 w-7 rounded-full transition-colors hover:opacity-80 cursor-pointer ${
                            n <= Number(currentModule.complexity_level) ? 'bg-amber-500' : 'bg-stone-200 hover:bg-amber-200'
                          }`}
                        />
                      )
                    ))}
                  </div>
                  <span className="text-xs text-stone-500 font-mono">{currentModule.complexity_level}/5</span>
                </div>

                {/* Module number + title */}
                <div className="text-amber-600 font-serif text-[27px] italic mb-2">
                  Module {currentModuleIndex + 1}
                </div>
                <div className="flex items-start gap-3 mb-6">
                  {isStudent ? (
                    <h2 className="font-serif text-[32px] text-stone-900 flex-1 px-1 py-0.5">{currentModule.title}</h2>
                  ) : (
                    <>
                      <input
                        className="font-serif text-[32px] text-stone-900 flex-1 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 rounded-t px-1 py-0.5 outline-none transition-all"
                        value={currentModule.title}
                        onChange={e => handleEditField('title', e.target.value)}
                      />
                      {autoSaveStatus !== 'idle' && (
                        <span className="text-[10px] text-stone-400 mt-3 shrink-0">
                          {autoSaveStatus === 'saving' ? 'Saving...' : '✓ Saved'}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex border-b border-stone-200 mb-6">
                  {(['objectives', 'resources', 'assessment'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors ${
                        activeTab === tab
                          ? 'border-b-2 border-amber-500 text-stone-900'
                          : 'text-stone-400 hover:text-stone-700'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {activeTab === 'objectives' && (
                  <>
                    <ul className="space-y-2 mb-4">
                      {(currentModule.learning_objectives || []).map((obj, i) => (
                        <li key={i} className="flex items-start gap-3 text-stone-700">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-2.5 flex-shrink-0" />
                          {isStudent ? (
                            <span className="leading-relaxed flex-1 text-stone-700">{obj}</span>
                          ) : (
                            <>
                              <input
                                className="leading-relaxed flex-1 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 rounded-t px-1 outline-none transition-all text-stone-700"
                                value={obj}
                                onChange={e => {
                                  const newObjs = [...(currentModule.learning_objectives || [])];
                                  newObjs[i] = e.target.value;
                                  handleEditField('learning_objectives', newObjs);
                                }}
                              />
                              <button
                                onClick={() => {
                                  const newObjs = (currentModule.learning_objectives || []).filter((_, idx) => idx !== i);
                                  handleEditField('learning_objectives', newObjs);
                                }}
                                className="text-stone-300 hover:text-red-400 transition-colors mt-0.5 shrink-0 text-xs"
                                title="Remove"
                              >✕</button>
                            </>
                          )}
                        </li>
                      ))}
                      {(currentModule.learning_objectives || []).length === 0 && (
                        <p className="text-stone-400 italic text-sm">No learning objectives listed.</p>
                      )}
                    </ul>
                    {!isStudent && (
                      <button
                        onClick={() => {
                          const newObjs = [...(currentModule.learning_objectives || []), ''];
                          handleEditField('learning_objectives', newObjs);
                        }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mb-8"
                      >
                        + Add objective
                      </button>
                    )}

                    {currentModule.narrative_preview && (
                      <div>
                        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">
                          Narrative Preview
                        </h4>
                        {isStudent ? (
                          <blockquote className="text-stone-600 leading-relaxed italic border-l-2 border-stone-300 pl-4">
                            "{currentModule.narrative_preview}"
                          </blockquote>
                        ) : (
                          <textarea
                            className="w-full text-stone-600 leading-relaxed italic border-l-2 border-stone-300 pl-4 bg-transparent focus:bg-amber-50/50 focus:border-amber-300 outline-none resize-none transition-all"
                            rows={4}
                            value={currentModule.narrative_preview || ''}
                            onChange={e => handleEditField('narrative_preview', e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── Tab: Resources ── */}
                {activeTab === 'resources' && (() => {
                  const readings = currentModule.recommended_readings || [];

                  if (isStudent) {
                    return (
                      <div className="space-y-4">
                        {readings.length === 0 && (
                          <p className="text-stone-400 italic text-sm">No readings recommended for this module.</p>
                        )}
                        {readings.map((r, ri) => (
                          <div key={ri} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs text-stone-500 bg-white border border-stone-200 rounded px-1.5 py-0.5">
                                {r.type === 'video' ? '🎬 Video' : r.type === 'news' ? '📰 News' : '📄 Academic'}
                              </span>
                              {r.estimated_time && <span className="text-xs text-stone-400">{r.estimated_time}</span>}
                              <span className={`text-xs ml-auto ${r.reading_type === 'required' ? 'text-amber-600 font-semibold' : 'text-stone-400'}`}>
                                {r.reading_type === 'required' ? 'Required' : 'Optional'}
                              </span>
                            </div>
                            <p className="font-bold text-stone-900 mb-1 leading-snug">{r.title}</p>
                            {r.url && (
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline block mb-3">{r.url}</a>
                            )}
                            {(r.key_points || []).length > 0 && (
                              <div className="mb-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Key Points</p>
                                <ul className="space-y-1">
                                  {r.key_points.map((kp, j) => (
                                    <li key={j} className="flex items-start gap-2">
                                      <span className="text-amber-500 font-bold mt-1.5 text-xs">·</span>
                                      <span className="text-sm text-stone-600">{kp}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {r.rationale && (
                              <div className="border-t border-stone-100 pt-3">
                                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Why: </span>
                                <span className="text-xs text-stone-500">{r.rationale}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  }

                  const updateReading = (ri: number, updated: Partial<Reading>) => {
                    const newReadings = readings.map((r, idx) => idx === ri ? { ...r, ...updated } : r);
                    handleEditField('recommended_readings', newReadings);
                  };
                  const removeReading = (ri: number) => {
                    handleEditField('recommended_readings', readings.filter((_, idx) => idx !== ri));
                  };

                  return (
                    <div className="space-y-4">
                      {readings.length === 0 && (
                        <p className="text-stone-400 italic text-sm">No readings recommended for this module.</p>
                      )}
                      {readings.map((r, ri) => (
                        <div key={ri} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
                          {/* Header row */}
                          <div className="flex items-center gap-2 mb-3">
                            <select
                              className="text-xs text-stone-500 bg-white border border-stone-200 rounded px-1.5 py-0.5 outline-none focus:border-amber-300 cursor-pointer"
                              value={r.type || 'academic'}
                              onChange={e => updateReading(ri, { type: e.target.value })}
                            >
                              <option value="academic">📄 Academic</option>
                              <option value="video">🎬 Video</option>
                              <option value="news">📰 News</option>
                            </select>
                            <input
                              className="text-xs text-stone-400 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 outline-none px-1 flex-1"
                              value={r.estimated_time || ''}
                              placeholder="estimated time"
                              onChange={e => updateReading(ri, { estimated_time: e.target.value })}
                            />
                            <select
                              className="text-xs text-stone-400 bg-transparent border border-stone-200 rounded px-1 py-0.5 outline-none"
                              value={r.reading_type || 'optional'}
                              onChange={e => updateReading(ri, { reading_type: e.target.value as 'required' | 'optional' })}
                            >
                              <option value="required">Required</option>
                              <option value="optional">Optional</option>
                            </select>
                            <button
                              onClick={() => removeReading(ri)}
                              className="text-stone-300 hover:text-red-400 transition-colors text-xs ml-1"
                              title="Remove reading"
                            >✕</button>
                          </div>

                          {/* Title */}
                          <input
                            className="font-bold text-stone-900 w-full bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 outline-none px-1 mb-1 leading-snug"
                            value={r.title}
                            placeholder="Title"
                            onChange={e => updateReading(ri, { title: e.target.value })}
                          />
                          <input
                            className="text-xs text-stone-400 w-full bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 outline-none px-1 mb-3"
                            value={r.url || ''}
                            placeholder="URL (optional)"
                            onChange={e => updateReading(ri, { url: e.target.value })}
                          />

                          {/* Key points */}
                          <div className="mb-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">Key Points</p>
                            <ul className="space-y-1">
                              {(r.key_points || []).map((kp, j) => (
                                <li key={j} className="flex items-start gap-2">
                                  <span className="text-amber-500 font-bold mt-1.5 text-xs">·</span>
                                  <input
                                    className="text-sm text-stone-600 flex-1 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 outline-none px-1"
                                    value={kp}
                                    onChange={e => {
                                      const newKps = [...(r.key_points || [])];
                                      newKps[j] = e.target.value;
                                      updateReading(ri, { key_points: newKps });
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      const newKps = (r.key_points || []).filter((_, idx) => idx !== j);
                                      updateReading(ri, { key_points: newKps });
                                    }}
                                    className="text-stone-300 hover:text-red-400 transition-colors text-xs mt-1 shrink-0"
                                  >✕</button>
                                </li>
                              ))}
                            </ul>
                            <button
                              onClick={() => updateReading(ri, { key_points: [...(r.key_points || []), ''] })}
                              className="text-xs text-amber-600 hover:text-amber-700 font-medium mt-1.5 flex items-center gap-1"
                            >+ Add key point</button>
                          </div>

                          {/* Rationale */}
                          <div className="border-t border-stone-100 pt-3">
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">Why: </span>
                            <input
                              className="text-xs text-stone-500 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 outline-none px-1 w-[calc(100%-3rem)]"
                              value={r.rationale || ''}
                              placeholder="Rationale…"
                              onChange={e => updateReading(ri, { rationale: e.target.value })}
                            />
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => {
                          const newReading: Reading = { title: '', key_points: [], rationale: '', reading_type: 'required' };
                          handleEditField('recommended_readings', [...readings, newReading]);
                        }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                      >+ Add reading</button>
                    </div>
                  );
                })()}

                {/* ── Tab: Assessment ── */}
                {activeTab === 'assessment' && (() => {
                  const assignments = currentModule.assignments || [];

                  if (isStudent) {
                    return (
                      <div className="space-y-4">
                        {assignments.length === 0 && (
                          <p className="text-stone-400 italic text-sm">No assignment for this module.</p>
                        )}
                        {assignments.map((a, ai) => (
                          <div key={ai} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="px-2 py-0.5 bg-stone-200 text-stone-600 text-xs font-bold rounded uppercase tracking-wide">{a.type}</span>
                              <span className="font-bold text-stone-900">{a.title}</span>
                            </div>
                            {(a.task_description || a.coverage) && (
                              <div className="mb-3">
                                <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1">Description</span>
                                <p className="text-sm text-stone-700 leading-relaxed">{a.task_description || a.coverage}</p>
                              </div>
                            )}
                            {a.deliverable && (
                              <div className="mb-2">
                                <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1">Deliverable</span>
                                <p className="text-sm text-stone-600">{a.deliverable}</p>
                              </div>
                            )}
                            {a.estimated_time && (
                              <div className="mb-3 flex items-center gap-1.5">
                                <span className="text-stone-400 text-sm">⏱</span>
                                <span className="text-sm text-stone-600">{a.estimated_time}</span>
                              </div>
                            )}
                            {(a.rubric_highlights || []).length > 0 && (
                              <div className="mt-3">
                                <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1.5">Rubric</span>
                                <ul className="space-y-1">
                                  {a.rubric_highlights!.map((point, pi) => (
                                    <li key={pi} className="flex items-start gap-2">
                                      <span className="text-stone-300 mt-1.5 text-xs">•</span>
                                      <span className="text-sm text-stone-600">{point}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  }

                  const updateAssignment = (ai: number, updated: Partial<Assignment>) => {
                    const newAssignments = assignments.map((a, idx) => idx === ai ? { ...a, ...updated } : a);
                    handleEditField('assignments', newAssignments);
                  };
                  const removeAssignment = (ai: number) => {
                    handleEditField('assignments', assignments.filter((_, idx) => idx !== ai));
                  };

                  return (
                    <div className="space-y-4">
                      {assignments.length === 0 && (
                        <p className="text-stone-400 italic text-sm">No assignment for this module.</p>
                      )}
                      {assignments.map((a, ai) => (
                        <div key={ai} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
                          {/* Type + Title row */}
                          <div className="flex items-center gap-2 mb-3">
                            <input
                              className="px-2 py-0.5 bg-stone-200 text-stone-600 text-xs font-bold rounded uppercase tracking-wide bg-transparent border border-stone-200 focus:border-amber-300 outline-none w-28"
                              value={a.type}
                              placeholder="Type"
                              onChange={e => updateAssignment(ai, { type: e.target.value })}
                            />
                            <input
                              className="font-bold text-stone-900 flex-1 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 outline-none px-1"
                              value={a.title}
                              placeholder="Assignment title"
                              onChange={e => updateAssignment(ai, { title: e.target.value })}
                            />
                            <button
                              onClick={() => removeAssignment(ai)}
                              className="text-stone-300 hover:text-red-400 transition-colors text-xs shrink-0"
                              title="Remove assignment"
                            >✕</button>
                          </div>

                          {/* Description */}
                          <div className="mb-3">
                            <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1">Description</span>
                            <textarea
                              className="w-full text-sm text-stone-700 leading-relaxed bg-transparent border border-stone-200 rounded-lg p-2 focus:border-amber-300 focus:bg-amber-50/50 outline-none resize-none transition-all"
                              rows={3}
                              value={a.task_description || a.coverage || ''}
                              placeholder="Task description…"
                              onChange={e => updateAssignment(ai, { task_description: e.target.value, coverage: '' })}
                            />
                          </div>

                          {/* Deliverable */}
                          <div className="mb-2">
                            <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1">Deliverable</span>
                            <input
                              className="w-full text-sm text-stone-600 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 outline-none px-1"
                              value={a.deliverable || ''}
                              placeholder="What students submit…"
                              onChange={e => updateAssignment(ai, { deliverable: e.target.value })}
                            />
                          </div>

                          {/* Estimated time */}
                          <div className="mb-3 flex items-center gap-1.5">
                            <span className="text-stone-400 text-sm">⏱</span>
                            <input
                              className="text-sm text-stone-600 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 outline-none px-1 flex-1"
                              value={a.estimated_time || ''}
                              placeholder="Estimated time…"
                              onChange={e => updateAssignment(ai, { estimated_time: e.target.value })}
                            />
                          </div>

                          {/* Rubric highlights */}
                          <div className="mt-3">
                            <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1.5">Rubric</span>
                            <ul className="space-y-1">
                              {(a.rubric_highlights || []).map((point, pi) => (
                                <li key={pi} className="flex items-start gap-2">
                                  <span className="text-stone-300 mt-1.5 text-xs">•</span>
                                  <input
                                    className="text-sm text-stone-600 flex-1 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 outline-none px-1"
                                    value={point}
                                    onChange={e => {
                                      const newRubric = [...(a.rubric_highlights || [])];
                                      newRubric[pi] = e.target.value;
                                      updateAssignment(ai, { rubric_highlights: newRubric });
                                    }}
                                  />
                                  <button
                                    onClick={() => {
                                      const newRubric = (a.rubric_highlights || []).filter((_, idx) => idx !== pi);
                                      updateAssignment(ai, { rubric_highlights: newRubric });
                                    }}
                                    className="text-stone-300 hover:text-red-400 transition-colors text-xs mt-1 shrink-0"
                                  >✕</button>
                                </li>
                              ))}
                            </ul>
                            <button
                              onClick={() => updateAssignment(ai, { rubric_highlights: [...(a.rubric_highlights || []), ''] })}
                              className="text-xs text-amber-600 hover:text-amber-700 font-medium mt-1.5 flex items-center gap-1"
                            >+ Add rubric point</button>
                          </div>
                        </div>
                      ))}

                      <button
                        onClick={() => {
                          const newAssignment: Assignment = { title: '', type: 'Assignment', task_description: '', rubric_highlights: [] };
                          handleEditField('assignments', [...assignments, newAssignment]);
                        }}
                        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
                      >+ Add assignment</button>
                    </div>
                  );
                })()}
              </div>

              {/* ── Student: Sentiment Feedback / Professor: Export Bar ── */}
              {isStudent ? (
                <div className="mt-8 bg-white border border-stone-200 rounded-2xl p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-stone-500 mb-4">How are you feeling about this module?</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'got-it', emoji: '🟢', label: 'Got it — I could explain this',
                        base: 'bg-white border-stone-200 text-stone-700 hover:bg-green-50',
                        active: 'bg-green-50 border-green-500 text-green-800 ring-1 ring-green-400 shadow-sm' },
                      { key: 'mostly', emoji: '🟡', label: 'Mostly got it, but unclear on parts',
                        base: 'bg-white border-stone-200 text-stone-700 hover:bg-amber-50',
                        active: 'bg-amber-50 border-amber-500 text-amber-800 ring-1 ring-amber-400 shadow-sm' },
                      { key: 'off', emoji: '🔴', label: "Something's off, not sure what",
                        base: 'bg-white border-stone-200 text-stone-700 hover:bg-red-50',
                        active: 'bg-red-50 border-red-500 text-red-800 ring-1 ring-red-400 shadow-sm' },
                      { key: 'not-read', emoji: '⚫', label: "Didn't really read it",
                        base: 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50',
                        active: 'bg-stone-100 border-stone-500 text-stone-700 ring-1 ring-stone-400 shadow-sm' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setModuleFeedback(prev => ({ ...prev, [currentModuleIndex]: opt.key }))}
                        className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all cursor-pointer ${
                          moduleFeedback[currentModuleIndex] === opt.key ? opt.active : opt.base
                        }`}
                      >
                        <span className="text-base shrink-0">{opt.emoji}</span>
                        <span className="text-left leading-snug">{opt.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Optional comment textarea (only for mostly or off) */}
                  {(moduleFeedback[currentModuleIndex] === 'mostly' || moduleFeedback[currentModuleIndex] === 'off') && (
                    <textarea
                      className="w-full mt-4 px-4 py-3 border border-stone-200 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 bg-stone-50/50 focus:bg-white focus:border-amber-300 outline-none resize-none transition-all"
                      rows={2}
                      placeholder="Anything on your mind? (optional)"
                      value={(moduleFeedback[`${currentModuleIndex}-comment`] as string) || ''}
                      onChange={e => setModuleFeedback(prev => ({ ...prev, [`${currentModuleIndex}-comment`]: e.target.value }))}
                    />
                  )}

                  {/* Submit & Skip */}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={async () => {
                        const sentiment = moduleFeedback[currentModuleIndex];
                        if (!sentiment) return;
                        const comment = moduleFeedback[`${currentModuleIndex}-comment`] || '';
                        try {
                          await fetch('/api/feedback', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              course_id: Number(id),
                              module_index: currentModuleIndex,
                              module_title: currentModule.title,
                              sentiment,
                              comment,
                              student_id: 'anonymous',
                            }),
                          });
                          setModuleFeedback(prev => ({ ...prev, [`${currentModuleIndex}-submitted`]: 'true' }));
                        } catch (err) {
                          console.error('Feedback submit error:', err);
                        }
                      }}
                      disabled={!moduleFeedback[currentModuleIndex] || moduleFeedback[`${currentModuleIndex}-submitted`] === 'true'}
                      className={`px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wide transition-all ${
                        moduleFeedback[`${currentModuleIndex}-submitted`] === 'true'
                          ? 'bg-green-600 text-white cursor-default'
                          : moduleFeedback[currentModuleIndex]
                            ? 'bg-stone-900 text-white hover:bg-stone-700 cursor-pointer'
                            : 'bg-stone-200 text-stone-400 cursor-not-allowed'
                      }`}
                    >
                      {moduleFeedback[`${currentModuleIndex}-submitted`] === 'true' ? '✓ Submitted' : 'Submit'}
                    </button>
                    <button
                      onClick={() => navigateModule(1)}
                      disabled={currentModuleIndex === modules.length - 1}
                      className="text-sm text-stone-400 hover:text-stone-600 transition-colors disabled:opacity-30"
                    >
                      Skip
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-8">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Export your curriculum</p>
                  <div className="flex items-center gap-3">
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
                </div>
              )}
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
