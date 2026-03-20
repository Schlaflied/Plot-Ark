/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { NodeObject, LinkObject } from 'react-force-graph-2d';
import { Search, X, Send, Loader2, AlertCircle, Network } from 'lucide-react';

// ---- Domain types (matching the backend API contract) ----

interface GraphNode {
  id: string;
  label: string;
  description: string;
}

interface GraphEdge {
  source: string;
  target: string;
  label: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  status?: string;
}

// ---- Internal types used by react-force-graph-2d ----

interface FGNode extends GraphNode {
  val?: number;
  degree?: number;
  x?: number;
  y?: number;
}

type FGNodeObject = NodeObject<FGNode>;
type FGLinkObject = LinkObject<FGNode, { label: string }>;

// ---- Theme constants ----

const DARK_BG = '#f5f0e8';
const PANEL_BG = '#ede8de';
const BORDER_COLOR = '#d4cfc5';
const TEXT_PRIMARY = '#1a1a2e';
const TEXT_MUTED = '#6b6560';
const ACCENT = '#8B5E3C';

// Map degree (0..maxDegree) to a warm brown palette
function degreeToColor(degree: number, maxDegree: number): string {
  const t = maxDegree > 0 ? degree / maxDegree : 0;
  // Low degree: dusty tan (#c4a882) → High degree: deep walnut (#5c3317)
  const r = Math.round(196 + t * (92 - 196));
  const g = Math.round(168 + t * (51 - 168));
  const b = Math.round(130 + t * (23 - 130));
  return `rgb(${r},${g},${b})`;
}

// ---- Markdown stripper ----

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')        // ### headings
    .replace(/\*\*(.*?)\*\*/g, '$1')  // **bold**
    .replace(/\*(.*?)\*/g, '$1')      // *italic*
    .replace(/\[(\d+)\]/g, '')        // [1] reference numbers
    .replace(/ - /g, '\n• ')          // - list items → bullet
    .replace(/\n{3,}/g, '\n\n')       // collapse extra newlines
    .trim()
}

// ---- Subject tab config ----

type SubjectKey = string;

