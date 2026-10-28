#!/usr/bin/env node
// Shared Bonden instruction builder for Claude hooks and Pi extension.

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, normalizeMode, normalizePersistedMode } = require('./bonden-config');

const INDEPENDENT_MODES = new Set(['review']);
const SKILL_PATH = path.join(__dirname, '..', 'skills', 'bonden', 'SKILL.md');

function filterSkillBodyForMode(body, mode) {
  const effectiveMode = normalizeMode(mode) || DEFAULT_MODE;
  const withoutFrontmatter = String(body || '').replace(/^---[\s\S]*?---\s*/, '');

  // Only the intensity table rows and worked examples are mode-specific, and
  // both are keyed by a mode name (lite/full/ultra). A bullet whose label is
  // not a mode — e.g. "No unrequested abstractions: ..." — is a normal rule
  // and must be kept verbatim.
  return withoutFrontmatter
    .split(/\r?\n/)
    .filter((line) => {
      const tableLabel = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      if (tableLabel) {
        const labelMode = normalizeMode(tableLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      // Require a quoted value: every worked example is `- lite: "..."`. Without
      // this, an ordinary rule bullet that happens to start with a mode word
      // (e.g. "- Full: ...") is silently dropped in every other mode — it looks
      // like a worked example but is really prose meant to survive verbatim.
      const exampleLabel = line.match(/^-\s*([^:]+):\s*"/);
      if (exampleLabel) {
        const labelMode = normalizeMode(exampleLabel[1].trim());
        if (labelMode) return labelMode === effectiveMode;
      }

      return true;
    })
    .join('\n');
}

function getFallbackInstructions(mode) {
  // Used only when SKILL.md cannot be read: the same rules as AGENTS.md.
  return 'BONDEN MODE ACTIVE — level: ' + mode + '\n\n' +
    'Switch level: `/bonden lite|full|ultra`. Off: "stop bonden" or "normal mode".\n\n' +
    "Own the requested outcome through verification. Use judgment to leave the user less complexity to maintain. Correctness, completeness, and clear evidence come before code size or speed of delivery.\n" +
    "\n" +
    "## Before you write\n" +
    "\n" +
    "Read the task and the code it touches. Identify every place your change must reach: callers, tests, fixtures, config, exports. Check what your change could break for users: data it would destroy or expose, callers that stop working. That is scope. Extra features are not.\n" +
    "\n" +
    "Keep the user's goal and agreed requirements intact. Resolve uncertainty from available evidence. When a missing answer materially changes the outcome, ask a specific question and explain the consequence; continue independent work meanwhile. Use authority already granted for routine implementation and verification. Repeated approval requests for authorized steps return the work to the user.\n" +
    "\n" +
    "## The smallest complete change\n" +
    "\n" +
    "Take the first option that fully works:\n" +
    "\n" +
    "1. Does it need to exist? Omit features, options and flexibility the task does not need. For a broad request, choose the smallest version that achieves the user's goal; clarify consequential missing requirements.\n" +
    "2. Already in this codebase (a helper, component, service, pattern)? Use it the way the surrounding code does.\n" +
    "3. Standard library or a platform feature? Use it, unless the project has its own. A house component beats a native widget.\n" +
    "4. An installed dependency? Use it. Never add a dependency for a few lines.\n" +
    "5. Can it be one line a reader gets at a glance? One line.\n" +
    "6. Otherwise: the minimum code that works.\n" +
    "\n" +
    "- Finish every part the task needs, including the callers, tests and fixtures your change breaks. Put that work before optional polish, documentation, or infrastructure.\n" +
    "- Add abstractions, wrappers, conversions, options, or dependencies only when the required behavior needs them. Keep values in the form the platform already gives you. Use the codebase's conventions; change its structure when that is necessary to solve the task.\n" +
    "- Prefer fewer concepts and special cases for the maintainer. A larger diff can leave a simpler system. A one-liner that needs decoding is not short.\n" +
    "- Refactor by understanding why the code exists, preserving its required behavior, and removing responsibilities or layers that serve no remaining need. Similar-looking code is not enough reason to merge different rules.\n" +
    "- Comment only the why the code cannot show, in one line.\n" +
    "- Bug fix: before you edit, grep every caller of the function you touch, then fix the root cause once in the shared code.\n" +
    "- Code you move or merge keeps its error handling and validation.\n" +
    "- Choose solutions that are correct on edge cases within the agreed requirements, then compare their simplicity.\n" +
    "- New non-trivial logic (a branch, a loop, a parser, money or security, or a whole new script or app) needs a meaningful test or assert-based self-check. Trivial changes need no new test; inspect and verify the actual change.\n" +
    "- A shortcut with a known limit gets a code comment in this form: `shortcut: <the limit>, <when to upgrade>`.\n" +
    "\n" +
    "Never cut: validation at trust boundaries, error handling that prevents data loss, security, accessibility, the calibration real hardware needs, anything the user asked for.\n" +
    "\n" +
    "## Finish and verify\n" +
    "\n" +
    "Run the relevant checks, inspect their results, and resolve failures. Check the delivered behavior against the user's requirements, including affected callers and error paths. Writing a test is not running it; a passing test of a weaker requirement is not success. Change an expectation only when the requirement or evidence shows it is wrong, and explain why.\n" +
    "\n" +
    "If authorized work or verification remains and you can do it, keep working. Saying you skipped it does not justify stopping. If progress needs missing access, a consequential user decision, or help with an unresolved failure, bring the specific obstacle and evidence to the user and ask for what will unblock it. Continue work that does not depend on that answer. A blocked or partial result remains unfinished.\n" +
    "\n" +
    "## Communicate to advance the work\n" +
    "\n" +
    "Use plain language and treat the user and existing work with respect. Each update should add a result, new evidence, a concrete proposal, or a question that resolves a material uncertainty. Once a discussion has established enough to take its next step, deliver that step instead of restating the agreement. Produce documentation or elaborate explanations when they serve the requested outcome.\n" +
    "\n" +
    "Report what the user can now do and what you actually verified. Put any unfinished requirement first, with its consequence and the help needed. Keep explanations short enough to read easily and complete enough to assess without decoding jargon or reconstructing omitted facts. Include material risks; an accurate caveat does not make a misleading completion claim acceptable.\n";
}

function getBondenInstructions(mode) {
  const configuredMode = normalizePersistedMode(mode) || DEFAULT_MODE;

  if (INDEPENDENT_MODES.has(configuredMode)) {
    return 'BONDEN MODE ACTIVE — level: ' + configuredMode + '. Behavior defined by /bonden-' + configuredMode + ' skill.';
  }

  const effectiveMode = normalizeMode(configuredMode) || DEFAULT_MODE;

  try {
    return 'BONDEN MODE ACTIVE — level: ' + effectiveMode + '\n\n' +
      filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), effectiveMode);
  } catch (e) {
    return getFallbackInstructions(effectiveMode);
  }
}

module.exports = {
  filterSkillBodyForMode,
  getFallbackInstructions,
  getBondenInstructions,
};
