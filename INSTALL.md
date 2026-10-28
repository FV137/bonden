# Install

Codex is the primary installation target. Other host adapters are inherited from Ponytail; their installations have not been manually verified for this fork.

Pick your agent below. Not listed? Most agents read [`AGENTS.md`](AGENTS.md): copy it into your project, or ask your agent to install [`skills/bonden/SKILL.md`](skills/bonden/SKILL.md) as a skill. Which files map to which agent: [Agent portability](docs/agent-portability.md).

The Claude Code and Codex plugins, and the Cursor hooks, require Node.js on the non-interactive shell's PATH. Without it, the skills remain available but automatic rule injection and mode tracking fail.

## Claude Code

```
/plugin marketplace add FV137/bonden
```
```
/plugin install bonden@bonden
```
(You have to send two separate prompts for the install to work) 

Same steps in the Claude Code Desktop app's Code tab: type the two `/plugin` commands above into the prompt box, or click the **+** button next to it, choose **Plugins** → **Add plugin** to browse your configured marketplaces, and manage marketplaces from **Customize** in the sidebar.

CodeBuddy installs the same plugin with the same two `/plugin` commands and switches levels with `/bonden ultra` and so on; it has no subagent injection.

## Codex

```bash
codex plugin marketplace add FV137/bonden
codex plugin add bonden@bonden
```

Node.js must be on your PATH. Run `codex` and open `/hooks`, review and trust the three Bonden hooks (`SessionStart`, `SubagentStart`, and `UserPromptSubmit`), then start a new thread. They load the rules, pass them to subagents, and track mode changes.

Invoke `$bonden:bonden` to use the core skill, or `$bonden:bonden-help` to see the commands and modes.

This same install also covers the Codex desktop app: restart the app after installing and it picks up the plugin.

## GitHub Copilot CLI

```bash
copilot plugin marketplace add FV137/bonden
copilot plugin install bonden@bonden
```

In an interactive Copilot CLI session, use the slash equivalents:

```
/plugin marketplace add FV137/bonden
/plugin install bonden@bonden
```

Copilot CLI namespaces plugin commands by plugin name. For example:

```text
/bonden:bonden ultra
/bonden:bonden-review
```

## Pi agent harness

```
pi install git:github.com/FV137/bonden
```

## Kimi Code

In Kimi Code, run `/plugins install https://github.com/FV137/bonden`, then `/reload` or start a new session. The plugin puts [`AGENTS.md`](AGENTS.md) into the system prompt every turn and adds the six skills, which Kimi also offers as `/bonden`, `/bonden-review`, `/bonden-audit`, `/bonden-debt`, `/bonden-gain` and `/bonden-help`. Level switching (`/bonden lite`) loads the skill for that turn; there is no persistent mode flag in Kimi.

## Oh My Pi (omp)

```bash
omp plugin marketplace add FV137/bonden
omp plugin install bonden@bonden
```

omp uses Bonden's Pi extension to inject the ruleset every turn. This fork has not been manually verified in omp. Start a new session after installing.

## OpenCode

Bonden has not been published to npm. Run from a checkout (the plugin reuses `hooks/` and `skills/`):

```json
{ "plugins": ["./.opencode/plugins"] }
```

Injects the ruleset every turn at the active level; adds the `/bonden` commands (see [the command reference](skills/bonden-help/SKILL.md)). OpenCode also auto-loads this repo's `AGENTS.md`, so the rules hold even without the plugin. The plugin adds the `lite/full/ultra/off` levels.

The `./` path resolves against your project's `opencode.json`; to share one checkout across projects, point it at the absolute path of the checkout's `.opencode/plugins` directory. A `plugins` entry must name a **directory**, not a file: OpenCode 2 rejects a path to `bonden.mjs` with `configured plugin path must be a directory`. Opening this repo in OpenCode 2 needs no entry at all: it loads `.opencode/plugins/index.js` on its own.

