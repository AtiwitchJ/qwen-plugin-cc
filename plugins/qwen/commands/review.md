---
description: Run an Qwen Code code review against local git state
argument-hint: '[--wait|--background] [--base <ref>] [--scope auto|working-tree|branch]'
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Bash(node:*), Bash(git:*), AskUserQuestion
---

Run an Qwen Code review through the shared plugin runtime.

Raw slash-command arguments:
`$ARGUMENTS`

Core constraint:
- This command is review-only.
- Do not fix issues, apply patches, or suggest that you are about to make changes.
- Your only job is to run the review and return Qwen Code's output verbatim to the user.

Execution mode rules:
- If the raw arguments include `--wait`, do not ask. Run the review in the foreground.
- If the raw arguments include `--background`, do not ask. Run the review in a Claude background task.
- Otherwise, estimate the review size before asking using `git status --short --untracked-files=all` and `git diff --shortstat`.
- Then use `AskUserQuestion` exactly once with two options:
  - `Wait for results`
  - `Run in background`

Foreground flow:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/qwen-companion.mjs" review "$ARGUMENTS"
```

- Return the command stdout verbatim.

Background flow:

```typescript
Bash({
  command: `node "${CLAUDE_PLUGIN_ROOT}/scripts/qwen-companion.mjs" review "$ARGUMENTS"`,
  description: "Qwen Code review",
  run_in_background: true
})
```

- After launching, tell the user: "Qwen Code review started in the background. Check `/qwen:status` for progress."