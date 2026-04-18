/**
 * ModuleCard — Main content card for CoursePage with Objectives / Resources / Assessment tabs.
 */

import React from 'react';
import type { Module, Reading, Assignment } from '../utils/courseExport';
import { MASTERY_COLORS } from '../constants/theme';

/** Strip "Module N:" or "Module N —" prefix from titles (added during generation) */
const stripModulePrefix = (title: string): string =>
  title.replace(/^Module\s+\d+\s*[:—–\-]\s*/i, '');

// ─── Types ────────────────────────────────────────────────────────────────────

type TabKey = 'objectives' | 'resources' | 'assessment' | 'ai-suggestion' | 'knowledge-map';

interface ModuleHint {
  message: string;
  tips: string[];
}

interface KgConceptMatch {
  label: string;
  id: string;
  definition?: string;
  source?: string;
  source_text?: string;
  objective_text?: string;  // legacy compat
  source_layer?: string;
}

interface KgDependency {
  from_module: number;
  to_module: number;
  from_concept: string;
  to_concept: string;
  relation: string;
}

interface ModuleCardProps {
  module: Module;
  moduleIndex: number;
  activeTab: TabKey;
  isStudent: boolean;
  autoSaveStatus: 'idle' | 'saving' | 'saved';
  showEditHint: boolean;
  moduleHint?: ModuleHint | null;
  kgConcepts?: KgConceptMatch[];
  kgDependencies?: KgDependency[];
  kgLoading?: boolean;
  masteryMap?: Record<string, string>;
  onTabChange: (tab: TabKey) => void;
  onEditField: (field: string, value: any) => void;
  onDismissHint: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

const ModuleCard: React.FC<ModuleCardProps> = ({
  module: currentModule,
  moduleIndex,
  activeTab,
  isStudent,
  autoSaveStatus,
  showEditHint,
  moduleHint,
  kgConcepts = [],
  kgDependencies = [],
  kgLoading = false,
  masteryMap,
  onTabChange,
  onEditField,
  onDismissHint,
}) => {
  return (
    <>
      {/* Edit Hint — professor only */}
      {!isStudent && showEditHint && (
        <div className="flex items-center justify-between mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
          <div className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
            Click any field to edit — changes save automatically
          </div>
          <button onClick={onDismissHint} className="text-amber-400 hover:text-amber-600 transition-colors">✕</button>
        </div>
      )}

      {/* Module Card */}
      <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm">

        {/* Complexity bar */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-stone-500 uppercase tracking-widest font-bold">Complexity</span>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n =>
              isStudent ? (
                <div
                  key={n}
                  className={`h-2 w-7 rounded-full ${n <= Number(currentModule.complexity_level) ? 'bg-amber-500' : 'bg-stone-200'}`}
                />
              ) : (
                <button
                  key={n}
                  title={`Set complexity to ${n}`}
                  onClick={() => onEditField('complexity_level', n)}
                  className={`h-2 w-7 rounded-full transition-colors hover:opacity-80 cursor-pointer ${
                    n <= Number(currentModule.complexity_level) ? 'bg-amber-500' : 'bg-stone-200 hover:bg-amber-200'
                  }`}
                />
              )
            )}
          </div>
          <span className="text-xs text-stone-500 font-mono">{currentModule.complexity_level}/5</span>
        </div>

        {/* Module number + title */}
        <div className="text-amber-600 font-serif text-[27px] italic mb-2">
          Module {moduleIndex + 1}
        </div>
        <div className="flex items-start gap-3 mb-6">
          {isStudent ? (
            <h2 className="font-serif text-[32px] text-stone-900 flex-1 px-1 py-0.5">{stripModulePrefix(currentModule.title)}</h2>
          ) : (
            <>
              <input
                className="font-serif text-[32px] text-stone-900 flex-1 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 rounded-t px-1 py-0.5 outline-none transition-all"
                value={stripModulePrefix(currentModule.title)}
                onChange={e => onEditField('title', e.target.value)}
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
          {(['objectives', 'resources', 'assessment', 'ai-suggestion', 'knowledge-map'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className={`px-4 py-2 text-sm font-bold uppercase tracking-widest transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? 'border-b-2 border-amber-500 text-stone-900'
                  : 'text-stone-400 hover:text-stone-700'
              }`}
            >
              {tab === 'objectives' ? '🎯 Objectives'
               : tab === 'resources' ? '📚 Resources'
               : tab === 'assessment' ? '✏️ Assessment'
               : tab === 'ai-suggestion' ? '🤖 AI Suggestion'
               : tab === 'knowledge-map' ? '📊 Knowledge Map'
               : tab}
            </button>
          ))}
        </div>

        {/* Tab: Objectives */}
        {activeTab === 'objectives' && (
          <ObjectivesTab module={currentModule} isStudent={isStudent} onEditField={onEditField} moduleHint={moduleHint} />
        )}

        {/* Tab: Resources */}
        {activeTab === 'resources' && (
          <ResourcesTab module={currentModule} isStudent={isStudent} onEditField={onEditField} />
        )}

        {/* Tab: Assessment */}
        {activeTab === 'assessment' && (
          <AssessmentTab module={currentModule} isStudent={isStudent} onEditField={onEditField} />
        )}

        {/* Tab: AI Suggestion */}
        {activeTab === 'ai-suggestion' && (
          <AISuggestionTab module={currentModule} isStudent={isStudent} onEditField={onEditField} />
        )}

        {/* Tab: Knowledge Map */}
        {activeTab === 'knowledge-map' && (
          <KnowledgeMapTab
            moduleIndex={moduleIndex}
            concepts={kgConcepts}
            dependencies={kgDependencies}
            loading={kgLoading}
            masteryMap={masteryMap}
          />
        )}
      </div>
    </>
  );
};

// ─── Objectives Tab ───────────────────────────────────────────────────────────

const ObjectivesTab: React.FC<{
  module: Module;
  isStudent: boolean;
  onEditField: (field: string, value: any) => void;
  moduleHint?: ModuleHint | null;
}> = ({ module: m, isStudent, onEditField, moduleHint }) => (
  <>
    <ul className="space-y-2 mb-4">
      {(m.learning_objectives || []).map((obj, i) => (
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
                  const newObjs = [...(m.learning_objectives || [])];
                  newObjs[i] = e.target.value;
                  onEditField('learning_objectives', newObjs);
                }}
              />
              <button
                onClick={() => {
                  const newObjs = (m.learning_objectives || []).filter((_, idx) => idx !== i);
                  onEditField('learning_objectives', newObjs);
                }}
                className="text-stone-300 hover:text-red-400 transition-colors mt-0.5 shrink-0 text-xs"
                title="Remove"
              >✕</button>
            </>
          )}
        </li>
      ))}
      {(m.learning_objectives || []).length === 0 && (
        <p className="text-stone-400 italic text-sm">No learning objectives listed.</p>
      )}
    </ul>
    {!isStudent && (
      <button
        onClick={() => onEditField('learning_objectives', [...(m.learning_objectives || []), ''])}
        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1 mb-8"
      >
        + Add objective
      </button>
    )}
    {m.narrative_preview && (
      <div>
        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">Narrative Preview</h4>
        {isStudent ? (
          <blockquote className="text-stone-600 leading-relaxed italic border-l-2 border-stone-300 pl-4">
            "{m.narrative_preview}"
          </blockquote>
        ) : (
          <textarea
            className="w-full text-stone-600 leading-relaxed italic border-l-2 border-stone-300 pl-4 bg-transparent focus:bg-amber-50/50 focus:border-amber-300 outline-none resize-none transition-all"
            rows={4}
            value={m.narrative_preview || ''}
            onChange={e => onEditField('narrative_preview', e.target.value)}
          />
        )}
      </div>
    )}

    {/* Student-facing hint — shown only on flagged modules */}
    {isStudent && moduleHint && (
      <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-stone-400 mb-2">A note for you</p>
        <p className="text-sm text-stone-600 leading-relaxed mb-3">{moduleHint.message}</p>
        <ul className="space-y-1.5">
          {moduleHint.tips.map((tip, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-stone-500">
              <span className="mt-1 w-1 h-1 rounded-full bg-stone-400 flex-shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>
    )}
  </>
);

// ─── Resources Tab ────────────────────────────────────────────────────────────

const ResourcesTab: React.FC<{
  module: Module;
  isStudent: boolean;
  onEditField: (field: string, value: any) => void;
}> = ({ module: m, isStudent, onEditField }) => {
  const readings = m.recommended_readings || [];

  const updateReading = (ri: number, updated: Partial<Reading>) => {
    const newReadings = readings.map((r, idx) => (idx === ri ? { ...r, ...updated } : r));
    onEditField('recommended_readings', newReadings);
  };
  const removeReading = (ri: number) => {
    onEditField('recommended_readings', readings.filter((_, idx) => idx !== ri));
  };

  if (isStudent) {
    return (
      <div className="space-y-4">
        {readings.length === 0 && <p className="text-stone-400 italic text-sm">No readings recommended for this module.</p>}
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
            {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-xs text-amber-600 hover:underline block mb-3">{r.url}</a>}
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

  return (
    <div className="space-y-4">
      {readings.length === 0 && <p className="text-stone-400 italic text-sm">No readings recommended for this module.</p>}
      {readings.map((r, ri) => (
        <div key={ri} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
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
            <button onClick={() => removeReading(ri)} className="text-stone-300 hover:text-red-400 transition-colors text-xs ml-1" title="Remove reading">✕</button>
          </div>
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
                    onClick={() => updateReading(ri, { key_points: (r.key_points || []).filter((_, idx) => idx !== j) })}
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
        onClick={() => onEditField('recommended_readings', [...readings, { title: '', key_points: [], rationale: '', reading_type: 'required' as const }])}
        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
      >+ Add reading</button>
    </div>
  );
};

// ─── Assessment Tab ───────────────────────────────────────────────────────────

const AssessmentTab: React.FC<{
  module: Module;
  isStudent: boolean;
  onEditField: (field: string, value: any) => void;
}> = ({ module: m, isStudent, onEditField }) => {
  const assignments = m.assignments || [];

  const updateAssignment = (ai: number, updated: Partial<Assignment>) => {
    const newAssignments = assignments.map((a, idx) => (idx === ai ? { ...a, ...updated } : a));
    onEditField('assignments', newAssignments);
  };
  const removeAssignment = (ai: number) => {
    onEditField('assignments', assignments.filter((_, idx) => idx !== ai));
  };

  if (isStudent) {
    return (
      <div className="space-y-4">
        {assignments.length === 0 && <p className="text-stone-400 italic text-sm">No assignment for this module.</p>}
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

  return (
    <div className="space-y-4">
      {assignments.length === 0 && <p className="text-stone-400 italic text-sm">No assignment for this module.</p>}
      {assignments.map((a, ai) => (
        <div key={ai} className="bg-stone-50 rounded-xl p-5 border border-stone-200">
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
            <button onClick={() => removeAssignment(ai)} className="text-stone-300 hover:text-red-400 transition-colors text-xs shrink-0" title="Remove assignment">✕</button>
          </div>
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
          <div className="mb-2">
            <span className="text-[10px] font-bold tracking-widest text-stone-400 uppercase block mb-1">Deliverable</span>
            <input
              className="w-full text-sm text-stone-600 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 focus:bg-amber-50/50 outline-none px-1"
              value={a.deliverable || ''}
              placeholder="What students submit…"
              onChange={e => updateAssignment(ai, { deliverable: e.target.value })}
            />
          </div>
          <div className="mb-3 flex items-center gap-1.5">
            <span className="text-stone-400 text-sm">⏱</span>
            <input
              className="text-sm text-stone-600 bg-transparent border-b border-transparent hover:border-stone-200 focus:border-amber-300 outline-none px-1 flex-1"
              value={a.estimated_time || ''}
              placeholder="Estimated time…"
              onChange={e => updateAssignment(ai, { estimated_time: e.target.value })}
            />
          </div>
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
                    onClick={() => updateAssignment(ai, { rubric_highlights: (a.rubric_highlights || []).filter((_, idx) => idx !== pi) })}
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
        onClick={() => onEditField('assignments', [...assignments, { title: '', type: 'Assignment', task_description: '', rubric_highlights: [] }])}
        className="text-xs text-amber-600 hover:text-amber-700 font-medium flex items-center gap-1"
      >+ Add assignment</button>
    </div>
  );
};

// ─── AI Suggestion Tab ────────────────────────────────────────────────────────

const AISuggestionTab: React.FC<{
  module: Module;
  isStudent: boolean;
  onEditField: (field: string, value: any) => void;
}> = ({ module: m, isStudent, onEditField }) => {
  const suggestions = isStudent
    ? (m.learning_suggestions || [])
    : (m.teaching_suggestions || []);

  const heading = isStudent ? 'Learning Suggestions' : 'Teaching Suggestions';
  const emptyMsg = isStudent
    ? 'No learning suggestions available for this module yet.'
    : 'No teaching suggestions available for this module yet. Try regenerating this module to get AI suggestions.';
  const description = isStudent
    ? 'AI-generated tips to help you get the most out of this module.'
    : 'AI-generated ideas for teaching this module more effectively.';

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{isStudent ? '💡' : '🧑‍🏫'}</span>
        <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest">{heading}</h4>
      </div>
      <p className="text-xs text-stone-400 mb-4">{description}</p>
      {suggestions.length > 0 ? (
        <ul className="space-y-3">
          {suggestions.map((s, i) => (
            <li key={i} className="group flex items-start gap-3 text-stone-700 bg-amber-50/50 border border-amber-100 rounded-xl p-4 relative pr-10 hover:border-amber-200 transition-colors">
              <span className="text-amber-500 mt-0.5 text-sm font-bold shrink-0">→</span>
              <span className="leading-relaxed text-sm">{s}</span>
              <button
                onClick={() => {
                  const newSuggestions = [...suggestions];
                  newSuggestions.splice(i, 1);
                  onEditField(isStudent ? 'learning_suggestions' : 'teaching_suggestions', newSuggestions);
                }}
                className="absolute right-4 top-4 text-stone-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs"
                title="Dismiss suggestion"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center py-8 text-stone-400">
          <span className="text-2xl block mb-2">🤖</span>
          <p className="text-sm">{emptyMsg}</p>
        </div>
      )}
    </div>
  );
};

// ─── Knowledge Map Tab ────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, { text: string; color: string }> = {
  objective:  { text: 'from objective',  color: 'bg-amber-50 text-amber-600 border-amber-200' },
  title:      { text: 'from title',      color: 'bg-blue-50 text-blue-600 border-blue-200' },
  narrative:  { text: 'from narrative',  color: 'bg-purple-50 text-purple-600 border-purple-200' },
  reading:    { text: 'from reading',    color: 'bg-green-50 text-green-600 border-green-200' },
  assignment: { text: 'from assignment', color: 'bg-red-50 text-red-600 border-red-200' },
  suggestion: { text: 'from suggestion', color: 'bg-stone-100 text-stone-500 border-stone-200' },
};

const KnowledgeMapTab: React.FC<{
  moduleIndex: number;
  concepts: KgConceptMatch[];
  dependencies: KgDependency[];
  loading: boolean;
  masteryMap?: Record<string, string>;
}> = ({ moduleIndex, concepts, dependencies, loading, masteryMap }) => {
  const modNum = moduleIndex + 1;

  // Filter dependencies related to this module
  const relatedDeps = dependencies.filter(
    d => d.from_module === modNum || d.to_module === modNum
  );

  if (loading) {
    return (
      <div className="flex items-center gap-3 py-12 justify-center text-stone-400">
        <div className="w-5 h-5 border-2 border-stone-200 border-t-amber-500 rounded-full animate-spin" />
        <span className="text-sm">Mapping concepts to knowledge graph…</span>
      </div>
    );
  }

  if (concepts.length === 0 && relatedDeps.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-3xl block mb-3">📊</span>
        <p className="text-sm text-stone-400 mb-1">No knowledge graph concepts mapped to this module.</p>
        <p className="text-xs text-stone-300">This module's content may not overlap with available KG topics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Concepts matched */}
      {concepts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔗</span>
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
              Matched Concepts
            </h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
              {concepts.length}
            </span>
          </div>
          <div className="grid gap-3">
            {concepts.map((c, i) => {
              const src = SOURCE_LABELS[c.source || 'objective'] || SOURCE_LABELS.objective;
              const definition = c.definition || c.objective_text || c.source_text || '';
              return (
                <div
                  key={i}
                  className={`bg-stone-50 rounded-xl p-4 border border-stone-200 transition-colors ${
                    c.source_layer === 'warm' ? 'hover:border-purple-300' : 'hover:border-amber-200'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    {(() => {
                      const masteryLevel = masteryMap?.[c.id] || masteryMap?.[c.label.toLowerCase()] || '';
                      if (masteryLevel && masteryLevel !== 'not_started') {
                        const emoji = masteryLevel === 'mastered' ? '🟢' : masteryLevel === 'learning' ? '🟡' : '🟠';
                        return <span className="text-sm">{emoji}</span>;
                      }
                      return <span className="text-sm">{c.source_layer === 'warm' ? '🟣' : '🟤'}</span>;
                    })()}
                    <span className="font-bold text-stone-900 text-sm">{c.label}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${src.color}`}>
                      {src.text}
                    </span>
                  </div>
                  {definition && (
                    <p className="text-xs text-stone-600 leading-relaxed pl-6 line-clamp-3">
                      {definition}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Cross-module dependencies */}
      {relatedDeps.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">🔀</span>
            <h4 className="text-xs font-bold text-stone-500 uppercase tracking-widest">
              Cross-Module Dependencies
            </h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-stone-200 text-stone-600 font-bold">
              {relatedDeps.length}
            </span>
          </div>
          <div className="space-y-2">
            {relatedDeps.map((dep, i) => {
              const isOutgoing = dep.from_module === modNum;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${
                    isOutgoing
                      ? 'bg-amber-50/50 border-amber-100'
                      : 'bg-blue-50/50 border-blue-100'
                  }`}
                >
                  <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                    isOutgoing ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    M{dep.from_module}
                  </span>
                  <span className="text-stone-400 text-xs">→</span>
                  <span className={`font-bold text-xs px-2 py-0.5 rounded ${
                    !isOutgoing ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                    M{dep.to_module}
                  </span>
                  <span className="text-stone-500 text-xs flex-1 truncate">
                    <span className="font-medium text-stone-700">{dep.from_concept}</span>
                    {' → '}
                    <span className="font-medium text-stone-700">{dep.to_concept}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModuleCard;
