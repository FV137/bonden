const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const observer = require('../hooks/bonden-observer');

function fixture(t, lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bonden-observer-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const transcript = path.join(dir, 'session.jsonl');
  fs.writeFileSync(transcript, lines.map(JSON.stringify).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'observer.json'), JSON.stringify({ enabled: true }));
  return { dir, input: { session_id: 'test-session', turn_id: 'test-turn', model: 'gpt-6-astra',
    hook_event_name: 'Stop', transcript_path: transcript, last_assistant_message: 'Audit finished. Tests were not run because dependencies are absent.' } };
}

const message = (role, text, channel) => ({ type: 'response_item', payload: {
  type: 'message', role, ...(channel ? { channel } : {}), content: [{ type: 'input_text', text }],
} });
const audit = [
  { type: 'session_meta', payload: { model_provider: 'openai' } },
  message('user', 'Run a comprehensive audit. Install the prerequisites needed to finish it. Do not fix the application.'),
  { type: 'response_item', payload: { type: 'function_call', call_id: 'c1', name: 'exec_command', arguments: '{"cmd":"npm test"}' } },
  { type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: 'node_modules is absent. Tests could not run.' } },
  message('assistant', 'I should wrap up now.', 'analysis'),
  message('assistant', 'Audit finished. Tests were not run because dependencies are absent.', 'final'),
];

test('observer sees the request, actual tools, and final claim, but not private reasoning', t => {
  const { input } = fixture(t, audit);
  const context = observer.readContext(input);
  assert.match(JSON.stringify(context), /comprehensive audit/);
  assert.match(JSON.stringify(context), /npm test/);
  assert.match(JSON.stringify(context), /node_modules is absent/);
  assert.match(JSON.stringify(context), /Audit finished/);
  assert.doesNotMatch(JSON.stringify(context), /wrap up now/);
  assert.equal(context.provider, 'openai');
});

test('final warning is delivered directly, grounded in transcript evidence, and cannot continue or block the agent', async t => {
  const { dir, input } = fixture(t, audit);
  let calls = 0;
  const check = async context => {
    calls++;
    return { notice: 'The comprehensive audit stopped with required checks unrun, although installing dependencies was authorized.',
      topic: 'unfinished-audit', evidence: [context.events[0].id, context.events.at(-1).id] };
  };
  const output = await observer.run(input, { dataDir: dir, check });
  assert.match(output.systemMessage, /Heads up.*audit/s);
  assert.deepEqual(Object.keys(output), ['systemMessage']);
  assert.equal(calls, 1);
  assert.deepEqual(await observer.run(input, { dataDir: dir, check }), {});
  assert.equal(calls, 1, 'an unchanged final response must not be billed twice');
});

test('quiet checks produce no warning or success badge', async t => {
  const { dir, input } = fixture(t, audit);
  const output = await observer.run(input, { dataDir: dir,
    check: async () => ({ notice: '', topic: '', evidence: [] }) });
  assert.deepEqual(output, {});
});

test('an observer failure is visible and never reported as a clean check', async t => {
  const { dir, input } = fixture(t, audit);
  const output = await observer.run(input, { dataDir: dir, check: async () => { throw new Error('request timed out'); } });
  assert.match(output.systemMessage, /Observer unavailable.*timed out/);
  assert.doesNotMatch(output.systemMessage, /passed|verified|complete/i);
});

test('invented evidence is rejected instead of presented as a finding', async t => {
  const { dir, input } = fixture(t, audit);
  const output = await observer.run(input, { dataDir: dir,
    check: async () => ({ notice: 'Made-up failure.', topic: 'invented', evidence: ['nonexistent'] }) });
  assert.match(output.systemMessage, /Observer unavailable/);
  assert.doesNotMatch(output.systemMessage, /Made-up failure/);
});

