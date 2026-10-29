#!/usr/bin/env node
// Explicit opt-in: this exercise makes real model calls on the existing Codex account.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { queryCodex } = require('../hooks/bonden-observer');

async function main() {
  const model = process.argv[2];
  if (!model) throw new Error('Usage: node scripts/check-observer.js MODEL');
  const cases = require('../tests/fixtures/observer-cases.json');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bonden-observer-eval-'));
  const results = [];
  for (const scenario of cases) {
    const started = Date.now();
    const verdict = await queryCodex({ phase: scenario.phase, omitted: 0, events: scenario.events, previouslyReported: [] }, { model }, root);
    const pass = Boolean(verdict.notice) === scenario.shouldWarn &&
      (!verdict.notice || (verdict.evidence.length > 0 && verdict.evidence.every(id => scenario.events.some(e => e.id === id))));
    const result = { name: scenario.name, pass, elapsedMs: Date.now() - started, ...verdict };
    results.push(result);
    console.log(JSON.stringify(result));
    fs.writeFileSync(path.join(root, 'results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
  }
  console.log(`Results: ${path.join(root, 'results.json')}`);
  assert.ok(results.every(r => r.pass), 'Observer acceptance case failed; inspect the actual verdicts.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
