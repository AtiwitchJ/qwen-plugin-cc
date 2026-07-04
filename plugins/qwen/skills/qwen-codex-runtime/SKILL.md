---
name: qwen-codex-runtime
description: Use when Codex should run Qwen Code plugin setup, review, task, status, result, cancel, or transfer commands from this installed plugin.
---

# Qwen Code Codex Runtime

Use the companion script bundled with this plugin. Resolve the plugin root as the directory two levels above this `SKILL.md`, then run:

```bash
node "<plugin-root>/scripts/qwen-companion.mjs" setup --json
node "<plugin-root>/scripts/qwen-companion.mjs" task "<prompt>"
node "<plugin-root>/scripts/qwen-companion.mjs" review "<arguments>"
node "<plugin-root>/scripts/qwen-companion.mjs" adversarial-review "<arguments>"
node "<plugin-root>/scripts/qwen-companion.mjs" status "<job-id>"
node "<plugin-root>/scripts/qwen-companion.mjs" result "<job-id>"
node "<plugin-root>/scripts/qwen-companion.mjs" cancel "<job-id>"
node "<plugin-root>/scripts/qwen-companion.mjs" transfer "<arguments>"
```

Return the companion stdout verbatim when it succeeds. If it reports that the Qwen Code CLI is missing or unauthenticated, show the setup output and ask the user to complete the listed next step.
