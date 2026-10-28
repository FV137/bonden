const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Codex installs Bonden from this fork without the upstream mascot', () => {
  const manifest = JSON.parse(read('.codex-plugin/plugin.json'));
  const marketplace = JSON.parse(read('.agents/plugins/marketplace.json'));
  assert.equal(JSON.parse(read('plugin.json')).name, 'bonden');
  assert.equal(manifest.name, 'bonden');
  assert.equal(marketplace.name, 'bonden');
  assert.equal(marketplace.plugins[0].name, 'bonden');
  assert.equal(marketplace.plugins[0].source.url, 'https://github.com/FV137/stunning-kiwi.git');
  assert.equal(manifest.interface.displayName, 'Bonden');
  assert.equal(manifest.interface.logo, undefined);
  assert.equal(manifest.interface.composerIcon, undefined);
});

test('Codex bundles all six Bonden skills without inherited savings claims', () => {
  const manifest = JSON.parse(read('.codex-plugin/plugin.json'));
  for (const suffix of ['', '-review', '-audit', '-debt', '-gain', '-help']) {
    const name = `bonden${suffix}`;
    const skill = read(path.join(manifest.skills, name, 'SKILL.md'));
    assert.match(skill, new RegExp(`^name: ${name}$`, 'm'));
  }
  const gain = read('skills/bonden-gain/SKILL.md');
  assert.doesNotMatch(gain, /\d+%|Scoreboard|Opus 5\.5/);
  assert.match(gain, /measured|measurement/i);
});
