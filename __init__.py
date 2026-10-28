"""Hermes plugin for Bonden."""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any, Callable

DEFAULT_MODE = "full"
RUNTIME_MODES = {"off", "lite", "full", "ultra"}
SKILL_COMMANDS = {
    "bonden-review": "Review the current diff or provided target: bugs, security, load, missing tests, speed, and what to cut.",
    "bonden-audit": "Audit the whole repo: bugs, security, load, missing tests, speed, and what to cut.",
    "bonden-debt": "List every deliberate `shortcut:` comment and its upgrade path.",
    "bonden-gain": "Report recorded measurements and their limits.",
    "bonden-help": "Show the Bonden command reference.",
}

ROOT = Path(__file__).resolve().parent
SKILLS_DIR = ROOT / "skills"
BONDEN_SKILL = SKILLS_DIR / "bonden" / "SKILL.md"

_current_mode = None


def _normalize_runtime_mode(mode: str | None) -> str | None:
    if not isinstance(mode, str):
        return None
    mode = mode.strip().lower()
    return mode if mode in RUNTIME_MODES else None


def _config_dir() -> Path:
    if os.environ.get("XDG_CONFIG_HOME"):
        return Path(os.environ["XDG_CONFIG_HOME"]) / "bonden"
    if os.name == "nt":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "bonden"
    return Path.home() / ".config" / "bonden"


def _default_mode() -> str:
    env_mode = _normalize_runtime_mode(os.environ.get("BONDEN_DEFAULT_MODE"))
    if env_mode:
        return env_mode
    try:
        data = json.loads((_config_dir() / "config.json").read_text(encoding="utf-8-sig"))
        file_mode = _normalize_runtime_mode(data.get("defaultMode"))
        if file_mode:
            return file_mode
    except Exception:
        pass
    return DEFAULT_MODE


def _strip_frontmatter(text: str) -> str:
    return re.sub(r"^---[\s\S]*?---\s*", "", text or "", count=1)


def _filter_skill_body_for_mode(body: str, mode: str) -> str:
    effective = _normalize_runtime_mode(mode) or DEFAULT_MODE
    lines = []
    # str.splitlines() drops a trailing line terminator instead of yielding a
    # trailing empty element, so a body ending in "\n" loses that newline on
    # rejoin. re.split keeps it, matching the JS filter's split(/\r?\n/).
    for line in re.split(r"\r?\n", _strip_frontmatter(body)):
        table_label = re.match(r"^\|\s*\*\*(.+?)\*\*\s*\|", line)
        if table_label:
            label_mode = _normalize_runtime_mode(table_label.group(1))
            if label_mode and label_mode != effective:
                continue

        # Require a quoted value: every worked example is `- lite: "..."`. Without
        # this, an ordinary rule bullet that happens to start with a mode word
        # (e.g. "- Full: ...") is silently dropped in every other mode — it looks
        # like a worked example but is really prose meant to survive verbatim.
        # Mirrors the fix in hooks/bonden-instructions.js (#571).
        example_label = re.match(r'^-\s*([^:]+):\s*"', line)
        if example_label:
            label_mode = _normalize_runtime_mode(example_label.group(1))
            if label_mode and label_mode != effective:
                continue

        lines.append(line)
    return "\n".join(lines)


def _fallback_instructions(mode: str) -> str:
    return (
        f"BONDEN MODE ACTIVE — level: {mode}\n\n"
        "Own the requested outcome through verification. "
        "Keep the user's goal and requirements intact. "
        "Read the affected callers, tests, fixtures, config and exports. "
        "Reuse the codebase, standard library, platform, or installed dependencies before adding code. "
        "Prefer fewer concepts and special cases while preserving required behavior and error handling. "
        "Use authority already granted. "
        "Ask a specific question when missing information materially changes the outcome, and continue independent work. "
        "Run relevant checks, inspect results, and resolve failures. "
        "If authorized work or verification remains and you can do it, keep working. "
        "Seek help with a concrete blocker; a partial or blocked result remains unfinished. "
        "Advance discussion with a concrete proposal or new evidence. "
        "Report the outcome and actual verification in plain language, with unfinished requirements first. "
        "Never cut validation at trust boundaries, error handling that prevents data loss, security, accessibility, hardware calibration, or anything the user asked for."
    )


