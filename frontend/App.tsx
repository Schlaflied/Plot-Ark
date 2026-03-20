/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useEffect, useRef } from 'react';
import { HeroScene, QuantumComputerScene } from './components/QuantumScene';
import { SurfaceCodeDiagram, TransformerDecoderDiagram } from './components/Diagrams';
import GraphViewer from './components/GraphViewer';
import { ArrowDown, Menu, X, BookOpen, Download, Copy, CheckCircle2, ChevronLeft, ChevronRight, FileText, Pencil, Plus, Trash2, Clock, Star, Network } from 'lucide-react';

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

interface CurriculumData {
  modules: Module[];
  sources: { title?: string; url: string; domain: string; type?: string; estimated_time?: string; retrieved_at: string }[];
}

interface HistoryEntry {
  id: number;
  created_at: string;
  topic: string;
  level: string;
  course_code: string;
  course_type: string;
  module_count: number;
  is_favorite: boolean;
}

interface Source {
  url: string;
  title: string;
  type: 'academic' | 'video' | 'news' | 'other';
  snippet: string;
  credibility: 'high' | 'medium' | 'low';
  tags?: string[];
}

const CITATIONS_PER_PAGE = 5;

const LEVEL_GROUPS = [
  {
    label: 'Undergraduate',
    options: [
      { value: 'undergraduate-year-1', label: 'Undergraduate Year 1' },
      { value: 'undergraduate-year-2', label: 'Undergraduate Year 2' },
      { value: 'undergraduate-year-3', label: 'Undergraduate Year 3' },
      { value: 'undergraduate-year-4', label: 'Undergraduate Year 4' },
    ],
  },
  {
    label: 'Graduate',
    options: [
      { value: 'master-year-1', label: "Master's Year 1" },
      { value: 'master-year-2', label: "Master's Year 2" },
      { value: 'master-year-3', label: "Master's Year 3" },
      { value: 'doctoral', label: 'Doctoral / PhD' },
    ],
  },
  {
    label: 'Professional / Continuing Ed',
    options: [
      { value: 'professional-beginner', label: 'Professional — Beginner' },
      { value: 'professional-intermediate', label: 'Professional — Intermediate' },
      { value: 'professional-advanced', label: 'Professional — Advanced' },
    ],
  },
  {
    label: 'Language Learning (ESL/EFL)',
    options: [
      { value: 'esl-beginner', label: 'ESL/EFL — Beginner (CLB 1-4)' },
      { value: 'esl-intermediate', label: 'ESL/EFL — Intermediate (CLB 5-7)' },
      { value: 'esl-advanced', label: 'ESL/EFL — Advanced (CLB 8+)' },
    ],
  },
  {
    label: 'K-12',
    options: [
      { value: 'k12-elementary', label: 'K-12 Elementary' },
      { value: 'k12-middle', label: 'K-12 Middle School' },
      { value: 'k12-highschool', label: 'K-12 High School' },
    ],
  },
];

const COURSE_TYPES = [
  { value: 'mixed', label: 'Mixed' },
  { value: 'project', label: 'Project-Based' },
  { value: 'essay', label: 'Essay / Research' },
  { value: 'debate', label: 'Debate / Roleplay' },
  { value: 'lab', label: 'Lab / Simulation' },
];

const DESIGN_APPROACHES = [
  { value: 'addie', label: 'ADDIE — Linear (Analysis → Design → Development → Implementation → Evaluation)' },
  { value: 'sam', label: 'SAM — Iterative (Rapid Prototype → Evaluate → Revise)' },
];

const ASSIGNMENT_TYPES = ['essay', 'project', 'debate', 'lab', 'quiz', 'reflection'];

const inputCls = 'w-full p-2 bg-white border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors';

// ---- Query History panel (reads from localStorage written by GraphViewer) ----

type QHSubject = 'all' | 'business-law' | 'call';

interface QueryHistoryItem {
  id: number;
  question: string;
  answer: string;
  subject: QHSubject;
  starred: boolean;
  matchedNodeId: string | null;
  timestamp?: number;
}

function formatTimestamp(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) + ', ' +
    d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
}

const QHPANEL_BG = '#f5f0e8';
const QHPANEL_CARD = '#ede8de';
const QHBORDER = '#d4cfc5';
const QHTEXT = '#1a1a2e';
const QHMUTED = '#6b6560';
const QHACCENT = '#8B5E3C';

const subjectLabel = (s: QHSubject) =>
  s === 'business-law' ? 'Business Law' : s === 'call' ? 'CALL' : 'All';

const subjectPillStyle = (s: QHSubject): React.CSSProperties =>
  s === 'business-law'
    ? { background: 'rgba(139,94,60,0.15)', color: '#8B5E3C' }
    : s === 'call'
    ? { background: 'rgba(79,120,120,0.15)', color: '#4f7878' }
    : { background: 'rgba(107,101,96,0.12)', color: '#6b6560' };

