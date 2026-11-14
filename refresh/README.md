# refresh.mjs — evidence-driven curriculum refresh (MVP, offline dry run)

Standalone Node CLI, independent of the Flask/React app. Local fixtures stand in for one allowlisted authoritative source; nothing is fetched from the network.

```bash
node refresh/refresh.mjs --dry-run \
  --previous refresh/fixtures/source_v1.json --current refresh/fixtures/source_v2_changed.json \
  --course refresh/fixtures/course.json --allowlist refresh/fixtures/allowlist.json \
  --decision refresh/fixtures/decision_approve.json --out refresh-out
node --test refresh/test/refresh.test.mjs
```

State flow: detected → sourced → impact-mapped → drafted → reviewed → approved → published → monitored → retained | revised | rolled-back (plus `rejected` from reviewed). The dry run stops at `drafted` (no decision), `approved` (approve) or `rejected`; it never publishes. `published` is only reachable from `approved` with a named human approval.

Source content is untrusted data: instruction-like text is quarantined and never used to draft edits. A brief is a proposal and does not establish legal or regulatory compliance. Only an approved, published version may enter LTM cohort monitoring.
