import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRefresh, createRun, transition, snapshot } from '../lib.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(readFileSync(join(dir, '../fixtures', n), 'utf8'));
const base = () => ({
  previousSource: fx('source_v1.json'), currentSource: fx('source_v2_changed.json'),
  course: fx('course.json'), allowlist: fx('allowlist.json'), decision: null, now: '2026-03-01T09:00:00Z',
});

test('changed source produces all artifacts and stops at drafted without decision', () => {
  const r = runRefresh(base());
  assert.equal(r.proposed, true);
  assert.equal(r.run.state, 'drafted');
  for (const k of ['snapshot', 'semantic-diff', 'impact-map', 'change-brief', 'audit']) assert.ok(r.artifacts[k], k);
  assert.equal(r.artifacts['course-version-draft'], undefined);
  const d = r.artifacts['semantic-diff'].changes.map((c) => `${c.claim_id}:${c.type}`).sort();
  assert.deepEqual(d, ['c1:modified', 'c4:added']);
  const im = r.artifacts['impact-map'];
  assert.deepEqual(im.modules.map((m) => m.id), ['m1']);
  assert.deepEqual(im.nodes.map((n) => n.id), ['kg-notify-timeline']);
  assert.equal(im.candidate_prerequisites.length, 2);
  assert.deepEqual(im.unmapped_claims, ['c4']);
});

test('unchanged source produces no proposal', () => {
  const b = base(); b.currentSource = fx('source_v1.json');
  const r = runRefresh(b);
  assert.equal(r.proposed, false);
  assert.equal(r.artifacts['change-brief'], undefined);
  assert.equal(r.artifacts['impact-map'], undefined);
  assert.equal(r.run.state, 'sourced');
});

test('every proposal traces to preserved source evidence', () => {
  const r = runRefresh(base());
  const snap = r.artifacts.snapshot;
  const preserved = JSON.parse(snap.preserved_evidence);
  assert.equal(snap.source_url, 'https://example.gov.test/privacy/breach-reporting-guidance');
  assert.ok(snap.retrieved_at && snap.jurisdiction && snap.effective_date && snap.published_date);
  for (const p of r.artifacts['change-brief'].proposals) {
    assert.equal(p.evidence.snapshot_hash, snap.content_hash);
    const claim = preserved.claims.find((c) => c.id === p.evidence.claim_id);
    assert.ok(claim, 'claim exists in preserved evidence');
    assert.equal(p.source_quote_after, claim.text);
  }
  assert.match(r.artifacts['change-brief'].disclaimer, /does not establish legal or regulatory compliance/);
});

test('approval creates unpublished version draft, never published', () => {
  const b = base(); b.decision = fx('decision_approve.json');
  const r = runRefresh(b);
  assert.equal(r.run.state, 'approved');
  assert.equal(r.artifacts['course-version-draft'].status, 'approved-unpublished');
  assert.equal(r.artifacts.audit.dry_run, true);
  assert.ok(r.artifacts.audit.rollback_ref.version);
  assert.match(r.artifacts.audit.ltm_handoff, /not-eligible/);
});

test('rejection cannot reach published', () => {
  const b = base(); b.decision = fx('decision_reject.json');
  const r = runRefresh(b);
  assert.equal(r.run.state, 'rejected');
  assert.equal(r.artifacts['course-version-draft'], undefined);
  assert.throws(() => transition(r.run, 'published', 'x'), /Illegal transition/);
});

test('unreviewed or decision-less runs cannot publish', () => {
  const r = runRefresh(base());
  assert.throws(() => transition(r.run, 'published', 'x'), /Illegal transition/);
  const run = createRun('t', 'n');
  for (const s of ['sourced', 'impact-mapped', 'drafted', 'reviewed', 'approved']) transition(run, s, 'n');
  assert.throws(() => transition(run, 'published', 'n'), /explicit human approval/);
  run.decision = { decision: 'approve', reviewer: 'A', reviewed_at: 'n' };
  transition(run, 'published', 'n');
  transition(run, 'monitored', 'n');
  transition(run, 'retained', 'n');
  assert.throws(() => transition(run, 'revised', 'n'), /Illegal/);
});

test('state flow skipping steps is rejected', () => {
  const run = createRun('t', 'n');
  assert.throws(() => transition(run, 'approved', 'n'), /Illegal/);
});

test('approval requires named reviewer', () => {
  const b = base(); b.decision = { decision: 'approve', reviewer: ' ', reviewed_at: 'n' };
  assert.throws(() => runRefresh(b), /reviewer/);
});

test('embedded instructions are quarantined, not obeyed or used for edits', () => {
  const b = base(); b.currentSource = fx('source_v2_injected.json');
  const r = runRefresh(b);
  const brief = r.artifacts['change-brief'];
  assert.equal(brief.proposals.length, 0);
  assert.equal(brief.quarantined[0].claim_id, 'c1');
  assert.equal(r.run.state, 'drafted'); // injected "publish immediately" had no effect
  assert.equal(r.artifacts['course-version-draft'], undefined);
});

test('non-allowlisted source is refused', () => {
  const src = { ...fx('source_v1.json'), url: 'https://evil.test/x' };
  assert.throws(() => snapshot(src, fx('allowlist.json'), 'n'), /allowlist/);
});

test('CLI dry-run writes artifacts; non-dry-run refused', () => {
  const out = mkdtempSync(join(tmpdir(), 'refresh-'));
  const f = (n) => join(dir, '../fixtures', n);
  const cli = join(dir, '../refresh.mjs');
  const common = ['--previous', f('source_v1.json'), '--current', f('source_v2_changed.json'),
    '--course', f('course.json'), '--allowlist', f('allowlist.json'), '--out', out];
  execFileSync('node', [cli, '--dry-run', ...common, '--decision', f('decision_approve.json')]);
  for (const n of ['snapshot', 'semantic-diff', 'impact-map', 'change-brief', 'audit', 'course-version-draft']) {
    assert.ok(existsSync(join(out, `${n}.json`)), n);
  }
  assert.throws(() => execFileSync('node', [cli, ...common], { stdio: 'pipe' }));
});