For Kilo Code, point its `plugin` key at the checkout: `{ "plugin": ["/absolute/path/to/bonden/.opencode/plugins/bonden.mjs"] }` in `kilo.jsonc`.

OpenCode 1 uses the older `plugin` key and the checkout's file path: `{ "plugin": ["./.opencode/plugins/bonden.mjs"] }`.

## Gemini CLI

```bash
gemini extensions install https://github.com/FV137/bonden
```

Loads the ruleset as always-on context every session and registers the `/bonden` commands; the `skills/` ship too, activated when a task needs them.
The Gemini adapter intentionally does not ship a root `hooks/hooks.json`: Gemini auto-loads that path, while Bonden's lifecycle hooks use Claude/Codex event names.

Qwen Code installs the same extension: `qwen extensions install FV137/bonden:bonden`. It loads `AGENTS.md` as always-on context and registers the `/bonden` commands and the skills; levels don't persist across sessions, since the lifecycle hooks are not used.

## Qoder

Qoder auto-loads `AGENTS.md` from the repo root as always-on context, so running bonden from a checkout works with zero setup. For per-project rules, copy [`.qoder/rules/bonden.md`](.qoder/rules/bonden.md) into your project's `.qoder/rules/`. The six bonden skills (`/bonden`, `/bonden-review`, `/bonden-audit`, `/bonden-debt`, `/bonden-gain`, `/bonden-help`) are available via Qoder's Skill system; the plugin manifest at [`.qoder-plugin/plugin.json`](.qoder-plugin/plugin.json) points at the `skills/` directory.

For full plugin-tier support (automatic mode activation + ruleset injection on every prompt), install bonden as a Qoder plugin (`qodercli plugins install <path-to-bonden>`): the manifest loads [`hooks/qoder-hooks.json`](hooks/qoder-hooks.json) and Qoder fills in `${QODER_PLUGIN_ROOT}`. Without the plugin, copy those hooks into your `.qoder/settings.json` and replace `${QODER_PLUGIN_ROOT}` with the path to your bonden checkout. Qoder's `UserPromptSubmit` hook activates the default mode on first prompt and injects the ruleset every turn; `PreToolUse` with `task|Task` matcher injects the ruleset into subagents. Level switches (`/bonden lite|full|ultra|off`) work automatically.

## Antigravity CLI

```bash
agy plugin install https://github.com/FV137/bonden
```

