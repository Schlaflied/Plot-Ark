/**
 * Enterprise L&D preview.
 *
 * This intentionally reuses Plot Ark's existing curriculum engine language
 * while demonstrating a workplace-learning workflow with synthetic data.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Check,
  CheckCircle2,
  CircleGauge,
  Clock3,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Lightbulb,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  X,
} from 'lucide-react';

type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

interface Suggestion {
  id: number;
  title: string;
  detail: string;
  evidence: string;
  impact: string;
}

const SUGGESTIONS: Suggestion[] = [
  {
    id: 1,
    title: 'Move the retention rule before the customer scenario',
    detail: 'Introduce the 30-day retention rule in Module 2.2, then let learners apply it in the scenario.',
    evidence: '38% missed the retention question; the rule currently appears after the scenario.',
    impact: 'High impact · low effort',
  },
  {
    id: 2,
    title: 'Add a contrasting example for approved vs. personal storage',
    detail: 'Place two side-by-side examples immediately before the storage decision checkpoint.',
    evidence: '26 learners selected “something is unclear” at this concept boundary.',
    impact: 'Medium impact · low effort',
  },
  {
    id: 3,
    title: 'Split the reporting workflow into a three-step job aid',
    detail: 'Keep the policy explanation in the course and provide a downloadable action checklist.',
    evidence: 'Median time is 2.4× the course baseline and repeat attempts cluster on this module.',
    impact: 'Medium impact · medium effort',
  },
];

const PULSE_OPTIONS = [
  ['understood', 'I understand this', 'I can explain and apply the key idea.'],
  ['partial', 'I partly understand', 'Some parts are clear, but I still have questions.'],
  ['unlocated', 'Something is unclear', 'I know I am stuck, but I cannot locate the exact issue.'],
  ['not-reviewed', 'I have not reviewed this yet', 'This keeps non-engagement separate from misunderstanding.'],
] as const;

const MetricCard: React.FC<{
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}> = ({ label, value, note, icon }) => (
  <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-center justify-between">
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <span className="text-amber-600">{icon}</span>
    </div>
    <p className="text-2xl font-semibold text-stone-900">{value}</p>
    <p className="mt-1 text-xs text-stone-500">{note}</p>
  </div>
);

const SourceCard: React.FC<{
  title: string;
  detail: string;
  meta: string;
  icon: React.ReactNode;
  onUpload: () => void;
}> = ({ title, detail, meta, icon, onUpload }) => (
  <button
    type="button"
    onClick={onUpload}
    className="group w-full rounded-2xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-amber-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-400"
  >
    <div className="flex items-start gap-3">
      <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-stone-900">{title}</p>
          <Upload size={15} className="text-stone-300 transition group-hover:text-amber-600" />
        </div>
        <p className="mt-1 text-sm leading-relaxed text-stone-500">{detail}</p>
        <p className="mt-3 text-xs font-medium text-emerald-700">{meta}</p>
      </div>
    </div>
  </button>
);

const EnterprisePage: React.FC = () => {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [statuses, setStatuses] = useState<Record<number, SuggestionStatus>>({});
  const [notice, setNotice] = useState('');
  const [pulse, setPulse] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedCount = useMemo(
    () => Object.values(statuses).filter(status => status === 'accepted').length,
    [statuses],
  );

  const chooseFile = (kind: string) => {
    setNotice(`Choose a ${kind} file. This preview keeps uploads local until analysis is started.`);
    fileInputRef.current?.click();
  };

  const updateSuggestion = (id: number, status: SuggestionStatus) => {
    setStatuses(previous => ({ ...previous, [id]: status }));
  };

  const signOut = () => {
    logout();
    navigate('/login');
  };

  if (auth?.role === 'enterprise_user') {
    return (
      <div className="min-h-screen bg-[#F6F4EF] text-stone-900">
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center px-6 py-3">
            <span className="font-serif text-lg font-semibold">Plot Ark</span>
            <span className="ml-3 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">Enterprise user</span>
            <button type="button" onClick={signOut} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-900">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-12">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Learner pulse</p>
            <h1 className="mt-3 font-serif text-4xl">How is this module landing?</h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-500">Data Privacy &amp; Security · Module 4: Handling customer data</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {PULSE_OPTIONS.map(([value, title, detail]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPulse(value)}
                aria-pressed={pulse === value}
                className={`rounded-2xl border p-5 text-left shadow-sm transition focus:outline-none focus:ring-2 focus:ring-amber-400 ${
                  pulse === value ? 'border-amber-400 bg-amber-50' : 'border-stone-200 bg-white hover:border-amber-200 hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-semibold text-stone-900">{title}</p><p className="mt-2 text-sm leading-6 text-stone-500">{detail}</p></div>
                  {pulse === value ? <CheckCircle2 size={20} className="shrink-0 text-amber-600" /> : null}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
            <div className="flex items-start gap-3"><ShieldCheck size={19} className="mt-0.5 shrink-0" /><p>Your response supports course improvement. It is shown to L&amp;D at cohort level and is not used to rank individual employees.</p></div>
          </div>
          <button
            type="button"
            disabled={!pulse}
            onClick={() => setNotice('Thank you. Your learning pulse has been recorded for this preview.')}
            className="mt-6 w-full rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Submit learning pulse
          </button>
          {notice ? <p role="status" className="mt-3 text-center text-sm font-medium text-emerald-700">{notice}</p> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-stone-900">
      <input ref={fileInputRef} type="file" className="hidden" aria-label="Upload learning source" />

      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center gap-4 px-6 py-3">
          <span className="font-serif text-lg font-semibold">Plot Ark</span>
          <div className="h-5 w-px bg-stone-200" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="font-serif text-lg font-semibold">Enterprise L&D</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Preview
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs text-stone-500">
            <ShieldCheck size={15} className="text-emerald-600" />
            Synthetic demo data
            <button type="button" onClick={signOut} className="ml-3 inline-flex items-center gap-1.5 border-l border-stone-200 pl-4 text-sm font-medium text-stone-500 hover:text-stone-900">
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <section className="overflow-hidden rounded-3xl bg-stone-900 text-white shadow-xl">
          <div className="grid gap-8 px-7 py-8 lg:grid-cols-[1.45fr_0.8fr] lg:px-10">
            <div>
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-stone-300">
                <Sparkles size={13} className="text-amber-400" /> Workplace learning observability
              </div>
              <h1 className="max-w-3xl font-serif text-4xl leading-tight lg:text-5xl">
                Find where training content loses people—and what to improve next.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-300">
                Plot Ark connects existing learning materials with the data your organization already has.
                Start with spreadsheets and learner feedback; connect xAPI later when it is available.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById('diagnosis')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  Explore the diagnosis <ArrowRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => chooseFile('training content')}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-stone-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <Upload size={15} /> Upload your own
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Demo program</p>
              <h2 className="mt-2 text-xl font-semibold">Data Privacy & Security</h2>
              <p className="mt-1 text-sm text-stone-400">Annual compliance training · Cohort Q3</p>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between"><span className="text-stone-400">Content</span><span>1 SCORM package · 12 modules</span></div>
                <div className="flex items-center justify-between"><span className="text-stone-400">Learning report</span><span>CSV · 248 learners</span></div>
                <div className="flex items-center justify-between"><span className="text-stone-400">Pulse feedback</span><span>162 responses</span></div>
                <div className="h-px bg-white/10" />
                <div className="flex items-center justify-between font-medium"><span>Evidence coverage</span><span className="text-emerald-400">82% · strong</span></div>
              </div>
            </div>
          </div>
        </section>

        {notice && (
          <div role="status" className="mt-5 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice('')} aria-label="Dismiss upload notice" className="p-1 text-amber-700 hover:text-amber-900">
              <X size={15} />
            </button>
          </div>
        )}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Program metrics">
          <MetricCard label="Learners" value="248" note="Across one Q3 cohort" icon={<Users size={18} />} />
          <MetricCard label="Completion" value="72%" note="8 points below target" icon={<CircleGauge size={18} />} />
          <MetricCard label="Median time" value="34 min" note="Module 7 is 2.4× baseline" icon={<Clock3 size={18} />} />
          <MetricCard label="Content issues" value="3" note="1 high-confidence finding" icon={<AlertTriangle size={18} />} />
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">1 · Connect evidence</p>
              <h2 className="mt-1 font-serif text-3xl">Use the data you already have</h2>
            </div>
            <p className="hidden max-w-md text-right text-xs leading-5 text-stone-500 md:block">
              xAPI is optional. Plot Ark can begin with course files, LMS exports, and its own learner pulse.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SourceCard title="Training content" detail="PDF, PPTX, DOCX, or a read-only SCORM package." meta="SCORM indexed · 82% readable" icon={<FileArchive size={20} />} onUpload={() => chooseFile('course or SCORM')} />
            <SourceCard title="LMS report" detail="Map completion, score, time, attempts, and module columns from CSV." meta="248 learner rows mapped" icon={<FileSpreadsheet size={20} />} onUpload={() => chooseFile('CSV')} />
            <SourceCard title="Learner pulse" detail="A lightweight link captures four distinct learning states outside the LMS." meta="162 anonymous responses" icon={<BookOpenCheck size={20} />} onUpload={() => setNotice('Learner Pulse preview: a shareable link would be generated for this program.')} />
          </div>
        </section>

        <section id="diagnosis" className="mt-12 scroll-mt-20">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">2 · Diagnose friction</p>
            <h2 className="mt-1 font-serif text-3xl">One signal becomes useful when the evidence connects</h2>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
            <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">High friction</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Evidence: strong</span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold">Module 4 · Handling customer data</h3>
                  <p className="mt-1 text-sm text-stone-500">The scenario asks learners to apply a rule before the course explains it.</p>
                </div>
                <BarChart3 size={24} className="text-amber-600" />
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">Question accuracy</p><p className="mt-1 text-lg font-semibold">62%</p></div>
                <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">Unlocated difficulty</p><p className="mt-1 text-lg font-semibold">26 learners</p></div>
                <div className="rounded-xl bg-stone-50 p-3"><p className="text-xs text-stone-500">Repeat attempts</p><p className="mt-1 text-lg font-semibold">1.8× baseline</p></div>
              </div>

              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-start gap-3">
                  <Lightbulb size={19} className="mt-0.5 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold text-amber-950">Likely prerequisite gap</p>
                    <p className="mt-1 text-sm leading-6 text-amber-900/80">
                      “Retention period” is required by the customer-data scenario, but the concept is introduced in the following section.
                      Plot Ark treats this as a likely relationship—not proven causality.
                    </p>
                  </div>
                </div>
              </div>
            </article>

            <aside className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Evidence chain</p>
              <div className="mt-5 space-y-4">
                {[
                  ['Course structure', 'SCORM manifest places the rule after the scenario.', FileText],
                  ['Observed behaviour', 'Accuracy drops at the matching checkpoint.', BarChart3],
                  ['Learner voice', 'The dominant response is “I cannot locate what is unclear.”', Users],
                ].map(([title, detail, Icon]) => (
                  <div key={String(title)} className="flex gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                      {React.createElement(Icon as React.ElementType, { size: 15 })}
                    </div>
                    <div><p className="text-sm font-semibold">{title as string}</p><p className="mt-0.5 text-xs leading-5 text-stone-500">{detail as string}</p></div>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t border-stone-100 pt-4 text-xs leading-5 text-stone-500">
                Data is anonymized and shown at cohort level. This preview does not rank individual employees.
              </div>
            </aside>
          </div>
        </section>

        <section className="mt-12 pb-10">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">3 · Improve the next version</p>
              <h2 className="mt-1 font-serif text-3xl">Human-governed revision suggestions</h2>
            </div>
            <div className="text-sm text-stone-500">{acceptedCount} accepted · {SUGGESTIONS.length - Object.keys(statuses).length} awaiting review</div>
          </div>

          <div className="space-y-3">
            {SUGGESTIONS.map(suggestion => {
              const status = statuses[suggestion.id] ?? 'pending';
              return (
                <article key={suggestion.id} className={`rounded-2xl border bg-white p-5 shadow-sm transition ${status === 'accepted' ? 'border-emerald-300' : status === 'rejected' ? 'border-stone-200 opacity-60' : 'border-stone-200'}`}>
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-stone-900">{suggestion.title}</h3>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">{suggestion.impact}</span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-stone-600">{suggestion.detail}</p>
                      <p className="mt-2 text-xs text-stone-400">Evidence: {suggestion.evidence}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {status !== 'pending' && (
                        <button type="button" onClick={() => updateSuggestion(suggestion.id, 'pending')} className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Reset decision">
                          <RefreshCw size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => updateSuggestion(suggestion.id, 'rejected')}
                        aria-pressed={status === 'rejected'}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${status === 'rejected' ? 'border-stone-400 bg-stone-100 text-stone-800' : 'border-stone-200 text-stone-500 hover:bg-stone-50'}`}
                      >
                        <X size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => updateSuggestion(suggestion.id, 'accepted')}
                        aria-pressed={status === 'accepted'}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition ${status === 'accepted' ? 'bg-emerald-700' : 'bg-stone-900 hover:bg-stone-800'}`}
                      >
                        <Check size={14} /> Accept
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={20} className="mt-0.5 text-emerald-600" />
              <div><p className="font-semibold">Revision brief</p><p className="text-sm text-stone-500">Export accepted changes for your Storyline, Rise, Captivate, or course-authoring workflow.</p></div>
            </div>
            <button type="button" onClick={() => setNotice('Preview only: the revision brief will include accepted recommendations and their evidence.')} className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:bg-stone-50">
              Export change brief <ArrowRight size={15} />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default EnterprisePage;
