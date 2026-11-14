/**
 * Manager Follow-up Pulse UI (Enterprise L&D).
 *
 * ManagerFollowUpForm: a manager sees and answers only their own requests.
 * ManagerFollowUpAdmin: admin configures intervals, sees who has responded
 * (never what they answered) and the cohort-level evidence card.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface FollowUpRequest {
  manager_id: number;
  program: string;
  cohort: string;
  interval_days: number;
  due: boolean;
  my_status: string | null;
  my_comment: string;
}

interface Option { value: string; label: string }

export const ManagerFollowUpForm: React.FC<{ email: string }> = ({ email }) => {
  const [requests, setRequests] = useState<FollowUpRequest[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [draft, setDraft] = useState<Record<string, { status: string; comment: string }>>({});
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    fetch('/api/enterprise/followup/mine', { headers: { 'X-User-Email': email } })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { setRequests(data.requests ?? []); setOptions(data.options ?? []); })
      .catch(() => setMessage('Could not load follow-up requests.'));
  }, [email]);

  useEffect(load, [load]);

  const submit = async (req: FollowUpRequest) => {
    const key = `${req.manager_id}:${req.interval_days}`;
    const value = draft[key];
    if (!value?.status) return;
    const res = await fetch(`/api/enterprise/followup/mine/${req.manager_id}/${req.interval_days}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-User-Email': email },
      body: JSON.stringify(value),
    });
    setMessage(res.ok ? 'Thank you. Your follow-up has been saved.' : 'Could not save your follow-up.');
    if (res.ok) load();
  };

  if (requests.length === 0) return null;

  return (
    <section className="mt-12" aria-label="Manager follow-up">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Manager follow-up</p>
      <h2 className="mt-2 font-serif text-3xl">Is your team applying the training?</h2>
      <div className="mt-4 space-y-4">
        {requests.map(req => {
          const key = `${req.manager_id}:${req.interval_days}`;
          const current = draft[key] ?? { status: req.my_status ?? '', comment: req.my_comment };
          return (
            <article key={key} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <p className="font-semibold">{req.program} · {req.cohort} · {req.interval_days}-day follow-up</p>
              {!req.due ? (
                <p className="mt-2 text-sm text-stone-500">This follow-up opens {req.interval_days} days after the program.</p>
              ) : (
                <>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {options.map(o => (
                      <button
                        key={o.value}
                        type="button"
                        aria-pressed={current.status === o.value}
                        onClick={() => setDraft(d => ({ ...d, [key]: { ...current, status: o.value } }))}
                        className={`rounded-xl border p-3 text-left text-sm font-medium ${current.status === o.value ? 'border-amber-400 bg-amber-50' : 'border-stone-200 hover:border-amber-200'}`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={current.comment}
                    maxLength={500}
                    onChange={e => setDraft(d => ({ ...d, [key]: { ...current, comment: e.target.value } }))}
                    placeholder="Optional comment about your team (no names, please)"
                    aria-label="Optional comment"
                    className="mt-3 w-full rounded-xl border border-stone-200 p-3 text-sm"
                    rows={2}
                  />
                  <button
                    type="button"
                    disabled={!current.status}
                    onClick={() => submit(req)}
                    className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  >
                    {req.my_status ? 'Update follow-up' : 'Submit follow-up'}
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <ShieldCheck size={19} className="mt-0.5 shrink-0" />
        <p>You see only your own team&apos;s form. L&amp;D sees cohort totals only; no individual employees are ranked or scored.</p>
      </div>
      {message ? <p role="status" className="mt-3 text-sm font-medium text-emerald-700">{message}</p> : null}
    </section>
  );
};

interface Aggregate {
  invited: number; responded: number; coverage: number;
  breakdown_suppressed: boolean; min_group_size: number;
  evidence_status: 'sufficient' | 'insufficient_data';
  counts: Record<string, number> | null;
  applying_share: number | null;
}
interface IntervalView {
  interval_days: number;
  due: boolean;
  managers: { email: string; responded: boolean }[];
  aggregate: Aggregate;
  evidence_card: { summary: string };
}
interface Coverage {
  config: { intervals_days: number[]; program_version: string; min_group_size: number };
  status_labels: Record<string, string>;
  cohorts: { cohort: { id: number; label: string }; intervals: IntervalView[] }[];
}

export const ManagerFollowUpAdmin: React.FC<{ role: string }> = ({ role }) => {
  const [programId, setProgramId] = useState<number | null>(null);
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [intervals, setIntervals] = useState('30, 90');
  const [managers, setManagers] = useState('');
  const [message, setMessage] = useState('');
  const headers = { 'Content-Type': 'application/json', 'X-User-Role': role };

  const load = useCallback((id: number) => {
    fetch(`/api/enterprise/programs/${id}/followup/coverage`, { headers })
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: Coverage) => { setCoverage(data); setIntervals(data.config.intervals_days.join(', ')); })
      .catch(() => setMessage('Could not load manager follow-up.'));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  useEffect(() => {
    fetch('/api/enterprise/programs')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { const first = data.programs?.[0]; if (first) { setProgramId(first.id); load(first.id); } })
      .catch(() => undefined);
  }, [load]);

  if (programId === null) return null;

  const saveConfig = async () => {
    const days = intervals.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !Number.isNaN(n));
    const res = await fetch(`/api/enterprise/programs/${programId}/followup/config`, {
      method: 'PUT', headers, body: JSON.stringify({ intervals_days: days }),
    });
    setMessage(res.ok ? 'Follow-up intervals saved.' : (await res.json()).error ?? 'Could not save intervals.');
    if (res.ok) load(programId);
  };

  const addManagers = async () => {
    const manager_emails = managers.split(/[\s,;]+/).filter(Boolean);
    const res = await fetch(`/api/enterprise/programs/${programId}/followup/managers`, {
      method: 'POST', headers, body: JSON.stringify({ manager_emails }),
    });
    setMessage(res.ok ? 'Managers added.' : (await res.json()).error ?? 'Could not add managers.');
    if (res.ok) { setManagers(''); load(programId); }
  };

  return (
    <section className="mt-12" aria-label="Manager follow-up evidence">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Manager follow-up</p>
      <h2 className="mt-1 font-serif text-3xl">Is behavior changing at work?</h2>
      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4">
        <label className="text-sm">Follow-up days
          <input value={intervals} onChange={e => setIntervals(e.target.value)} className="ml-2 w-28 rounded-lg border border-stone-200 px-2 py-1" />
        </label>
        <button type="button" onClick={saveConfig} className="rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-semibold text-white">Save intervals</button>
        <label className="text-sm">Add managers
          <input value={managers} onChange={e => setManagers(e.target.value)} placeholder="email, email" className="ml-2 w-64 rounded-lg border border-stone-200 px-2 py-1" />
        </label>
        <button type="button" onClick={addManagers} className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-semibold">Add</button>
      </div>
      {message ? <p role="status" className="mt-2 text-sm text-stone-600">{message}</p> : null}
      {coverage?.cohorts.map(c => c.intervals.map(iv => (
        <article key={`${c.cohort.id}-${iv.interval_days}`} className="mt-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Manager follow-up · {c.cohort.label} · {iv.interval_days} days</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${iv.aggregate.evidence_status === 'sufficient' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
              {iv.aggregate.evidence_status === 'sufficient' ? 'Evidence: sufficient' : 'Insufficient data'}
            </span>
            <span className="text-xs text-stone-500">Coverage {Math.round(iv.aggregate.coverage * 100)}% · {iv.aggregate.responded}/{iv.aggregate.invited}</span>
          </div>
          <p className="mt-2 text-sm text-stone-600">{iv.evidence_card.summary}</p>
          {iv.aggregate.counts ? (
            <dl className="mt-3 grid gap-2 sm:grid-cols-4">
              {Object.entries(iv.aggregate.counts).map(([k, v]) => (
                <div key={k} className="rounded-xl bg-stone-50 p-3"><dt className="text-xs text-stone-500">{coverage.status_labels[k] ?? k}</dt><dd className="mt-1 text-lg font-semibold">{v}</dd></div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-xs text-stone-500">Breakdown hidden until at least {iv.aggregate.min_group_size} managers respond.</p>
          )}
          <p className="mt-3 text-xs text-stone-500">
            Responded: {iv.managers.filter(m => m.responded).map(m => m.email).join(', ') || 'none yet'} ·
            Not yet: {iv.managers.filter(m => !m.responded).map(m => m.email).join(', ') || 'none'}
          </p>
        </article>
      )))}
    </section>
  );
};
