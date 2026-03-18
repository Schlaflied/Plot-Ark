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

type SubjectKey = 'all' | 'business-law' | 'call';

const SUBJECT_TABS: { key: SubjectKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'business-law', label: 'Business Law' },
  { key: 'call', label: 'CALL' },
];

const GraphViewer: React.FC = () => {
  const [activeSubject, setActiveSubject] = useState<SubjectKey>('all');
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
  const [queryHistory, setQueryHistory] = useState<{ id: number; question: string; answer: string; subject: SubjectKey; starred: boolean }[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 1200, height: 600 });

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
        body: JSON.stringify({ question: question.trim(), mode: 'hybrid' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const answer = data.answer ?? JSON.stringify(data);
      setQueryAnswer(answer);
      setQueryHistory(prev => [{ id: Date.now(), question: question.trim(), answer, subject: activeSubject, starred: false }, ...prev].slice(0, 20));

      // Highlight and pan to matched node if backend returned one
      const matchedNodeId: string | null = data.matched_node_id ?? null;
      if (matchedNodeId !== null && graphData) {
        const matchedNode = graphData.nodes.find(n => String(n.id) === matchedNodeId) ?? null;
        if (matchedNode) {
          setSelectedNode(matchedNode);
          const n = matchedNode as FGNode;
          if (fgRef.current && n.x != null && n.y != null) {
            fgRef.current.centerAt(n.x, n.y, 1000);
            fgRef.current.zoom(2, 1000);
          }
        }
      }
    } catch (err) {
      setQueryError(err instanceof Error ? err.message : 'Query failed');
    } finally {
      setQueryLoading(false);
    }
  };

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
    <div className="w-full flex flex-col gap-4">
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
    <div
      className="w-full flex flex-col rounded-xl overflow-hidden"
      style={{ background: DARK_BG, border: `1px solid ${BORDER_COLOR}` }}
    >
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-wrap"
        style={{ borderBottom: `1px solid ${BORDER_COLOR}`, background: PANEL_BG }}
      >
        <Network size={16} style={{ color: ACCENT, flexShrink: 0 }} />

        {/* Subject tabs */}
        <div className="flex items-center gap-1" style={{ background: DARK_BG, borderRadius: '0.5rem', padding: '2px' }}>
          {SUBJECT_TABS.map(tab => {
            const isActive = activeSubject === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveSubject(tab.key)}
                className="text-xs font-medium px-3 py-1 rounded transition-all"
                style={{
                  background: isActive ? ACCENT : 'transparent',
                  color: isActive ? DARK_BG : TEXT_MUTED,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: '0.375rem',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <span className="text-xs font-semibold tracking-widest uppercase" style={{ color: TEXT_MUTED }}>
          {graphData.nodes.length} nodes · {graphData.links.length} edges
        </span>
        <div className="flex-1" />

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
        <button
          onClick={() => fgRef.current?.zoomToFit(400, 40)}
          className="text-xs px-2 py-1 rounded"
          style={{ background: BORDER_COLOR, color: TEXT_MUTED }}
          title="Fit all nodes in view"
        >
          ⊡ Fit view
        </button>
      </div>

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
            onEngineStop={() => fgRef.current?.zoomToFit(400, 30)}
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
                    const subjectLabel =
                      item.subject === 'business-law' ? 'Business Law'
                      : item.subject === 'call' ? 'CALL'
                      : 'All';
                    const subjectStyle: React.CSSProperties =
                      item.subject === 'business-law'
                        ? { background: 'rgba(139,94,60,0.15)', color: '#8B5E3C' }
                        : item.subject === 'call'
                        ? { background: 'rgba(79,120,120,0.15)', color: '#4f7878' }
                        : { background: 'rgba(107,101,96,0.12)', color: TEXT_MUTED };
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg p-3 text-xs"
                        style={{ background: DARK_BG, border: `1px solid ${item.starred ? ACCENT : BORDER_COLOR}` }}
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
                            onClick={() =>
                              setQueryHistory(prev =>
                                prev.map(h => h.id === item.id ? { ...h, starred: !h.starred } : h)
                              )
                            }
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
                            onClick={() =>
                              setQueryHistory(prev => prev.filter(h => h.id !== item.id))
                            }
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
    </div>
  );
};

export default GraphViewer;
