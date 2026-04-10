/**
 * TrendChart — SVG line chart for analysis history.
 * Mini mode (default) + Full View modal for detailed inspection.
 * Shows at-risk % and completion rate over time.
 * Pure SVG, no external dependencies.
 */

import React, { useState, useEffect } from 'react';

interface HistoryPoint {
  run_at: string;
  at_risk_pct: number;
  avg_completion_rate: number;
  total_students: number;
  noise_label: string;
}

interface TrendChartProps {
  courseId: number;
}

/* Shared SVG chart renderer used by both mini and full modes */
function ChartSVG({
  history,
  W,
  H,
  PAD_X,
  PAD_Y,
  hoveredIdx,
  setHoveredIdx,
  showDateLabels,
  fontSize,
}: {
  history: HistoryPoint[];
  W: number;
  H: number;
  PAD_X: number;
  PAD_Y: number;
  hoveredIdx: number | null;
  setHoveredIdx: (i: number | null) => void;
  showDateLabels?: boolean;
  fontSize?: number;
}) {
  const chartW = W - PAD_X * 2;
  const chartH = H - PAD_Y * 2;
  const fs = fontSize ?? 7;

  const xScale = (i: number) => PAD_X + (i / (history.length - 1)) * chartW;
  const yScale = (v: number) => PAD_Y + (1 - v) * chartH;

  const riskPoints = history.map((p, i) => `${xScale(i)},${yScale(p.at_risk_pct)}`).join(' ');
  const compPoints = history.map((p, i) => `${xScale(i)},${yScale(p.avg_completion_rate)}`).join(' ');

  // Build filled area paths
  const riskAreaPath = `M ${xScale(0)},${yScale(0)} ` +
    history.map((p, i) => `L ${xScale(i)},${yScale(p.at_risk_pct)}`).join(' ') +
    ` L ${xScale(history.length - 1)},${yScale(0)} Z`;
  const compAreaPath = `M ${xScale(0)},${yScale(0)} ` +
    history.map((p, i) => `L ${xScale(i)},${yScale(p.avg_completion_rate)}`).join(' ') +
    ` L ${xScale(history.length - 1)},${yScale(0)} Z`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      onMouseLeave={() => setHoveredIdx(null)}
    >
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(v => (
        <g key={v}>
          <line
            x1={PAD_X} y1={yScale(v)} x2={W - PAD_X} y2={yScale(v)}
            stroke="#e7e5e4" strokeWidth="0.5"
            strokeDasharray={v === 0 || v === 1 ? '' : '2,3'}
          />
          <text x={2} y={yScale(v) + 3} textAnchor="start" fill="#a8a29e" fontSize={fs}>
            {(v * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      {/* Filled areas */}
      <path d={compAreaPath} fill="#60a5fa" opacity="0.06" />
      <path d={riskAreaPath} fill="#f87171" opacity="0.08" />

      {/* Completion line (blue, behind) */}
      <polyline
        points={compPoints} fill="none" stroke="#60a5fa"
        strokeWidth={showDateLabels ? '2.5' : '1.5'}
        strokeLinejoin="round" strokeLinecap="round" opacity="0.8"
      />

      {/* At-risk line (red, front) */}
      <polyline
        points={riskPoints} fill="none" stroke="#f87171"
        strokeWidth={showDateLabels ? '3' : '2'}
        strokeLinejoin="round" strokeLinecap="round"
      />

      {/* Date labels on x-axis (full mode only) */}
      {showDateLabels && history.map((p, i) => {
        // Show every Nth label to avoid overlap
        const step = Math.max(1, Math.floor(history.length / 8));
        if (i % step !== 0 && i !== history.length - 1) return null;
        const d = new Date(p.run_at);
        const label = `${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
        return (
          <text key={`dl-${i}`} x={xScale(i)} y={H - 2} textAnchor="middle" fill="#a8a29e" fontSize={fs - 0.5}>
            {label}
          </text>
        );
      })}

      {/* Data points — interactive */}
      {history.map((p, i) => (
        <g key={i} onMouseEnter={() => setHoveredIdx(i)} className="cursor-pointer">
          <rect x={xScale(i) - 12} y={0} width={24} height={H} fill="transparent" />
          <circle
            cx={xScale(i)} cy={yScale(p.at_risk_pct)}
            r={hoveredIdx === i ? (showDateLabels ? 6 : 4) : (showDateLabels ? 4 : 2)}
            fill="#f87171" className="transition-all duration-150"
          />
          <circle
            cx={xScale(i)} cy={yScale(p.avg_completion_rate)}
            r={hoveredIdx === i ? (showDateLabels ? 5.5 : 3.5) : (showDateLabels ? 3.5 : 1.5)}
            fill="#60a5fa" className="transition-all duration-150" opacity="0.85"
          />
        </g>
      ))}

      {/* Hover tooltip */}
      {hoveredIdx !== null && (() => {
        const p = history[hoveredIdx];
        const tx = xScale(hoveredIdx);
        const tooltipW = showDateLabels ? 175 : 118;
        const tooltipH = showDateLabels ? 72 : 52;
        const tooltipFS = showDateLabels ? 10 : 7;
        const tooltipX = tx > W / 2 ? tx - tooltipW - 8 : tx + 8;
        const date = new Date(p.run_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return (
          <g>
            <line x1={tx} y1={PAD_Y} x2={tx} y2={H - PAD_Y} stroke="#d6d3d1" strokeWidth="0.5" strokeDasharray="2,2" />
            <rect x={tooltipX} y={PAD_Y} width={tooltipW} height={tooltipH} rx={6} fill="#1c1917" opacity="0.94" />
            <text x={tooltipX + 8} y={PAD_Y + tooltipFS + 4} fill="#a8a29e" fontSize={tooltipFS - 1}>{date}</text>
            <text x={tooltipX + 8} y={PAD_Y + tooltipFS * 2 + 6} fill="#f87171" fontSize={tooltipFS} fontWeight="600">
              ● At-risk: {(p.at_risk_pct * 100).toFixed(1)}%
            </text>
            <text x={tooltipX + 8} y={PAD_Y + tooltipFS * 3 + 8} fill="#60a5fa" fontSize={tooltipFS} fontWeight="600">
              ● Completion: {(p.avg_completion_rate * 100).toFixed(1)}%
            </text>
          </g>
        );
      })()}
    </svg>
  );
}

const TrendChart: React.FC<TrendChartProps> = ({ courseId }) => {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [fullView, setFullView] = useState(false);
  const [fullHoveredIdx, setFullHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/history/${courseId}?limit=20`)
      .then(r => r.json())
      .then(d => {
        setHistory(d.history || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [courseId]);

  if (loading) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-4 animate-pulse">
        <div className="h-24 bg-stone-100 rounded" />
      </div>
    );
  }

  if (history.length < 2) return null;

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  const riskDelta = latest.at_risk_pct - prev.at_risk_pct;
  const compDelta = latest.avg_completion_rate - prev.avg_completion_rate;

  const DeltaBadge = ({ delta, inverted }: { delta: number; inverted?: boolean }) => {
    const good = inverted ? delta <= 0 : delta >= 0;
    return (
      <span className={`text-[10px] font-bold ${good ? 'text-green-500' : 'text-red-500'}`}>
        {delta > 0 ? '↑' : delta < 0 ? '↓' : '—'}{Math.abs(delta * 100).toFixed(1)}%
      </span>
    );
  };

  return (
    <>
      {/* ─── Mini mode ─────────────────────────────────────────────── */}
      <div className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
              Analysis History
            </p>
            <span className="text-[10px] text-stone-300">{history.length} runs</span>
          </div>
          <div className="flex items-center gap-4">
            {/* Legend */}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-red-400 rounded-full inline-block" />
              <span className="text-[10px] text-stone-400">At-risk %</span>
              <DeltaBadge delta={riskDelta} inverted />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-blue-400 rounded-full inline-block" />
              <span className="text-[10px] text-stone-400">Completion</span>
              <DeltaBadge delta={compDelta} />
            </div>
            {/* Expand button */}
            <button
              onClick={() => setFullView(true)}
              className="text-[10px] text-stone-400 hover:text-stone-700 border border-stone-200 rounded px-2 py-0.5 hover:bg-stone-50 transition-colors"
              title="Full view"
            >
              ⛶ Full View
            </button>
          </div>
        </div>

        <div style={{ maxHeight: '130px' }}>
          <ChartSVG
            history={history} W={600} H={120} PAD_X={42} PAD_Y={16}
            hoveredIdx={hoveredIdx} setHoveredIdx={setHoveredIdx}
          />
        </div>
      </div>

      {/* ─── Full view modal ───────────────────────────────────────── */}
      {fullView && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setFullView(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

          {/* Modal */}
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[1100px] p-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-stone-800">Analysis History</h2>
                <p className="text-xs text-stone-400 mt-0.5">{history.length} runs · Last updated: {new Date(latest.run_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-6">
                {/* Large legend */}
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-red-400 rounded-full inline-block" />
                  <span className="text-xs text-stone-500 font-medium">At-risk %</span>
                  <DeltaBadge delta={riskDelta} inverted />
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-4 h-1 bg-blue-400 rounded-full inline-block" />
                  <span className="text-xs text-stone-500 font-medium">Completion Rate</span>
                  <DeltaBadge delta={compDelta} />
                </div>
                <button
                  onClick={() => setFullView(false)}
                  className="text-stone-400 hover:text-stone-700 text-xl leading-none"
                  title="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Large chart */}
            <div style={{ height: '340px' }}>
              <ChartSVG
                history={history} W={1000} H={300} PAD_X={55} PAD_Y={24}
                hoveredIdx={fullHoveredIdx} setHoveredIdx={setFullHoveredIdx}
                showDateLabels fontSize={10}
              />
            </div>

            {/* Summary stats row */}
            <div className="flex gap-4 mt-6 pt-4 border-t border-stone-100">
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-red-400">{(latest.at_risk_pct * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-1">Current At-Risk</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-blue-400">{(latest.avg_completion_rate * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-1">Current Completion</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-stone-700">{latest.total_students}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-1">Total Students</p>
              </div>
              <div className="flex-1 text-center">
                <p className="text-2xl font-bold text-stone-700">{history.length}</p>
                <p className="text-[10px] text-stone-400 uppercase tracking-wider mt-1">Analysis Runs</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default TrendChart;
