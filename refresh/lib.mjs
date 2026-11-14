// Evidence-driven curriculum refresh: pure, offline logic (no network, no execution of source content).
import { createHash } from 'node:crypto';

export const STATES = [
  'detected', 'sourced', 'impact-mapped', 'drafted', 'reviewed', 'approved',
  'published', 'monitored', 'retained', 'revised', 'rolled-back', 'rejected',
];

export const TRANSITIONS = {
  detected: ['sourced'],
  sourced: ['impact-mapped'],
  'impact-mapped': ['drafted'],
  drafted: ['reviewed'],
  reviewed: ['approved', 'rejected'],
  approved: ['published'],
  published: ['monitored', 'rolled-back'],
  monitored: ['retained', 'revised', 'rolled-back'],
  retained: [], revised: [], 'rolled-back': [], rejected: [],
};

export const DISCLAIMER =
  'This change brief is a proposal for human review. It does not establish legal or regulatory compliance.';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Heuristic only: flags text that addresses an agent/reader with instructions. Flagged text stays inert data.
const INSTRUCTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|rules)/i,
  /disregard (all )?(previous|prior|above)/i,
  /\b(publish|approve|deploy|delete|overwrite)\b[^.]*\b(immediately|without review|automatically)\b/i,
  /\byou (must|should) now\b/i,
  /\bsystem prompt\b/i,
  /\bas an? (ai|assistant|llm)\b/i,
];
export function detectEmbeddedInstructions(text) {
  return INSTRUCTION_PATTERNS.filter((p) => p.test(text)).map((p) => p.source);
}

// ---- State machine ----
export function createRun(runId, now) {
  return { run_id: runId, state: 'detected', history: [{ state: 'detected', at: now }] };
}

export function transition(run, to, at, actor = 'refresh.mjs') {
  const allowed = TRANSITIONS[run.state] ?? [];
  if (!allowed.includes(to)) throw new Error(`Illegal transition ${run.state} -> ${to}`);
  if (to === 'published') {
    const d = run.decision;
    if (!d || d.decision !== 'approve' || !d.reviewer) {
      throw new Error('Cannot publish without an explicit human approval');
    }
  }
  run.state = to;
  run.history.push({ state: to, at, actor });
  return run;
}

// ---- Snapshot ----
export function snapshot(source, allowlist, retrievedAt) {
  const entry = allowlist.sources.find((s) => s.source_id === source.source_id && s.url === source.url);
  if (!entry) throw new Error(`Source not on allowlist: ${source.url}`);
  const raw = JSON.stringify(source);
  const claims = source.claims.map((c) => ({
    id: c.id,
    text: c.text,
    text_hash: sha256(c.text),
    embedded_instruction_flags: detectEmbeddedInstructions(c.text),
  }));
  return {
    source_id: source.source_id,
    source_url: source.url,
    retrieved_at: retrievedAt,
    content_hash: sha256(raw),
    published_date: source.published_date,
    effective_date: source.effective_date,
    jurisdiction: entry.jurisdiction,
    claims,
    preserved_evidence: raw, // verbatim original, never modified
  };
}

// ---- Semantic diff (claim-level) ----
export function semanticDiff(prev, curr) {
  const p = new Map(prev.claims.map((c) => [c.id, c]));
  const q = new Map(curr.claims.map((c) => [c.id, c]));
  const changes = [];
  for (const [id, c] of q) {
    if (!p.has(id)) changes.push({ claim_id: id, type: 'added', before: null, after: c.text });
    else if (p.get(id).text_hash !== c.text_hash) {
      changes.push({ claim_id: id, type: 'modified', before: p.get(id).text, after: c.text });
    }
  }
  for (const [id, c] of p) if (!q.has(id)) changes.push({ claim_id: id, type: 'removed', before: c.text, after: null });
  return {
    previous_hash: prev.content_hash,
    current_hash: curr.content_hash,
    changed: changes.length > 0,
    changes,
  };
}