test('background checks wait for six tools and deduplicate topics across later checks', async t => {
  const { dir, input } = fixture(t, audit);
  input.hook_event_name = 'PostToolUse';
  input.tool_name = 'Bash';
  input.tool_input = { command: 'npm test' };
  input.tool_response = 'Dependencies absent.';
  let calls = 0;
  const check = async context => {
    calls++;
    return { notice: 'Repeated prerequisite failure.', topic: 'same-issue', evidence: [context.events[0].id] };
  };
  for (let i = 1; i < 6; i++) {
    input.tool_use_id = `c${i}`;
    assert.deepEqual(await observer.run(input, { dataDir: dir, check }), {});
  }
  input.tool_use_id = 'c6';
  assert.deepEqual(await observer.run(input, { dataDir: dir, check }), {});
  assert.match((await observer.deliver(input, { dataDir: dir })).systemMessage, /Repeated prerequisite/);
  assert.deepEqual(await observer.deliver(input, { dataDir: dir }), {});
  input.hook_event_name = 'Stop';
  input.last_assistant_message = 'Another final reply.';
  assert.deepEqual(await observer.run(input, { dataDir: dir, check }), {});
  assert.equal(calls, 2);
});

test('Stop delivers an undelivered background notice even when the final checker has nothing new', async t => {
  const { dir, input } = fixture(t, audit);
  input.hook_event_name = 'PostToolUse';
  const check = async context => ({ notice: 'The audit was changed into repairs.', topic: 'scope', evidence: [context.events[0].id] });
  for (let i = 0; i < 6; i++) await observer.run(input, { dataDir: dir, check });
  input.hook_event_name = 'Stop';
  const output = await observer.run(input, { dataDir: dir, check: async () => ({ notice: '', topic: '', evidence: [] }) });
  assert.match(output.systemMessage, /audit was changed into repairs/);
  assert.deepEqual(await observer.deliver(input, { dataDir: dir }), {});
});

test('disabled observer makes no model calls', async t => {
  const { dir, input } = fixture(t, audit);
  fs.writeFileSync(path.join(dir, 'observer.json'), '{"enabled":false}');
  assert.deepEqual(await observer.run(input, { dataDir: dir, check: async () => assert.fail('disabled') }), {});
});

test('parallel hooks cannot start duplicate checks, and Stop waits for the live check', async t => {
  const { dir, input } = fixture(t, audit);
  let release;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  let calls = 0;
  const check = async () => { calls++; started(); await pending; return { notice: '', topic: '', evidence: [] }; };
  const first = observer.run(input, { dataDir: dir, check });
  await ready;
  const second = observer.run(input, { dataDir: dir, check });
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});

test('missing or unsupported transcripts produce a visible failure without inference', async t => {
  const { dir, input } = fixture(t, [{ unexpected: 'format' }]);
  const output = await observer.run(input, { dataDir: dir, check: async () => assert.fail('unsupported transcript') });
  assert.match(output.systemMessage, /Observer unavailable.*transcript/i);
});

test('context limits retain the original request and explicitly mark omitted material', t => {
  const lines = audit.concat(Array.from({ length: 20 }, (_, i) => message('assistant', `Step ${i}: ${'x'.repeat(2000)}`, 'commentary')));
  const { input } = fixture(t, lines);
  const context = observer.readContext(input, 6000);
  assert.match(JSON.stringify(context), /comprehensive audit/);
  assert.ok(context.omitted > 0);
  assert.ok(JSON.stringify(context).length < 8000);
});

test('custom providers are not silently rerouted through the default account', async t => {
  const lines = structuredClone(audit);
  lines[0].payload.model_provider = 'private-provider';
  const { dir, input } = fixture(t, lines);
  const output = await observer.run(input, { dataDir: dir, check: async () => assert.fail('wrong provider') });
  assert.match(output.systemMessage, /Observer unavailable.*provider/i);
});

test('observer commands use stdin, a read-only session, no recursive hooks, and no project instructions', () => {
  const args = observer.codexArgs('/tmp/observer work', 'gpt-6-astra');
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('read-only'));
  assert.ok(args.includes('project_doc_max_bytes=0'));
  assert.ok(args.includes('tools.experimental_request_user_input.enabled=false'));
  assert.ok(args.includes('service_tier="default"'));
  assert.ok(args.includes('hooks'));
  assert.equal(args.at(-1), '-');
  assert.ok(!args.some(s => /dangerously|bypass/.test(s)));
});
