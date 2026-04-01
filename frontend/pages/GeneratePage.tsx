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

// ─── Status Badge ─────────────────────────────────────────────────────────────

type StreamStatus = 'idle' | 'researching' | 'generating' | 'fixing' | 'done' | 'error';

const statusConfig: Record<StreamStatus, { label: string; color: string; icon: React.ReactNode }> = {
  idle: { label: '', color: '', icon: null },
  researching: { label: 'Researching sources…', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: <Loader2 size={14} className="animate-spin" /> },
  generating: { label: 'Generating curriculum…', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: <Loader2 size={14} className="animate-spin" /> },
  fixing: { label: 'Fixing structure…', color: 'bg-orange-50 text-orange-700 border-orange-200', icon: <Loader2 size={14} className="animate-spin" /> },
  done: { label: 'Generation complete', color: 'bg-green-50 text-green-700 border-green-200', icon: <CheckCircle2 size={14} /> },
  error: { label: 'Generation failed', color: 'bg-red-50 text-red-700 border-red-200', icon: <AlertTriangle size={14} /> },
};

// ─── GeneratePage ─────────────────────────────────────────────────────────────

const GeneratePage: React.FC = () => {
  const navigate = useNavigate();

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

  // Stream state
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [streamText, setStreamText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [warningMessage, setWarningMessage] = useState('');
  const streamRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isGenerating = status === 'researching' || status === 'generating' || status === 'fixing';
  const canSubmit = topic.trim() && audience.trim() && !isGenerating;

  // Syllabus parse callback — auto-fill form fields
  const handleSyllabusParsed = useCallback((fields: Record<string, string>) => {
    if (fields.topic) setTopic(fields.topic);
    if (fields.course_code) setCourseCode(fields.course_code);
    if (fields.audience) setAudience(fields.audience);
    if (fields.accreditation_context) setAccreditationContext(fields.accreditation_context);

    // Only set level if it's a valid value
    if (fields.level && LEVELS.some(l => l.value === fields.level)) {
      setLevel(fields.level);
    }
    // Only set course_type if valid
    if (fields.course_type && COURSE_TYPES.some(t => t.value === fields.course_type)) {
      setCourseType(fields.course_type);
    }
  }, []);

  const handleGenerate = async () => {
    if (!canSubmit) return;

    setStatus('researching');
    setStreamText('');
    setStatusMessage('');
    setWarningMessage('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/curriculum/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          level,
          audience: audience.trim(),
          course_code: courseCode.trim(),
          course_type: courseType,
          module_count: moduleCount,
          session_duration: sessionDuration,
          design_approach: designApproach,
          accreditation_context: accreditationContext.trim(),
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        setStatus('error');
        setStatusMessage(`Server error: ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();

          if (payload === '[DONE]') {
            setStatus('done');
            continue;
          }

          try {
            const data = JSON.parse(payload);

            if (data.status) {
              if (data.status === 'researching') setStatus('researching');
              else if (data.status === 'generating') setStatus('generating');
              else if (data.status === 'fixing') setStatus('fixing');
              if (data.message) setStatusMessage(data.message);
            }

            if (data.text) {
              setStatus(prev => prev === 'researching' ? 'generating' : prev);
              if (data.reset) {
                setStreamText(data.text);
              } else {
                setStreamText(prev => prev + data.text);
              }
              // Auto-scroll
              if (streamRef.current) {
                streamRef.current.scrollTop = streamRef.current.scrollHeight;
              }
            }

            if (data.reset) {
              setStreamText('');
            }

            if (data.type === 'warning') {
              setWarningMessage(data.message || '');
            }

            if (data.error) {
              setStatus('error');
              setStatusMessage(data.error);
            }
          } catch {
            // ignore unparseable lines
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setStatus('idle');
        setStatusMessage('Generation cancelled');
      } else {
        setStatus('error');
        setStatusMessage(err.message || 'Network error');
      }
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setStatus('idle');
  };

  const handleViewCourse = () => {
    navigate('/courses');
  };

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

          {/* Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold font-serif text-stone-900 mb-2">
              Create a New Course
            </h1>
            <p className="text-sm text-stone-500 leading-relaxed">
              Fill in the details below and our AI agent will research real sources, apply instructional design
              principles, and generate a complete curriculum with modules, readings, and assessments.
            </p>
          </div>

          {/* ── Form ───────────────────────────────────────────────────────── */}
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

            {/* ── Syllabus Upload ───────────────────────────────────────────── */}
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
                {/* Custom input — hours + minutes */}
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
                {/* Separator + custom input */}
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

          {/* ── Actions ────────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 mb-6">
            {!isGenerating ? (
              <button
                onClick={handleGenerate}
                disabled={!canSubmit}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: canSubmit ? '#C5A028' : '#d6d3d1',
                  color: canSubmit ? '#fff' : '#a8a29e',
                }}
              >
                <Sparkles size={16} />
                Generate Curriculum
              </button>
            ) : (
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 transition-all"
              >
                Cancel
              </button>
            )}

            {status === 'done' && (
              <button
                onClick={handleViewCourse}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 transition-all"
              >
                <BookOpen size={16} />
                View in Dashboard
              </button>
            )}
          </div>

          {/* ── Status Badge ───────────────────────────────────────────────── */}
          {status !== 'idle' && (
            <div className={`flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl border text-sm ${statusConfig[status].color}`}>
              {statusConfig[status].icon}
              <span className="font-medium">{statusConfig[status].label}</span>
              {statusMessage && (
                <span className="text-xs opacity-70 ml-2">— {statusMessage}</span>
              )}
            </div>
          )}

          {/* ── Warning ────────────────────────────────────────────────────── */}
          {warningMessage && (
            <div className="flex items-center gap-2 px-4 py-2.5 mb-4 rounded-xl border bg-orange-50 text-orange-700 border-orange-200 text-sm">
              <AlertTriangle size={14} />
              <span>{warningMessage}</span>
            </div>
          )}

          {/* ── Stream Output ──────────────────────────────────────────────── */}
          {(streamText || isGenerating) && (
            <div
              ref={streamRef}
              className="bg-stone-900 text-stone-300 rounded-2xl p-6 text-xs font-mono leading-relaxed overflow-y-auto shadow-inner border border-stone-800"
              style={{ maxHeight: 420 }}
            >
              {streamText ? (
                <pre className="whitespace-pre-wrap break-words">{streamText}</pre>
              ) : (
                <div className="flex items-center gap-3 text-stone-500">
                  <Loader2 size={16} className="animate-spin" />
                  Waiting for response…
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default GeneratePage;
