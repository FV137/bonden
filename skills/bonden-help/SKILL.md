---
name: bonden-help
description: >
  Quick reference for bonden levels, skills and commands. One-shot display.
  Use for /bonden-help, "bonden help", "how do I use bonden".
---

# Bonden Help

Display this reference card when invoked. One-shot, do NOT change mode,
write flag files, or persist anything.

## Levels

| Level | Trigger | What change |
|-------|---------|-------------|
| **Lite** | `/bonden lite` | Follow the requested approach; mention a smaller option when it materially helps. |
| **Full** | `/bonden` | Choose the simplest complete solution, run verification, and report the observed result. Default. |
| **Ultra** | `/bonden ultra` | Challenge costly assumptions with a concrete alternative; resolve consequential scope choices, then follow through. |

Every level requires completion and verification. Level sticks until changed or session end.

## Skills

| Skill | Trigger | What it does |
|-------|---------|--------------|
| **bonden** | `/bonden` | Own the requested outcome through verification, with less complexity and clear reporting. |
| **bonden-review** | `/bonden-review` | Quality review of a diff: bugs, security, load, missing tests, speed, what to cut. Each finding says what goes wrong and how to fix it. |
| **bonden-audit** | `/bonden-audit` | The same quality review for the whole repo, ranked. |
| **bonden-debt** | `/bonden-debt` | Harvest `shortcut:` comments into a tracked ledger. |
| **bonden-gain** | `/bonden-gain` | Report recorded measurements and their limits; no inherited savings claims. |
| **bonden-help** | `/bonden-help` | This card. |

In Codex CLI and the IDE extension, invoke skills with `$bonden:bonden`,
`$bonden:bonden-review`, or `$bonden:bonden-help`. Claude Code and OpenCode use the
slash-command forms above (OpenCode ships all six as slash commands).

## Deactivate

Say "stop bonden" or "normal mode". Resume anytime with `/bonden`.
`/bonden off` also works.

## Band (Claude Code)

`/bonden band` hides the band above the prompt, the same command brings it back.
`/bonden band on` and `/bonden band off` set it directly. The level stays.
`/bonden band import` adds your past Claude Code sessions (cost, agent time, tokens) to the board.

## Configure Default Mode

Default mode = `full`, auto-active every session. Change it:

**Environment variable** (highest priority):
```bash
export BONDEN_DEFAULT_MODE=ultra
```

**Config file** (`~/.config/bonden/config.json`, Windows: `%APPDATA%\bonden\config.json`):
```json
{ "defaultMode": "lite" }
```

Set `"off"` to disable auto-activation on session start, activate manually
with `/bonden` when wanted.

Resolution: env var > config file > `full`.

## Update

Enable auto-update once: open `/plugin`, go to Marketplaces, pick bonden, Enable auto-update. Claude Code then pulls new versions at startup (run `/reload-plugins` when it prompts). Manual refresh: `/plugin marketplace update bonden` then `/reload-plugins`.

If `/plugin` is not recognized, your Claude Code is out of date. Update it (`npm install -g @anthropic-ai/claude-code@latest`, or `brew upgrade claude-code`) and restart. Other hosts use their own update flow.

## More

Full docs + examples: https://github.com/FV137/stunning-kiwi
