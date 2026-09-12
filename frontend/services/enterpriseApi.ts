export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

export interface EnterpriseProgram {
  id: number;
  name: string;
  description: string;
  organization: { id: number; name: string; slug: string };
  engine_course_id: number;
  cohort: { id: number; label: string } | null;
  source_count: number;
  event_count: number;
}

export interface EnterpriseSuggestion {
  id: number;
  module_id: string;
  title: string;
  detail: string;
  evidence: string;
  impact: string;
  confidence: string;
  status: SuggestionStatus;
}

export interface EnterpriseModule {
  module_id: string;
  module_title: string;
  learners: number;
  events: number;
  completion_rate: number;
  average_score: number;
  median_duration_minutes: number;
  average_attempts: number;
  pulse: Record<string, number>;
  friction_score: number;
  evidence_confidence: string;
}

export interface EnterpriseReport {
  run_id: number;
  program_id: number;
  program_name: string;
  cohort: { id: number; label: string };
  content_version: number;
  metrics: {
    learners: number;
    completion_rate: number;
    median_duration_minutes: number;
    content_issues: number;
  };
  evidence_coverage: number;
  modules: EnterpriseModule[];
  suggestions: EnterpriseSuggestion[];
  comparison: { has_previous: boolean; completion_delta: number | null };
  ltm?: { status: string; path?: string; message?: string };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

export async function listEnterprisePrograms(): Promise<EnterpriseProgram[]> {
  const payload = await requestJson<{ programs: EnterpriseProgram[] }>('/api/enterprise/programs');
  return payload.programs;
}

export function createEnterpriseProgram(input: {
  organization_name: string;
  program_name: string;
  cohort_label: string;
  description?: string;
}): Promise<EnterpriseProgram> {
  return requestJson('/api/enterprise/programs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}

export function getEnterpriseProgram(programId: number): Promise<EnterpriseProgram> {
  return requestJson(`/api/enterprise/programs/${programId}`);
}

export function getLatestEnterpriseAnalysis(programId: number): Promise<EnterpriseReport> {
  return requestJson(`/api/enterprise/programs/${programId}/analysis/latest`);
}

export async function uploadEnterpriseSources(
  programId: number,
  files: File[],
  sourceKind: 'training_content' | 'lms_report',
): Promise<void> {
  const form = new FormData();
  files.forEach(file => form.append('files[]', file));
  form.append('source_kind', sourceKind);
  await requestJson(`/api/enterprise/programs/${programId}/sources`, { method: 'POST', body: form });
}

export function analyzeEnterpriseProgram(programId: number): Promise<EnterpriseReport> {
  return requestJson(`/api/enterprise/programs/${programId}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
}

export function decideEnterpriseSuggestion(
  suggestionId: number,
  status: Exclude<SuggestionStatus, 'pending'>,
): Promise<{ id: number; status: SuggestionStatus }> {
  return requestJson(`/api/enterprise/suggestions/${suggestionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function submitEnterprisePulse(
  programId: number,
  input: { state: string; module_id: string; learner_ref: string },
): Promise<{ id: number; state: string }> {
  return requestJson(`/api/enterprise/programs/${programId}/pulse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
}
