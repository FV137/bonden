const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawn } = require('node:child_process');

const hash = text => createHash('sha256').update(text).digest('hex');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const dataRoot = () => process.env.PLUGIN_DATA || path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'plugins/data/bonden-bonden');
const clean = text => text.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

function save(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, file);
}

async function acquire(file, blocking = false) {
  const lock = file + '.lock';
  const deadline = Date.now() + 65000;
  for (;;) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); return lock; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const pid = Number(fs.readFileSync(lock, 'utf8'));
        try { process.kill(pid, 0); }
        catch (error) { if (error.code === 'ESRCH') { fs.unlinkSync(lock); continue; } throw error; }
      } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (!blocking) return null;
      if (Date.now() > deadline) throw new Error('previous observer check did not finish');
      await wait(100);
    }
  }
}

function drain(state) {
  const messages = [...new Set(state.pending || [])];
  state.pending = [];
  return messages.length ? { systemMessage: messages.join('\n') } : {};
}

async function deliver(input, { dataDir = dataRoot() } = {}) {
  let lock;
  try {
    if (!input.session_id || input.agent_id || !readJSON(path.join(dataDir, 'observer.json'), {}).enabled) return {};
    const file = path.join(dataDir, 'observer', hash(input.session_id) + '.json');
    if (!fs.existsSync(file)) return {};
    lock = await acquire(file);
    if (!lock) return {};
    const state = readJSON(file, {});
    const output = drain(state);
    if (output.systemMessage) save(file, state);
    return output;
  } catch (error) {
    return { systemMessage: `Bonden · Observer unavailable: ${clean(error.message)}` };
  } finally {
    if (lock) fs.unlinkSync(lock);
  }
}

function readContext(input, limit = 100000) {
  if (!input.transcript_path) throw new Error('no transcript is available');
  if (fs.statSync(input.transcript_path).size > 64 * 1024 * 1024) throw new Error('transcript exceeds the supported 64 MiB size');
  const events = [];
  let provider;
  let shortened = 0;
  function add(id, role, text) {
    if (!text) return;
    if (text.length > 12000) { text = text.slice(0, 6000) + '\n[content omitted]\n' + text.slice(-6000); shortened++; }
    events.push({ id, role, text });
  }
  const lines = fs.readFileSync(input.transcript_path, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let row;
    try { row = JSON.parse(lines[i]); }
    catch { if (i === lines.length - 1) break; throw new Error('transcript contains invalid JSON'); }
    const p = row.payload;
    if (row.type === 'session_meta') provider = p?.model_provider;
    if (row.type === 'compacted' && p?.message) add(`e${i}`, 'context summary', p.message);
    if (row.type !== 'response_item' || !p) continue;
    if (p.type === 'message' && ['user', 'assistant'].includes(p.role) && p.channel !== 'analysis') {
      add(`e${i}`, p.role, (p.content || []).filter(c => ['input_text', 'output_text', 'text'].includes(c.type)).map(c => c.text).join('\n'));
    } else if (['function_call', 'custom_tool_call'].includes(p.type)) {
      add(`e${i}`, 'tool call', `${p.name} ${p.arguments ?? p.input ?? ''}`);
    } else if (['function_call_output', 'custom_tool_call_output'].includes(p.type)) {
      add(`e${i}`, 'tool result', typeof p.output === 'string' ? p.output : JSON.stringify(p.output));
    }
  }
  if (!events.some(e => e.role === 'user')) throw new Error('unsupported transcript: no user request found');
  // The triggering output can arrive before the rollout writer flushes it.
  if (input.hook_event_name === 'PostToolUse') {
    add('current-tool', 'tool result', JSON.stringify({ name: input.tool_name, input: input.tool_input, result: input.tool_response }));
  }
  if (input.hook_event_name === 'Stop' && input.last_assistant_message && events.at(-1)?.text !== input.last_assistant_message) {
    add('current-final', 'assistant', input.last_assistant_message);
  }
  let omitted = shortened;
  let length = events.reduce((sum, e) => sum + JSON.stringify(e).length, 0);
  while (length > limit && events.length > 2) {
    // Keep user requirements ahead of old tool output when the window fills.
    let index = events.findIndex((e, i) => i > 0 && i < events.length - 1 && !['user', 'context summary'].includes(e.role));
    if (index < 0) index = 1;
    length -= JSON.stringify(events[index]).length;
    events.splice(index, 1);
    omitted++;
  }
  return { provider, phase: input.hook_event_name === 'Stop' ? 'agent finishing this turn' : 'work in progress', omitted, events };
}