Installs the six skills, and Antigravity turns the `/bonden` commands into skills as well, so you [call them as slash commands](https://www.antigravity.google/docs/skills#slash-command-conversion) such as `/bonden-review`. No lifecycle hooks, so levels don't persist. For the always-on ruleset, copy [`AGENTS.md`](AGENTS.md) into your project; Antigravity [reads it as workspace rules](https://www.antigravity.google/docs/rules).

## Hermes Agent

```bash
hermes plugins install FV137/bonden --enable
```

If that stops with `plugin.json declares an unsupported or missing Agent Plugins schema`, it is Hermes' install check (fix pending in [NousResearch/hermes-agent#125937](https://github.com/NousResearch/hermes-agent/pull/125937)). Until it lands, clone the plugin in by hand; Hermes loads it from `plugin.yaml` as usual:

```bash
git clone https://github.com/FV137/bonden.git ~/.hermes/plugins/bonden
hermes plugins enable bonden
```

Restart Hermes after installing. The plugin injects the active Bonden mode before each LLM turn, registers the bundled skills as `bonden:<skill>`, and adds `/bonden`, `/bonden-review`, `/bonden-audit`, `/bonden-debt`, `/bonden-gain`, and `/bonden-help`. In shared gateways, restrict `/bonden` to trusted users with Hermes slash-command access controls; runtime mode is process-local.

## CodeWhale

Reads `AGENTS.md` from the project root, zero setup. Copy [`AGENTS.md`](AGENTS.md) to your project, or run `codewhale` from a checkout of this repo. That's it.

## Devin CLI

```bash
devin plugins install FV137/bonden
```

Installs bonden as a Devin plugin; skills are available as `/bonden:bonden`, `/bonden:bonden-review`, and so on.

## OpenClaw

Bonden has not been published to ClawHub. Copy the six skill directories from [`.openclaw/skills`](.openclaw/skills/) into `~/.openclaw/skills/`.

## Grok Build

```bash
grok plugin install FV137/bonden --trust
```

Enable the plugin (off by default): `/plugins` → Plugins → Space on `bonden`, or in `~/.grok/config.toml`:

```toml
[plugins]
enabled = ["bonden"]
```

Start a new session (or reload plugins). Skills show as `/bonden`, `/bonden-review`, `/bonden-audit`, `/bonden-debt`, `/bonden-gain`, `/bonden-help`. Verify with `grok inspect`. Grok can auto-invoke bonden for coding tasks from its skill description; use `/bonden` (or `/bonden lite`, `/bonden full`, `/bonden ultra`) when activation needs to be explicit. Grok lifecycle hooks are not used because their SessionStart output cannot inject instructions.

`AGENTS.md` still works instruction-only from a checkout without the plugin.

## Goose

```bash
goose plugin install https://github.com/FV137/bonden.git
```

That imports the six skills as `bonden:bonden`, `bonden:bonden-review` and so on. For the always-on rules, copy [`AGENTS.md`](AGENTS.md) to `~/.agents/AGENTS.md` (or into your project; `~/.config/goose/.goosehints` works too). Goose has no lifecycle hooks, so the levels don't persist.

## Cursor

```bash
git clone https://github.com/FV137/bonden
node bonden/scripts/cursor-hooks.js install
```

Merges two native hooks into `~/.cursor/hooks.json` (add `--project` to write `<project>/.cursor/hooks.json` instead) and keeps any hooks you already have there. The entries run `node` from that checkout, so leave it where it is or re-run the install after moving it. Cursor reloads the file on save; open a new chat and the ruleset for your default level arrives through `sessionStart`. Send `/bonden lite`, `/bonden full`, `/bonden ultra` or `/bonden off` as a plain message to switch the level for the rest of the conversation; `/bonden` reports it. Cursor's `subagentStart` cannot inject context, so subagents run without the ruleset, and cloud agents never fire `sessionStart`. The always-on rule (`.cursor/rules/bonden.mdc`) and the hooks are alternatives: while the rule is in a workspace the hooks inject nothing and the mode commands answer with a notice, so delete the rule to let the hooks manage the level. Contract, verification record and limitations: [docs/cursor-hooks.md](docs/cursor-hooks.md). Uninstall: `node bonden/scripts/cursor-hooks.js uninstall`.

## Settings

Set the level for every new session with the `BONDEN_DEFAULT_MODE` env var (`lite`/`full`/`ultra`/`off`), or a `defaultMode` field in `~/.config/bonden/config.json` (`%APPDATA%\bonden\config.json` on Windows). The default is `full`.

While active, the ruleset is also injected into every subagent spawned via the Agent tool. To scope that to specific agent types (say, keep it off read-only search agents), set the `BONDEN_SUBAGENT_MATCHER` env var to a regex tested against the subagent's `agent_type`. It is unanchored and case-insensitive: `explore|general` matches either, `^general$` is exact, and plugin agent types look like `plugin:name`. Unset means inject into every subagent (the default); an invalid regex, or a subagent whose type the platform doesn't report, also falls back to injecting.

## Skills CLI

The [skills CLI](https://skills.sh) copies the six bonden skills into the skills folder of many agents:

```bash
npx skills add FV137/bonden
```

Pick the agent with `--agent` (for IBM Bob: `--agent bob`), take all six without asking with `--skill '*'`, and add `--global` to install for your user instead of the project. This installs the skills only; for the always-on ruleset, also add [`AGENTS.md`](AGENTS.md) or use one of the plugins above.

## Other agents (rules file only)

Cursor (rule-only alternative to the [hooks install](#cursor)), Windsurf, Cline, GitHub Copilot Chat (the VS Code, JetBrains, and Visual Studio editor extension, not the standalone [Copilot CLI](#github-copilot-cli)), Aider, Kiro, Zed, CodeWhale, Qoder: copy the matching rules file from this repo ([`.cursor/rules/`](.cursor/rules/), [`.windsurf/rules/`](.windsurf/rules/), [`.clinerules/`](.clinerules/), [`.github/copilot-instructions.md`](.github/copilot-instructions.md), [`AGENTS.md`](AGENTS.md), [`.kiro/steering/`](.kiro/steering/), [`.qoder/rules/`](.qoder/rules/)).

Kiro: copy `.kiro/steering/bonden.md` to `~/.kiro/steering/` (global) or `.kiro/steering/` in your project.

GitHub Copilot CLI fallback (instruction-only mode): it reads `AGENTS.md` and `.github/copilot-instructions.md` in a project, or copy the rules into `~/.copilot/copilot-instructions.md` to run bonden in every project. This path keeps always-on guidance, but does not add plugin mode switches or hooks.

VS Code with the Codex extension reads `AGENTS.md`, which this repo ships, so it works from the repo root with no setup (`~/.codex/AGENTS.md` makes Codex global).

JetBrains Junie can read `AGENTS.md` once you point it there in Settings → Tools → Junie → Project Settings → Guidelines Path (it is not automatic yet). This repo ships `AGENTS.md`; `.junie/guidelines.md` is Junie's legacy path.

Amp (Sourcegraph) reads `AGENTS.md` from the working directory and parent directories up to `$HOME`, which this repo ships, so it works with no setup (`~/.config/amp/AGENTS.md` works globally).

Jules (Google) reads `AGENTS.md` from the repository root, which this repo ships, so it picks up the ruleset with no setup.

## Uninstall

| Host | Command |
|------|---------|
| Claude Code | `/plugin remove bonden` |
| Codex | `codex plugin remove bonden` |
| Devin CLI | `devin plugins remove bonden` |
| Grok Build | `grok plugin uninstall bonden` |
| Pi agent | `pi uninstall bonden` |
| Kimi Code | `/plugins` in Kimi Code, then remove bonden |
| Skills CLI | `npx skills remove bonden bonden-audit bonden-debt bonden-gain bonden-help bonden-review` (same `--agent` / `--global` flags as the install) |
| Oh My Pi (omp) | `omp plugin uninstall bonden@bonden`, then `omp plugin marketplace remove bonden` |
| OpenCode | `opencode plugin remove @fv137/bonden` |
| Cursor hooks | `node scripts/cursor-hooks.js uninstall` (add `--project` for a project-level install); removes only bonden's entries from `hooks.json` |
| Cursor rule / Windsurf / Cline / Qoder / etc. | Delete the copied rule file |

These remove the plugin's own files. They leave behind a small amount of state bonden writes outside the plugin folder: the mode flag (`~/.claude/.bonden-active`, or `~/.cursor/.bonden-active` for Cursor), `~/.config/bonden/config.json`, the statusline script copy (`~/.claude/bonden-statusline.sh` or `.ps1`), bonden's entries in `~/.cursor/hooks.json`, and (if you accepted the setup nudge) a `statusLine` entry in `~/.claude/settings.json`. Until they are removed, the statusline badge keeps showing the last mode. Run `node scripts/uninstall.js` to clean those up too. **Run it before the host remove command above**: the script is itself a plugin file, so removing the plugin first deletes it (or run it from a separate clone of this repo). It only removes the statusLine entry if it points at bonden's own script, so a statusline you set up yourself is left untouched.
