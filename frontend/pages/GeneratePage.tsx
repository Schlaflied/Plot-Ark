/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Sparkles, BookOpen, GraduationCap, Users,
  Hash, Clock, Layers, FileText, Loader2, CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

// ─── Extracted modules ────────────────────────────────────────────────────────

import { LEVELS, COURSE_TYPES, DESIGN_APPROACHES, SESSION_DURATIONS, MODULE_PRESETS } from '../constants/formOptions';
import { Select } from '../components/ui/Select';
import { Input } from '../components/ui/Input';
import { SyllabusUpload } from '../components/generate/SyllabusUpload';
import { SourceReview, type ReviewedSource } from '../components/generate/SourceReview';
import { SkeletonReview, type SkeletonModule } from '../components/generate/SkeletonReview';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 'form' | 'source-review' | 'skeleton-review';

// ─── GeneratePage ─────────────────────────────────────────────────────────────

const GeneratePage: React.FC = () => {
  const navigate = useNavigate();

  // ── Multi-step state ────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>('form');

  // Form state
  const [topic, setTopic] = useState('');
  const [level, setLevel] = useState('undergraduate-year-1');
  const [audience, setAudience] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [courseType, setCourseType] = useState('mixed');
  const [moduleCount, setModuleCount] = useState('6');
  const [sessionDuration, setSessionDuration] = useState('90');
  const [designApproach, setDesignApproach] = useState('addie');
  const [accreditationContext, setAccreditationContext] = useState('');
  const [customDuration, setCustomDuration] = useState('');
  const [customHours, setCustomHours] = useState('');
  const [customMinutes, setCustomMinutes] = useState('');
  const [customModules, setCustomModules] = useState('');
  const [customLevel, setCustomLevel] = useState('');

  // Source review state
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sources, setSources] = useState<ReviewedSource[]>([]);
  const [approvedSources, setApprovedSources] = useState<ReviewedSource[]>([]);

  // Skeleton review state
  const [skeletonLoading, setSkeletonLoading] = useState(false);
  const [skeletonModules, setSkeletonModules] = useState<SkeletonModule[]>([]);
  const [courseNarrative, setCourseNarrative] = useState('');

  // Error / status
  const [errorMessage, setErrorMessage] = useState('');

  const canSubmit = topic.trim() && audience.trim() && !sourcesLoading;

  // ── Syllabus parse callback ─────────────────────────────────────────────────
  const handleSyllabusParsed = useCallback((fields: Record<string, string>) => {
    if (fields.topic) setTopic(fields.topic);
    if (fields.course_code) setCourseCode(fields.course_code);
    if (fields.audience) setAudience(fields.audience);
    if (fields.accreditation_context) setAccreditationContext(fields.accreditation_context);
    if (fields.level && LEVELS.some(l => l.value === fields.level)) {
      setLevel(fields.level);
    }
    if (fields.course_type && COURSE_TYPES.some(t => t.value === fields.course_type)) {
      setCourseType(fields.course_type);
    }
  }, []);

  // ── Step 1 → 2: Fetch sources from Tavily ──────────────────────────────────
  const handleFetchSources = async () => {
    if (!canSubmit) return;
    setSourcesLoading(true);
    setErrorMessage('');
    try {
      const resolvedLevel = level === 'other-custom' ? customLevel.trim() : level;
      const res = await fetch('/api/sources/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim(), level: resolvedLevel, audience: audience.trim() }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      const fetched: ReviewedSource[] = (data.sources || []).map((s: any) => ({
        ...s,
        priority: 'optional' as const,  // default all to optional
      }));
      setSources(fetched);
      setStep('source-review');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to fetch sources');
    } finally {
      setSourcesLoading(false);
    }
  };

  // ── Step 2 → 3: Generate skeleton with approved sources ────────────────────
  const handleConfirmSources = async (approved: ReviewedSource[]) => {
    setApprovedSources(approved);
    setSkeletonLoading(true);
    setSkeletonModules([]);
    setCourseNarrative('');
    setErrorMessage('');
    setStep('skeleton-review');

    try {
      const res = await fetch('/api/curriculum/skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          level: level === 'other-custom' ? customLevel.trim() : level,
          audience: audience.trim(),
          course_code: courseCode.trim(),
          course_type: courseType,
          module_count: moduleCount,
          design_approach: designApproach,
          accreditation_context: accreditationContext.trim(),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const data = JSON.parse(payload);
            if (data.text) fullText += data.text;
          } catch {
            // ignore
          }
        }
      }

      // Parse the skeleton JSON
      const clean = fullText.replace(/```json\n?/g, '').replace(/```/g, '').trim();
      const first = clean.indexOf('{');
      const last = clean.lastIndexOf('}');
      if (first === -1 || last === -1) throw new Error('Invalid skeleton response');

      const parsed = JSON.parse(clean.slice(first, last + 1));
      const mods: SkeletonModule[] = (parsed.modules || []).map((m: any, i: number) => ({
        module_number: m.module_number ?? i + 1,
        title: m.title || `Module ${i + 1}`,
        complexity_level: m.complexity_level ?? 1,
        learning_objectives: m.learning_objectives || [],
      }));

      setSkeletonModules(mods);
      setCourseNarrative(parsed.course_narrative || '');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to generate skeleton');
    } finally {
      setSkeletonLoading(false);
    }
  };

  // ── Step 3 → Save & navigate: Save skeleton to DB ─────────────────────────
  const handleAddToCourse = async (editedModules: SkeletonModule[], narrative: string) => {
    setErrorMessage('');
    try {
      // Build modules with empty arrays for readings/assignments (skeleton only)
      const modulesForSave = editedModules.map(m => ({
        ...m,
        narrative_preview: '',
        recommended_readings: [],
        assignments: [],
      }));

      // Build sources for save
      const sourcesForSave = approvedSources.map(s => ({
        title: s.title,
        url: s.url,
        domain: new URL(s.url).hostname.replace('www.', ''),
        type: s.type,
        estimated_time: '',
        retrieved_at: new Date().toISOString().slice(0, 10),
      }));

      const res = await fetch('/api/curriculum/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          level: level === 'other-custom' ? customLevel.trim() : level,
          audience: audience.trim(),
          course_code: courseCode.trim(),
          course_type: courseType,
          module_count: editedModules.length,
          design_approach: designApproach,
          modules: modulesForSave,
          sources: sourcesForSave,
          course_narrative: narrative,
        }),
      });

      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      navigate('/courses');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to save course');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-[#F9F8F4]">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-5 bg-white border-b border-stone-200 shrink-0 gap-4">
        <Link
          to="/courses"
          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-900 transition-colors font-medium"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs tracking-[0.15em] text-stone-400 uppercase font-bold">
          <Sparkles size={14} className="text-amber-500" />
          Course Generator
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-10">

          {/* ── Error banner ─────────────────────────────────────────────── */}
          {errorMessage && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl border bg-red-50 text-red-700 border-red-200 text-sm">
              <AlertTriangle size={14} />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* ── Step 1: FORM ──────────────────────────────────────────────── */}
          {step === 'form' && (
            <>
              {/* Title */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold font-serif text-stone-900 mb-2">
                  Create a New Course
                </h1>
                <p className="text-sm text-stone-500 leading-relaxed">
                  Fill in the details below. Our AI agent will research real sources, then generate
                  a module skeleton for you to review and customize.
                </p>
              </div>

              {/* ── Form ───────────────────────────────────────────────────── */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-5 mb-6">

                {/* Topic + Course Code */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px] gap-4">
                  <Input
                    id="gen-topic"
                    label="Topic"
                    icon={<BookOpen size={15} />}
                    value={topic}
                    onChange={setTopic}
                    placeholder="e.g. Introduction to Machine Learning"
                    required
                  />
                  <Input
                    id="gen-code"
                    label="Course Code"
                    icon={<Hash size={15} />}
                    value={courseCode}
                    onChange={setCourseCode}
                    placeholder="e.g. CS 301"
                  />
                </div>

                {/* Level + Audience */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    id="gen-level"
                    label="Level"
                    icon={<GraduationCap size={15} />}
                    value={level}
                    onChange={setLevel}
                    options={LEVELS}
                    placeholder="Select level…"
                    allowCustom
                    customValue={customLevel}
                    onCustomChange={setCustomLevel}
                  />
                  <Input
                    id="gen-audience"
                    label="Target Audience"
                    icon={<Users size={15} />}
                    value={audience}
                    onChange={setAudience}
                    placeholder="e.g. Computer Science undergraduates"
                    required
                  />
                </div>

                {/* Accreditation + Course Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="gen-accreditation" className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-1.5">
                      <FileText size={15} /> Accreditation Context
                      <span className="text-xs text-stone-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="gen-accreditation"
                      type="text"
                      value={accreditationContext}
                      onChange={e => setAccreditationContext(e.target.value)}
                      placeholder="e.g. CPA Canada, AACSB"
                      className="w-full bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
                    />
                  </div>
                  <Select
                    id="gen-type"
                    label="Course Type"
                    icon={<FileText size={15} />}
                    value={courseType}
                    onChange={setCourseType}
                    options={COURSE_TYPES}
                  />
                </div>

                {/* ── Syllabus Upload ─────────────────────────────────────── */}
                <SyllabusUpload onFieldsParsed={handleSyllabusParsed} />

                {/* Design Approach */}
                <Select
                  id="gen-design"
                  label="Design Approach"
                  icon={<Sparkles size={15} />}
                  value={designApproach}
                  onChange={setDesignApproach}
                  options={DESIGN_APPROACHES}
                />

                {/* Session Duration — pill selector */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-2">
                    <Clock size={15} /> Session Duration
                    <span className="text-xs text-stone-400 font-normal">(per session)</span>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {SESSION_DURATIONS.map(d => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() => { setSessionDuration(String(d.value)); setCustomDuration(''); }}
                        className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                          sessionDuration === String(d.value) && !customDuration
                            ? 'bg-stone-800 text-white border-stone-800'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                    {/* Other / Custom pill */}
                    <button
                      type="button"
                      onClick={() => {
                        if (!customDuration) setCustomDuration(sessionDuration);
                        else { setCustomDuration(''); }
                      }}
                      className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                        customDuration
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      Other / Custom
                    </button>
                    {customDuration && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={8}
                          value={customHours}
                          onChange={e => {
                            const h = e.target.value;
                            setCustomHours(h);
                            const total = (parseInt(h) || 0) * 60 + (parseInt(customMinutes) || 0);
                            setSessionDuration(String(total || 60));
                          }}
                          className="w-14 bg-white border border-stone-200 rounded-lg px-2 py-2 text-sm text-stone-800 text-center outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
                          placeholder="0"
                        />
                        <span className="text-xs text-stone-500 font-medium">hr</span>
                        <input
                          type="number"
                          min={0}
                          max={59}
                          value={customMinutes}
                          onChange={e => {
                            const m = e.target.value;
                            setCustomMinutes(m);
                            const total = (parseInt(customHours) || 0) * 60 + (parseInt(m) || 0);
                            setSessionDuration(String(total || 60));
                          }}
                          className="w-14 bg-white border border-stone-200 rounded-lg px-2 py-2 text-sm text-stone-800 text-center outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 transition"
                          placeholder="0"
                        />
                        <span className="text-xs text-stone-500 font-medium">min</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Number of Modules — pill selector */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 mb-2">
                    <Layers size={15} /> Number of Modules
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    {MODULE_PRESETS.map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => { setModuleCount(String(n)); setCustomModules(''); }}
                        className={`w-10 h-10 rounded-full text-sm font-medium border transition-all ${
                          moduleCount === String(n) && !customModules
                            ? 'bg-stone-800 text-white border-stone-800'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="text-stone-300 text-sm mx-1">or</span>
                    <input
                      type="number"
                      min={3}
                      max={20}
                      value={customModules}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomModules(val);
                        if (val) setModuleCount(val);
                      }}
                      onFocus={() => {
                        if (!customModules) setCustomModules(moduleCount);
                      }}
                      placeholder={moduleCount}
                      className={`w-16 h-10 bg-white border rounded-lg px-3 text-sm text-center outline-none transition ${
                        customModules
                          ? 'border-stone-800 ring-2 ring-stone-200 text-stone-800'
                          : 'border-stone-200 text-stone-400 hover:border-stone-400'
                      } focus:ring-2 focus:ring-amber-300 focus:border-amber-400`}
                    />
                  </div>
                </div>
              </div>

              {/* ── Generate Button ───────────────────────────────────────── */}
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={handleFetchSources}
                  disabled={!canSubmit}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: canSubmit ? '#C5A028' : '#d6d3d1',
                    color: canSubmit ? '#fff' : '#a8a29e',
                  }}
                >
                  {sourcesLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> Searching Sources…</>
                  ) : (
                    <><Sparkles size={16} /> Generate Curriculum</>
                  )}
                </button>
              </div>
            </>
          )}

          {/* ── Step 2: SOURCE REVIEW ─────────────────────────────────────── */}
          {step === 'source-review' && (
            <SourceReview
              sources={sources}
              topic={topic}
              loading={sourcesLoading}
              onConfirm={handleConfirmSources}
              onBack={() => setStep('form')}
            />
          )}

          {/* ── Step 3: SKELETON REVIEW ───────────────────────────────────── */}
          {step === 'skeleton-review' && (
            <SkeletonReview
              modules={skeletonModules}
              courseNarrative={courseNarrative}
              topic={topic}
              loading={skeletonLoading}
              onAddToCourse={handleAddToCourse}
              onBack={() => setStep('source-review')}
            />
          )}

        </div>
      </div>
    </div>
  );
};

export default GeneratePage;
