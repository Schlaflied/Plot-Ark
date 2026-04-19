/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { NodeObject, LinkObject } from 'react-force-graph-2d';
import { Network } from 'lucide-react';
import YearSidebar, { type FilterKey } from './YearSidebar';
import QueryPanel from './QueryPanel';
import IngestPanel from './IngestPanel';
import GraphToolbar from './GraphToolbar';
import CourseBanner from './CourseBanner';
import NodeDetailPanel from './NodeDetailPanel';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT, masteryToColor } from '../constants/theme';
import { useIngest } from '../hooks/useIngest';
import { useQuery } from '../hooks/useQuery';
import { useCourseManager } from '../hooks/useCourseManager';

// ---- Domain types ----

interface GraphNode { id: string; label: string; description: string; source_layer?: string; }
interface GraphEdge { source: string; target: string; label: string; }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; status?: string; }

interface FGNode extends GraphNode {
  val?: number; degree?: number; x?: number; y?: number; source_layer?: string;
}
type FGNodeObject = NodeObject<FGNode>;
type FGLinkObject = LinkObject<FGNode, { label: string }>;

// ---- Component ----

type SubjectKey = string;

interface AnnotationData {
  confusion_counts: Record<string, { count: number; pct: number; label: string }>;
  exam_focus: string[];
  important_counts: Record<string, number>;
  total_students: number;
}

interface GraphViewerProps {
  initialCourseCode?: string;
  initialCourseTopic?: string;
  masteryMap?: Record<string, string>;  // concept_id | label_lower → mastery_level
  role?: 'student' | 'professor';
  courseId?: number;
}

