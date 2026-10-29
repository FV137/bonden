# Observer

Bonden's optional Codex observer reads the user's requests, visible assistant replies, and tool calls/results. A separate request to the session's model looks for consequential omissions, changed scope, or unsupported completion claims. Notices appear directly in the interactive CLI as **Bonden · Heads up**. The observer has no tools and cannot approve actions, change files, or continue the main agent's turn. A quiet check does not certify correctness.

Inspired by Claude Code's [You Should Know](https://code.claude.com/docs/en/interactive-mode#you-should-know-suggestions); this is an independent implementation.

## Enable or disable

Requires Codex CLI 0.165.0, Node.js, an existing OpenAI Codex login, and trusted Bonden hooks. Other Codex versions and the desktop UI have not been verified. The observer is off by default because it sends session content, potentially including private code or data, to additional OpenAI calls and consumes usage.

From a Bonden checkout:

```sh
node hooks/bonden-observer.js on
node hooks/bonden-observer.js status
node hooks/bonden-observer.js off
```

The installed script is also available under `~/.codex/plugins/cache/bonden/bonden/<version>/hooks/bonden-observer.js`. Commands use the same configuration in `~/.codex/plugins/data/bonden-bonden/observer.json` (or the corresponding `CODEX_HOME`). Disabling Bonden's plugin stops its hooks. Observer enablement is separate from the core skill's mode.

## Checks and usage

Background checks become eligible after six completed tool calls, with at least a minute between checks and one observer request at a time per session. A quick synchronous hook delivers completed notices at tool boundaries. A final synchronous check examines the completion claim and delivers any pending notice before the turn closes. That final check can add latency; a model request times out after 60 seconds. Notices do not block completion. Repeated topics are suppressed within the session. Observer failures are reported explicitly.

Calls use the main session's model, the existing OpenAI login, and the `default` service tier, with hooks, tools, project instructions, and plugins disabled in the observer. Custom model providers are rejected to avoid silently changing the destination of session content. These are separate requests; they do not inherit the main conversation's prompt cache. Cost depends on conversation length and check frequency, not a fixed multiplier. `status` reports accumulated token usage from completed checks.

Only text is reviewed, including tool results already present in the transcript. Private reasoning and image contents are excluded. The input is bounded to roughly 100,000 characters, prioritizing user requirements over older tool output; omissions are marked. Transcripts larger than 64 MiB are rejected visibly. The transcript format is version-dependent, so an unrecognized format is reported as an unavailable check.

State, usage, recent topics, and the latest notice with its evidence stay in private files under `~/.codex/plugins/data/bonden-bonden/observer/`. No full transcript copy is retained by Bonden. These files remain until removed by the user. `codex exec` does not display the contents of hook warnings; use the interactive CLI for notices.

## Verification

`npm test` exercises transcript handling, notice validation, duplicate suppression, concurrency, errors, and disabled behavior without model calls. To run the focused real-model acceptance cases, including the reported incomplete-audit failure and genuine-blocker controls:

```sh
node scripts/check-observer.js gpt-6-astra
```

This command uses the existing Codex account and prints each verdict, elapsed time, and token usage. These checks establish behavior on the exercised cases; they do not establish that every omission will be caught.
