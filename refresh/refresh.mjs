#!/usr/bin/env node
// Usage: node refresh/refresh.mjs --dry-run --previous <file> --current <file> --course <file> --allowlist <file> --out <dir> [--decision <file>]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { runRefresh } from './lib.mjs';

const { values: a } = parseArgs({
  options: {
    'dry-run': { type: 'boolean' }, previous: { type: 'string' }, current: { type: 'string' },
    course: { type: 'string' }, allowlist: { type: 'string' }, decision: { type: 'string' },
    out: { type: 'string', default: 'refresh-out' }, now: { type: 'string' },
  },
});
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));

if (!a['dry-run']) {
  console.error('Only --dry-run is supported in this MVP; publishing is not implemented.');
  process.exit(2);
}
for (const k of ['previous', 'current', 'course', 'allowlist']) {
  if (!a[k]) { console.error(`Missing --${k}`); process.exit(2); }
}
try {
  const { run, artifacts, proposed } = runRefresh({
    previousSource: load(a.previous), currentSource: load(a.current), course: load(a.course),
    allowlist: load(a.allowlist), decision: a.decision ? load(a.decision) : null,
    now: a.now ?? new Date().toISOString(),
  });
  mkdirSync(a.out, { recursive: true });
  for (const [name, data] of Object.entries(artifacts)) {
    writeFileSync(join(a.out, `${name}.json`), JSON.stringify(data, null, 2));
  }
  console.log(`state=${run.state} proposal=${proposed ? 'yes' : 'none'} artifacts=${Object.keys(artifacts).join(',')}`);
} catch (e) {
  console.error(`refresh failed: ${e.message}`);
  process.exit(1);
}