const GraphViewer: React.FC = () => {
  const [activeSubject, setActiveSubject] = useState<SubjectKey>('all');
  const [selectedYear, setSelectedYear] = useState<number | null>(1);

  // Undergraduate course data (mutable via CRUD)
  const [undergraduateCourses, setUndergraduateCourses] = useState<Record<number, { code: string; label: string; fullName: string }[]>>({
    1: [
      { code: 'acct-101', label: 'ACCT 101', fullName: 'Introduction to Financial Accounting' },
      { code: 'econ-101', label: 'ECON 101', fullName: 'Introduction to Microeconomics' },
      { code: 'bus-101', label: 'BUS 101', fullName: 'Foundations of Business' },
      { code: 'mgmt-101', label: 'MGMT 101', fullName: 'Principles of Management' },
      { code: 'hr-101', label: 'HR 101', fullName: 'Human Resources Fundamentals' },
    ],
    2: [
      { code: 'business-law', label: 'Business Law', fullName: 'Business Law and Ethics' },
      { code: 'info-201', label: 'INFO 201', fullName: 'Information Systems' },
      { code: 'acct-201', label: 'ACCT 201', fullName: 'Intermediate Accounting' },
      { code: 'econ-201', label: 'ECON 201', fullName: 'Macroeconomics' },
    ],
    3: [
      { code: 'supply-301', label: 'Supply Chain 301', fullName: 'Supply Chain Management' },
      { code: 'employ-301', label: 'Employment Law 301', fullName: 'Employment Law' },
      { code: 'mgmt-301', label: 'MGMT 301', fullName: 'Organizational Behavior' },
    ],
    4: [
      { code: 'nego-401', label: 'Negotiation 401', fullName: 'Negotiation and Conflict Resolution' },
      { code: 'ihrm-401', label: 'IHRM 401', fullName: 'International Human Resource Management' },
      { code: 'call', label: 'CALL', fullName: 'Computer-Assisted Language Learning' },
    ],
  });
  const [editingCourseKey, setEditingCourseKey] = useState<string | null>(null);
  const [courseNameInput, setCourseNameInput] = useState('');
  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameInput, setFullNameInput] = useState('');
  const [addingCourseYear, setAddingCourseYear] = useState<number | null>(null);
  const [newCourseInput, setNewCourseInput] = useState('');

  // Dynamic subject tabs
  const [subjectTabs, setSubjectTabs] = useState<{ key: string; label: string }[]>([
    { key: 'all', label: 'All' },
    { key: 'business-law', label: 'Business Law' },
    { key: 'call', label: 'CALL' },
  ]);
  const [addingTab, setAddingTab] = useState(false);
  const [newTabName, setNewTabName] = useState('');

  // Ingestion panel state
  const [ingestFiles, setIngestFiles] = useState<{ name: string; status: 'waiting' | 'processing' | 'done' | 'error' }[]>([]);
  const [ingestSubject, setIngestSubject] = useState('');
  const [ingestRunning, setIngestRunning] = useState(false);
  const [ingestOverflow, setIngestOverflow] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dropZoneHovered, setDropZoneHovered] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: FGNodeObject[]; links: FGLinkObject[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [maxDegree, setMaxDegree] = useState(1);

  // Sidebar
  const [selectedNode, setSelectedNode] = useState<FGNodeObject | null>(null);

  // Tooltip — position tracked via global mousemove
  const [hoveredNode, setHoveredNode] = useState<FGNodeObject | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Search / filter
  const [searchQuery, setSearchQuery] = useState('');

  // Query
  const [question, setQuestion] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryAnswer, setQueryAnswer] = useState<string | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryHistory, setQueryHistory] = useState<{ id: number; question: string; answer: string; subject: string; starred: boolean; matchedNodeId: string | null; timestamp?: number }[]>(() => {
    try {
      const stored = localStorage.getItem('plot_ark_query_history');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);

  // Persist queryHistory to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('plot_ark_query_history', JSON.stringify(queryHistory));
    } catch {
      // localStorage unavailable
    }
  }, [queryHistory]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  // Course search
  const [courseSearch, setCourseSearch] = useState('');
  const [courseSearchResults, setCourseSearchResults] = useState<{ year: number; code: string; label: string; fullName: string }[]>([]);
  const courseSearchRef = useRef<HTMLDivElement>(null);
  const [courseSearchOpen, setCourseSearchOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const hasInitializedZoom = useRef<boolean>(false);
  const dragTabIndex = useRef<number | null>(null);
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);
  const dragCoursePillIndex = useRef<number | null>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });

  // ESC to exit fullscreen
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  // Track cursor for tooltip
  useEffect(() => {
    const handleMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  // Measure container
  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: Math.max(rect.width, 300),
          height: Math.max(rect.height, 400),
        });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fetch graph
  useEffect(() => {
    const fetchGraph = async () => {
      setLoading(true);
      setError(null);
      setNotReady(false);
      setGraphData(null);
      hasInitializedZoom.current = false;
      try {
        const url = activeSubject === 'all' ? '/api/graph' : `/api/graph?subject=${activeSubject}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: GraphData = await res.json();

        if (data.status === 'not_ready') {
          setNotReady(true);
          setLoading(false);
          return;
        }

        // Compute degree map
        const degreeMap: Record<string, number> = {};
        data.nodes.forEach(n => { degreeMap[n.id] = 0; });
        data.edges.forEach(e => {
          degreeMap[e.source] = (degreeMap[e.source] ?? 0) + 1;
          degreeMap[e.target] = (degreeMap[e.target] ?? 0) + 1;
        });
        const max = Math.max(1, ...Object.values(degreeMap));
        setMaxDegree(max);

        const nodes: FGNodeObject[] = data.nodes.map(n => ({
          ...n,
          degree: degreeMap[n.id] ?? 0,
          val: Math.max(1, (degreeMap[n.id] ?? 0) * 0.5 + 1),
        }));

        const links: FGLinkObject[] = data.edges.map(e => ({
          source: e.source,
          target: e.target,
          label: e.label,
        }));

        setGraphData({ nodes, links });
        setLoading(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load graph');
        setLoading(false);
      }
    };
    fetchGraph();
  }, [activeSubject]);

  // Highlighted node ids from search
  const highlightedIds: Set<string> | null = searchQuery.trim()
    ? new Set(
        graphData?.nodes
          .filter(n => {
            const node = n as FGNode;
            return (
              node.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              String(node.id).toLowerCase().includes(searchQuery.toLowerCase())
            );
          })
          .map(n => String(n.id)) ?? []
      )
    : null;

  const nodeCanvasObject = useCallback(
    (node: FGNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as FGNode;
      const label = n.label ?? String(n.id);
      const degree = n.degree ?? 0;
      const r = Math.max(4, Math.sqrt(degree + 1) * 3);
      const nx = n.x ?? 0;
      const ny = n.y ?? 0;

      const nodeId = String(n.id);
      const isHighlighted = highlightedIds ? highlightedIds.has(nodeId) : false;
      const isSearchActive = !!searchQuery.trim();
      const isFaded = isSearchActive && !isHighlighted;
      const isSelected = selectedNode ? String((selectedNode as FGNode).id) === nodeId : false;

      const fillColor = degreeToColor(degree, maxDegree);

      // Draw node circle
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, 2 * Math.PI);
      ctx.fillStyle = isFaded ? 'rgba(80,80,120,0.25)' : fillColor;
      ctx.fill();

      // Selection / highlight ring
      if (isSelected || isHighlighted) {
        ctx.beginPath();
        ctx.arc(nx, ny, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? '#f59e0b' : '#e879f9';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Label
      if (globalScale > 0.8 || isHighlighted || isSelected) {
        const fontSize = Math.max(3, 10 / globalScale);
        ctx.font = `${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isFaded ? 'rgba(148,163,184,0.3)' : TEXT_PRIMARY;
        ctx.fillText(label, nx, ny + r + fontSize * 0.9);
      }
    },
    [highlightedIds, maxDegree, searchQuery, selectedNode]
  );

  const nodePointerAreaPaint = useCallback(
    (node: FGNodeObject, color: string, ctx: CanvasRenderingContext2D) => {
      const n = node as FGNode;
      const r = Math.max(4, Math.sqrt((n.degree ?? 0) + 1) * 3);
      ctx.beginPath();
      ctx.arc(n.x ?? 0, n.y ?? 0, r + 4, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();
    },
    []
  );

  const handleNodeClick = useCallback((node: FGNodeObject) => {
    setSelectedNode(prev => {
      const prevId = prev ? String((prev as FGNode).id) : null;
      const newId = String((node as FGNode).id);
      return prevId === newId ? null : node;
    });
  }, []);

  const handleNodeHover = useCallback(
    (node: FGNodeObject | null) => {
      setHoveredNode(node);
    },
    []
  );

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    setQueryLoading(true);
    setQueryAnswer(null);
    setQueryError(null);
    try {
      const res = await fetch('/api/graph/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim(), mode: 'hybrid', subject: activeSubject === 'all' ? 'business-law' : activeSubject }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = data.answer ?? JSON.stringify(data);
      setQueryAnswer(answer);
      const matchedNodeIdForHistory: string | null = data.matched_node_id ?? null;
      setQueryHistory(prev => [{ id: Date.now(), question: question.trim(), answer, subject: activeSubject, starred: false, matchedNodeId: matchedNodeIdForHistory, timestamp: Date.now() }, ...prev].slice(0, 20));

      // Highlight and pan to matched node if backend returned one
      const matchedNodeId: string | null = matchedNodeIdForHistory;
      if (matchedNodeId !== null && graphData) {
        // Try id match first, fall back to label match
        const matchedNode = (
          graphData.nodes.find(n => String(n.id) === matchedNodeId) ??
          graphData.nodes.find(n => (n as FGNode).label?.toLowerCase() === question.trim().toLowerCase())
        ) ?? null;
        if (matchedNode) {
          setSelectedNode(matchedNode);
          // Delay to let React re-render + ensure force-graph has set x/y
          setTimeout(() => {
            const n = matchedNode as FGNode;
            if (fgRef.current && n.x != null && n.y != null) {
              fgRef.current.centerAt(n.x, n.y, 800);
              fgRef.current.zoom(3, 800);
            }
          }, 150);
        }
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  };

  // ---- Ingestion helpers ----

  const COURSE_CODE_RE = /([A-Z]{2,4}\s?\d{3,4})/;

  const addFilesToIngest = (files: FileList | File[]) => {
    const fileArr = Array.from(files);
    setIngestFiles(prev => {
      const combined = [...prev, ...fileArr.map(f => ({ name: f.name, status: 'waiting' as const }))];
      if (combined.length > 15) {
        setIngestOverflow(true);
        return combined.slice(0, 15);
      }
      setIngestOverflow(false);
      return combined;
    });
    // Auto-detect course code from first filename if ingestSubject is empty
    if (fileArr.length > 0) {
      setIngestSubject(prev => {
        if (prev.trim() !== '') return prev;
        const match = COURSE_CODE_RE.exec(fileArr[0].name);
        return match ? match[1] : prev;
      });
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropZoneHovered(false);
    if (e.dataTransfer.files.length > 0) addFilesToIngest(e.dataTransfer.files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFilesToIngest(e.target.files);
      e.target.value = '';
    }
  };

  const handleBuildGraph = () => {
    if (ingestRunning || ingestFiles.length === 0 || ingestSubject.trim() === '') return;
    setIngestRunning(true);
    // Simulate processing each file sequentially
    const runNext = (idx: number) => {
      if (idx >= ingestFiles.length) {
        setIngestRunning(false);
        return;
      }
      setIngestFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'processing' } : f));
      setTimeout(() => {
        setIngestFiles(prev => prev.map((f, i) => i === idx ? { ...f, status: 'done' } : f));
        runNext(idx + 1);
      }, 800);
    };
    // Reset all to waiting first
    setIngestFiles(prev => prev.map(f => ({ ...f, status: 'waiting' })));
    setTimeout(() => runNext(0), 50);
  };

  // ---- Tab helpers ----

  const slugify = (name: string) =>
    name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const confirmAddTab = () => {
    const trimmed = newTabName.trim();
    if (!trimmed) { setAddingTab(false); setNewTabName(''); return; }
    const key = slugify(trimmed);
    if (!subjectTabs.find(t => t.key === key)) {
      setSubjectTabs(prev => [...prev, { key, label: trimmed }]);
    }
    setNewTabName('');
    setAddingTab(false);
  };

  const handleHistoryClick = (item: { question: string; answer: string; subject: string; matchedNodeId: string | null }) => {
    setQuestion(item.question);
    setQueryAnswer(item.answer);
    setActiveSubject(item.subject);
    if (item.matchedNodeId !== null && graphData) {
      const matchedNode = (
        graphData.nodes.find(n => String(n.id) === item.matchedNodeId) ??
        graphData.nodes.find(n => (n as FGNode).label?.toLowerCase() === item.question.toLowerCase())
      ) ?? null;
      if (matchedNode) {
        setSelectedNode(matchedNode);
        setTimeout(() => {
          const n = matchedNode as FGNode;
          if (fgRef.current && n.x != null && n.y != null) {
            fgRef.current.centerAt(n.x, n.y, 800);
            fgRef.current.zoom(3, 800);
          }
        }, 150);
      }
    }
  };

  // ---- Course search ----

  const handleCourseSearch = (query: string) => {
    setCourseSearch(query);
    if (!query.trim()) {
      setCourseSearchResults([]);
      setCourseSearchOpen(false);
      return;
    }
    const q = query.toLowerCase();
    const results: { year: number; code: string; label: string; fullName: string }[] = [];
    Object.entries(undergraduateCourses).forEach(([year, courses]) => {
      courses.forEach(course => {
        if (course.label.toLowerCase().includes(q) || course.code.toLowerCase().includes(q)) {
          results.push({ year: Number(year), code: course.code, label: course.label, fullName: course.fullName });
        }
      });
    });
    setCourseSearchResults(results);
    setCourseSearchOpen(results.length > 0);
  };

  const selectCourseResult = (result: { year: number; code: string; label: string; fullName: string }) => {
    setSelectedYear(result.year);
    setActiveSubject(result.code);
    setCourseSearch('');
    setCourseSearchResults([]);
    setCourseSearchOpen(false);
  };

  // Click-outside: close course search dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (courseSearchRef.current && !courseSearchRef.current.contains(e.target as Node)) {
        setCourseSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ---- Render states ----

  if (loading) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ background: DARK_BG, borderRadius: '0.75rem', minHeight: '16rem' }}
      >
        <div className="flex flex-col items-center gap-3" style={{ color: TEXT_MUTED }}>
          <Loader2 size={28} className="animate-spin" style={{ color: ACCENT }} />
          <span className="text-sm">Loading knowledge graph…</span>
        </div>
      </div>
    );
  }

  if (notReady) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ background: DARK_BG, borderRadius: '0.75rem', minHeight: '16rem' }}
      >
        <div className="flex flex-col items-center gap-3 text-center px-8" style={{ color: TEXT_MUTED }}>
          <Network size={32} style={{ color: ACCENT, opacity: 0.5 }} />
          <p className="text-sm">Knowledge graph not initialized. Run the ingestion script first.</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ background: DARK_BG, borderRadius: '0.75rem', minHeight: '16rem' }}
      >
        <div className="flex flex-col items-center gap-3 text-center px-8" style={{ color: '#f87171' }}>
          <AlertCircle size={28} />
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!graphData) return null;

  const selectedFGNode = selectedNode ? (selectedNode as FGNode) : null;

  return (
    <div
      className={isFullscreen ? undefined : 'w-full flex flex-col gap-4'}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 50, background: DARK_BG, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1rem', padding: '1rem' } : undefined}
    >
      {/* How to use */}
      <div
        className="rounded-xl px-5 py-4 text-sm grid grid-cols-2 gap-x-8 gap-y-2"
        style={{ background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_MUTED }}
      >
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🔍 Search</span> — type a concept name to highlight matching nodes</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🖱 Click a node</span> — see its full definition in the side panel</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🔎 Zoom / pan</span> — scroll wheel to zoom, drag to move around</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>💬 Ask a question</span> — type below the graph to query the knowledge base</div>
      </div>

      {/* Main horizontal layout: year sidebar + graph viewer + ingestion panel */}
      <div className="flex flex-row" style={{ gap: 0, alignItems: 'stretch' }}>

      {/* Left: Year navigation sidebar */}
      <div
        className="flex flex-col p-3"
        style={{
          width: '160px',
          flexShrink: 0,
          background: PANEL_BG,
          borderRight: `1px solid ${BORDER_COLOR}`,
          border: `1px solid ${BORDER_COLOR}`,
          borderRadius: '0.75rem 0 0 0.75rem',
        }}
      >
        <div
          className="text-xs font-semibold tracking-widest uppercase mb-3"
          style={{ color: TEXT_MUTED }}
        >
          Undergraduate
        </div>
        {[1, 2, 3, 4].map(year => {
          const isActive = selectedYear === year;
          return (
            <button
              key={year}
              onClick={() => setSelectedYear(prev => prev === year ? null : year)}
              className="w-full text-left rounded text-sm"
              style={{
                padding: '0.5rem 0.75rem',
                background: isActive ? ACCENT : 'transparent',
                color: isActive ? DARK_BG : TEXT_MUTED,
                border: 'none',
                cursor: 'pointer',
                fontWeight: isActive ? 600 : 400,
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = BORDER_COLOR;
              }}
              onMouseLeave={e => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              Year {year}
            </button>
          );
        })}
        {/* Separator */}
        <div style={{ borderTop: `1px solid ${BORDER_COLOR}`, margin: '8px 0' }} />
        {/* All Courses */}
        <div
          onClick={() => { setSelectedYear(null); setActiveSubject('all'); }}
          style={{
            padding: '6px 12px',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            fontSize: '0.8rem',
            background: selectedYear === null ? ACCENT : 'transparent',
            color: selectedYear === null ? DARK_BG : TEXT_MUTED,
            fontWeight: selectedYear === null ? 600 : 400,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => { if (selectedYear !== null) (e.currentTarget as HTMLDivElement).style.background = BORDER_COLOR; }}
          onMouseLeave={e => { if (selectedYear !== null) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
        >
          All Courses
        </div>
      </div>

      {/* Middle: graph viewer (flex-col: toolbar + banner + graph + query) */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ flex: '1 1 0', minWidth: 0, background: DARK_BG, border: `1px solid ${BORDER_COLOR}`, borderLeft: 'none', borderRadius: '0 0.75rem 0.75rem 0' }}
      >
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-wrap"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}`, background: PANEL_BG }}
      >
        <Network size={16} style={{ color: ACCENT, flexShrink: 0 }} />

        {/* Subject tabs — hidden when a year is selected */}
        {selectedYear === null && <div className="flex items-center gap-1" style={{ background: DARK_BG, borderRadius: '0.5rem', padding: '2px' }}>
          {subjectTabs.map((tab, index) => {
            const isActive = activeSubject === tab.key;
            const isDragOver = dragOverTabIndex === index;
            return (
              <div
                key={tab.key}
                className="relative flex items-center group"
                draggable={true}
                onDragStart={e => { dragTabIndex.current = index; e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverTabIndex(index); }}
                onDragLeave={() => setDragOverTabIndex(null)}
                onDrop={e => {
                  e.preventDefault();
                  if (dragTabIndex.current === null || dragTabIndex.current === index) { setDragOverTabIndex(null); return; }
                  setSubjectTabs(prev => {
                    const next = [...prev];
                    const [moved] = next.splice(dragTabIndex.current!, 1);
                    next.splice(index, 0, moved);
                    return next;
                  });
                  dragTabIndex.current = null;
                  setDragOverTabIndex(null);
                }}
                onDragEnd={() => { dragTabIndex.current = null; setDragOverTabIndex(null); }}
                style={{ display: 'inline-flex', cursor: 'grab', userSelect: 'none', background: isDragOver ? BORDER_COLOR : undefined, borderRadius: '0.375rem' }}
              >
                <button
                  onClick={() => setActiveSubject(tab.key)}
                  className="text-xs font-medium px-3 py-1 rounded transition-all"
                  style={{
                    background: isActive ? ACCENT : 'transparent',
                    color: isActive ? DARK_BG : TEXT_MUTED,
                    border: 'none',
                    cursor: 'inherit',
                    borderRadius: '0.375rem',
                    fontWeight: isActive ? 600 : 400,
                    paddingRight: tab.key !== 'all' ? '1.4rem' : undefined,
                  }}
                >
                  {tab.label}
                </button>
                {tab.key !== 'all' && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setSubjectTabs(prev => prev.filter(t => t.key !== tab.key));
                      if (activeSubject === tab.key) setActiveSubject('all');
                    }}
                    title="Remove tab"
                    className="absolute"
                    style={{
                      right: '3px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: isActive ? DARK_BG : TEXT_MUTED,
                      fontSize: '0.65rem',
                      lineHeight: 1,
                      padding: '1px',
                      opacity: 0,
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                    onFocus={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                    onBlur={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0'; }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {/* + button to add new tab */}
          {addingTab ? (
            <div className="flex items-center gap-1 px-1">
              <input
                autoFocus
                type="text"
                value={newTabName}
                onChange={e => setNewTabName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') confirmAddTab();
                  if (e.key === 'Escape') { setAddingTab(false); setNewTabName(''); }
                }}
                placeholder="Subject name"
                style={{
                  background: DARK_BG,
                  border: `1px solid ${ACCENT}`,
                  color: TEXT_PRIMARY,
                  borderRadius: '0.375rem',
                  padding: '0.15rem 0.4rem',
                  fontSize: '0.75rem',
                  outline: 'none',
                  width: '110px',
                }}
              />
              <button
                onClick={confirmAddTab}
                style={{
                  background: ACCENT,
                  color: DARK_BG,
                  border: 'none',
                  borderRadius: '0.375rem',
                  padding: '0.15rem 0.4rem',
                  fontSize: '0.7rem',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Add
              </button>
              <button
                onClick={() => { setAddingTab(false); setNewTabName(''); }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: TEXT_MUTED,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTab(true)}
              title="Add subject tab"
              style={{
                background: 'none',
                border: `1px dashed ${BORDER_COLOR}`,
                color: TEXT_MUTED,
                borderRadius: '0.375rem',
                padding: '0.1rem 0.45rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              +
            </button>
          )}
        </div>}

        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: TEXT_MUTED }}>
          {graphData.nodes.length} nodes · {graphData.links.length} edges
        </span>
        <div className="flex-1" />

        {/* Course search */}
        <div className="relative" ref={courseSearchRef}>
          <div className="relative flex items-center">
            <Search
              size={13}
              className="absolute left-2.5 pointer-events-none"
              style={{ color: TEXT_MUTED }}
            />
            <input
              type="text"
              value={courseSearch}
              onChange={e => handleCourseSearch(e.target.value)}
              placeholder="Search courses…"
              style={{
                background: DARK_BG,
                border: `1px solid ${BORDER_COLOR}`,
                color: TEXT_PRIMARY,
                borderRadius: '0.5rem',
                padding: '0.3rem 2rem 0.3rem 2rem',
                fontSize: '0.75rem',
                outline: 'none',
                width: '160px',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
              onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
            />
            {courseSearch && (
              <button
                onClick={() => { setCourseSearch(''); setCourseSearchResults([]); setCourseSearchOpen(false); }}
                className="absolute right-2"
                style={{ color: TEXT_MUTED, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <X size={12} />
              </button>
            )}
          </div>
          {courseSearchOpen && (
            <div
              className="absolute mt-1"
              style={{
                top: '100%',
                left: 0,
                zIndex: 50,
                background: PANEL_BG,
                border: `1px solid ${BORDER_COLOR}`,
                borderRadius: '0.5rem',
                minWidth: '200px',
                maxHeight: '220px',
                overflowY: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              }}
            >
              {courseSearchResults.map(result => (
                <button
                  key={`${result.year}-${result.code}`}
                  onClick={() => selectCourseResult(result)}
                  className="w-full text-left flex items-center gap-2 px-3 py-2"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    color: TEXT_PRIMARY,
                    borderBottom: `1px solid ${BORDER_COLOR}`,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = DARK_BG; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  <span style={{ color: TEXT_MUTED, flexShrink: 0 }}>Year {result.year}</span>
                  <span style={{ fontWeight: 500 }}>{result.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search input */}
        <div className="relative flex items-center">
          <Search
            size={13}
            className="absolute left-2.5 pointer-events-none"
            style={{ color: TEXT_MUTED }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Filter nodes…"
            style={{
              background: DARK_BG,
              border: `1px solid ${BORDER_COLOR}`,
              color: TEXT_PRIMARY,
              borderRadius: '0.5rem',
              padding: '0.3rem 2rem 0.3rem 2rem',
              fontSize: '0.75rem',
              outline: 'none',
              width: '180px',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2"
              style={{ color: TEXT_MUTED, lineHeight: 1 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Dismiss sidebar */}
        {selectedNode && (
          <button
            onClick={() => setSelectedNode(null)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: BORDER_COLOR, color: TEXT_MUTED }}
          >
            Close panel
          </button>
        )}

        {/* Fullscreen toggle */}
        {!isFullscreen ? (
          <button
            onClick={() => setIsFullscreen(true)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: BORDER_COLOR, color: TEXT_MUTED }}
            title="Enter full screen"
          >
            ⛶ Full screen
          </button>
        ) : (
          <button
            onClick={() => setIsFullscreen(false)}
            className="text-xs px-2 py-1 rounded"
            style={{ background: BORDER_COLOR, color: TEXT_MUTED }}
            title="Exit full screen (Esc)"
          >
            ✕ Exit full screen
          </button>
        )}
        <button
          onClick={() => fgRef.current?.zoomToFit(400, 40)}
          className="text-xs px-2 py-1 rounded"
          style={{ background: BORDER_COLOR, color: TEXT_MUTED }}
          title="Fit all nodes in view"
        >
          ⊡ Fit view
        </button>
      </div>

      {/* Course banner — shown when a year is selected */}
      {selectedYear !== null && (
        <div
          className="flex items-center gap-2"
          style={{
            borderBottom: `1px solid ${BORDER_COLOR}`,
            background: PANEL_BG,
            padding: '8px 16px',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          <span className="text-xs font-semibold shrink-0" style={{ color: TEXT_MUTED }}>
            Year {selectedYear}:
          </span>
          <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
            {undergraduateCourses[selectedYear]?.map((course, idx) => {
              const isCoursActive = activeSubject === course.code;
              const isEditing = editingCourseKey === course.code;
              return (
                <div
                  key={course.code}
                  className="relative group flex-shrink-0"
                  draggable={true}
                  onDragStart={e => { dragCoursePillIndex.current = idx; e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                  onDrop={e => { e.preventDefault(); if (dragCoursePillIndex.current === null || dragCoursePillIndex.current === idx) return; setUndergraduateCourses(prev => { const next = { ...prev }; const arr = [...(next[selectedYear!] || [])]; const [moved] = arr.splice(dragCoursePillIndex.current!, 1); arr.splice(idx, 0, moved); next[selectedYear!] = arr; dragCoursePillIndex.current = null; return next; }); }}
                  onDragEnd={() => { dragCoursePillIndex.current = null; }}
                  style={{ cursor: 'grab', userSelect: 'none' }}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      type="text"
                      value={courseNameInput}
                      onChange={e => setCourseNameInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const trimmed = courseNameInput.trim();
                          if (trimmed) {
                            setUndergraduateCourses(prev => ({
                              ...prev,
                              [selectedYear]: prev[selectedYear].map(c =>
                                c.code === course.code ? { ...c, label: trimmed } : c
                              ),
                            }));
                          }
                          setEditingCourseKey(null);
                          setCourseNameInput('');
                        }
                        if (e.key === 'Escape') {
                          setEditingCourseKey(null);
                          setCourseNameInput('');
                        }
                      }}
                      onBlur={() => {
                        const trimmed = courseNameInput.trim();
                        if (trimmed) {
                          setUndergraduateCourses(prev => ({
                            ...prev,
                            [selectedYear]: prev[selectedYear].map(c =>
                              c.code === course.code ? { ...c, label: trimmed } : c
                            ),
                          }));
                        }
                        setEditingCourseKey(null);
                        setCourseNameInput('');
                      }}
                      style={{
                        background: DARK_BG,
                        border: `1px solid ${ACCENT}`,
                        color: TEXT_PRIMARY,
                        borderRadius: '999px',
                        padding: '2px 10px',
                        fontSize: '0.75rem',
                        outline: 'none',
                        width: '110px',
                      }}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => setActiveSubject(course.code)}
                        className="text-xs rounded-full shrink-0"
                        style={{
                          padding: '3px 12px',
                          background: isCoursActive ? ACCENT : 'transparent',
                          color: isCoursActive ? DARK_BG : TEXT_MUTED,
                          border: `1px solid ${isCoursActive ? ACCENT : BORDER_COLOR}`,
                          cursor: 'pointer',
                          fontWeight: isCoursActive ? 600 : 400,
                          transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => {
                          if (!isCoursActive) {
                            (e.currentTarget as HTMLButtonElement).style.background = BORDER_COLOR;
                          }
                        }}
                        onMouseLeave={e => {
                          if (!isCoursActive) {
                            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                          }
                        }}
                      >
                        {course.label}
                      </button>
                      {/* Hover action buttons */}
                      <span
                        className="absolute -top-1.5 -right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ zIndex: 5 }}
                      >
                        <button
                          title="Rename"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingCourseKey(course.code);
                            setCourseNameInput(course.label);
                          }}
                          style={{
                            background: PANEL_BG,
                            border: `1px solid ${BORDER_COLOR}`,
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            fontSize: '0.55rem',
                            cursor: 'pointer',
                            color: TEXT_MUTED,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        >
                          <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>✎</span>
                        </button>
                        <button
                          title="Delete"
                          onClick={e => {
                            e.stopPropagation();
                            setUndergraduateCourses(prev => ({
                              ...prev,
                              [selectedYear]: prev[selectedYear].filter(c => c.code !== course.code),
                            }));
                            if (activeSubject === course.code) setActiveSubject('all');
                          }}
                          style={{
                            background: PANEL_BG,
                            border: `1px solid ${BORDER_COLOR}`,
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            fontSize: '0.6rem',
                            cursor: 'pointer',
                            color: TEXT_MUTED,
                            lineHeight: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
            {/* Add course inline */}
            {addingCourseYear === selectedYear ? (
              <div className="flex items-center gap-1 flex-shrink-0">
                <input
                  autoFocus
                  type="text"
                  value={newCourseInput}
                  onChange={e => setNewCourseInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const trimmed = newCourseInput.trim();
                      if (trimmed) {
                        const code = trimmed.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
                        setUndergraduateCourses(prev => ({
                          ...prev,
                          [selectedYear]: [...(prev[selectedYear] ?? []), { code, label: trimmed, fullName: trimmed }],
                        }));
                      }
                      setAddingCourseYear(null);
                      setNewCourseInput('');
                    }
                    if (e.key === 'Escape') {
                      setAddingCourseYear(null);
                      setNewCourseInput('');
                    }
                  }}
                  placeholder="Course name"
                  style={{
                    background: DARK_BG,
                    border: `1px solid ${ACCENT}`,
                    color: TEXT_PRIMARY,
                    borderRadius: '999px',
                    padding: '2px 10px',
                    fontSize: '0.75rem',
                    outline: 'none',
                    width: '110px',
                  }}
                />
                <button
                  onClick={() => { setAddingCourseYear(null); setNewCourseInput(''); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: TEXT_MUTED,
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    padding: '0 2px',
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingCourseYear(selectedYear)}
                title="Add course"
                style={{
                  background: 'none',
                  border: `1px dashed ${BORDER_COLOR}`,
                  color: TEXT_MUTED,
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                +
              </button>
            )}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setSelectedYear(null)}
            className="text-xs shrink-0"
            style={{
              background: 'none',
              border: 'none',
              color: TEXT_MUTED,
              cursor: 'pointer',
              padding: '3px 8px',
            }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Full name tag strip — shown when a course in the current year is active */}
      {selectedYear !== null && (() => {
        const activeCourse = undergraduateCourses[selectedYear]?.find(c => c.code === activeSubject);
        if (!activeCourse) return null;
        return (
          <div
            style={{
              background: PANEL_BG,
              borderBottom: `1px solid ${BORDER_COLOR}`,
              padding: '6px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {editingFullName ? (
              <input
                autoFocus
                type="text"
                value={fullNameInput}
                onChange={e => setFullNameInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const trimmed = fullNameInput.trim();
                    if (trimmed) {
                      setUndergraduateCourses(prev => ({
                        ...prev,
                        [selectedYear]: prev[selectedYear].map(c =>
                          c.code === activeCourse.code ? { ...c, fullName: trimmed } : c
                        ),
                      }));
                    }
                    setEditingFullName(false);
                    setFullNameInput('');
                  }
                  if (e.key === 'Escape') {
                    setEditingFullName(false);
                    setFullNameInput('');
                  }
                }}
                onBlur={() => {
                  const trimmed = fullNameInput.trim();
                  if (trimmed) {
                    setUndergraduateCourses(prev => ({
                      ...prev,
                      [selectedYear]: prev[selectedYear].map(c =>
                        c.code === activeCourse.code ? { ...c, fullName: trimmed } : c
                      ),
                    }));
                  }
                  setEditingFullName(false);
                  setFullNameInput('');
                }}
                style={{
                  background: DARK_BG,
                  border: `1px solid ${ACCENT}`,
                  color: TEXT_PRIMARY,
                  borderRadius: '999px',
                  padding: '3px 12px',
                  fontSize: '0.8rem',
                  outline: 'none',
                  width: '320px',
                }}
              />
            ) : (
              <div
                className="group"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                onClick={() => { setEditingFullName(true); setFullNameInput(activeCourse.fullName); }}
              >
                <span
                  style={{
                    background: DARK_BG,
                    border: `1px solid ${BORDER_COLOR}`,
                    borderRadius: '999px',
                    padding: '3px 12px',
                    fontSize: '0.8rem',
                    color: TEXT_PRIMARY,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {activeCourse.fullName}
                </span>
                <button
                  title="Rename full name"
                  onClick={e => {
                    e.stopPropagation();
                    setEditingFullName(true);
                    setFullNameInput(activeCourse.fullName);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: TEXT_MUTED,
                    fontSize: '0.8rem',
                    lineHeight: 1,
                    padding: '2px',
                    opacity: 1,
                  }}
                >
                  <span style={{ transform: 'scaleX(-1)', display: 'inline-block' }}>✎</span>
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Graph + detail sidebar */}
      <div className="relative" style={{ minHeight: '500px', height: '60vh' }}>
        {/* Canvas area — always full width */}
        <div ref={containerRef} className="w-full h-full overflow-hidden">
          <ForceGraph2D
            ref={fgRef}
            width={dimensions.width}
            height={dimensions.height}
            graphData={graphData}
            backgroundColor={DARK_BG}
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            onNodeClick={handleNodeClick}
            onNodeHover={handleNodeHover}
            onEngineStop={() => {
              if (!hasInitializedZoom.current) {
                fgRef.current?.zoomToFit(400, 80);
                hasInitializedZoom.current = true;
              }
            }}
            linkColor={() => 'rgba(139,94,60,0.25)'}
            linkWidth={1}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={() => 'rgba(139,94,60,0.5)'}
            cooldownTicks={120}
            d3AlphaDecay={0.02}
            d3VelocityDecay={0.3}
          />
        </div>

        {/* Detail panel — floats over the graph in the top-right corner */}
        {selectedFGNode && (
          <div
            className="flex flex-col"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: '280px',
              zIndex: 10,
              borderLeft: `1px solid ${BORDER_COLOR}`,
              background: PANEL_BG,
              overflowY: 'auto',
            }}
          >
            <div
              className="flex items-start justify-between p-4"
              style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
            >
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-semibold tracking-widest uppercase mb-1"
                  style={{ color: ACCENT }}
                >
                  Node Detail
                </div>
                <h3
                  className="text-base font-semibold leading-snug"
                  style={{ color: TEXT_PRIMARY, wordBreak: 'break-word' }}
                >
                  {selectedFGNode.label}
                </h3>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="ml-2 mt-0.5 shrink-0"
                style={{ color: TEXT_MUTED }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              <div>
                <div
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: TEXT_MUTED }}
                >
                  ID
                </div>
                <div
                  className="text-xs font-mono px-2 py-1 rounded truncate"
                  style={{ background: DARK_BG, color: TEXT_MUTED }}
                >
                  {String(selectedFGNode.id)}
                </div>
              </div>

              <div>
                <div
                  className="text-xs uppercase tracking-widest mb-1"
                  style={{ color: TEXT_MUTED }}
                >
                  Connections
                </div>
                <div className="text-sm" style={{ color: TEXT_PRIMARY }}>
                  {selectedFGNode.degree ?? 0}
                </div>
              </div>

              {selectedFGNode.description && (
                <div>
                  <div
                    className="text-xs uppercase tracking-widest mb-1.5"
                    style={{ color: TEXT_MUTED }}
                  >
                    Description
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: TEXT_PRIMARY }}
                  >
                    {selectedFGNode.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hover tooltip (fixed, follows cursor) */}
      {hoveredNode && (
        <div
          className="pointer-events-none fixed z-50 rounded-lg px-2.5 py-1.5 text-xs shadow-xl"
          style={{
            left: mousePos.x + 14,
            top: mousePos.y - 10,
            background: PANEL_BG,
            border: `1px solid ${BORDER_COLOR}`,
            color: TEXT_PRIMARY,
            maxWidth: '220px',
          }}
        >
          <div className="font-semibold truncate">{(hoveredNode as FGNode).label}</div>
          {(hoveredNode as FGNode).degree !== undefined && (
            <div style={{ color: TEXT_MUTED }}>
              {(hoveredNode as FGNode).degree} connection
              {(hoveredNode as FGNode).degree !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      {/* Query bar */}
      <div
        className="flex flex-col gap-3 p-4"
        style={{ borderTop: `1px solid ${BORDER_COLOR}`, background: PANEL_BG }}
      >
        <form onSubmit={handleQuery} className="flex items-center gap-2">
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
                        onClick={() => handleHistoryClick(item)}
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
    </div>
    {/* End middle graph viewer */}

    {/* Right: Ingestion panel */}
    <div
      className="flex flex-col"
      style={{
        width: '288px',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: PANEL_BG,
        border: `1px solid ${BORDER_COLOR}`,
        borderRadius: '0.75rem',
        margin: '0 0 0 8px',
      }}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.pptx,.docx"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileInput}
      />

      {/* Panel header */}
      <div
        className="px-4 pt-4 pb-2"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}` }}
      >
        <div
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: ACCENT }}
        >
          Upload Materials
        </div>
      </div>

      <div className="flex flex-col gap-3 p-4" style={{ flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        {/* Subject name input */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium" style={{ color: TEXT_MUTED }}>
            Subject name
          </label>
          <input
            type="text"
            value={ingestSubject}
            onChange={e => setIngestSubject(e.target.value)}
            placeholder="e.g. CALL 201"
            disabled={ingestRunning}
            style={{
              background: DARK_BG,
              border: `1px solid ${BORDER_COLOR}`,
              color: TEXT_PRIMARY,
              borderRadius: '0.5rem',
              padding: '0.35rem 0.6rem',
              fontSize: '0.8rem',
              outline: 'none',
              transition: 'border-color 0.15s',
              opacity: ingestRunning ? 0.6 : 1,
            }}
            onFocus={e => (e.currentTarget.style.borderColor = ACCENT)}
            onBlur={e => (e.currentTarget.style.borderColor = BORDER_COLOR)}
          />
        </div>

        {/* Drop zone */}
        <div
          onClick={() => !ingestRunning && fileInputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDropZoneHovered(true); }}
          onDragLeave={() => setDropZoneHovered(false)}
          onDrop={handleFileDrop}
          style={{
            flex: '1 1 0',
            minHeight: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px dashed ${dropZoneHovered ? ACCENT : BORDER_COLOR}`,
            borderRadius: '0.5rem',
            padding: '1.25rem 0.75rem',
            textAlign: 'center',
            cursor: ingestRunning ? 'not-allowed' : 'pointer',
            background: dropZoneHovered ? 'rgba(139,94,60,0.05)' : DARK_BG,
            transition: 'border-color 0.15s, background 0.15s',
            opacity: ingestRunning ? 0.6 : 1,
          }}
        >
          <div className="text-xs" style={{ color: TEXT_MUTED, lineHeight: 1.6 }}>
            <div style={{ fontSize: '1.25rem', marginBottom: '0.35rem' }}>📂</div>
            <div>Drop PDF, PPTX, DOCX</div>
            <div>or click to browse</div>
            <div className="mt-1" style={{ fontSize: '0.875rem', color: TEXT_PRIMARY, fontWeight: 600 }}>Max 15 files</div>
          </div>
        </div>

        {/* Overflow warning */}
        {ingestOverflow && (
          <div className="text-xs" style={{ color: '#f87171' }}>
            Only the first 15 files were added.
          </div>
        )}

        {/* File list */}
        {ingestFiles.length > 0 && (
          <div className="flex flex-col gap-1">
            {ingestFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded px-2 py-1.5 text-xs"
                style={{ background: DARK_BG, border: `1px solid ${BORDER_COLOR}` }}
              >
                <span style={{ flexShrink: 0 }}>📄</span>
                <span
                  className="flex-1 truncate"
                  style={{ color: TEXT_PRIMARY }}
                  title={file.name}
                >
                  {file.name}
                </span>
                <span style={{ flexShrink: 0, fontSize: '0.8rem' }}>
                  {file.status === 'waiting' && '⏳'}
                  {file.status === 'processing' && (
                    <span style={{ color: ACCENT }}>🔄</span>
                  )}
                  {file.status === 'done' && '✅'}
                  {file.status === 'error' && '❌'}
                </span>
                {file.status === 'processing' && (
                  <span style={{ color: TEXT_MUTED, fontSize: '0.65rem', flexShrink: 0 }}>
                    processing...
                  </span>
                )}
                {!ingestRunning && (
                  <button
                    onClick={() => setIngestFiles(prev => prev.filter((_, i) => i !== idx))}
                    title="Remove"
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: TEXT_MUTED,
                      fontSize: '0.75rem',
                      lineHeight: 1,
                      padding: '0 1px',
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      </div>

      {/* Build Graph button — pinned at bottom of panel */}
      <div className="px-4 pb-4 pt-2">
        <button
          onClick={handleBuildGraph}
          disabled={ingestFiles.length === 0 || ingestSubject.trim() === '' || ingestRunning}
          className="flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-opacity w-full"
          style={{
            background: ACCENT,
            color: DARK_BG,
            border: 'none',
            cursor: ingestFiles.length === 0 || ingestSubject.trim() === '' || ingestRunning ? 'not-allowed' : 'pointer',
            opacity: ingestFiles.length === 0 || ingestSubject.trim() === '' || ingestRunning ? 0.45 : 1,
          }}
        >
          {ingestRunning && (
            <Loader2 size={14} className="animate-spin" />
          )}
          {ingestRunning ? 'Building…' : 'Build Graph'}
        </button>
      </div>
    </div>
    {/* End ingestion panel */}

    </div>
    {/* End main horizontal row */}
    </div>
  );
};

export default GraphViewer;
