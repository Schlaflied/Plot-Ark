/**
 * Enterprise L&D preview.
 *
 * This intentionally reuses Plot Ark's existing curriculum engine language
 * while demonstrating a workplace-learning workflow with synthetic data.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ManagerFollowUpAdmin, ManagerFollowUpForm } from '../components/enterprise/ManagerFollowUp';
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

interface UploadRule {
  label: string;
  accept: string;
  formats: string;
  maxFiles: number;
  maxMb: number;
}

const GENERAL_UPLOAD: UploadRule = {
  label: 'learning source',
  accept: '.zip,.pdf,.pptx,.docx,.xlsx,.csv',
  formats: 'SCORM ZIP, PDF, PPTX, DOCX, XLSX, CSV',
  maxFiles: 10,
  maxMb: 50,
};

const CONTENT_UPLOAD: UploadRule = {
  label: 'training content',
  accept: '.zip,.pdf,.pptx,.docx',
  formats: 'SCORM ZIP, PDF, PPTX, DOCX',
  maxFiles: 10,
  maxMb: 50,
};

const REPORT_UPLOAD: UploadRule = {
  label: 'LMS report',
  accept: '.xlsx,.csv',
  formats: 'XLSX, CSV',
  maxFiles: 5,
  maxMb: 25,
};

interface MappingProposal {
  platform: string | null;
  platform_label: string | null;
  manual_required: boolean;
  mapping: Record<string, string>;
  ambiguous: Record<string, string[]>;
  unmatched_columns: string[];
  columns: string[];
  row_count: number;
  fields: { field: string; label: string; required: boolean }[];
}

interface StagedImport {
  id: number;
  fileName: string;
  platformLabel: string;
  sourceLabel: string;
  summary: { learners: number; events: number; completion_rate: number | null; avg_score: number | null; avg_duration_seconds: number | null; small_group: boolean };
}

const PLATFORM_CHOICES: [string, string][] = [
  ['auto', 'Detect automatically'],
  ['workday_learning', 'Workday Learning'],
  ['d2l_brightspace', 'D2L Brightspace'],
  ['canvas', 'Canvas'],
  ['moodle', 'Moodle'],
  ['manual', 'Other / map manually'],
];

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
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [platform, setPlatform] = useState('auto');
  const [proposal, setProposal] = useState<MappingProposal | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sourceSite, setSourceSite] = useState('');
  const [sourceVersion, setSourceVersion] = useState('');
  const [staged, setStaged] = useState<StagedImport[]>([]);
  const uploadRuleRef = useRef<UploadRule>(GENERAL_UPLOAD);

  const acceptedCount = useMemo(
    () => Object.values(statuses).filter(status => status === 'accepted').length,
    [statuses],
  );

  const chooseFile = (rule: UploadRule) => {
    uploadRuleRef.current = rule;
    if (fileInputRef.current) {
      fileInputRef.current.accept = rule.accept;
      fileInputRef.current.click();
    }
  };

  const loadProposal = async (file: File, chosenPlatform: string) => {
    const body = new FormData();
    body.append('file', file);
    body.append('platform', chosenPlatform);
    try {
      const res = await fetch('/api/enterprise/mapping/preview', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setProposal(null);
        setNotice(data.error ?? 'Could not read this LMS export.');
        return;
      }
      setProposal(data);
      setMapping(data.mapping);
    } catch {
      setProposal(null);
      setNotice('Mapping preview is unavailable right now. Check that the backend is running.');
    }
  };

  const confirmMapping = async () => {
    if (!reportFile || !proposal) return;
    const body = new FormData();
    body.append('file', reportFile);
    body.append('platform', platform);
    body.append('mapping', JSON.stringify(mapping));
    body.append('source_site', sourceSite);
    body.append('source_version', sourceVersion);
    try {
      const res = await fetch('/api/enterprise/mapping/preview', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? 'Could not confirm this mapping.');
        return;
      }
      const sourceLabel: string = data.source?.label ?? 'Unlabelled source';
      setStaged(prev => [...prev, {
        id: Date.now(),
        fileName: reportFile.name,
        platformLabel: data.platform_label ?? 'Manual mapping',
        sourceLabel,
        summary: data.summary,
      }]);
      setNotice('Mapping confirmed for this preview. No data was stored.');
      setReportFile(null);
      setProposal(null);
    } catch {
      setNotice('Mapping preview is unavailable right now. Check that the backend is running.');
    }
  };

  const missingFields = proposal
    ? [
        ...(['learner_ref', 'completion'] as const).filter(f => !mapping[f]).map(f => proposal.fields.find(x => x.field === f)?.label ?? f),
        ...(!mapping.module_id && !mapping.module_title ? ['Module / content ID or title'] : []),
      ]
    : [];

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    const rule = uploadRuleRef.current;
    const oversized = files.find(file => file.size > rule.maxMb * 1024 * 1024);

    if (files.length > rule.maxFiles) {
      setNotice(`Too many files. ${rule.label} accepts up to ${rule.maxFiles} files per upload.`);
    } else if (oversized) {
      setNotice(`${oversized.name} is over the ${rule.maxMb} MB per-file limit.`);
    } else if (files.length > 0 && rule === REPORT_UPLOAD) {
      setReportFile(files[0]);
      setPlatform('auto');
      setSourceSite('');
      setSourceVersion('');
      setNotice(files.length > 1 ? 'Mapping review shows the first file; map each LMS report separately.' : '');
      void loadProposal(files[0], 'auto');
    } else if (files.length > 0) {
      setNotice(`${files.length} ${rule.label} file${files.length === 1 ? '' : 's'} selected. Preview formats: ${rule.formats}.`);
    }

    event.currentTarget.value = '';
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
          <ManagerFollowUpForm email={auth.email} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F4EF] text-stone-900">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={GENERAL_UPLOAD.accept}
        onChange={handleFilesSelected}
        className="hidden"
        aria-label="Upload learning source"
      />

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
                  onClick={() => chooseFile(GENERAL_UPLOAD)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium text-stone-200 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
                >
                  <Upload size={15} /> Upload your own
                </button>
              </div>
              <p className="mt-3 text-xs text-stone-400">
                SCORM ZIP, PDF, PPTX, DOCX, XLSX, CSV · up to 10 files · 50 MB each
              </p>
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

        {reportFile && proposal && (
          <section aria-label="Map LMS report columns" className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Map LMS report</p>
                <p className="mt-1 text-sm text-stone-600">
                  {reportFile.name} · {proposal.row_count} rows ·{' '}
                  {proposal.platform_label ? `Proposed preset: ${proposal.platform_label}` : 'No preset matched — map columns manually'}
                </p>
              </div>
              <select
                aria-label="LMS platform"
                value={platform}
                onChange={e => { setPlatform(e.target.value); void loadProposal(reportFile, e.target.value); }}
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm"
              >
                {PLATFORM_CHOICES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs text-stone-500">
                Source site (optional)
                <input
                  value={sourceSite}
                  maxLength={80}
                  onChange={e => setSourceSite(e.target.value)}
                  placeholder="e.g. Legacy Moodle"
                  className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900"
                />
              </label>
              <label className="text-xs text-stone-500">
                Source version (optional)
                <input
                  value={sourceVersion}
                  maxLength={80}
                  onChange={e => setSourceVersion(e.target.value)}
                  placeholder="e.g. Moodle 3.11"
                  className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900"
                />
              </label>
            </div>
            <p className="mt-1 text-xs text-stone-400">Descriptive label only; Plot Ark does not detect the site or version.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {proposal.fields.map(({ field, label, required }) => (
                <label key={field} className="text-xs text-stone-500">
                  {label}{required ? ' *' : ''}
                  <select
                    value={mapping[field] ?? ''}
                    onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                    className="mt-1 block w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-900"
                  >
                    <option value="">— not mapped —</option>
                    {proposal.columns.map(column => <option key={column} value={column}>{column}</option>)}
                  </select>
                  {proposal.ambiguous[field] && (
                    <span className="mt-1 block text-amber-700">Also matched: {proposal.ambiguous[field].join(', ')}</span>
                  )}
                </label>
              ))}
            </div>
            {(() => {
              const used = new Set(Object.values(mapping));
              const unmatched = proposal.columns.filter(c => !used.has(c));
              return unmatched.length > 0 ? (
                <p className="mt-4 text-xs leading-5 text-stone-500">
                  <span className="font-semibold text-stone-700">Unmatched columns (not imported):</span> {unmatched.join(', ')}
                </p>
              ) : null;
            })()}
            {missingFields.length > 0 && (
              <p role="alert" className="mt-3 text-sm text-red-700">Missing required field(s): {missingFields.join(', ')}.</p>
            )}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={missingFields.length > 0}
                onClick={() => { void confirmMapping(); }}
                className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Confirm mapping
              </button>
              <button type="button" onClick={() => { setReportFile(null); setProposal(null); }} className="text-sm font-medium text-stone-500 hover:text-stone-900">
                Cancel
              </button>
            </div>
          </section>
        )}

        {staged.length > 0 && (
          <section aria-label="Cohort comparison by source" className="mt-5 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Cohort comparison by source</p>
              <button type="button" onClick={() => setStaged([])} className="text-xs font-medium text-stone-500 hover:text-stone-900">Clear</button>
            </div>
            <p className="mt-1 text-xs text-stone-500">Each labelled import stays its own cohort; sources are never pooled. Preview only, nothing is stored.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="text-xs text-stone-400">
                    <th className="py-1.5 pr-4 font-medium">Source</th>
                    <th className="py-1.5 pr-4 font-medium">Learners</th>
                    <th className="py-1.5 pr-4 font-medium">Completion</th>
                    <th className="py-1.5 pr-4 font-medium">Avg score</th>
                    <th className="py-1.5 font-medium">Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {staged.map(item => (
                    <tr key={item.id} className="border-t border-stone-100 text-stone-800">
                      <td className="py-2 pr-4">
                        <span className="font-medium">{item.sourceLabel}</span>
                        <span className="block text-xs text-stone-400">{item.platformLabel} · {item.fileName}</span>
                      </td>
                      <td className="py-2 pr-4">{item.summary.learners}{item.summary.small_group ? ' *' : ''}</td>
                      <td className="py-2 pr-4">{item.summary.completion_rate === null ? '—' : `${Math.round(item.summary.completion_rate * 100)}%`}</td>
                      <td className="py-2 pr-4">{item.summary.avg_score ?? '—'}</td>
                      <td className="py-2">{item.summary.avg_duration_seconds === null ? '—' : `${Math.round(item.summary.avg_duration_seconds / 60)} min`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {staged.some(item => item.summary.small_group) && (
              <p className="mt-2 text-xs text-stone-400">* Fewer than 5 learners: treat as indicative only.</p>
            )}
          </section>
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
            <SourceCard title="Training content" detail="SCORM ZIP, PDF, PPTX, DOCX · up to 10 files · 50 MB each." meta="SCORM indexed · 82% readable" icon={<FileArchive size={20} />} onUpload={() => chooseFile(CONTENT_UPLOAD)} />
            <SourceCard title="LMS report" detail="XLSX or CSV · up to 5 files · 25 MB each. Map completion, score, time, attempts, and module columns." meta="248 learner rows mapped" icon={<FileSpreadsheet size={20} />} onUpload={() => chooseFile(REPORT_UPLOAD)} />
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

        <ManagerFollowUpAdmin role={auth?.role ?? ''} />

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
