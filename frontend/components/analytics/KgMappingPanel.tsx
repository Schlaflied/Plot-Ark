/**
 * KgMappingPanel — simplified sidebar summary of KG concept coverage.
 * Full details are now in the Knowledge Map tab inside ModuleCard.
 */

import React, { useState, useEffect } from 'react';
import { Network, Loader2 } from 'lucide-react';

interface KgSummary {
  status: string;
  total_concepts_matched: number;
  modules_with_matches: number;
  total_modules: number;
  dependencies: any[];
}

interface KgMappingPanelProps {
  courseId: string | undefined;
}

const KgMappingPanel: React.FC<KgMappingPanelProps> = ({ courseId }) => {
  const [data, setData] = useState<KgSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    fetch(`/api/graph/kg-mapping/${courseId}`)
      .then(r => r.json())
      .then(d => setData(d.status === 'ok' ? d : null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [courseId]);

  // Don't render anything if no KG available
  if (!loading && !data) return null;

  const coverage = data
    ? Math.round((data.modules_with_matches / Math.max(data.total_modules, 1)) * 100)
    : 0;

  return (
    <div className="px-5 py-5 border-t border-stone-100">
      <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 flex items-center gap-1.5 mb-3">
        <Network size={11} />
        Knowledge Graph
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <Loader2 size={12} className="animate-spin" />
          <span>Analyzing…</span>
        </div>
      ) : data ? (
        <div className="space-y-3">
          {/* Coverage bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-stone-500">Module coverage</span>
              <span className="text-xs font-bold text-stone-700">{coverage}%</span>
            </div>
            <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all duration-500"
                style={{ width: `${coverage}%` }}
              />
            </div>
            <p className="text-[10px] text-stone-400 mt-1">
              {data.modules_with_matches}/{data.total_modules} modules linked
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-amber-50/80 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-amber-700">{data.total_concepts_matched}</p>
              <p className="text-[9px] text-amber-600 font-medium uppercase tracking-wide">Concepts</p>
            </div>
            <div className="bg-stone-50 rounded-lg p-2 text-center">
              <p className="text-lg font-bold text-stone-700">{data.dependencies.length}</p>
              <p className="text-[9px] text-stone-500 font-medium uppercase tracking-wide">Dependencies</p>
            </div>
          </div>

          <p className="text-[10px] text-stone-400 leading-relaxed">
            Open any module's <span className="font-semibold text-stone-500">Knowledge Map</span> tab for details.
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default KgMappingPanel;