// ---- Impact map ----
export function impactMap(diff, course) {
  const changed = new Set(diff.changes.map((c) => c.claim_id));
  const hit = (x) => (x.claim_refs ?? []).filter((r) => changed.has(r));
  const modules = course.modules.filter((m) => hit(m).length).map((m) => ({ id: m.id, title: m.title, claims: hit(m) }));
  const nodes = course.knowledge_graph.nodes.filter((n) => hit(n).length).map((n) => ({ id: n.id, label: n.label, claims: hit(n) }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const candidate_prerequisites = course.knowledge_graph.edges
    .filter((e) => nodeIds.has(e.from) || nodeIds.has(e.to))
    .map((e) => ({ ...e, status: 'candidate', note: 'Relation touches an affected node; human must confirm it still holds.' }));
  const unmapped_claims = [...changed].filter(
    (id) => !modules.some((m) => m.claims.includes(id)) && !nodes.some((n) => n.claims.includes(id)),
  );
  return { course_id: course.course_id, modules, nodes, candidate_prerequisites, unmapped_claims };
}

// ---- Change brief ----
export function changeBrief(snap, diff, impact) {
  const flagged = new Set(snap.claims.filter((c) => c.embedded_instruction_flags.length).map((c) => c.id));
  const evidence = (claimId) => ({
    source_url: snap.source_url,
    snapshot_hash: snap.content_hash,
    retrieved_at: snap.retrieved_at,
    effective_date: snap.effective_date,
    claim_id: claimId,
  });
  const proposals = [];
  const quarantined = [];
  for (const ch of diff.changes) {
    if (flagged.has(ch.claim_id)) {
      quarantined.push({
        claim_id: ch.claim_id,
        reason: 'Source text contains embedded instructions; treated as untrusted data and not used to draft edits.',
        patterns: snap.claims.find((c) => c.id === ch.claim_id).embedded_instruction_flags,
        evidence: evidence(ch.claim_id),
      });
      continue;
    }
    const targets = [
      ...impact.modules.filter((m) => m.claims.includes(ch.claim_id)).map((m) => ({ kind: 'module', id: m.id })),
      ...impact.nodes.filter((n) => n.claims.includes(ch.claim_id)).map((n) => ({ kind: 'kg-node', id: n.id })),
    ];
    proposals.push({
      proposal_id: `p-${ch.claim_id}`,
      change_type: ch.type,
      targets,
      summary: targets.length
        ? `Review ${targets.map((t) => t.id).join(', ')} against ${ch.type} source claim ${ch.claim_id}.`
        : `No existing course content maps to ${ch.type} claim ${ch.claim_id}; consider a new module.`,
      source_quote_before: ch.before,
      source_quote_after: ch.after, // quoted as inert evidence only
      evidence: evidence(ch.claim_id),
      uncertainty: targets.length
        ? 'Medium: mapping is by claim reference; wording of affected content needs human judgement.'
        : 'High: no mapped content; scope of change is unknown.',
    });
  }
  return {
    disclaimer: DISCLAIMER,
    source_url: snap.source_url,
    jurisdiction: snap.jurisdiction,
    effective_date: snap.effective_date,
    proposals,
    quarantined,
    candidate_prerequisites: impact.candidate_prerequisites,
    unmapped_claims: impact.unmapped_claims,
  };
}

// ---- Human review ----
export function validateDecision(d) {
  if (!d || !['approve', 'reject'].includes(d.decision)) throw new Error('Decision must be "approve" or "reject"');
  if (!d.reviewer || !String(d.reviewer).trim()) throw new Error('A named human reviewer is required');
  if (!d.reviewed_at) throw new Error('reviewed_at is required');
  return d;
}

// ---- Orchestration (dry run: never publishes) ----
export function runRefresh({ previousSource, currentSource, course, allowlist, decision, now }) {
  const run = createRun(`refresh-${course.course_id}-${now}`, now);
  const prev = snapshot(previousSource, allowlist, now);
  const curr = snapshot(currentSource, allowlist, now);
  transition(run, 'sourced', now);
  const diff = semanticDiff(prev, curr);
  const artifacts = { snapshot: curr, 'semantic-diff': diff };

  if (!diff.changed) {
    artifacts.audit = audit(run, curr, diff, null, course, now, 'no-change: no curriculum change proposal created');
    return { run, artifacts, proposed: false };
  }
  const impact = impactMap(diff, course);
  transition(run, 'impact-mapped', now);
  const brief = changeBrief(curr, diff, impact);
  transition(run, 'drafted', now);
  artifacts['impact-map'] = impact;
  artifacts['change-brief'] = brief;

  let note = 'awaiting human review decision';
  if (decision) {
    run.decision = validateDecision(decision);
    transition(run, 'reviewed', decision.reviewed_at, decision.reviewer);
    if (decision.decision === 'approve') {
      transition(run, 'approved', decision.reviewed_at, decision.reviewer);
      artifacts['course-version-draft'] = {
        course_id: course.course_id,
        based_on_version: course.version,
        status: 'approved-unpublished',
        approved_proposals: brief.proposals.map((p) => p.proposal_id),
        approved_by: decision.reviewer,
        evidence_snapshot_hash: curr.content_hash,
      };
      note = 'approved; dry run, nothing published';
    } else {
      transition(run, 'rejected', decision.reviewed_at, decision.reviewer);
      note = 'rejected by reviewer; no course version created';
    }
  }
  artifacts.audit = audit(run, curr, diff, run.decision ?? null, course, now, note);
  return { run, artifacts, proposed: true };
}

function audit(run, snap, diff, decision, course, now, note) {
  return {
    run_id: run.run_id,
    dry_run: true,
    final_state: run.state,
    state_history: run.history,
    recorded_at: now,
    source: { url: snap.source_url, content_hash: snap.content_hash, previous_hash: diff.previous_hash },
    human_decision: decision,
    rollback_ref: { course_id: course.course_id, version: course.version, content_hash: course.content_hash },
    ltm_handoff: 'not-eligible: only an approved, published version enters cohort/LTM outcome monitoring',
    note,
  };
}