const GraphViewer: React.FC<GraphViewerProps> = ({ initialCourseCode, initialCourseTopic, masteryMap: masteryMapProp, role = 'student', courseId }) => {
  // ---- Mastery: use prop if provided, otherwise auto-fetch all ----
  const [masteryMapFetched, setMasteryMapFetched] = useState<Record<string, string>>({});
  useEffect(() => {
    if (masteryMapProp && Object.keys(masteryMapProp).length > 0) return;
    fetch('/api/mastery/all')
      .then(r => r.json())
      .then(d => setMasteryMapFetched(d.mastery || {}))
      .catch(() => {});
  }, [masteryMapProp]);
  const masteryMap = (masteryMapProp && Object.keys(masteryMapProp).length > 0)
    ? masteryMapProp
    : masteryMapFetched;

  // ---- Annotations ----
  const [sessionId] = useState<string>(() => {
    let id = localStorage.getItem('plot_ark_session_id');
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('plot_ark_session_id', id); }
    return id;
  });
  const [annotationData, setAnnotationData] = useState<AnnotationData>({ confusion_counts: {}, exam_focus: [], important_counts: {}, total_students: 1 });
  // myAnnotations: Set of "conceptId:type" this session has marked
  const [myAnnotations, setMyAnnotations] = useState<Set<string>>(new Set());

  // ---- Subject → courseId lookup (for annotation fetching when courseId prop is absent) ----
  const [subjectCourseMap, setSubjectCourseMap] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/graph/courses')
      .then(r => r.json())
      .then((rows: { id: number; course_code: string; topic: string }[]) => {
        const m: Record<string, number> = {};
        const toSlug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
        rows.forEach(r => {
          if (r.course_code) { m[r.course_code.toLowerCase()] = r.id; m[toSlug(r.course_code)] = r.id; }
          if (r.topic) { m[r.topic.toLowerCase()] = r.id; m[toSlug(r.topic)] = r.id; }
        });
        setSubjectCourseMap(m);
      })
      .catch(() => {});
  }, []);

  // ---- Module num map (for NodeDetailPanel "Related module" display) ----
  // conceptId_lower → module number string e.g. "2"
  const [moduleNumMap, setModuleNumMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!courseId) return;
    fetch(`/api/graph/kg-mapping/${courseId}`)
      .then(r => r.json())
      .then(data => {
        if (data.status !== 'ok') return;
        const moduleConceptsMap: Record<string, string[]> = data.module_concepts || {};
        const numMap: Record<string, string> = {};
        Object.entries(moduleConceptsMap).forEach(([modNum, concepts]) => {
          (concepts as any[]).forEach((c: any) => {
            const cid = typeof c === 'string' ? c : (c.id || c.label || '');
            if (cid) numMap[cid.toLowerCase()] = modNum;
          });
        });
        setModuleNumMap(numMap);
      })
      .catch(() => {});
  }, [courseId]);

  // ---- Core graph state ----
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const handleToggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const [activeSubject, setActiveSubject] = useState<SubjectKey>('all');
  const [effectiveCourseId, setEffectiveCourseId] = useState<number | undefined>(courseId);
  useEffect(() => {
    if (courseId) { setEffectiveCourseId(courseId); return; }
    if (activeSubject && activeSubject !== 'all') {
      const key = activeSubject.toLowerCase();
      const asSpaced = key.replace(/-/g, ' ');
      const resolved = subjectCourseMap[key]
        ?? subjectCourseMap[asSpaced]
        ?? Object.entries(subjectCourseMap).find(([k]) => k.startsWith(asSpaced))?.[1]
        ?? Object.entries(subjectCourseMap).find(([k]) => k.includes(asSpaced))?.[1];
      setEffectiveCourseId(resolved);
    } else {
      setEffectiveCourseId(undefined);
    }
  }, [courseId, activeSubject, subjectCourseMap]);

  const fetchAnnotations = useCallback(() => {
    const url = effectiveCourseId ? `/api/kg/annotations/${effectiveCourseId}` : '/api/kg/annotations/global';
    fetch(url).then(r => r.json()).then(d => setAnnotationData(d)).catch(() => {});
  }, [effectiveCourseId]);

  useEffect(() => { fetchAnnotations(); }, [fetchAnnotations]);

  const handleAnnotate = useCallback(async (conceptId: string, conceptLabel: string, type: 'confused' | 'important' | 'exam_focus') => {
    try {
      const res = await fetch('/api/kg/annotate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: effectiveCourseId, concept_id: conceptId, concept_label: conceptLabel, role, annotation_type: type, session_id: sessionId }),
      });
      const data = await res.json();
      const key = `${conceptId}:${type}`;
      setMyAnnotations(prev => {
        const next = new Set(prev);
        data.action === 'added' ? next.add(key) : next.delete(key);
        return next;
      });
      fetchAnnotations();
    } catch { /* non-fatal */ }
  }, [effectiveCourseId, role, sessionId, fetchAnnotations]);

  const [selectedYear, setSelectedYear] = useState<number | null>(1);
  const [graphData, setGraphData] = useState<{ nodes: FGNodeObject[]; links: FGLinkObject[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [selectedNode, setSelectedNode] = useState<FGNodeObject | null>(null);
  const [hoveredNode, setHoveredNode] = useState<FGNodeObject | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const hasInitializedZoom = useRef<boolean>(false);

  // ---- Custom hooks ----

  const {
    undergraduateCourses, setUndergraduateCourses,
    subjectTabs, setSubjectTabs,
    addingTab, setAddingTab, newTabName, setNewTabName, confirmAddTab,
    editingCourseKey, setEditingCourseKey,
    courseNameInput, setCourseNameInput,
    addingCourseYear, setAddingCourseYear,
    newCourseInput, setNewCourseInput,
    courseSearch, courseSearchResults, courseSearchRef,
    courseSearchOpen,
    handleCourseSearch, selectCourseResult,
    dragTabIndex, dragOverTabIndex, setDragOverTabIndex,
    dragCoursePillIndex,
    addCourse,
  } = useCourseManager({ initialCourseCode, initialCourseTopic, setSelectedYear, setActiveSubject });

  const {
    ingestFiles, setIngestFiles, ingestFileObjects,
    ingestSubject, setIngestSubject,
    ingestCourseCode, setIngestCourseCode,
    ingestYear, setIngestYear,
    ingestLayer, setIngestLayer,
    ingestSubjectError, setIngestSubjectError,
    ingestYearError, setIngestYearError,
    ingestRunning, ingestOverflow, setIngestOverflow,
    ingestError, ingestSuccess,
    dropZoneHovered, setDropZoneHovered,
    handleBuildGraph,
  } = useIngest({
    onComplete: (tabKey, tabLabel, tabYear, subjectName) => {
      addCourse(tabKey, tabLabel, tabYear, subjectName);
      setSelectedYear(tabYear);
      setActiveSubject(tabKey);
    },
  });

  const {
    question, setQuestion,
    queryLoading, queryAnswer, queryError,
    queryHistory, setQueryHistory,
    showHistory, setShowHistory,
    handleQuery, handleHistoryClick,
  } = useQuery({ activeSubject, graphData, fgRef, setSelectedNode, setActiveSubject });

  // ---- Effects ----

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false); };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => setMousePos({ x: e.clientX, y: e.clientY });
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  useEffect(() => {
    const update = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setDimensions({ width: Math.max(rect.width, 300), height: Math.max(rect.height, 400) });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ---- Fetch graph ----

  const fetchGraph = useCallback(async () => {
    setLoading(true); setError(null); setNotReady(false); setGraphData(null);
    hasInitializedZoom.current = false;
    try {
      const url = activeSubject === 'all' ? '/api/graph' : `/api/graph?subject=${activeSubject}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: GraphData = await res.json();
      if (data.status === 'not_ready') { setNotReady(true); setLoading(false); return; }

      const degreeMap: Record<string, number> = {};
      data.nodes.forEach(n => { degreeMap[n.id] = 0; });
      data.edges.forEach(e => { degreeMap[e.source] = (degreeMap[e.source] ?? 0) + 1; degreeMap[e.target] = (degreeMap[e.target] ?? 0) + 1; });
      setGraphData({
        nodes: data.nodes.map(n => ({ ...n, degree: degreeMap[n.id] ?? 0, val: Math.max(1, (degreeMap[n.id] ?? 0) * 0.5 + 1) })),
        links: data.edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
      });
      setLoading(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load graph'); setLoading(false); }
  }, [activeSubject]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // ---- Canvas rendering ----

  const highlightedIds: Set<string> | null = searchQuery.trim()
    ? new Set(graphData?.nodes.filter(n => { const node = n as FGNode; return node.label?.toLowerCase().includes(searchQuery.toLowerCase()) || String(node.id).toLowerCase().includes(searchQuery.toLowerCase()); }).map(n => String(n.id)) ?? [])
    : null;

  const nodeCanvasObject = useCallback(
    (node: FGNodeObject, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const n = node as FGNode;
      const label = n.label ?? String(n.id);
      const degree = n.degree ?? 0;
      const r = Math.max(4, Math.sqrt(degree + 1) * 3);
      const nx = n.x ?? 0, ny = n.y ?? 0;
      const nodeId = String(n.id);
      const isHighlighted = highlightedIds ? highlightedIds.has(nodeId) : false;
      const isSearchActive = !!searchQuery.trim();
      const isFaded = isSearchActive && !isHighlighted;
      const isSelected = selectedNode ? String((selectedNode as FGNode).id) === nodeId : false;

      const nodeLayer = n.source_layer || 'hot';
      const nodeLabel = (n.label || '').toLowerCase();
      const masteryLevel = masteryMap?.[nodeId] || masteryMap?.[nodeLabel] || '';

      // Filter fading: if any filter is active, fade nodes that don't match
      const isFilterActive = activeFilters.size > 0;
      const nodeConfusionInfo = annotationData.confusion_counts[nodeId] || annotationData.confusion_counts[nodeLabel];
      const nodeIsExamFocus = annotationData.exam_focus.includes(nodeId);
      const nodeMatchesFilter = !isFilterActive || (
        (activeFilters.has('mastered')       && masteryLevel === 'mastered') ||
        (activeFilters.has('learning')       && masteryLevel === 'learning') ||
        (activeFilters.has('struggling')     && masteryLevel === 'struggling') ||
        (activeFilters.has('no_data')        && !masteryLevel) ||
        (activeFilters.has('exam_focus')     && nodeIsExamFocus) ||
        (activeFilters.has('confused')       && (nodeConfusionInfo?.count ?? 0) > 0) ||
        (activeFilters.has('high_confusion') && (nodeConfusionInfo?.pct ?? 0) > 50)
      );
      const isFilterFaded = isFilterActive && !nodeMatchesFilter;

      // Fill: mastery color > gray
      const effectiveFaded = isFaded || isFilterFaded;
      ctx.beginPath(); ctx.arc(nx, ny, r, 0, 2 * Math.PI);
      const masteryColor = masteryLevel ? masteryToColor(masteryLevel) : '';
      ctx.fillStyle = effectiveFaded
        ? 'rgba(80,80,120,0.25)'
        : (masteryColor || '#9ca3af');
      ctx.fill();

      // Border: layer color
      if (!effectiveFaded) {
        const layerBorderColor = nodeLayer === 'warm' ? '#c084fc'
          : nodeLayer === 'hot' ? '#d97706'
          : '#60a5fa';
        ctx.beginPath(); ctx.arc(nx, ny, r, 0, 2 * Math.PI);
        ctx.strokeStyle = layerBorderColor;
        ctx.lineWidth = 1.5 / globalScale;
        ctx.stroke();
      }

      // Exam focus ring (gold) — visible to both roles
      const isExamFocus = annotationData.exam_focus.includes(nodeId);
      if (isExamFocus && !effectiveFaded) {
        ctx.beginPath(); ctx.arc(nx, ny, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2 / globalScale; ctx.stroke();
      }

      // Selection / search highlight ring — white for visibility on dark canvas
      if (isSelected || isHighlighted) {
        ctx.beginPath(); ctx.arc(nx, ny, r + (isExamFocus ? 6 : 3), 0, 2 * Math.PI);
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / globalScale; ctx.stroke();
      }

      // Confusion badge — professor sees count (top-right), student sees own-confused dot (top-right)
      const confusionInfo = annotationData.confusion_counts[nodeId] || annotationData.confusion_counts[nodeLabel];
      const myConfused = myAnnotations.has(`${nodeId}:confused`);
      const hasClassConfusion = (confusionInfo?.count ?? 0) > 0;
      const showConfusionBadge = !effectiveFaded && (
        role === 'professor'
          ? hasClassConfusion
          : myConfused || (activeFilters.has('confused') && hasClassConfusion)
      );
      if (showConfusionBadge) {
        const badgeR = Math.max(3, r * 0.45);
        const bx = nx + r * 0.75, by = ny - r * 0.75;
        ctx.beginPath(); ctx.arc(bx, by, badgeR, 0, 2 * Math.PI);
        ctx.fillStyle = '#ef4444'; ctx.fill();
        if (role === 'professor' && confusionInfo) {
          const badgeFontSize = Math.max(2.5, badgeR * 1.1);
          ctx.font = `bold ${badgeFontSize}px Inter, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(confusionInfo.count > 9 ? '9+' : String(confusionInfo.count), bx, by);
        }
      }

      if (globalScale > 0.8 || isHighlighted || isSelected) {
        const fontSize = Math.max(3, 10 / globalScale);
        ctx.font = `${fontSize}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = effectiveFaded ? 'rgba(148,163,184,0.3)' : TEXT_PRIMARY;
        ctx.fillText(label, nx, ny + r + fontSize * 0.9);
      }
    }, [highlightedIds, searchQuery, selectedNode, masteryMap, annotationData, myAnnotations, role, activeFilters]
  );

  const nodePointerAreaPaint = useCallback((node: FGNodeObject, color: string, ctx: CanvasRenderingContext2D) => {
    const n = node as FGNode; const r = Math.max(4, Math.sqrt((n.degree ?? 0) + 1) * 3);
    ctx.beginPath(); ctx.arc(n.x ?? 0, n.y ?? 0, r + 4, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
  }, []);

  const handleNodeClick = useCallback((node: FGNodeObject) => {
    setSelectedNode(prev => { const prevId = prev ? String((prev as FGNode).id) : null; return prevId === String((node as FGNode).id) ? null : node; });
  }, []);

  const handleNodeHover = useCallback((node: FGNodeObject | null) => { setHoveredNode(node); }, []);

  // ---- Render ----

  const selectedFGNode = selectedNode ? (selectedNode as FGNode) : null;

  return (
    <div
      className={isFullscreen ? undefined : 'w-full flex flex-col gap-4'}
      style={isFullscreen ? { position: 'fixed', inset: 0, zIndex: 50, background: DARK_BG, display: 'flex', flexDirection: 'column', overflow: 'hidden', gap: '1rem', padding: '1rem' } : undefined}
    >
      {/* How to use + layer legend */}
      <div className="rounded-xl px-5 py-3 text-sm grid grid-cols-2 gap-x-8 gap-y-1.5" style={{ background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_MUTED }}>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🔍 Search</span> — type a concept name to highlight matching nodes</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🖱 Click a node</span> — see its full definition in the side panel</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🔎 Zoom / pan</span> — scroll wheel to zoom, drag to move around</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>💬 Ask a question</span> — type below the graph to query the knowledge base</div>
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '1.5rem', alignItems: 'center', paddingTop: '6px', borderTop: `1px solid ${BORDER_COLOR}` }}>
          <span style={{ color: TEXT_PRIMARY, fontWeight: 600, fontSize: '0.8rem' }}>Layer (border):</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'transparent', border: '2px solid #d97706' }} /> Core</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'transparent', border: '2px solid #c084fc' }} /> Supplementary</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'transparent', border: '2px solid #60a5fa' }} /> Student Notes</span>
        </div>
      </div>

      {/* Main horizontal layout */}
      <div className="flex flex-row" style={{ gap: 0, alignItems: 'stretch', ...(isFullscreen ? { flex: '1 1 0', minHeight: 0 } : {}) }}>

      <YearSidebar selectedYear={selectedYear} onSelectYear={year => setSelectedYear(prev => prev === year ? null : year)} onSelectAll={() => { setSelectedYear(null); setActiveSubject('all'); }} undergraduateCourses={undergraduateCourses} activeFilters={activeFilters} onToggleFilter={handleToggleFilter} role={role} />

      {/* Middle: graph viewer */}
      <div className="flex flex-col overflow-hidden" style={{ flex: '1 1 0', minWidth: 0, background: DARK_BG, border: `1px solid ${BORDER_COLOR}`, borderLeft: 'none', borderRadius: '0 0.75rem 0.75rem 0' }}>

      <GraphToolbar
        selectedYear={selectedYear} activeSubject={activeSubject} setActiveSubject={setActiveSubject}
        subjectTabs={subjectTabs} setSubjectTabs={setSubjectTabs}
        addingTab={addingTab} setAddingTab={setAddingTab} newTabName={newTabName} setNewTabName={setNewTabName} confirmAddTab={confirmAddTab}
        dragTabIndex={dragTabIndex} dragOverTabIndex={dragOverTabIndex} setDragOverTabIndex={setDragOverTabIndex}
        nodeCount={graphData ? graphData.nodes.length : null} edgeCount={graphData ? graphData.links.length : null}
        courseSearch={courseSearch} courseSearchResults={courseSearchResults} courseSearchRef={courseSearchRef} courseSearchOpen={courseSearchOpen}
        handleCourseSearch={handleCourseSearch} selectCourseResult={selectCourseResult}
        searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        hasSelectedNode={!!selectedNode} onClosePanel={() => setSelectedNode(null)}
        isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen}
        onFitView={() => fgRef.current?.zoomToFit(400, 40)}
      />

      {selectedYear !== null && (
        <CourseBanner
          selectedYear={selectedYear} activeSubject={activeSubject} setActiveSubject={setActiveSubject}
          undergraduateCourses={undergraduateCourses} setUndergraduateCourses={setUndergraduateCourses}
          editingCourseKey={editingCourseKey} setEditingCourseKey={setEditingCourseKey}
          courseNameInput={courseNameInput} setCourseNameInput={setCourseNameInput}
          addingCourseYear={addingCourseYear} setAddingCourseYear={setAddingCourseYear}
          newCourseInput={newCourseInput} setNewCourseInput={setNewCourseInput}
          dragCoursePillIndex={dragCoursePillIndex} setSelectedYear={setSelectedYear}
        />
      )}

      {/* Graph + detail sidebar */}
      <div className="relative" style={{ minHeight: '500px', height: '60vh' }}>
        <div ref={containerRef} className="w-full h-full overflow-hidden">
          {(notReady || error || !graphData) ? (
            <div className="flex items-center justify-center w-full h-full" style={{ background: DARK_BG }}>
              <div className="flex flex-col items-center gap-3 text-center px-8" style={{ color: TEXT_MUTED }}>
                <Network size={32} style={{ color: ACCENT, opacity: 0.5 }} />
                <p className="text-sm">{error ? error : 'No knowledge graph yet. Upload your course materials using the dropbox on the right first.'}</p>
              </div>
            </div>
          ) : (
          <ForceGraph2D
            ref={fgRef} width={dimensions.width} height={dimensions.height} graphData={graphData}
            backgroundColor={DARK_BG} nodeCanvasObject={nodeCanvasObject} nodePointerAreaPaint={nodePointerAreaPaint}
            onNodeClick={handleNodeClick} onNodeHover={handleNodeHover}
            onEngineStop={() => { if (!hasInitializedZoom.current) { fgRef.current?.zoomToFit(400, 80); hasInitializedZoom.current = true; } }}
            linkColor={() => 'rgba(139,94,60,0.25)'} linkWidth={1}
            linkDirectionalArrowLength={4} linkDirectionalArrowRelPos={1} linkDirectionalArrowColor={() => 'rgba(139,94,60,0.5)'}
            cooldownTicks={120} d3AlphaDecay={0.02} d3VelocityDecay={0.3}
          />
          )}
        </div>

        {selectedFGNode && (() => {
          const selId = String(selectedFGNode.id);
          const selLabel = (selectedFGNode.label ?? '').toLowerCase();
          const selMasteryLevel = masteryMap?.[selId] || masteryMap?.[selLabel] || '';
          const selModuleNum = moduleNumMap[selId.toLowerCase()] || moduleNumMap[selLabel];
          return (
            <NodeDetailPanel
              node={selectedFGNode}
              onClose={() => setSelectedNode(null)}
              role={role}
              moduleLabel={selModuleNum ? `Module ${selModuleNum}` : undefined}
              masteryLevel={selMasteryLevel || undefined}
              annotation={{
                isConfused: myAnnotations.has(`${selId}:confused`),
                isImportant: myAnnotations.has(`${selId}:important`),
                isExamFocus: annotationData.exam_focus.includes(selId),
                confusionCount: annotationData.confusion_counts[selId]?.count,
                confusionPct: annotationData.confusion_counts[selId]?.pct,
              }}
              onAnnotate={(type) => handleAnnotate(selId, selectedFGNode.label ?? '', type)}
            />
          );
        })()}
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="pointer-events-none fixed z-50 rounded-lg px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: mousePos.x + 14, top: mousePos.y - 10, background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_PRIMARY, maxWidth: '220px' }}>
          <div className="font-semibold truncate">{(hoveredNode as FGNode).label}</div>
          {(hoveredNode as FGNode).source_layer && (hoveredNode as FGNode).source_layer !== 'hot' && (
            <div style={{ color: (hoveredNode as FGNode).source_layer === 'warm' ? '#c084fc' : '#60a5fa', fontSize: '0.65rem', fontWeight: 600 }}>
              {(hoveredNode as FGNode).source_layer === 'warm' ? 'Supplementary' : 'Student Notes'}
            </div>
          )}
          {(hoveredNode as FGNode).degree !== undefined && (
            <div style={{ color: TEXT_MUTED }}>{(hoveredNode as FGNode).degree} connection{(hoveredNode as FGNode).degree !== 1 ? 's' : ''}</div>
          )}
        </div>
      )}

      <QueryPanel question={question} setQuestion={setQuestion} queryLoading={queryLoading} queryAnswer={queryAnswer} queryError={queryError}
        queryHistory={queryHistory} setQueryHistory={setQueryHistory} showHistory={showHistory} setShowHistory={setShowHistory}
        activeSubject={activeSubject} subjectTabs={subjectTabs} onSubmitQuery={handleQuery} onHistoryClick={handleHistoryClick} />
    </div>

    <IngestPanel
      ingestFiles={ingestFiles} setIngestFiles={setIngestFiles} ingestFileObjects={ingestFileObjects}
      ingestSubject={ingestSubject} setIngestSubject={setIngestSubject}
      ingestCourseCode={ingestCourseCode} setIngestCourseCode={setIngestCourseCode}
      ingestYear={ingestYear} setIngestYear={setIngestYear}
      ingestLayer={ingestLayer} setIngestLayer={setIngestLayer}
      ingestSubjectError={ingestSubjectError} setIngestSubjectError={setIngestSubjectError}
      ingestYearError={ingestYearError} setIngestYearError={setIngestYearError}
      ingestRunning={ingestRunning} ingestOverflow={ingestOverflow} setIngestOverflow={setIngestOverflow}
      ingestError={ingestError} ingestSuccess={ingestSuccess}
      dropZoneHovered={dropZoneHovered} setDropZoneHovered={setDropZoneHovered}
      onBuildGraph={handleBuildGraph} isFullscreen={isFullscreen}
    />

    </div>
    </div>
  );
};

export default GraphViewer;