const QueryHistorySection: React.FC<{ onGoToGraph: () => void; onCountChange?: (n: number) => void }> = ({ onGoToGraph, onCountChange }) => {
  const [items, setItems] = useState<QueryHistoryItem[]>(() => {
    try {
      const stored = localStorage.getItem('plot_ark_query_history');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  // Re-read from localStorage on focus (in case GraphViewer updated it)
  useEffect(() => {
    const sync = () => {
      try {
        const stored = localStorage.getItem('plot_ark_query_history');
        const parsed: QueryHistoryItem[] = stored ? JSON.parse(stored) : [];
        setItems(parsed);
        onCountChange?.(parsed.length);
      } catch {}
    };
    window.addEventListener('focus', sync);
    return () => window.removeEventListener('focus', sync);
  }, [onCountChange]);

  const deleteItem = (id: number) => {
    setItems(prev => {
      const next = prev.filter(h => h.id !== id);
      try { localStorage.setItem('plot_ark_query_history', JSON.stringify(next)); } catch {}
      onCountChange?.(next.length);
      return next;
    });
  };

  const clearAll = () => {
    setItems([]);
    try { localStorage.removeItem('plot_ark_query_history'); } catch {}
    onCountChange?.(0);
  };

  return (
    <section id="query-history" style={{ background: '#1c1917', padding: '6rem 0' }}>
      <div className="container mx-auto px-6">
        {/* Header */}
        <div className="flex items-end justify-between mb-10 flex-wrap gap-4">
          <div className="max-w-xl">
            <div style={{ fontSize: '0.7rem', letterSpacing: '0.2em', color: '#a8a29e', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.75rem' }}>
              Query History
            </div>
            <h2 style={{ fontFamily: 'serif', fontSize: '2.25rem', color: 'white', marginBottom: '0.75rem', lineHeight: 1.2 }}>
              Past Knowledge Graph Queries
            </h2>
            <p style={{ color: '#a8a29e', lineHeight: 1.7 }}>
              All questions asked in the Knowledge Graph tab — persisted across sessions.
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={clearAll}
              style={{
                background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.3)',
                color: '#fca5a5',
                borderRadius: '0.5rem',
                padding: '0.4rem 0.9rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Clear All
            </button>
          )}
        </div>

        {/* Empty state */}
        {items.length === 0 ? (
          <div style={{
            background: QHPANEL_BG,
            border: `1px solid ${QHBORDER}`,
            borderRadius: '0.75rem',
            padding: '3rem',
            textAlign: 'center',
          }}>
            <Clock size={32} style={{ color: QHACCENT, opacity: 0.35, margin: '0 auto 0.75rem' }} />
            <p style={{ color: QHMUTED, fontSize: '0.875rem' }}>
              No queries yet — ask something in the{' '}
              <button
                onClick={onGoToGraph}
                style={{ color: QHACCENT, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, textDecoration: 'underline' }}
              >
                Knowledge Graph tab
              </button>
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {items.map(item => (
              <div
                key={item.id}
                onClick={onGoToGraph}
                style={{
                  background: QHPANEL_BG,
                  border: `1px solid ${item.starred ? QHACCENT : QHBORDER}`,
                  borderRadius: '0.75rem',
                  padding: '1rem 1.25rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = QHPANEL_CARD; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = QHPANEL_BG; }}
                title="Click to go to Knowledge Graph"
              >
                {/* Top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                  {/* Subject pill */}
                  <span style={{
                    ...subjectPillStyle(item.subject),
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    letterSpacing: '0.03em',
                    whiteSpace: 'nowrap',
                  }}>
                    {subjectLabel(item.subject)}
                  </span>
                  {/* Timestamp */}
                  {item.timestamp && (
                    <span style={{ fontSize: '0.7rem', color: QHMUTED, marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                      {formatTimestamp(item.timestamp)}
                    </span>
                  )}
                  {/* Delete */}
                  <button
                    onClick={e => { e.stopPropagation(); deleteItem(item.id); }}
                    title="Delete"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: QHMUTED,
                      fontSize: '1rem',
                      lineHeight: 1,
                      padding: '0 2px',
                      marginLeft: item.timestamp ? '0' : 'auto',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
                {/* Question */}
                <div style={{ fontWeight: 600, color: QHTEXT, fontSize: '0.875rem', marginBottom: '0.35rem' }}>
                  {item.question}
                </div>
                {/* Answer preview */}
                <div style={{
                  color: QHMUTED,
                  fontSize: '0.78rem',
                  lineHeight: 1.55,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {item.answer}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

const App: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'professor' | 'student'>('professor');

  // Form state
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('undergraduate-year-1');
  const [levelCustom, setLevelCustom] = useState('');
  const [audience, setAudience] = useState('');
  const [audienceCustom, setAudienceCustom] = useState('');
  const [accreditationContext, setAccreditationContext] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [moduleCount, setModuleCount] = useState('6');
  const [courseType, setCourseType] = useState('mixed');
  const [designApproach, setDesignApproach] = useState('addie');
  const [sessionDuration, setSessionDuration] = useState<string>('90');
  const [sessionDurationCustomHours, setSessionDurationCustomHours] = useState('');
  const [sessionDurationCustomMins, setSessionDurationCustomMins] = useState('');
  const [levelOpen, setLevelOpen] = useState(false);
  const levelDropdownRef = useRef<HTMLDivElement>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const audienceDropdownRef = useRef<HTMLDivElement>(null);
  const [courseTypeOpen, setCourseTypeOpen] = useState(false);
  const courseTypeDropdownRef = useRef<HTMLDivElement>(null);
  const [designApproachOpen, setDesignApproachOpen] = useState(false);
  const designApproachDropdownRef = useRef<HTMLDivElement>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [agentStatus, setAgentStatus] = useState('');
  const [curriculum, setCurriculum] = useState<CurriculumData | null>(null);
  const [copied, setCopied] = useState(false);

  // Two-phase generation state
  const [skeleton, setSkeleton] = useState<Partial<Module & { module_number?: number; learning_objectives: string[] }>[]>([]);
  const [generationPhase, setGenerationPhase] = useState<'idle' | 'skeleton' | 'skeleton_ready' | 'expanding' | 'done'>('idle');
  const [expandProgress, setExpandProgress] = useState<number>(0);
  const [skeletonExpanded, setSkeletonExpanded] = useState<Set<number>>(new Set());
  const [skeletonEdited, setSkeletonEdited] = useState<boolean>(false);
  const [courseNarrative, setCourseNarrative] = useState<string>('');
  const [editingNarrative, setEditingNarrative] = useState<boolean>(false);

  const updateSkeleton = (idx: number, updates: Partial<typeof skeleton[0]>) => {
    setSkeleton(prev => prev.map((m, i) => i === idx ? { ...m, ...updates } : m));
    setSkeletonEdited(true);
  };

  const deleteSkeletonModule = (idx: number) => {
    setSkeleton(prev => prev
      .filter((_, i) => i !== idx)
      .map((m, i) => ({ ...m, module_number: i + 1 }))
    );
    setSkeletonEdited(true);
  };

  const addSkeletonModule = () => {
    setSkeleton(prev => [...prev, {
      module_number: prev.length + 1,
      title: 'New Module',
      complexity_level: (prev[prev.length - 1]?.complexity_level ?? 1) + 1,
      learning_objectives: ['']
    }]);
    setSkeletonEdited(true);
  };

  // R2: Human-in-the-loop source review
  const [isFetchingSources, setIsFetchingSources] = useState(false);
  const [previewSources, setPreviewSources] = useState<Source[]>([]);
  const [sourcePriorities, setSourcePriorities] = useState<Record<string, 'required' | 'optional' | 'exclude'>>({});
  const [showSourceReview, setShowSourceReview] = useState(false);
  const [expandedSnippets, setExpandedSnippets] = useState<Set<string>>(new Set());
  // Store pending form params while user reviews sources
  const pendingParams = useRef<Record<string, string> | null>(null);
  // Store topic/level/audience for history-loaded curricula (enables Re-research)
  const [loadedCurriculumMeta, setLoadedCurriculumMeta] = useState<{ topic: string; level: string; audience: string } | null>(null);

  // Module navigation & editing
  const [currentModuleIndex, setCurrentModuleIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'objectives' | 'resources' | 'assessment'>('objectives');
  const [editedModules, setEditedModules] = useState<Module[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Drag and drop
  const dragIndex = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Student comprehension check
  const [moduleCheckins, setModuleCheckins] = useState<Record<number, {
    choice: '🟢' | '🟡' | '🔴' | '⚫' | null;
    text: string;
    submitted: boolean;
  }>>({});
  const [checkinText, setCheckinText] = useState('');

  // Citations — collapsible groups of 5
  const [openCitationGroups, setOpenCitationGroups] = useState<Set<number>>(new Set([0]));


  // History panel (curriculum)
  const [showHistory, setShowHistory] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Query history badge count (synced from localStorage)
  const [queryHistoryCount, setQueryHistoryCount] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('plot_ark_query_history');
      return stored ? (JSON.parse(stored) as unknown[]).length : 0;
    } catch { return 0; }
  });
  useEffect(() => {
    const syncCount = () => {
      try {
        const stored = localStorage.getItem('plot_ark_query_history');
        setQueryHistoryCount(stored ? (JSON.parse(stored) as unknown[]).length : 0);
      } catch {}
    };
    window.addEventListener('storage', syncCount);
    window.addEventListener('focus', syncCount);
    return () => {
      window.removeEventListener('storage', syncCount);
      window.removeEventListener('focus', syncCount);
    };
  }, []);

  const toggleCitationGroup = (i: number) => {
    setOpenCitationGroups(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (levelDropdownRef.current && !levelDropdownRef.current.contains(e.target as Node)) setLevelOpen(false);
      if (audienceDropdownRef.current && !audienceDropdownRef.current.contains(e.target as Node)) setAudienceOpen(false);
      if (courseTypeDropdownRef.current && !courseTypeDropdownRef.current.contains(e.target as Node)) setCourseTypeOpen(false);
      if (designApproachDropdownRef.current && !designApproachDropdownRef.current.contains(e.target as Node)) setDesignApproachOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const scrollToSection = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    setMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      const offsetPosition = element.getBoundingClientRect().top + window.pageYOffset - 100;
      window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
    }
  };

  // R2 Step 1: fetch sources for review before generating
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveAudience = audience === 'custom' ? audienceCustom : audience;
    const effectiveLevel = level === 'other' ? levelCustom : level;
    if (!topic || !effectiveLevel || !effectiveAudience) return;

    const params: Record<string, string> = {
      topic,
      level: effectiveLevel,
      audience: effectiveAudience,
      accreditation_context: accreditationContext,
      course_code: courseCode,
      module_count: moduleCount,
      course_type: courseType,
      design_approach: designApproach,
      session_duration: sessionDuration === 'other'
        ? String((parseInt(sessionDurationCustomHours || '0') * 60) + parseInt(sessionDurationCustomMins || '0') || 90)
        : sessionDuration,
    };

    pendingParams.current = params;
    setIsFetchingSources(true);
    setPreviewSources([]);
    setShowSourceReview(false);
    setCurriculum(null);
    setLoadedCurriculumMeta(null);
    setSkeleton([]);
    setGenerationPhase('idle');
    setExpandProgress(0);

    try {
      const res = await fetch('/api/sources/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, level: effectiveLevel, audience: effectiveAudience }),
      });
      const data = await res.json();
      const sources: Source[] = data.sources || [];
      setPreviewSources(sources);
      // Default: all sources set to 'optional'
      const initialPriorities: Record<string, 'required' | 'optional' | 'exclude'> = {};
      sources.forEach((s: Source) => { initialPriorities[s.url] = 'optional'; });
      setSourcePriorities(initialPriorities);
      setShowSourceReview(true);
      // Scroll to source review panel
      setTimeout(() => {
        const el = document.getElementById('source-review');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('Failed to fetch sources preview', err);
      // Fallback: use skeleton phase directly without source review
      await runSkeleton(params, []);
    } finally {
      setIsFetchingSources(false);
    }
  };

  // R2 Step 2: generate skeleton with approved sources (two-phase flow)
  const handleGenerateWithApproved = async () => {
    if (!pendingParams.current) return;
    const approved = previewSources
      .filter(s => sourcePriorities[s.url] !== 'exclude')
      .map(s => ({ ...s, priority: sourcePriorities[s.url] ?? 'optional' }));
    setShowSourceReview(false);
    await runSkeleton(pendingParams.current, approved);
  };

  const runGenerate = async (params: Record<string, string>, approved: (Source & { priority?: 'required' | 'optional' })[]) => {
    setIsGenerating(true);
    setStreamText('');
    setAgentStatus('');
    setCurriculum(null);
    setCurrentModuleIndex(0);
    setActiveTab('objectives');
    setIsEditing(false);
    setOpenCitationGroups(new Set([0]));

    try {
      const body: Record<string, unknown> = { ...params };
      if (approved.length > 0) {
        body.approved_sources = approved;
      }

      const response = await fetch('/api/curriculum/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              try {
                let cleanText = accumulatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const firstBrace = cleanText.indexOf('{');
                const lastBrace = cleanText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                  cleanText = cleanText.slice(firstBrace, lastBrace + 1);
                }
                const parsed = JSON.parse(cleanText) as CurriculumData;
                setCurriculum(parsed);
                setEditedModules(parsed.modules.map((m, i, arr) => ({
                  ...m,
                  complexity_level: Number(m.complexity_level) || Math.max(1, Math.round((i + 1) / arr.length * 5)),
                })));
              } catch (err) {
                console.error('Failed to parse JSON', err);
              }
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.status) {
                setAgentStatus(parsed.message || '');
                continue;
              }
              if (parsed.reset) {
                accumulatedText = '';
                setStreamText('');
                continue;
              }
              if (parsed.text) {
                accumulatedText += parsed.text;
                setStreamText(accumulatedText);
              }
            } catch {
              // Incomplete chunk
            }
          }
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Phase 1: Stream skeleton from /api/curriculum/skeleton
  const runSkeleton = async (params: Record<string, string>, approved: (Source & { priority?: 'required' | 'optional' })[]) => {
    setGenerationPhase('skeleton');
    setIsGenerating(true);
    setStreamText('');
    setAgentStatus('');
    setCurriculum(null);
    setSkeleton([]);
    setCourseNarrative('');
    setSkeletonExpanded(new Set());
    setCurrentModuleIndex(0);
    setEditedModules([]);
    setIsEditing(false);
    setOpenCitationGroups(new Set([0]));

    try {
      const body: Record<string, unknown> = { ...params };
      if (approved.length > 0) {
        body.approved_sources = approved;
      }

      const response = await fetch('/api/curriculum/skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawData = line.slice(6).trim();
            if (rawData === '[DONE]') {
              // Parse skeleton
              try {
                let cleanText = accumulatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                const firstBrace = cleanText.indexOf('{');
                const lastBrace = cleanText.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1) {
                  cleanText = cleanText.slice(firstBrace, lastBrace + 1);
                }
                const parsed = JSON.parse(cleanText) as { course_narrative?: string; modules: Partial<Module & { module_number?: number; learning_objectives: string[] }>[] };
                const skeletonModules = (parsed.modules || []).map((m, i) => ({
                  ...m,
                  module_number: m.module_number ?? i + 1,
                  learning_objectives: Array.isArray(m.learning_objectives) ? m.learning_objectives.map((o: string) => o && o.length > 0 ? o[0].toUpperCase() + o.slice(1) : o) : [],
                  complexity_level: Number(m.complexity_level) || Math.max(1, Math.round((i + 1) / (parsed.modules.length) * 5)),
                }));
                setSkeleton(skeletonModules);
                if (parsed.course_narrative) {
                  setCourseNarrative(parsed.course_narrative);
                }
                setGenerationPhase('skeleton_ready');
              } catch (err) {
                console.error('Failed to parse skeleton JSON', err);
                setGenerationPhase('idle');
              }
              break;
            }
            try {
              const parsed = JSON.parse(rawData);
              if (parsed.status) {
                setAgentStatus(parsed.message || '');
                continue;
              }
              if (parsed.text) {
                accumulatedText += parsed.text;
                setStreamText(accumulatedText);
              }
            } catch {
              // Incomplete chunk
            }
          }
        }
      }
    } catch (error) {
      console.error('Skeleton generation error:', error);
      setGenerationPhase('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  // Phase 2: Expand all skeleton modules one-by-one
  const runExpandAll = async () => {
    if (!pendingParams.current || skeleton.length === 0) return;

    setGenerationPhase('expanding');
    setExpandProgress(0);
    setEditedModules([]);
    setCurriculum(null);
    setIsGenerating(true);
    setStreamText('');
    setAgentStatus('');

    const params = pendingParams.current;
    // Retrieve approved sources from the last source review
    const approved = previewSources
      .filter(s => sourcePriorities[s.url] !== 'exclude')
      .map(s => ({ ...s, priority: sourcePriorities[s.url] ?? 'optional' }));

    const expandedModules: Module[] = [];

    try {
    for (let i = 0; i < skeleton.length; i++) {
      setAgentStatus(`Expanding module ${i + 1} of ${skeleton.length}...`);

      try {
        const body: Record<string, unknown> = {
          ...params,
          skeleton: skeleton,
          module_index: i,
        };
        if (approved.length > 0) {
          body.approved_sources = approved;
        }

        const response = await fetch('/api/curriculum/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!response.body) throw new Error('No response body for module ' + i);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const rawData = line.slice(6).trim();
              if (rawData === '[DONE]') {
                // Parse expanded module
                try {
                  let cleanText = accumulatedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                  const firstBrace = cleanText.indexOf('{');
                  const lastBrace = cleanText.lastIndexOf('}');
                  if (firstBrace !== -1 && lastBrace !== -1) {
                    cleanText = cleanText.slice(firstBrace, lastBrace + 1);
                  }
                  const parsed = JSON.parse(cleanText) as Module;
                  const normalised: Module = {
                    title: parsed.title || skeleton[i].title || `Module ${i + 1}`,
                    complexity_level: Number(parsed.complexity_level) || Number(skeleton[i].complexity_level) || 1,
                    learning_objectives: Array.isArray(parsed.learning_objectives)
                      ? parsed.learning_objectives.map((o: string) => o && o.length > 0 ? o[0].toUpperCase() + o.slice(1) : o)
                      : (skeleton[i].learning_objectives || []).map((o: string) => o && o.length > 0 ? o[0].toUpperCase() + o.slice(1) : o),
                    narrative_preview: parsed.narrative_preview || '',
                    recommended_readings: Array.isArray(parsed.recommended_readings) ? parsed.recommended_readings : [],
                    assignments: Array.isArray(parsed.assignments) ? parsed.assignments : [],
                  };
                  expandedModules.push(normalised);
                  // Update editedModules incrementally so UI shows progress
                  setEditedModules([...expandedModules]);
                } catch (err) {
                  console.error(`Failed to parse expanded module ${i}`, err);
                  // Fall back to skeleton data with empty expanded fields
                  const fallback: Module = {
                    title: skeleton[i].title || `Module ${i + 1}`,
                    complexity_level: Number(skeleton[i].complexity_level) || 1,
                    learning_objectives: skeleton[i].learning_objectives || [],
                    narrative_preview: '',
                    recommended_readings: [],
                    assignments: [],
                  };
                  expandedModules.push(fallback);
                  setEditedModules([...expandedModules]);
                }
                break;
              }
              try {
                const parsed = JSON.parse(rawData);
                if (parsed.status || parsed.expanding) {
                  // status updates — already shown via agentStatus
                  continue;
                }
                if (parsed.text) {
                  accumulatedText += parsed.text;
                }
              } catch {
                // Incomplete chunk
              }
            }
          }
        }

        setExpandProgress(i + 1);
      } catch (err) {
        console.error(`Error expanding module ${i}:`, err);
        // Push skeleton fallback so the loop continues
        expandedModules.push({
          title: skeleton[i].title || `Module ${i + 1}`,
          complexity_level: Number(skeleton[i].complexity_level) || 1,
          learning_objectives: skeleton[i].learning_objectives || [],
          narrative_preview: '',
          recommended_readings: [],
          assignments: [],
        });
        setEditedModules([...expandedModules]);
        setExpandProgress(i + 1);
      }
    }

    // Save to history
    try {
      await fetch('/api/curriculum/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: params.topic,
          level: params.level,
          audience: params.audience,
          course_code: params.courseCode || '',
          course_type: params.courseType || 'mixed',
          module_count: expandedModules.length,
          design_approach: params.designApproach || 'ADDIE',
          modules: expandedModules,
          sources: approved.map(s => ({ title: s.title, url: s.url, domain: (() => { try { return new URL(s.url).hostname; } catch { return s.url; } })() })),
          course_narrative: courseNarrative,
        }),
      });
    } catch (e) {
      console.warn('Failed to save curriculum to history:', e);
    }

    // All modules expanded — set curriculum with empty sources (sources come from approved list)
    const finalCurriculum: CurriculumData = {
      modules: expandedModules,
      sources: approved.map(s => ({
        title: s.title,
        url: s.url,
        domain: (() => { try { return new URL(s.url).hostname; } catch { return s.url; } })(),
        type: s.type,
        retrieved_at: new Date().toISOString().slice(0, 10),
      })),
    };
    setCurriculum(finalCurriculum);
    setGenerationPhase('done');
    setAgentStatus('');

    // Scroll to modules
    setTimeout(() => {
      const el = document.getElementById('modules');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
    } catch (err) {
      console.error('Expand all error:', err);
      setGenerationPhase('idle');
    } finally {
      setIsGenerating(false);
    }
  };

  const navigateModule = (direction: number) => {
    if (!editedModules.length) return;
    const newIndex = Math.max(0, Math.min(editedModules.length - 1, currentModuleIndex + direction));
    setCurrentModuleIndex(newIndex);
    setActiveTab('objectives');
    setIsEditing(false);
  };

  const updateCurrentModule = (updates: Partial<Module>) => {
    setEditedModules(prev => prev.map((m, i) =>
      i === currentModuleIndex ? { ...m, ...updates } : m
    ));
  };

  const handleSaveEdit = () => {
    setIsEditing(false);
    try {
      localStorage.setItem('plot-ark-modules', JSON.stringify(editedModules));
    } catch {
      // localStorage unavailable
    }
  };

  const handleAutoSave = () => {
    try {
      localStorage.setItem('plot-ark-modules', JSON.stringify(editedModules));
    } catch {
      // localStorage unavailable
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistoryEntries(data.history || []);
    } catch {
      setHistoryEntries([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleOpenHistory = () => {
    setShowHistory(true);
    fetchHistory();
  };

  const deleteHistory = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await fetch(`/api/history/${id}`, { method: 'DELETE' });
    setHistoryEntries(prev => prev.filter(h => h.id !== id));
  };

  const toggleFavorite = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const res = await fetch(`/api/history/${id}/favorite`, { method: 'POST' });
    const data = await res.json();
    setHistoryEntries(prev => prev.map(h =>
      h.id === id ? { ...h, is_favorite: data.is_favorite } : h
    ).sort((a, b) => (b.is_favorite ? 1 : 0) - (a.is_favorite ? 1 : 0)));
  };

  const loadFromHistory = async (entry: HistoryEntry) => {
    try {
      const res = await fetch(`/api/history/${entry.id}`);
      const data = await res.json();
      const parsed: CurriculumData = { modules: data.modules || [], sources: data.sources || [] };
      setCurriculum(parsed);
      setEditedModules(parsed.modules.map((m, i, arr) => ({
        ...m,
        complexity_level: Number(m.complexity_level) || Math.max(1, Math.round((i + 1) / arr.length * 5)),
        // Normalise array fields so render never calls .map() on null/undefined
        learning_objectives: Array.isArray(m.learning_objectives) ? m.learning_objectives : [],
        recommended_readings: Array.isArray(m.recommended_readings) ? m.recommended_readings : [],
        assignments: Array.isArray(m.assignments) ? m.assignments : [],
      })));
      setLoadedCurriculumMeta({ topic: data.topic || '', level: data.level || '', audience: data.audience || '' });
      setPreviewSources([]);
      setCurrentModuleIndex(0);
      setActiveTab('objectives');
      setIsEditing(false);
      setOpenCitationGroups(new Set([0]));
      setShowHistory(false);
      const el = document.getElementById('modules');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error('Failed to load history entry', e);
    }
  };

  // Re-research sources for a history-loaded curriculum
  const handleReresearch = async () => {
    if (!loadedCurriculumMeta) return;
    const { topic: metaTopic, level: metaLevel, audience: metaAudience } = loadedCurriculumMeta;
    setIsFetchingSources(true);
    try {
      const res = await fetch('/api/sources/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: metaTopic, level: metaLevel, audience: metaAudience }),
      });
      const data = await res.json();
      const sources: Source[] = data.sources || [];
      setPreviewSources(sources);
      const initialPriorities: Record<string, 'required' | 'optional' | 'exclude'> = {};
      sources.forEach((s: Source) => { initialPriorities[s.url] = 'optional'; });
      setSourcePriorities(initialPriorities);
      setShowSourceReview(true);
      setTimeout(() => {
        const el = document.getElementById('source-review');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      console.error('Failed to re-research sources', err);
    } finally {
      setIsFetchingSources(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === dropIndex) {
      setDragOverIndex(null);
      return;
    }
    const reordered = [...editedModules];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    setEditedModules(reordered);
    // Keep selection on the moved module
    setCurrentModuleIndex(dropIndex);
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    dragIndex.current = null;
    setDragOverIndex(null);
  };

  // Objective edit helpers
  const updateObjective = (i: number, value: string) => {
    const newObjs = [...currentModule!.learning_objectives];
    newObjs[i] = value;
    updateCurrentModule({ learning_objectives: newObjs });
  };
  const addObjective = () => {
    updateCurrentModule({ learning_objectives: [...currentModule!.learning_objectives, ''] });
  };
  const removeObjective = (i: number) => {
    updateCurrentModule({ learning_objectives: currentModule!.learning_objectives.filter((_, j) => j !== i) });
  };

  // Reading edit helpers
  const updateReading = (ri: number, updates: Partial<Reading>) => {
    const readings = currentModule!.recommended_readings.map((r, i) => i === ri ? { ...r, ...updates } : r);
    updateCurrentModule({ recommended_readings: readings });
  };
  const updateReadingKeyPoint = (ri: number, ki: number, value: string) => {
    const kps = [...currentModule!.recommended_readings[ri].key_points];
    kps[ki] = value;
    updateReading(ri, { key_points: kps });
  };
  const addReading = () => {
    updateCurrentModule({ recommended_readings: [...(currentModule!.recommended_readings || []), { title: '', key_points: [''], rationale: '' }] });
  };
  const removeReading = (ri: number) => {
    updateCurrentModule({ recommended_readings: currentModule!.recommended_readings.filter((_, i) => i !== ri) });
  };

  // Assignment edit helpers
  const updateAssignment = (ai: number, updates: Partial<Assignment>) => {
    const assignments = currentModule!.assignments.map((a, i) => i === ai ? { ...a, ...updates } : a);
    updateCurrentModule({ assignments });
  };
  const addAssignment = () => {
    updateCurrentModule({ assignments: [...(currentModule!.assignments || []), { title: '', type: 'essay', task_description: '', deliverable: '', estimated_time: '', covers_objectives: '', rubric_highlights: [] }] });
  };
  const removeAssignment = (ai: number) => {
    updateCurrentModule({ assignments: currentModule!.assignments.filter((_, i) => i !== ai) });
  };

  const deleteModule = (idx: number) => {
    if (editedModules.length <= 1) return;
    const updated = editedModules.filter((_, i) => i !== idx);
    setEditedModules(updated);
    setCurrentModuleIndex(Math.min(idx, updated.length - 1));
  };

  const addModule = () => {
    const blank: Module = {
      title: 'New Module',
      complexity_level: (editedModules[currentModuleIndex]?.complexity_level ?? 1) + 1,
      learning_objectives: [''],
      narrative_preview: '',
      recommended_readings: [],
      assignments: [],
    };
    const updated = [...editedModules];
    updated.splice(currentModuleIndex + 1, 0, blank);
    setEditedModules(updated);
    setCurrentModuleIndex(currentModuleIndex + 1);
  };

  const buildMarkdown = () => {
    if (!curriculum) return '';
    let md = `# Curriculum: ${topic}\n`;
    md += `**Level:** ${level} | **Audience:** ${audience}`;
    if (courseCode) md += ` | **Course Code:** ${courseCode}`;
    md += '\n\n## Modules\n\n';
    editedModules.forEach((m, i) => {
      md += `### Module ${i + 1}: ${m.title} *(Complexity ${m.complexity_level}/5)*\n\n`;
      md += `**Learning Objectives:**\n`;
      m.learning_objectives.forEach(obj => (md += `- ${obj}\n`));
      md += `\n**Narrative:** ${m.narrative_preview}\n\n`;
      if (m.recommended_readings?.length > 0) {
        md += `**Recommended Readings:**\n`;
        m.recommended_readings.forEach(r => {
          md += `- **${r.title}**\n`;
          r.key_points?.forEach(kp => (md += `  - ${kp}\n`));
          md += `  - *Why:* ${r.rationale}\n`;
        });
        md += '\n';
      }
      if (m.assignments?.length > 0) {
        md += `**Assignments:**\n`;
        m.assignments.forEach(a => {
          md += `- [${a.type?.toUpperCase()}] ${a.title}\n`;
          if (a.task_description) md += `  ${a.task_description}\n`;
          else if (a.coverage) md += `  ${a.coverage}\n`;
          if (a.deliverable) md += `  *Deliverable:* ${a.deliverable}\n`;
          if (a.estimated_time) md += `  *Time:* ${a.estimated_time}\n`;
          if (a.rubric_highlights?.length) {
            md += `  *Rubric:*\n`;
            a.rubric_highlights.forEach(r => (md += `    - ${r}\n`));
          }
        });
        md += '\n';
      }
    });
    md += `## Sources\n\n`;
    (curriculum.sources ?? []).forEach(s => (md += `- [${s.domain}](${s.url})\n`));
    return md;
  };

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(buildMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportMarkdown = () => {
    const blob = new Blob([buildMarkdown()], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topic.replace(/\s+/g, '_').toLowerCase()}_curriculum.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadIMSCC = () => {
    const blob = new Blob(['Mock IMSCC Content'], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${topic.replace(/\s+/g, '_').toLowerCase()}_curriculum.imscc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Load checkin from localStorage when module changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`plotark_checkins_${currentModuleIndex}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        setModuleCheckins(prev => ({ ...prev, [currentModuleIndex]: parsed }));
        setCheckinText(parsed.text || '');
      } else {
        setCheckinText('');
      }
    } catch {
      // localStorage unavailable
    }
  }, [currentModuleIndex]);

  const currentModule = editedModules[currentModuleIndex] ?? null;
  const citationGroups = curriculum
    ? Array.from({ length: Math.ceil((curriculum.sources ?? []).length / CITATIONS_PER_PAGE) }, (_, i) =>
        (curriculum.sources ?? []).slice(i * CITATIONS_PER_PAGE, (i + 1) * CITATIONS_PER_PAGE)
      )
    : [];

  return (
    <div className="min-h-screen bg-[#F9F8F4] text-stone-800 selection:bg-nobel-gold selection:text-white">

      {/* Navigation */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#F9F8F4]/90 backdrop-blur-md shadow-sm py-4' : 'bg-transparent py-6'}`}>
        <div className="container mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-8 h-8 bg-nobel-gold rounded-full flex items-center justify-center text-white font-serif font-bold text-xl shadow-sm pb-1">C</div>
            <span className={`font-serif font-bold text-lg tracking-wide transition-opacity ${scrolled ? 'opacity-100' : 'opacity-0 md:opacity-100'}`}>
              CURRICULUM <span className="font-normal text-stone-500">ENGINE</span>
            </span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium tracking-wide text-stone-600">
            <a href="#overview" onClick={scrollToSection('overview')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Overview</a>
            <a href="#modules" onClick={scrollToSection('modules')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Modules</a>
            <a href="#sources" onClick={scrollToSection('sources')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Sources</a>
            <a href="#export" onClick={scrollToSection('export')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Export</a>
            <a href="#knowledge-graph" onClick={scrollToSection('knowledge-graph')} className="flex items-center gap-1.5 hover:text-nobel-gold transition-colors cursor-pointer uppercase">
              <Network size={14} />
              Knowledge Graph
            </a>
            <a href="#query-history" onClick={scrollToSection('query-history')} className="flex items-center gap-1.5 hover:text-nobel-gold transition-colors cursor-pointer uppercase relative">
              <Clock size={14} />
              Query History
              {queryHistoryCount > 0 && (
                <span className="absolute -top-2 -right-3 min-w-[16px] h-4 flex items-center justify-center rounded-full text-[9px] font-bold px-1" style={{ background: '#8B5E3C', color: '#f5f0e8' }}>
                  {queryHistoryCount > 99 ? '99+' : queryHistoryCount}
                </span>
              )}
            </a>
            <button onClick={handleOpenHistory} className="flex items-center gap-1.5 text-stone-500 hover:text-nobel-gold transition-colors uppercase">
              <Clock size={14} />
              History
            </button>
          </div>
          <button className="md:hidden text-stone-900 p-2" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </nav>

      {/* View Mode Banner */}
      {viewMode === 'professor' ? (
        <div className="fixed top-16 left-0 right-0 z-40 bg-stone-50 border-b border-stone-200 px-6 py-2 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-stone-500">Professor View</span>
          <button
            onClick={() => setViewMode('student')}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors border border-amber-200"
          >
            Switch to Student View
          </button>
        </div>
      ) : (
        <div className="fixed top-16 left-0 right-0 z-40 bg-amber-400 border-b border-amber-500 px-6 py-2.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-widest text-amber-900">Student View</span>
            <span className="text-xs text-amber-800 font-medium">— read only</span>
          </div>
          <button
            onClick={() => setViewMode('professor')}
            className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-amber-900 text-amber-100 hover:bg-amber-800 transition-colors"
          >
            Back to Professor View
          </button>
        </div>
      )}

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-[#F9F8F4] flex flex-col items-center justify-center gap-8 text-xl font-serif animate-fade-in">
          <a href="#overview" onClick={scrollToSection('overview')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Overview</a>
          <a href="#modules" onClick={scrollToSection('modules')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Modules</a>
          <a href="#sources" onClick={scrollToSection('sources')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Sources</a>
          <a href="#export" onClick={scrollToSection('export')} className="hover:text-nobel-gold transition-colors cursor-pointer uppercase">Export</a>
          <a href="#knowledge-graph" onClick={scrollToSection('knowledge-graph')} className="flex items-center gap-2 hover:text-nobel-gold transition-colors cursor-pointer uppercase">
            <Network size={18} />
            Knowledge Graph
          </a>
        </div>
      )}

      {/* History Panel */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowHistory(false)} />
          <div className="relative ml-auto w-full max-w-md bg-[#F9F8F4] h-full shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-nobel-gold" />
                <h2 className="font-serif text-lg font-semibold">History</h2>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-stone-400 hover:text-stone-700 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {historyLoading ? (
                <div className="flex items-center justify-center h-32 text-stone-400 text-sm">Loading...</div>
              ) : historyEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-stone-400 text-sm gap-2">
                  <Clock size={24} className="opacity-30" />
                  <span>No curricula generated yet.</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {historyEntries.map(entry => (
                    <div
                      key={entry.id}
                      onClick={() => loadFromHistory(entry)}
                      className="w-full text-left p-4 bg-white border border-stone-200 rounded-xl hover:border-nobel-gold hover:shadow-sm transition-all group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-stone-800 group-hover:text-nobel-gold transition-colors truncate flex-1">{entry.topic}</div>
                        {viewMode === 'professor' && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={e => toggleFavorite(e, entry.id)}
                              className={`p-1 rounded transition-colors ${entry.is_favorite ? 'text-nobel-gold' : 'text-stone-300 hover:text-nobel-gold'}`}
                            >
                              <Star size={13} fill={entry.is_favorite ? 'currentColor' : 'none'} />
                            </button>
                            <button
                              onClick={e => deleteHistory(e, entry.id)}
                              className="p-1 rounded text-stone-300 hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-stone-400 mt-1 flex items-center gap-2 flex-wrap">
                        <span>{entry.level}</span>
                        {entry.course_code && <span className="px-1.5 py-0.5 bg-stone-100 rounded text-stone-500">{entry.course_code}</span>}
                        <span>{entry.module_count} modules</span>
                        <span className="ml-auto">{new Date(entry.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <header className="relative h-screen flex items-center justify-center overflow-hidden">
        <HeroScene />
        <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(249,248,244,0.92)_0%,rgba(249,248,244,0.6)_50%,rgba(249,248,244,0.3)_100%)]" />
        <div className="relative z-10 container mx-auto px-6 text-center">
          <div className="inline-block mb-4 px-3 py-1 border border-nobel-gold text-nobel-gold text-xs tracking-[0.2em] uppercase font-bold rounded-full backdrop-blur-sm bg-white/30">
            AI-Powered Design
          </div>
          <h1 className="font-serif text-5xl md:text-7xl lg:text-9xl font-medium leading-tight md:leading-[0.9] mb-8 text-stone-900 drop-shadow-sm">
            Curriculum Engine <br /><span className="italic font-normal text-stone-600 text-3xl md:text-5xl block mt-4">Narrative Curriculum Design</span>
          </h1>
          <p className="max-w-2xl mx-auto text-lg md:text-xl text-stone-700 font-light leading-relaxed mb-12">
            Generate comprehensive, narrative-driven educational modules tailored to your specific audience and accreditation standards.
          </p>
          <div className="flex justify-center">
            <a href="#overview" onClick={scrollToSection('overview')} className="group flex flex-col items-center gap-2 text-sm font-medium text-stone-500 hover:text-stone-900 transition-colors cursor-pointer">
              <span>START DESIGNING</span>
              <span className="p-2 border border-stone-300 rounded-full group-hover:border-stone-900 transition-colors bg-white/50">
                <ArrowDown size={16} />
              </span>
            </a>
          </div>
        </div>
      </header>

      <main>
        {/* OVERVIEW */}
        {viewMode === 'professor' && (
        <section id="overview" className="py-24 bg-white">
          <div className="container mx-auto px-6 md:px-12 grid grid-cols-1 md:grid-cols-12 gap-12 items-start">
            <div className="md:col-span-4">
              <div className="inline-block mb-3 text-xs font-bold tracking-widest text-stone-500 uppercase">Overview</div>
              <h2 className="font-serif text-4xl mb-6 leading-tight text-stone-900">Define Parameters</h2>
              <div className="w-16 h-1 bg-nobel-gold mb-6"></div>
              <p className="text-stone-600 leading-relaxed">
                Provide the core parameters for your curriculum. The AI engine applies Bloom's Taxonomy, i+1 difficulty scaffolding, and cognitive load principles.
              </p>
            </div>
            <div className="md:col-span-8">
              <form onSubmit={handleGenerate} className="bg-[#F9F8F4] p-8 rounded-2xl border border-stone-200 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">Topic <span className="text-red-400">*</span></label>
                    <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
                      placeholder="e.g. Introduction to Financial Accounting"
                      className="w-full p-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors" required />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Course Code <span className="text-stone-400 font-normal text-xs normal-case tracking-normal">optional</span>
                    </label>
                    <input type="text" value={courseCode} onChange={e => setCourseCode(e.target.value)}
                      placeholder="e.g. ACCT 201"
                      className="w-full p-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">Level <span className="text-red-400">*</span></label>
                    <div ref={levelDropdownRef} className="relative">
                      <button type="button"
                        onClick={() => setLevelOpen(o => !o)}
                        className="w-full p-3 bg-white border border-stone-300 rounded-lg text-left text-sm focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors flex items-center justify-between">
                        <span className={level === 'other' ? 'text-stone-500' : 'text-stone-800'}>
                          {level === 'other' ? 'Other / Custom' :
                            LEVEL_GROUPS.flatMap(g => g.options).find(o => o.value === level)?.label ?? 'Select level...'}
                        </span>
                        <svg className={`w-4 h-4 text-stone-400 transition-transform ${levelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </button>
                      {levelOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                          {LEVEL_GROUPS.map(group => (
                            <div key={group.label}>
                              <div className="px-3 py-1.5 text-xs font-bold text-stone-400 uppercase tracking-wider bg-stone-50 border-b border-stone-100">{group.label}</div>
                              {group.options.map(opt => (
                                <button key={opt.value} type="button"
                                  onClick={() => { setLevel(opt.value); setLevelCustom(''); setLevelOpen(false); }}
                                  className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 hover:text-amber-800 transition-colors ${level === opt.value ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700'}`}>
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          ))}
                          <div className="border-t border-stone-100">
                            <button type="button"
                              onClick={() => { setLevel('other'); setLevelOpen(false); }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 hover:text-amber-800 transition-colors ${level === 'other' ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-500'}`}>
                              Other / Custom
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {level === 'other' && (
                      <input type="text" value={levelCustom} onChange={e => setLevelCustom(e.target.value)}
                        placeholder="Describe the learner level..."
                        className="w-full p-3 mt-2 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors" required />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">Audience <span className="text-red-400">*</span></label>
                    <div ref={audienceDropdownRef} className="relative">
                      <button type="button" onClick={() => setAudienceOpen(o => !o)}
                        className="w-full p-3 bg-white border border-stone-300 rounded-lg text-left text-sm focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors flex items-center justify-between">
                        <span className={!audience ? 'text-stone-400' : 'text-stone-800'}>
                          {!audience ? 'Select discipline...' : audience === 'custom' ? (audienceCustom || 'Other / Custom...') : audience}
                        </span>
                        <svg className={`w-4 h-4 text-stone-400 transition-transform ${audienceOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </button>
                      {audienceOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
                          {['Business & Commerce','Computer Science & Engineering','Humanities & Social Sciences','Natural Sciences','Health Sciences','Education','Arts & Design','Law'].map(opt => (
                            <button key={opt} type="button"
                              onClick={() => { setAudience(opt); setAudienceCustom(''); setAudienceOpen(false); }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 hover:text-amber-800 transition-colors ${audience === opt ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700'}`}>
                              {opt}
                            </button>
                          ))}
                          <div className="border-t border-stone-100">
                            <button type="button"
                              onClick={() => { setAudience('custom'); setAudienceOpen(false); }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 hover:text-amber-800 transition-colors ${audience === 'custom' ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-500'}`}>
                              Other / Custom...
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    {audience === 'custom' && (
                      <input type="text" value={audienceCustom} onChange={e => setAudienceCustom(e.target.value)}
                        placeholder="e.g. Cross-listed Engineering & Business"
                        className="w-full mt-2 p-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors" required />
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">
                      Accreditation Context <span className="text-stone-400 font-normal text-xs normal-case tracking-normal">optional</span>
                    </label>
                    <input type="text" value={accreditationContext} onChange={e => setAccreditationContext(e.target.value)}
                      placeholder="e.g. CPA Canada, AACSB"
                      className="w-full p-3 bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">Course Type</label>
                    <div ref={courseTypeDropdownRef} className="relative">
                      <button type="button" onClick={() => setCourseTypeOpen(o => !o)}
                        className="w-full p-3 bg-white border border-stone-300 rounded-lg text-left text-sm focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors flex items-center justify-between">
                        <span className="text-stone-800">{COURSE_TYPES.find(ct => ct.value === courseType)?.label}</span>
                        <svg className={`w-4 h-4 text-stone-400 transition-transform ${courseTypeOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </button>
                      {courseTypeOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
                          {COURSE_TYPES.map(ct => (
                            <button key={ct.value} type="button"
                              onClick={() => { setCourseType(ct.value); setCourseTypeOpen(false); }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 hover:text-amber-800 transition-colors ${courseType === ct.value ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700'}`}>
                              {ct.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-2">Design Approach</label>
                    <div ref={designApproachDropdownRef} className="relative">
                      <button type="button" onClick={() => setDesignApproachOpen(o => !o)}
                        className="w-full p-3 bg-white border border-stone-300 rounded-lg text-left text-sm focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors flex items-center justify-between">
                        <span className="text-stone-800">{DESIGN_APPROACHES.find(da => da.value === designApproach)?.label}</span>
                        <svg className={`w-4 h-4 text-stone-400 transition-transform ${designApproachOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                      </button>
                      {designApproachOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
                          {DESIGN_APPROACHES.map(da => (
                            <button key={da.value} type="button"
                              onClick={() => { setDesignApproach(da.value); setDesignApproachOpen(false); }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-amber-50 hover:text-amber-800 transition-colors ${designApproach === da.value ? 'bg-amber-50 text-amber-800 font-medium' : 'text-stone-700'}`}>
                              {da.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Session Duration */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-3">Session Duration <span className="normal-case font-normal text-stone-400">(per session)</span></label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {[
                      { value: '75', label: '75 min (1.25 hrs)' },
                      { value: '90', label: '90 min (1.5 hrs)' },
                      { value: '180', label: '3 hours' },
                      { value: 'other', label: 'Other / Custom' },
                    ].map(opt => (
                      <button key={opt.value} type="button" onClick={() => setSessionDuration(opt.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${sessionDuration === opt.value ? 'bg-stone-900 text-white border-stone-900' : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'}`}>
                        {opt.label}
                      </button>
                    ))}
                    {sessionDuration === 'other' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min="0" max="8"
                          placeholder="hrs"
                          value={sessionDurationCustomHours}
                          onChange={e => setSessionDurationCustomHours(e.target.value)}
                          className="w-16 p-2 bg-white border border-stone-300 rounded-lg text-center text-sm font-bold focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors"
                        />
                        <span className="text-xs text-stone-400 font-medium">hr</span>
                        <input
                          type="number" min="0" max="59"
                          placeholder="min"
                          value={sessionDurationCustomMins}
                          onChange={e => setSessionDurationCustomMins(e.target.value)}
                          className="w-16 p-2 bg-white border border-stone-300 rounded-lg text-center text-sm font-bold focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors"
                        />
                        <span className="text-xs text-stone-400 font-medium">min</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Module Count */}
                <div className="mb-8">
                  <label className="block text-sm font-bold text-stone-700 uppercase tracking-wider mb-3">Number of Modules</label>
                  <div className="flex items-center gap-3">
                    <div className="flex gap-2 flex-wrap">
                      {['4', '6', '8', '10', '12'].map(n => (
                        <button key={n} type="button" onClick={() => setModuleCount(n)}
                          className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${moduleCount === n ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="text-stone-400 text-sm">or</span>
                    <input type="number" min="3" max="12" value={moduleCount} onChange={e => setModuleCount(e.target.value)}
                      className="w-20 p-2 bg-white border border-stone-300 rounded-lg text-center text-sm font-bold focus:outline-none focus:border-nobel-gold focus:ring-1 focus:ring-nobel-gold transition-colors" />
                  </div>
                </div>

                <button type="submit" disabled={isGenerating || isFetchingSources || generationPhase === 'expanding'}
                  className="w-full py-4 bg-stone-900 text-white font-bold uppercase tracking-widest rounded-lg hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2">
                  {isFetchingSources ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>Searching academic sources...</>
                  ) : generationPhase === 'skeleton' ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>Building skeleton...</>
                  ) : generationPhase === 'expanding' ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>Expanding modules...</>
                  ) : isGenerating ? (
                    <><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>Generating...</>
                  ) : 'Generate Curriculum'}
                </button>
              </form>

              {isGenerating && !curriculum && generationPhase !== 'expanding' && (
                <div className="mt-8 p-6 bg-stone-900 text-stone-300 rounded-xl font-mono text-sm overflow-hidden relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-nobel-gold/30">
                    <div className="h-full bg-nobel-gold animate-pulse w-1/3"></div>
                  </div>
                  <p className="mb-2 text-nobel-gold uppercase tracking-widest text-xs font-bold">
                    {generationPhase === 'skeleton' ? 'Building module skeleton...' : agentStatus ? 'Research Agent' : 'Generating...'}
                  </p>
                  <div className="whitespace-pre-wrap max-h-60 overflow-y-auto opacity-80">
                    {agentStatus && !streamText ? agentStatus : (streamText || 'Initializing...')}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
        )}

        {/* R2: Source Review Panel */}
        {showSourceReview && viewMode === 'professor' && (
          <section id="source-review" className="py-12 bg-white border-t border-amber-100">
            <div className="container mx-auto px-6 md:px-12">
              <div className="bg-white border border-amber-100 rounded-xl shadow-sm p-6 md:p-8">
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-xs font-bold tracking-widest text-amber-600 uppercase mb-1">Step 2 of 2 — Source Review</div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-serif text-2xl text-stone-900">Review Research Sources</h3>
                      {/* Credibility info tooltip */}
                      <div className="relative group flex items-center">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-stone-200 text-stone-500 text-[10px] font-bold cursor-default select-none leading-none">?</span>
                        <div className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 z-50 w-72 rounded-lg border border-stone-200 bg-white shadow-lg p-3 text-xs text-stone-600 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <p className="font-bold text-stone-700 mb-1">Credibility levels</p>
                          <p className="mb-1"><span className="font-semibold text-emerald-700">High</span> — Academic databases (ResearchGate, Springer, JSTOR, Academia.edu, .edu domains)</p>
                          <p className="mb-1"><span className="font-semibold text-amber-700">Medium</span> — News media (NYT, HBR, Economist) and educational video (YouTube, Coursera, TED)</p>
                          <p><span className="font-semibold text-stone-500">Low</span> — Domain not recognized; review manually before including</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSourceReview(false)}
                    className="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2 transition-colors"
                  >
                    ← Back to parameters
                  </button>
                </div>
                <p className="text-sm text-stone-500 mb-5">
                  These sources were found by the research agent. Set each source as Required, Optional, or Excluded before generating.
                </p>

                {/* Select All / Exclude All + count */}
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={() => {
                      const next: Record<string, 'required' | 'optional' | 'exclude'> = {};
                      previewSources.forEach(s => { next[s.url] = 'optional'; });
                      setSourcePriorities(next);
                    }}
                    className="text-xs font-bold text-amber-700 hover:text-amber-900 transition-colors"
                  >
                    Select All
                  </button>
                  <span className="text-stone-300">|</span>
                  <button
                    onClick={() => {
                      const next: Record<string, 'required' | 'optional' | 'exclude'> = {};
                      previewSources.forEach(s => { next[s.url] = 'exclude'; });
                      setSourcePriorities(next);
                    }}
                    className="text-xs font-bold text-stone-500 hover:text-stone-700 transition-colors"
                  >
                    Exclude All
                  </button>
                  <span className="ml-auto text-xs text-stone-400 font-medium">
                    {(() => {
                      const req = previewSources.filter(s => sourcePriorities[s.url] === 'required').length;
                      const opt = previewSources.filter(s => sourcePriorities[s.url] === 'optional').length;
                      const parts = [];
                      if (req > 0) parts.push(`${req} required`);
                      if (opt > 0) parts.push(`${opt} optional`);
                      return parts.length > 0 ? parts.join(', ') : 'none selected';
                    })()}
                  </span>
                </div>

                {/* Source list */}
                <div className="space-y-2 mb-6">
                  {previewSources.length === 0 ? (
                    <p className="text-sm text-stone-400 italic py-4 text-center">No sources found for this topic.</p>
                  ) : previewSources.map((s) => {
                    const priority = sourcePriorities[s.url] ?? 'optional';
                    const isExcluded = priority === 'exclude';
                    const credentialBadge =
                      s.credibility === 'high'
                        ? { dot: 'bg-emerald-500', label: 'High', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                        : s.credibility === 'medium'
                        ? { dot: 'bg-amber-400', label: 'Medium', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
                        : { dot: 'bg-stone-400', label: 'Low', cls: 'bg-stone-100 text-stone-500 border-stone-200' };
                    const typeIcon = s.type === 'video' ? '🎬' : s.type === 'news' ? '📰' : '📄';
                    return (
                      <div
                        key={s.url}
                        className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                          isExcluded
                            ? 'bg-stone-50 border-stone-200 opacity-50'
                            : priority === 'required'
                            ? 'bg-amber-50 border-amber-200'
                            : 'bg-stone-50 border-stone-200'
                        }`}
                      >
                        {/* 3-state pill selector */}
                        <div className="flex gap-1 shrink-0 mt-0.5">
                          <button
                            type="button"
                            onClick={() => setSourcePriorities(prev => ({ ...prev, [s.url]: 'required' }))}
                            className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors border ${
                              priority === 'required'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-white text-stone-400 border-stone-200 hover:border-amber-400 hover:text-amber-600'
                            }`}
                          >
                            Required
                          </button>
                          <button
                            type="button"
                            onClick={() => setSourcePriorities(prev => ({ ...prev, [s.url]: 'optional' }))}
                            className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors border ${
                              priority === 'optional'
                                ? 'bg-stone-200 text-stone-700 border-stone-300'
                                : 'bg-white text-stone-400 border-stone-200 hover:border-stone-400 hover:text-stone-600'
                            }`}
                          >
                            Optional
                          </button>
                          <button
                            type="button"
                            onClick={() => setSourcePriorities(prev => ({ ...prev, [s.url]: 'exclude' }))}
                            className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors border ${
                              priority === 'exclude'
                                ? 'bg-rose-100 text-rose-600 border-rose-300'
                                : 'bg-white text-stone-400 border-stone-200 hover:border-rose-300 hover:text-rose-500'
                            }`}
                          >
                            Exclude
                          </button>
                        </div>
                        {/* Credibility badge */}
                        <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-bold ${credentialBadge.cls}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${credentialBadge.dot}`}></span>
                          {credentialBadge.label}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-semibold text-stone-800 hover:text-amber-700 transition-colors underline underline-offset-2 decoration-stone-300 leading-snug"
                            >
                              {s.title || s.url}
                            </a>
                            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 shrink-0">
                              {typeIcon} {s.type}
                            </span>
                          </div>
                          {s.tags && s.tags.length > 0 && (
                            <div className="flex flex-wrap mt-1">
                              {s.tags.map((tag, ti) => (
                                <span key={ti} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-500 mr-1 mb-1">
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {s.snippet && (
                            <div>
                              <button
                                type="button"
                                onClick={() => setExpandedSnippets(prev => {
                                  const next = new Set(prev);
                                  next.has(s.url) ? next.delete(s.url) : next.add(s.url);
                                  return next;
                                })}
                                className="text-xs text-stone-400 hover:text-stone-600 cursor-pointer mt-1"
                              >
                                {expandedSnippets.has(s.url) ? '▾ Summary' : '▸ Summary'}
                              </button>
                              {expandedSnippets.has(s.url) && (
                                <p className="text-xs text-stone-500 leading-relaxed mt-1">
                                  {s.snippet}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Generate button */}
                <div className="flex items-center gap-4">
                  <button
                    onClick={handleGenerateWithApproved}
                    disabled={previewSources.every(s => sourcePriorities[s.url] === 'exclude')}
                    className="px-6 py-3 bg-amber-500 text-white font-bold uppercase tracking-wider rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                  >
                    Generate with selected sources →
                  </button>
                  {previewSources.every(s => sourcePriorities[s.url] === 'exclude') && (
                    <span className="text-xs text-stone-400">At least one source must not be excluded</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* SKELETON PREVIEW — shown after Phase 1 completes */}
        {(generationPhase === 'skeleton_ready' || generationPhase === 'expanding') && viewMode === 'professor' && skeleton.length > 0 && (
          <section id="skeleton-preview" className="py-12 bg-[#faf8f2] border-t border-amber-100">
            <div className="container mx-auto px-6 md:px-12 max-w-3xl">
              <div className="bg-white border border-amber-100 rounded-2xl shadow-sm p-6 md:p-8">
                {/* Header */}
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="text-xs font-bold tracking-widest text-amber-600 uppercase mb-1">Step 3 of 3 — Skeleton Review</div>
                    <h3 className="font-serif text-2xl text-stone-900">Review Module Structure</h3>
                    {skeletonEdited && generationPhase === 'skeleton_ready' && (
                      <p className="text-xs text-emerald-600 mt-1">✓ Changes will be used in generation</p>
                    )}
                  </div>
                  {generationPhase === 'skeleton_ready' && (
                    <button
                      onClick={() => setGenerationPhase('idle')}
                      className="text-xs text-stone-400 hover:text-stone-700 underline underline-offset-2 transition-colors shrink-0 mt-1"
                    >
                      ← Back
                    </button>
                  )}
                </div>
                <p className="text-sm text-stone-500 mb-6">
                  {generationPhase === 'expanding'
                    ? `Expanding modules... ${expandProgress} of ${skeleton.length} complete`
                    : 'Review and edit titles and objectives below, then click Generate Full Curriculum when ready.'}
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  <span className="text-amber-400">●</span> = complexity level — more dots means more advanced
                </p>

                {/* Module list */}
                <div className="space-y-2 mb-8">
                  {skeleton.map((mod, idx) => {
                    const isOpen = skeletonExpanded.has(idx);
                    const isDone = generationPhase === 'expanding' && idx < expandProgress;
                    const isActive = generationPhase === 'expanding' && idx === expandProgress;
                    return (
                      <div
                        key={idx}
                        className={`border rounded-xl transition-colors ${
                          isDone
                            ? 'border-emerald-200 bg-emerald-50'
                            : isActive
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-stone-200 bg-stone-50'
                        }`}
                      >
                        <div className="w-full flex items-center gap-3 px-4 py-3">
                          <button
                            type="button"
                            onClick={() => setSkeletonExpanded(prev => {
                              const next = new Set(prev);
                              next.has(idx) ? next.delete(idx) : next.add(idx);
                              return next;
                            })}
                            className="font-mono text-xs text-stone-400 shrink-0 w-5 text-left"
                          >{idx + 1}</button>
                          {generationPhase === 'skeleton_ready' ? (
                            <input
                              className="flex-1 font-bold bg-transparent border-b border-stone-300 focus:border-amber-500 focus:outline-none w-full text-sm text-stone-800 leading-snug"
                              value={mod.title || ''}
                              onChange={e => updateSkeleton(idx, { title: e.target.value })}
                              onClick={e => e.stopPropagation()}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSkeletonExpanded(prev => {
                                const next = new Set(prev);
                                next.has(idx) ? next.delete(idx) : next.add(idx);
                                return next;
                              })}
                              className="flex-1 font-semibold text-stone-800 text-sm leading-snug text-left"
                            >{mod.title || `Module ${idx + 1}`}</button>
                          )}
                          <span className="flex gap-0.5 shrink-0">
                            {[1, 2, 3, 4, 5].map(n => (
                              <span key={n} className={`w-1.5 h-1.5 rounded-full ${n <= Number(mod.complexity_level) ? 'bg-amber-400' : 'bg-stone-200'}`} />
                            ))}
                          </span>
                          {isDone && <span className="text-emerald-500 text-xs font-bold shrink-0">Done</span>}
                          {isActive && <span className="text-amber-600 text-xs font-bold shrink-0 animate-pulse">...</span>}
                          {generationPhase === 'skeleton_ready' && skeleton.length > 1 && (
                            <button
                              type="button"
                              onClick={e => { e.stopPropagation(); deleteSkeletonModule(idx); }}
                              className="text-stone-300 hover:text-red-400 text-sm px-1 shrink-0 transition-colors"
                              title="Remove module"
                            >×</button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSkeletonExpanded(prev => {
                              const next = new Set(prev);
                              next.has(idx) ? next.delete(idx) : next.add(idx);
                              return next;
                            })}
                            className={`text-stone-400 text-xs shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                          >▾</button>
                        </div>
                        {isOpen && (
                          <div className="px-4 pb-3 pt-0">
                            {generationPhase === 'skeleton_ready' ? (
                              <div className="space-y-1">
                                {(mod.learning_objectives || []).map((obj, objIdx) => (
                                  <div key={objIdx} className="flex items-center gap-2">
                                    <span className="text-amber-400 shrink-0 mt-0.5 text-xs">•</span>
                                    <input
                                      className="bg-transparent border-b border-stone-200 focus:border-amber-400 focus:outline-none text-sm w-full text-stone-600"
                                      value={obj}
                                      onChange={e => {
                                        const newObjs = [...(mod.learning_objectives || [])];
                                        newObjs[objIdx] = e.target.value;
                                        updateSkeleton(idx, { learning_objectives: newObjs });
                                      }}
                                    />
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="text-xs text-amber-500 hover:text-amber-700 mt-1 ml-4"
                                  onClick={() => updateSkeleton(idx, { learning_objectives: [...(mod.learning_objectives || []), ''] })}
                                >+ Add objective</button>
                              </div>
                            ) : (
                              Array.isArray(mod.learning_objectives) && mod.learning_objectives.length > 0 && (
                                <ul className="space-y-1">
                                  {mod.learning_objectives.map((obj, oi) => (
                                    <li key={oi} className="text-xs text-stone-600 flex gap-2">
                                      <span className="text-amber-400 shrink-0 mt-0.5">•</span>
                                      <span>{obj}</span>
                                    </li>
                                  ))}
                                </ul>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add Module button */}
                {generationPhase === 'skeleton_ready' && (
                  <div className="mb-6">
                    <button
                      type="button"
                      className="text-stone-400 hover:text-stone-600 text-sm transition-colors"
                      onClick={addSkeletonModule}
                    >+ Add Module</button>
                  </div>
                )}

                {/* Action buttons */}
                {generationPhase === 'skeleton_ready' && (
                  <div className="flex items-center gap-4 flex-wrap">
                    <button
                      onClick={runExpandAll}
                      className="px-6 py-3 rounded-lg font-bold uppercase tracking-wider text-sm transition-colors flex items-center gap-2"
                      style={{ background: '#C5A028', color: 'white' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#a8871e'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#C5A028'; }}
                    >
                      Generate Full Curriculum →
                    </button>
                    <span className="text-xs text-stone-400">
                      This will expand all {skeleton.length} modules with readings and assignments.
                    </span>
                  </div>
                )}
                {generationPhase === 'expanding' && (
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin shrink-0"></div>
                    <span className="text-sm text-stone-600 font-medium">
                      Expanding module {expandProgress + 1} of {skeleton.length}...
                    </span>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* MODULES */}
        <section id="modules" className="bg-white border-t border-stone-100 min-h-screen">
          <div className="flex">

            {/* Left sidebar — LMS style */}
            <div className="w-72 shrink-0 bg-white border-r border-stone-200 sticky top-20 h-[calc(100vh-80px)] flex flex-col overflow-hidden">
              {/* Sidebar header */}
              <div className="px-4 py-4 border-b border-stone-200">
                <div className="flex items-center gap-2 mb-1">
                  <BookOpen size={13} className="text-nobel-gold" />
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-widest">Course Structure</span>
                </div>
                <div className="flex items-center justify-between">
                  {editedModules.length > 0 ? (
                    <p className="text-xs text-stone-500">
                      {editedModules.length} modules{viewMode === 'professor' ? ' · drag to reorder' : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-stone-400">Generate a curriculum to begin</p>
                  )}
                  {viewMode === 'professor' && editedModules.length > 0 && (
                    <button
                      onClick={addModule}
                      className="text-stone-400 hover:text-stone-700 text-sm font-bold px-1"
                      title="Add module"
                    >
                      +
                    </button>
                  )}
                </div>
              </div>

              {/* Course narrative */}
              {viewMode === 'professor' && courseNarrative && (
                <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e7e5e4' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.6rem', letterSpacing: '0.15em', color: '#a8a29e', textTransform: 'uppercase', fontWeight: 700 }}>Course Narrative</span>
                    {!editingNarrative && (
                      <button
                        onClick={() => setEditingNarrative(true)}
                        style={{ fontSize: '0.6rem', color: '#a8a29e', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '0.2rem' }}
                      >
                        ✏️ edit
                      </button>
                    )}
                  </div>
                  {editingNarrative ? (
                    <>
                      <textarea
                        value={courseNarrative}
                        onChange={e => setCourseNarrative(e.target.value)}
                        onBlur={() => { setEditingNarrative(false); handleAutoSave(); }}
                        autoFocus
                        rows={4}
                        style={{
                          width: '100%',
                          fontSize: '0.72rem',
                          color: '#57534e',
                          lineHeight: 1.5,
                          border: '1px solid #d6d3d1',
                          borderRadius: '6px',
                          padding: '0.4rem 0.5rem',
                          resize: 'none',
                          fontFamily: 'inherit',
                          background: '#fafaf9',
                          boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ fontSize: '0.62rem', color: '#86efac', marginTop: '0.2rem' }}>✓ Auto-saving</div>
                    </>
                  ) : (
                    <p style={{ fontSize: '0.72rem', color: '#78716c', lineHeight: 1.55, margin: 0, fontStyle: 'italic' }}>
                      {courseNarrative}
                    </p>
                  )}
                </div>
              )}

              {/* Module list */}
              <div className="flex-1 overflow-y-auto p-3">
                {editedModules.length > 0 ? (
                  <div className="space-y-1">
                    {editedModules.map((mod, idx) => (
                      <div
                        key={idx}
                        draggable={viewMode === 'professor'}
                        onDragStart={viewMode === 'professor' ? () => handleDragStart(idx) : undefined}
                        onDragOver={viewMode === 'professor' ? e => handleDragOver(e, idx) : undefined}
                        onDrop={viewMode === 'professor' ? e => handleDrop(e, idx) : undefined}
                        onDragEnd={viewMode === 'professor' ? handleDragEnd : undefined}
                        onClick={() => { setCurrentModuleIndex(idx); setActiveTab('objectives'); setIsEditing(false); }}
                        className={`group w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3 select-none ${
                          viewMode === 'professor' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${
                          idx === currentModuleIndex ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
                        } ${dragOverIndex === idx && dragIndex.current !== idx ? 'border-2 border-nobel-gold' : 'border-2 border-transparent'}`}
                      >
                        <span className="font-mono text-xs opacity-40 w-4 shrink-0">{idx + 1}</span>
                        <span className="truncate flex-1 leading-snug">{mod.title}</span>
                        <span className="flex gap-0.5 shrink-0">
                          {[1, 2, 3, 4, 5].map(n => (
                            <span key={n} className={`w-1.5 h-1.5 rounded-full ${
                              n <= Number(mod.complexity_level)
                                ? idx === currentModuleIndex ? 'bg-nobel-gold' : 'bg-stone-400'
                                : idx === currentModuleIndex ? 'bg-white/20' : 'bg-stone-200'
                            }`} />
                          ))}
                        </span>
                        {viewMode === 'professor' && editedModules.length > 1 && (
                          <button
                            onClick={e => { e.stopPropagation(); deleteModule(idx); }}
                            className="opacity-0 group-hover:opacity-100 ml-auto text-stone-400 hover:text-red-500 text-xs px-1"
                            title="Delete module"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-stone-300 text-xs">No modules yet</div>
                )}
              </div>
            </div>

              {/* Right — module card */}
              <div className="flex-1 min-w-0 p-8 lg:p-12">
                {currentModule ? (
                  <>
                    {/* Navigation */}
                    <div className="flex items-center justify-between mb-6">
                      <button onClick={() => navigateModule(-1)} disabled={currentModuleIndex === 0}
                        className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-lg text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
                        <ChevronLeft size={16} /> Prev
                      </button>
                      <span className="font-serif text-stone-600">
                        Module <span className="text-stone-900 font-bold">{currentModuleIndex + 1}</span>
                        <span className="text-stone-400"> of {editedModules.length}</span>
                      </span>
                      <button onClick={() => navigateModule(1)} disabled={currentModuleIndex === editedModules.length - 1}
                        className="flex items-center gap-1 px-3 py-2 bg-stone-100 rounded-lg text-stone-700 hover:bg-stone-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm font-medium">
                        Next <ChevronRight size={16} />
                      </button>
                    </div>

                    {/* Module Card */}
                    <div className="bg-[#F9F8F4] border border-stone-200 rounded-2xl p-8 shadow-sm">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-stone-500 uppercase tracking-widest font-bold">Complexity</span>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(n => (
                              <div key={n} className={`h-2 w-7 rounded-full transition-colors ${n <= Number(currentModule.complexity_level) ? 'bg-nobel-gold' : 'bg-stone-300'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-stone-500 font-mono">{currentModule.complexity_level}/5</span>
                        </div>
                        {viewMode === 'professor' && (
                          <button onClick={() => setIsEditing(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                              isEditing ? 'bg-stone-900 text-white hover:bg-stone-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                            }`}>
                            <Pencil size={12} /> {isEditing ? 'Done' : 'Edit'}
                          </button>
                        )}
                      </div>

                      <div className="text-nobel-gold font-serif text-xl italic mb-2">Module {currentModuleIndex + 1}</div>

                      {/* Title */}
                      {isEditing ? (
                        <input value={currentModule.title} onChange={e => updateCurrentModule({ title: e.target.value })}
                          onBlur={handleAutoSave}
                          className="font-serif text-2xl text-stone-900 w-full border-b-2 border-nobel-gold bg-transparent outline-none mb-6 pb-1" />
                      ) : (
                        <h3 className="font-serif text-2xl text-stone-900 mb-6">{currentModule.title}</h3>
                      )}

                      {/* Tabs */}
                      <div className="flex border-b border-stone-200 mb-6">
                        {(['objectives', 'resources', 'assessment'] as const).map(tab => (
                          <button key={tab} onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 text-xs font-bold uppercase tracking-widest transition-colors ${
                              activeTab === tab ? 'border-b-2 border-nobel-gold text-stone-900' : 'text-stone-400 hover:text-stone-700'
                            }`}>
                            {tab}
                          </button>
                        ))}
                      </div>

                      {isEditing && (
                        <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-1.5 mb-3 flex items-center gap-1.5">
                          <span>✓</span>
                          <span>Auto-saving — changes are saved as you type</span>
                        </div>
                      )}

                      {/* Tab: Objectives */}
                      {activeTab === 'objectives' && (
                        <>
                          {isEditing && viewMode === 'professor' ? (
                            <div className="space-y-2 mb-6">
                              {(currentModule.learning_objectives || []).map((obj, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                  <div className="w-1.5 h-1.5 rounded-full bg-nobel-gold flex-shrink-0" />
                                  <input value={obj} onChange={e => updateObjective(i, e.target.value)} onBlur={handleAutoSave} className={`flex-1 ${inputCls}`} />
                                  <button onClick={() => removeObjective(i)} className="text-stone-400 hover:text-red-500 transition-colors">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))}
                              <button onClick={addObjective} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 transition-colors mt-2">
                                <Plus size={14} /> Add objective
                              </button>
                            </div>
                          ) : (
                            <ul className="space-y-2 mb-8">
                              {(currentModule.learning_objectives || []).map((obj, i) => (
                                <li key={i} className="flex items-start gap-3 text-stone-700">
                                  <div className="w-1.5 h-1.5 rounded-full bg-nobel-gold mt-2 flex-shrink-0" />
                                  <span className="leading-relaxed">{obj}</span>
                                </li>
                              ))}
                            </ul>
                          )}

                          <div>
                            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">Narrative Preview</h4>
                            {isEditing && viewMode === 'professor' ? (
                              <textarea value={currentModule.narrative_preview} onChange={e => updateCurrentModule({ narrative_preview: e.target.value })}
                                onBlur={handleAutoSave}
                                rows={4} className={inputCls + ' resize-none italic'} />
                            ) : (
                              <p className="text-stone-600 leading-relaxed italic border-l-2 border-stone-300 pl-4">"{currentModule.narrative_preview}"</p>
                            )}
                          </div>
                        </>
                      )}

                      {/* Tab: Resources */}
                      {activeTab === 'resources' && (
                        <div className="space-y-4">
                          {isEditing && viewMode === 'professor' ? (
                            <>
                              {(currentModule.recommended_readings || []).map((r, ri) => (
                                <div key={ri} className="bg-white rounded-xl p-5 border border-stone-200">
                                  <div className="space-y-3">
                                    <div className="flex gap-2 items-start">
                                      <input value={r.title} onChange={e => updateReading(ri, { title: e.target.value })}
                                        onBlur={handleAutoSave}
                                        placeholder="Reading title" className={`flex-1 ${inputCls} font-bold`} />
                                      <button onClick={() => removeReading(ri)} className="text-stone-400 hover:text-red-500 mt-1 transition-colors">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                    <input
                                      className="w-full text-xs text-stone-400 border border-stone-200 rounded px-2 py-1 mt-1 focus:outline-none focus:border-stone-400"
                                      placeholder="🔗 https:// (optional)"
                                      value={r.url || ''}
                                      onChange={e => updateReading(ri, { url: e.target.value })}
                                      onBlur={handleAutoSave}
                                    />
                                    <select
                                      className="w-full text-xs text-stone-500 border border-stone-200 rounded px-2 py-1 mt-1 focus:outline-none focus:border-stone-400 bg-white"
                                      value={r.type || 'academic'}
                                      onChange={e => updateReading(ri, { type: e.target.value as 'academic' | 'video' | 'news' })}
                                      onBlur={handleAutoSave}
                                    >
                                      <option value="academic">📄 Academic</option>
                                      <option value="video">🎬 Video</option>
                                      <option value="news">📰 News</option>
                                    </select>
                                    <div className="space-y-1.5">
                                      {(r.key_points || []).map((kp, ki) => (
                                        <div key={ki} className="flex gap-2 items-center">
                                          <span className="text-nobel-gold font-bold">·</span>
                                          <input value={kp} onChange={e => updateReadingKeyPoint(ri, ki, e.target.value)}
                                            onBlur={handleAutoSave}
                                            placeholder="Key point" className={`flex-1 ${inputCls}`} />
                                        </div>
                                      ))}
                                    </div>
                                    <input value={r.rationale} onChange={e => updateReading(ri, { rationale: e.target.value })}
                                      onBlur={handleAutoSave}
                                      placeholder="Why this reading is essential..." className={inputCls} />
                                  </div>
                                </div>
                              ))}
                              <button onClick={addReading} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 transition-colors">
                                <Plus size={14} /> Add reading
                              </button>
                            </>
                          ) : (
                            (() => {
                              const readings = currentModule.recommended_readings || [];
                              const required = readings.filter(r => r.reading_type === 'required');
                              const optional = readings.filter(r => r.reading_type !== 'required');

                              const renderReadingCard = (r: Reading, ri: number) => (
                                <div key={ri} className="bg-white rounded-xl p-5 border border-stone-200">
                                  <div className="flex items-center gap-2 mb-2">
                                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                                      {r.type === 'video' ? '🎬' : r.type === 'news' ? '📰' : '📄'} {r.type || 'academic'}
                                    </span>
                                    {r.estimated_time && <span className="text-xs text-stone-400">{r.estimated_time}</span>}
                                  </div>
                                  {r.url ? (
                                    <a href={r.url} target="_blank" rel="noopener noreferrer"
                                      className="font-bold text-stone-900 hover:text-nobel-gold transition-colors mb-3 leading-snug block underline underline-offset-2 decoration-stone-300">
                                      {r.title}
                                    </a>
                                  ) : (
                                    <h5 className="font-bold text-stone-900 mb-3 leading-snug">{r.title}</h5>
                                  )}
                                  {r.key_points?.length > 0 && (
                                    <ul className="space-y-1 mb-3">
                                      {r.key_points.map((kp, j) => (
                                        <li key={j} className="text-sm text-stone-600 flex items-start gap-2">
                                          <span className="text-nobel-gold font-bold mt-0.5">·</span><span>{kp}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                  <div className="text-xs text-stone-500 border-t border-stone-100 pt-3 mt-3">
                                    <span className="font-bold text-stone-400 uppercase tracking-wide mr-1">Why:</span>{r.rationale}
                                  </div>
                                </div>
                              );

                              return (
                                <>
                                  {required.length > 0 && (
                                    <div className="space-y-3">
                                      <div className="text-xs font-bold tracking-widest text-amber-600 uppercase small-caps">Required Readings</div>
                                      {required.map((r, ri) => renderReadingCard(r, ri))}
                                    </div>
                                  )}
                                  {optional.length > 0 && (
                                    <div className="space-y-3">
                                      <div className="text-xs font-bold tracking-widest text-stone-400 uppercase small-caps">Optional Readings</div>
                                      {optional.map((r, ri) => renderReadingCard(r, required.length + ri))}
                                    </div>
                                  )}
                                  {readings.length === 0 && (
                                    <p className="text-stone-400 italic text-sm">No readings recommended for this module.</p>
                                  )}
                                </>
                              );
                            })()
                          )}
                        </div>
                      )}

                      {/* Tab: Assessment */}
                      {activeTab === 'assessment' && (
                        <div className="space-y-4">
                          {(currentModule.assignments || []).map((a, ai) => (
                            <div key={ai} className="bg-white rounded-xl p-5 border border-stone-200">
                              {isEditing && viewMode === 'professor' ? (
                                <div className="space-y-3">
                                  <div className="flex gap-2 items-start">
                                    <input value={a.title} onChange={e => updateAssignment(ai, { title: e.target.value })}
                                      onBlur={handleAutoSave}
                                      placeholder="Assignment title" className={`flex-1 ${inputCls} font-bold`} />
                                    <button onClick={() => removeAssignment(ai)} className="text-stone-400 hover:text-red-500 mt-1 transition-colors">
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                  <select value={a.type} onChange={e => updateAssignment(ai, { type: e.target.value })}
                                    className={inputCls}>
                                    {ASSIGNMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <textarea value={a.task_description || a.coverage || ''} onChange={e => updateAssignment(ai, { task_description: e.target.value })}
                                    onBlur={handleAutoSave}
                                    placeholder="Task description — what students need to do..." rows={3}
                                    className={inputCls + ' resize-none'} />
                                  <input value={a.deliverable || ''} onChange={e => updateAssignment(ai, { deliverable: e.target.value })}
                                    onBlur={handleAutoSave}
                                    placeholder="Deliverable (e.g. 500-word written reflection)" className={inputCls} />
                                  <input value={a.estimated_time || ''} onChange={e => updateAssignment(ai, { estimated_time: e.target.value })}
                                    onBlur={handleAutoSave}
                                    placeholder="Estimated time (e.g. 60 minutes)" className={inputCls} />
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center gap-2 mb-3">
                                    <span className="px-2 py-0.5 bg-stone-100 text-stone-600 text-xs font-bold rounded uppercase tracking-wide">{a.type}</span>
                                    <h5 className="font-bold text-stone-900">{a.title}</h5>
                                  </div>
                                  {/* task_description replaces old generic coverage text */}
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
                                </>
                              )}
                            </div>
                          ))}
                          {isEditing && viewMode === 'professor' && (
                            <button onClick={addAssignment} className="flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800 transition-colors">
                              <Plus size={14} /> Add assignment
                            </button>
                          )}
                          {!isEditing && (currentModule.assignments || []).length === 0 && (
                            <p className="text-stone-400 italic text-sm">No assignment for this module.</p>
                          )}
                        </div>
                      )}

                      {/* Student Comprehension Check Widget */}
                      {viewMode === 'student' && (() => {
                        const checkin = moduleCheckins[currentModuleIndex] ?? { choice: null, text: '', submitted: false };
                        const choices: { emoji: string; label: string; value: '🟢' | '🟡' | '🔴' | '⚫' }[] = [
                          { emoji: '🟢', label: 'Got it — I could explain this', value: '🟢' },
                          { emoji: '🟡', label: 'Mostly got it, but unclear on parts', value: '🟡' },
                          { emoji: '🔴', label: "Something's off, not sure what", value: '🔴' },
                          { emoji: '⚫', label: "Didn't really read it", value: '⚫' },
                        ];
                        const needsTextBox = checkin.choice === '🟡' || checkin.choice === '🔴';

                        const handleCheckinChoice = (value: '🟢' | '🟡' | '🔴' | '⚫') => {
                          const updated = { choice: value, text: checkinText, submitted: false };
                          setModuleCheckins(prev => ({ ...prev, [currentModuleIndex]: updated }));
                        };

                        const handleCheckinSubmit = () => {
                          const updated = { choice: checkin.choice!, text: checkinText, submitted: true };
                          setModuleCheckins(prev => ({ ...prev, [currentModuleIndex]: updated }));
                          try {
                            localStorage.setItem(`plotark_checkins_${currentModuleIndex}`, JSON.stringify(updated));
                          } catch { /* localStorage unavailable */ }
                        };

                        const handleCheckinSkip = () => {
                          const updated = { choice: checkin.choice!, text: '', submitted: true };
                          setModuleCheckins(prev => ({ ...prev, [currentModuleIndex]: updated }));
                          setCheckinText('');
                          try {
                            localStorage.setItem(`plotark_checkins_${currentModuleIndex}`, JSON.stringify(updated));
                          } catch { /* localStorage unavailable */ }
                        };

                        const handleSimpleSubmit = (value: '🟢' | '🟡' | '🔴' | '⚫') => {
                          const updated = { choice: value, text: '', submitted: true };
                          setModuleCheckins(prev => ({ ...prev, [currentModuleIndex]: updated }));
                          try {
                            localStorage.setItem(`plotark_checkins_${currentModuleIndex}`, JSON.stringify(updated));
                          } catch { /* localStorage unavailable */ }
                        };

                        return (
                          <div className="mt-8 pt-6 border-t border-stone-200">
                            <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">
                              How are you feeling about this module?
                            </p>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                              {choices.map(c => (
                                <button
                                  key={c.value}
                                  onClick={() => {
                                    handleCheckinChoice(c.value);
                                    if (c.value === '🟢' || c.value === '⚫') {
                                      handleSimpleSubmit(c.value);
                                    }
                                  }}
                                  className={`flex items-center gap-2 px-3 py-2.5 rounded-full text-sm font-medium transition-all border ${
                                    checkin.choice === c.value
                                      ? c.value === '🟢'
                                        ? 'bg-emerald-100 border-emerald-400 text-emerald-800'
                                        : c.value === '🟡'
                                        ? 'bg-amber-100 border-amber-400 text-amber-800'
                                        : c.value === '🔴'
                                        ? 'bg-red-100 border-red-400 text-red-700'
                                        : 'bg-stone-200 border-stone-400 text-stone-700'
                                      : 'bg-white border-stone-300 text-stone-600 hover:border-stone-400 hover:bg-stone-50'
                                  }`}
                                >
                                  <span className="text-base leading-none">{c.emoji}</span>
                                  <span className="leading-snug text-left">{c.label}</span>
                                </button>
                              ))}
                            </div>

                            {checkin.submitted && !needsTextBox && checkin.choice !== null && (
                              <p className="text-xs text-stone-500 font-medium">Recorded ✓</p>
                            )}

                            {checkin.choice !== null && needsTextBox && !checkin.submitted && (
                              <div className="mt-2 space-y-2">
                                <textarea
                                  value={checkinText}
                                  onChange={e => setCheckinText(e.target.value)}
                                  placeholder="Anything on your mind? (optional)"
                                  rows={3}
                                  className="w-full p-3 bg-white border border-stone-300 rounded-xl text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-300 resize-none transition-colors"
                                />
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={handleCheckinSubmit}
                                    className="px-4 py-1.5 bg-stone-900 text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-stone-700 transition-colors"
                                  >
                                    Submit
                                  </button>
                                  <button
                                    onClick={handleCheckinSkip}
                                    className="text-xs text-stone-400 hover:text-stone-600 transition-colors underline underline-offset-2"
                                  >
                                    Skip
                                  </button>
                                </div>
                              </div>
                            )}

                            {checkin.submitted && needsTextBox && (
                              <p className="text-xs text-stone-500 font-medium mt-2">Recorded ✓</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 border-2 border-dashed border-stone-200 rounded-2xl text-stone-400">
                    <BookOpen size={48} className="mb-4 opacity-20" />
                    {viewMode === 'student' ? (
                      <p className="font-serif text-xl text-center">No curriculum loaded yet.<br /><span className="text-base font-sans font-normal text-stone-400">Ask your professor to generate one.</span></p>
                    ) : (
                      <p className="font-serif text-xl">Generate a curriculum to see modules.</p>
                    )}
                  </div>
                )}
              </div>
            </div>
        </section>

        {/* SOURCES */}
        <section id="sources" className="py-24 bg-stone-900 text-stone-100 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
            <div className="w-96 h-96 rounded-full bg-stone-600 blur-[100px] absolute top-[-100px] left-[-100px]"></div>
            <div className="w-96 h-96 rounded-full bg-nobel-gold blur-[100px] absolute bottom-[-100px] right-[-100px]"></div>
          </div>
          <div className="container mx-auto px-6 relative z-10">
            <div className="max-w-2xl mx-auto w-full">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-stone-800 text-nobel-gold text-xs font-bold tracking-widest uppercase rounded-full mb-6 border border-stone-700">
                  CITATIONS
                </div>
                <h2 className="font-serif text-4xl md:text-5xl mb-8 text-white">Sources</h2>
                {curriculum ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs text-stone-500 uppercase tracking-widest">
                        {(curriculum.sources ?? []).length} sources
                      </p>
                      {previewSources.length > 0 ? (
                        <button
                          onClick={() => {
                            setShowSourceReview(true);
                            setTimeout(() => {
                              document.getElementById('source-review')?.scrollIntoView({ behavior: 'smooth' });
                            }, 50);
                          }}
                          className="text-sm text-amber-500 hover:text-amber-300 underline cursor-pointer transition-colors"
                        >
                          ← Regenerate with Different Sources
                        </button>
                      ) : loadedCurriculumMeta && viewMode === 'professor' && (
                        <button
                          onClick={handleReresearch}
                          disabled={isFetchingSources}
                          className="text-sm px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isFetchingSources ? 'Searching sources...' : 'Re-research this topic →'}
                        </button>
                      )}
                    </div>
                    {citationGroups.map((group, gi) => (
                      <div key={gi} className="border border-stone-700 rounded-xl overflow-hidden">
                        {/* Group header */}
                        <button
                          onClick={() => toggleCitationGroup(gi)}
                          className="w-full flex items-center justify-between px-5 py-3 bg-stone-800/60 hover:bg-stone-800 transition-colors text-left"
                        >
                          <span className="text-sm font-bold text-stone-300">
                            Sources {gi * CITATIONS_PER_PAGE + 1}–{Math.min((gi + 1) * CITATIONS_PER_PAGE, (curriculum.sources ?? []).length)}
                          </span>
                          <ChevronRight
                            size={14}
                            className={`text-stone-500 transition-transform duration-200 ${openCitationGroups.has(gi) ? 'rotate-90' : ''}`}
                          />
                        </button>
                        {/* Group body */}
                        {openCitationGroups.has(gi) && (
                          <div className="divide-y divide-stone-800">
                            {group.map((source, idx) => (
                              <a key={idx} href={source.url} target="_blank" rel="noopener noreferrer"
                                className="flex items-start justify-between gap-4 px-5 py-3 bg-stone-900/40 hover:bg-stone-800/60 transition-colors group">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                                      {source.type === 'video' ? '🎬' : source.type === 'news' ? '📰' : '📄'} {source.type || 'academic'}
                                    </span>
                                    {source.estimated_time && (
                                      <span className="text-xs text-stone-500">{source.estimated_time}</span>
                                    )}
                                  </div>
                                  <span className="block font-bold text-stone-200 group-hover:text-nobel-gold transition-colors text-sm">{source.title || source.domain}</span>
                                  <span className="block text-xs text-stone-400 mt-0.5">{source.domain}</span>
                                </div>
                                <span className="text-xs text-stone-600 shrink-0 mt-0.5">{source.retrieved_at}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-lg text-stone-500 leading-relaxed italic">Sources will appear here once the curriculum is generated.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* EXPORT */}
        {viewMode === 'professor' && <section id="export" className="py-24 bg-white border-t border-stone-200">
          <div className="container mx-auto px-6 grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
            <div className="md:col-span-5 relative">
              <div className="aspect-square bg-[#F5F4F0] rounded-xl overflow-hidden relative border border-stone-200 shadow-inner">
                <QuantumComputerScene />
                <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-stone-400 font-serif italic">Curriculum Engine Visualization</div>
              </div>
            </div>
            <div className="md:col-span-7 flex flex-col justify-center">
              <div className="inline-block mb-3 text-xs font-bold tracking-widest text-stone-500 uppercase">EXPORT</div>
              <h2 className="font-serif text-4xl mb-6 text-stone-900">Deploy Your Curriculum</h2>
              <p className="text-lg text-stone-600 mb-8 leading-relaxed">
                Export as an IMS Common Cartridge for direct LMS import, download as Markdown, or copy to clipboard.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button onClick={handleDownloadIMSCC} disabled={!curriculum}
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-stone-900 text-white rounded-xl hover:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest text-xs">
                  <Download size={16} /> .imscc
                </button>
                <button onClick={handleExportMarkdown} disabled={!curriculum}
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-white border-2 border-stone-200 text-stone-900 rounded-xl hover:border-stone-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest text-xs">
                  <FileText size={16} /> Export .md
                </button>
                <button onClick={handleCopyMarkdown} disabled={!curriculum}
                  className="flex items-center justify-center gap-2 px-5 py-4 bg-white border-2 border-stone-200 text-stone-900 rounded-xl hover:border-stone-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-bold uppercase tracking-widest text-xs">
                  {copied ? <CheckCircle2 size={16} className="text-green-600" /> : <Copy size={16} />}
                  {copied ? 'Copied!' : 'Copy .md'}
                </button>
              </div>
            </div>
          </div>
        </section>}

        {/* Knowledge Graph */}
        <section id="knowledge-graph" className="py-24 bg-stone-900">
          <div className="container mx-auto px-6">
            <div className="max-w-xl mb-12">
              <div className="text-xs tracking-[0.2em] text-stone-400 uppercase font-bold mb-3">Knowledge Graph</div>
              <h2 className="font-serif text-4xl mb-6 text-white">Explore the Knowledge Network</h2>
              <p className="text-lg text-stone-400 leading-relaxed">
                Visualize relationships between concepts, topics, and resources. Click a node to inspect it, filter by name, or ask a question about the graph.
              </p>
            </div>
            <GraphViewer />
          </div>
        </section>

        {/* Query History */}
        <QueryHistorySection
          onGoToGraph={() => {
            const el = document.getElementById('knowledge-graph');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          onCountChange={setQueryHistoryCount}
        />
      </main>

      <footer className="bg-stone-900 text-stone-400 py-16">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <div className="text-white font-serif font-bold text-2xl mb-2">Curriculum Engine</div>
            <p className="text-sm">AI-Powered Narrative Curriculum Design</p>
          </div>
        </div>
        <div className="text-center mt-12 text-xs text-stone-600">
          Bloom's Taxonomy · i+1 Scaffolding · Cognitive Load Theory
        </div>
      </footer>
    </div>
  );
};

export default App;
