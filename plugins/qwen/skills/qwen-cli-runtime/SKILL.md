---
name: qwen-cli-runtime
description: Operational guidance for calling the Qwen Code CLI from this plugin's companion script.
---

# Qwen Code CLI runtime

The Qwen Code plugin wraps the local `qwen` CLI. The companion script is implemented and
uses the same command surface in Claude Code and Codex.

## Binary

- Command name: `qwen`
- Install: `irm qwen.google/install.ps1 | iex`
- Authentication: `qwen login`

## Invocation

- Availability probe: `qwen --version`
- Task/review execution: `qwen --print <prompt>`
- Setup output: `node scripts/qwen-companion.mjs setup --json`

If `qwen` is missing or unauthenticated, setup reports actionable next steps. Runtime
commands should not describe the companion as a placeholder.