def build_injected_context(mode: str | None = None) -> str:
    """Return the mode-filtered Bonden context injected before LLM turns."""
    effective = _normalize_runtime_mode(mode) or _default_mode()
    if effective == "off":
        return ""
    try:
        body = BONDEN_SKILL.read_text(encoding="utf-8")
        return f"BONDEN MODE ACTIVE — level: {effective}\n\n{_filter_skill_body_for_mode(body, effective)}"
    except OSError:
        return _fallback_instructions(effective)


def _pre_llm_call(
    session_id: str = "", conversation_history: Any = None, **_: Any
) -> dict[str, str] | None:
    mode = _current_mode or _default_mode()
    # Off is injected too: the ruleset from an earlier turn is replayed every turn,
    # and the /bonden off reply goes to the user, never to the model.
    context = build_injected_context(mode) or "BONDEN MODE OFF"

    # Hermes persists hook context in api_content for cache-stable replay.
    # Re-inject only when the active mode changed or compaction removed it.
    for message in reversed(conversation_history or []):
        if not isinstance(message, dict):
            continue
        api_content = message.get("api_content")
        if not isinstance(api_content, str):
            continue
        matches = re.findall(r"BONDEN MODE (?:ACTIVE — level: ([a-z]+)|OFF)", api_content)
        if matches:
            return None if (matches[-1] or "off") == mode else {"context": context}

    # Nothing persisted, so off has nothing to switch off.
    return None if mode == "off" else {"context": context}


def _skill_prompt(command: str, args: str = "") -> str:
    tail = args.strip()
    target = f"\n\nUser arguments: {tail}" if tail else ""
    return (
        f"Load and follow the Hermes plugin skill `bonden:{command}`. "
        f"{SKILL_COMMANDS[command]}{target}"
    )


def _slash_access_denied(event: Any, gateway: Any, command: str) -> bool:
    if gateway is None or event is None:
        return False
    checker = getattr(gateway, "_check_slash_access", None)
    source = getattr(event, "source", None)
    if checker is None or source is None:
        return False
    try:
        return checker(source, command) is not None
    except Exception:
        return True


def rewrite_gateway_command(event: Any = None, gateway: Any = None, **_: Any) -> dict[str, str] | None:
    """Rewrite authorized gateway /bonden-* commands into normal agent prompts."""
    text = str(getattr(event, "text", "") or "").strip()
    if not text.startswith("/"):
        return None
    head, _, rest = text[1:].partition(" ")
    command = head.replace("_", "-").lower()
    if command not in SKILL_COMMANDS:
        return None
    if _slash_access_denied(event, gateway, command):
        return None
    return {"action": "rewrite", "text": _skill_prompt(command, rest)}


def _handle_mode_command(raw_args: str) -> str:
    global _current_mode
    arg = (raw_args or "").strip().lower()
    if not arg:
        # Bare /bonden switches bonden on, or reports the level when it already is (#639).
        mode = _current_mode or _default_mode()
        if mode != "off":
            return f"Bonden mode: {mode}. Use `/bonden lite|full|ultra|off`."
        _current_mode = "full" if _default_mode() == "off" else _default_mode()
        return f"Bonden mode set to {_current_mode}."
    mode = _normalize_runtime_mode(arg)
    if not mode:
        return "Usage: /bonden [lite|full|ultra|off]"
    _current_mode = mode
    return f"Bonden mode set to {mode}."


def _make_skill_command_handler(ctx: Any, command: str) -> Callable[[str], str]:
    def handler(raw_args: str) -> str:
        prompt = _skill_prompt(command, raw_args or "")
        injected = False
        try:
            injected = bool(ctx.inject_message(prompt))
        except Exception:
            injected = False
        if injected:
            return f"Queued `{command}` for the agent."
        return prompt

    return handler


def register(ctx: Any) -> None:
    """Register Bonden hooks, skills, and slash commands with Hermes."""
    for child in sorted(SKILLS_DIR.iterdir() if SKILLS_DIR.exists() else []):
        skill_md = child / "SKILL.md"
        if child.is_dir() and skill_md.exists():
            ctx.register_skill(child.name, skill_md)

    ctx.register_hook("pre_llm_call", _pre_llm_call)
    ctx.register_hook("pre_gateway_dispatch", rewrite_gateway_command)

    ctx.register_command(
        "bonden",
        _handle_mode_command,
        description="Set Bonden mode: lite, full, ultra, or off.",
        args_hint="[lite|full|ultra|off]",
    )
    for command, description in SKILL_COMMANDS.items():
        ctx.register_command(
            command,
            _make_skill_command_handler(ctx, command),
            description=description,
            args_hint="[target or notes]",
        )
