/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { NodeObject, LinkObject } from 'react-force-graph-2d';
import { Network } from 'lucide-react';
import YearSidebar from './YearSidebar';
import QueryPanel from './QueryPanel';
import IngestPanel from './IngestPanel';
import GraphToolbar from './GraphToolbar';
import CourseBanner from './CourseBanner';
import NodeDetailPanel from './NodeDetailPanel';
import { DARK_BG, PANEL_BG, BORDER_COLOR, TEXT_PRIMARY, TEXT_MUTED, ACCENT, degreeToColor } from '../constants/theme';
import { useIngest } from '../hooks/useIngest';
import { useQuery } from '../hooks/useQuery';
import { useCourseManager } from '../hooks/useCourseManager';

// ---- Domain types ----

interface GraphNode { id: string; label: string; description: string; }
interface GraphEdge { source: string; target: string; label: string; }
interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; status?: string; }

interface FGNode extends GraphNode {
  val?: number; degree?: number; x?: number; y?: number;
}
type FGNodeObject = NodeObject<FGNode>;
type FGLinkObject = LinkObject<FGNode, { label: string }>;

// ---- Component ----

type SubjectKey = string;

interface GraphViewerProps {
  initialCourseCode?: string;
  initialCourseTopic?: string;
}

const GraphViewer: React.FC<GraphViewerProps> = ({ initialCourseCode, initialCourseTopic }) => {
  // ---- Core graph state ----
  const [activeSubject, setActiveSubject] = useState<SubjectKey>('all');
  const [selectedYear, setSelectedYear] = useState<number | null>(1);
  const [graphData, setGraphData] = useState<{ nodes: FGNodeObject[]; links: FGLinkObject[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notReady, setNotReady] = useState(false);
  const [maxDegree, setMaxDegree] = useState(1);
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
      const max = Math.max(1, ...Object.values(degreeMap));
      setMaxDegree(max);

      setGraphData({
        nodes: data.nodes.map(n => ({ ...n, degree: degreeMap[n.id] ?? 0, val: Math.max(1, (degreeMap[n.id] ?? 0) * 0.5 + 1) })),
        links: data.edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
      });
      setLoading(false);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load graph'); setLoading(false); }
  }, [activeSubject]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // ---- Canvas rendering (untouched) ----

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

      ctx.beginPath(); ctx.arc(nx, ny, r, 0, 2 * Math.PI);
      ctx.fillStyle = isFaded ? 'rgba(80,80,120,0.25)' : degreeToColor(degree, maxDegree); ctx.fill();

      if (isSelected || isHighlighted) {
        ctx.beginPath(); ctx.arc(nx, ny, r + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = isSelected ? '#f59e0b' : '#e879f9'; ctx.lineWidth = 2 / globalScale; ctx.stroke();
      }
      if (globalScale > 0.8 || isHighlighted || isSelected) {
        const fontSize = Math.max(3, 10 / globalScale);
        ctx.font = `${fontSize}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = isFaded ? 'rgba(148,163,184,0.3)' : TEXT_PRIMARY;
        ctx.fillText(label, nx, ny + r + fontSize * 0.9);
      }
    }, [highlightedIds, maxDegree, searchQuery, selectedNode]
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
      {/* How to use */}
      <div className="rounded-xl px-5 py-4 text-sm grid grid-cols-2 gap-x-8 gap-y-2" style={{ background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_MUTED }}>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🔍 Search</span> — type a concept name to highlight matching nodes</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🖱 Click a node</span> — see its full definition in the side panel</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>🔎 Zoom / pan</span> — scroll wheel to zoom, drag to move around</div>
        <div><span style={{ color: TEXT_PRIMARY, fontWeight: 600 }}>💬 Ask a question</span> — type below the graph to query the knowledge base</div>
      </div>

      {/* Main horizontal layout */}
      <div className="flex flex-row" style={{ gap: 0, alignItems: 'stretch', ...(isFullscreen ? { flex: '1 1 0', minHeight: 0 } : {}) }}>

      <YearSidebar selectedYear={selectedYear} onSelectYear={year => setSelectedYear(prev => prev === year ? null : year)} onSelectAll={() => { setSelectedYear(null); setActiveSubject('all'); }} undergraduateCourses={undergraduateCourses} />

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

        {selectedFGNode && <NodeDetailPanel node={selectedFGNode} onClose={() => setSelectedNode(null)} />}
      </div>

      {/* Hover tooltip */}
      {hoveredNode && (
        <div className="pointer-events-none fixed z-50 rounded-lg px-2.5 py-1.5 text-xs shadow-xl"
          style={{ left: mousePos.x + 14, top: mousePos.y - 10, background: PANEL_BG, border: `1px solid ${BORDER_COLOR}`, color: TEXT_PRIMARY, maxWidth: '220px' }}>
          <div className="font-semibold truncate">{(hoveredNode as FGNode).label}</div>
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