function codexArgs(cwd, model) {
  const disabled = ['hooks', 'plugins', 'apps', 'shell_tool', 'view_image', 'multi_agent', 'multi_agent_v2',
    'goals', 'request_permissions', 'request_permissions_tool', 'default_mode_request_user_input', 'code_mode',
    'js_repl', 'image_generation', 'memories', 'memory_tool', 'tool_suggest', 'sleep_tool', 'current_time_reminder'];
  return ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--json', '-s', 'read-only', '-C', cwd,
    '-m', model, '-c', 'approval_policy="never"', '-c', 'service_tier="default"',
    '-c', 'project_doc_max_bytes=0', '-c', 'skills.include_instructions=false',
    '-c', 'web_search="disabled"', '-c', 'tools.update_plan.enabled=false', '-c', 'tools.experimental_request_user_input.enabled=false',
    '-c', `model_instructions_file=${JSON.stringify(path.join(__dirname, 'bonden-observer-prompt.md'))}`,
    '--output-schema', path.join(__dirname, 'bonden-observer-schema.json'),
    ...disabled.flatMap(feature => ['--disable', feature]), '-'];
}

function queryCodex(context, input, root) {
  const cwd = path.join(root, 'work');
  fs.mkdirSync(cwd, { recursive: true, mode: 0o700 });
  return new Promise((resolve, reject) => {
    const child = spawn('codex', codexArgs(cwd, input.model), { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const cancel = () => child.kill('SIGKILL');
    process.once('SIGTERM', cancel);
    const timer = setTimeout(() => { timedOut = true; cancel(); }, 60000);
    child.stdout.on('data', chunk => {
      stdout += chunk;
      if (stdout.length > 2 * 1024 * 1024) cancel();
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
    child.stdin.on('error', () => {});
    child.on('error', error => { clearTimeout(timer); process.removeListener('SIGTERM', cancel); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      process.removeListener('SIGTERM', cancel);
      if (code !== 0) {
        const error = new Error(timedOut ? 'model request timed out' : `Codex request failed (exit ${code})`);
        error.diagnostic = stderr;
        return reject(error);
      }
      try {
        const entries = stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
        const reply = entries.filter(e => e.type === 'item.completed' && e.item?.type === 'agent_message').at(-1)?.item.text;
        const result = JSON.parse(reply);
        result.usage = entries.findLast(e => e.type === 'turn.completed')?.usage;
        resolve(result);
      } catch { reject(new Error('Codex returned no valid observer verdict')); }
    });
    child.stdin.end(JSON.stringify(context));
  });
}

async function run(input, { dataDir = dataRoot(), check = queryCodex } = {}) {
  let lock;
  let stateFile;
  let state;
  try {
    if (!readJSON(path.join(dataDir, 'observer.json'), {}).enabled) return {};
    if (!['PostToolUse', 'Stop'].includes(input.hook_event_name) || input.agent_id) return {};
    if (!input.session_id || !input.model) throw new Error('hook input is missing the session or model');
    const root = path.join(dataDir, 'observer');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    stateFile = path.join(root, hash(input.session_id) + '.json');
    lock = await acquire(stateFile, input.hook_event_name === 'Stop');
    if (!lock) return {};
    state = readJSON(stateFile, { tools: 0, topics: [], checks: 0, usage: {} });
    state.pending ||= [];
    if (input.hook_event_name === 'PostToolUse') {
      state.tools++;
      if (state.tools < 6 || Date.now() - (state.checkedAt || 0) < 60000) { save(stateFile, state); return {}; }
    }
    const context = readContext(input);
    if (context.provider && context.provider !== 'openai') throw new Error('this observer supports the OpenAI provider only');
    const fingerprint = hash(JSON.stringify(context));
    if (state.fingerprint === fingerprint) {
      const output = input.hook_event_name === 'Stop' ? drain(state) : {};
      save(stateFile, state);
      return output;
    }
    context.previouslyReported = state.topics;
    const result = await check(context, input, root);
    if (typeof result.notice !== 'string' || typeof result.topic !== 'string' || !Array.isArray(result.evidence) ||
        result.notice.length > 1000 || result.topic.length > 200 || (result.notice && (!result.topic || !result.evidence.length ||
        result.evidence.some(id => !context.events.some(e => e.id === id))))) throw new Error('observer returned invalid or unsupported evidence');
    state.tools = 0;
    state.checkedAt = Date.now();
    state.checks++;
    state.fingerprint = fingerprint;
    for (const [key, value] of Object.entries(result.usage || {})) {
      if (Number.isFinite(value)) state.usage[key] = (state.usage[key] || 0) + value;
    }
    delete state.error;
    delete state.diagnostic;
    if (result.notice && !state.topics.some(t => t.topic === result.topic)) {
      const notice = { topic: result.topic, notice: clean(result.notice), evidence: context.events.filter(e => result.evidence.includes(e.id)) };
      state.topics.push({ topic: notice.topic, notice: notice.notice });
      state.topics = state.topics.slice(-30);
      state.lastNotice = notice;
      state.pending.push(`Bonden · Heads up: ${notice.notice}`);
    }
    // Async hook output may arrive after a turn closes; synchronous hooks deliver it.
    const output = input.hook_event_name === 'Stop' ? drain(state) : {};
    save(stateFile, state);
    return output;
  } catch (error) {
    const message = `Bonden · Observer unavailable: ${clean(error.message)}. This check did not run successfully.`;
    if (state && stateFile && lock) {
      const repeated = state.error === error.message && state.errorTurn === input.turn_id;
      state.error = error.message;
      state.errorTurn = input.turn_id;
      state.checkedAt = Date.now();
      if (error.diagnostic) state.diagnostic = error.diagnostic;
      if (!repeated || input.hook_event_name === 'Stop') state.pending.push(message);
      const output = input.hook_event_name === 'Stop' ? drain(state) : {};
      save(stateFile, state);
      return output;
    }
    return { systemMessage: message };
  } finally {
    if (lock) fs.unlinkSync(lock);
  }
}

async function main() {
  const action = process.argv[2];
  const root = dataRoot();
  if (action) {
    if (!['on', 'off', 'status'].includes(action)) throw new Error('Use on, off, or status.');
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const config = path.join(root, 'observer.json');
    if (action !== 'status') save(config, { enabled: action === 'on' });
    const enabled = Boolean(readJSON(config, {}).enabled);
    console.log(`Bonden observer: ${enabled ? 'on' : 'off'}. ${enabled ? 'Checks use additional Codex model calls at the default service tier.' : 'No observer model calls.'}`);
    const dir = path.join(root, 'observer');
    if (action === 'status' && fs.existsSync(dir)) {
      const states = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => readJSON(path.join(dir, f), {}));
      const usage = {};
      for (const s of states) for (const [key, value] of Object.entries(s.usage || {})) usage[key] = (usage[key] || 0) + value;
      console.log(JSON.stringify({ checks: states.reduce((n, s) => n + (s.checks || 0), 0), usage,
        errors: states.filter(s => s.error).map(s => s.error) }, null, 2));
    }
    return;
  }
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  fs.writeSync(1, JSON.stringify(await run(input)));
}

module.exports = { readContext, codexArgs, queryCodex, run, deliver };
if (require.main === module) main().catch(error => {
  fs.writeSync(1, JSON.stringify({ systemMessage: `Bonden · Observer unavailable: ${clean(error.message)}` }));
  process.exitCode = 1;
});
