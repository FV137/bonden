#!/usr/bin/env node
// Every bonden command the pi extension registers must also ship as a
// file-based command for the hosts that need one: Claude Code (commands/*.toml,
// which Gemini CLI reuses) and OpenCode (.opencode/command/*.md). /bonden-help
// was advertised in the README and the help card but missing both files; this
// guards that drift -- a registered command with no adapter file fails here.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// pi-extension registers the canonical command set.
const piSource = fs.readFileSync(path.join(root, 'pi-extension', 'index.js'), 'utf8');
const commands = [...piSource.matchAll(/registerCommand\(["']([\w-]+)["']/g)].map((m) => m[1]);

test('pi registers at least the base command', () => {
  assert.ok(commands.includes('bonden'), 'expected pi to register a bonden command');
});

test('every registered command ships a Claude commands/*.toml', () => {
  for (const name of commands) {
    assert.ok(
      fs.existsSync(path.join(root, 'commands', `${name}.toml`)),
      `missing commands/${name}.toml`,
    );
  }
});

test('every registered command ships an OpenCode .opencode/command/*.md', () => {
  for (const name of commands) {
    assert.ok(
      fs.existsSync(path.join(root, '.opencode', 'command', `${name}.md`)),
      `missing .opencode/command/${name}.md`,
    );
  }
});

// /bonden-debt documents one grep for the whole tree, shipped in four copies.
// It missed C-style /* bonden: */ block comments (#810), so the ledger silently
// skipped every C/Java/CSS marker. Feed each shipped expression to real grep
// rather than restating it here: a copied regex only tests the copy.
const debtCopies = [
  'skills/bonden-debt/SKILL.md',
  '.openclaw/skills/bonden-debt/SKILL.md',
  'commands/bonden-debt.toml',
  '.opencode/command/bonden-debt.md',
];
const debtSamples = [
  ['# shortcut: current marker', true],
  ['// ponytail: upstream marker', true],
  ['/* ponytail: upstream block marker */', true],
  ['# bonden: hash marker', true],
  ['#bonden: hash marker, no space', true],
  ['// bonden: slash marker', true],
  ['//bonden: slash marker, no space', true],
  ['/* bonden: block marker, closed here */', true],
  ['/*bonden: block marker, no space */', true],
  ['/* bonden: block opener, closed some lines below', true],
  ['prose that merely mentions bonden: markers stays out of the ledger', false],
];

test('every bonden-debt copy greps #, // and /* markers but not prose', (t) => {
  const input = debtSamples.map(([line]) => line).join('\n') + '\n';
  const expected = debtSamples.flatMap(([line, hit], i) => (hit ? [`${i + 1}:${line}`] : []));

  for (const rel of debtCopies) {
    const documented = fs.readFileSync(path.join(root, rel), 'utf8').match(/git grep [^']*-nE '([^']+)'/);
    assert.ok(documented, `${rel} no longer documents a git grep ... -nE '<pattern>'`);

    const result = spawnSync('grep', ['-nE', documented[1]], { input, encoding: 'utf8', timeout: 5000 });
    if (result.error) {
      if (result.error.code === 'ENOENT') return t.skip('grep not available on this platform');
      throw result.error;
    }
    assert.equal(result.status, 0, `grep failed for ${rel}: ${result.stderr}`);
    assert.deepEqual(result.stdout.split('\n').filter(Boolean), expected, `${rel} misses or over-matches markers`);
  }
});

// The full documented command must skip .git and whatever .gitignore ignores, in any stack (#948, #1100).
test('the bonden-debt scan skips .git and ignored dirs like node_modules, dist, build and .next', (t) => {
  const cmd = fs.readFileSync(path.join(root, 'skills/bonden-debt/SKILL.md'), 'utf8').match(/`(git grep [^`]+)`/)[1];
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bonden-debt-'));
  for (const sub of ['src', '.git', 'node_modules/pkg', 'dist', 'build', '.next']) {
    fs.mkdirSync(path.join(dir, sub), { recursive: true });
    fs.writeFileSync(path.join(dir, sub, 'a.js'), '// bonden: marker\n');
  }
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\ndist/\nbuild/\n.next/\n');
  const result = spawnSync('sh', ['-c', cmd], { cwd: dir, encoding: 'utf8', timeout: 5000 });
  fs.rmSync(dir, { recursive: true, force: true });
  if (result.error || result.status === 127) return t.skip(`sh/git not available: ${result.error ? result.error.code : result.stderr}`);
  assert.deepEqual(result.stdout.split('\n').filter(Boolean), ['src/a.js:1:// bonden: marker']);
});
