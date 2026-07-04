---
description: Check whether the local Qwen Code CLI is ready and authenticated
argument-hint: '[]'
disable-model-invocation: true
allowed-tools: Bash(node:*), Bash(npm:*), AskUserQuestion
---

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/qwen-companion.mjs" setup --json $ARGUMENTS
```

If the result says Qwen Code is unavailable:
- Use `AskUserQuestion` exactly once to ask whether Claude should install Qwen Code now.
- Put the install option first and suffix it with `(Recommended)`.
- Use these two options:
  - `Install Qwen Code (Recommended)`
  - `Skip for now`
- If the user chooses install, run:

```bash
npm install -g @qwen-code/qwen-code
```

- Then rerun:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/qwen-companion.mjs" setup --json $ARGUMENTS
```

If Qwen Code is already installed:
- Do not ask about installation.

Output rules:
- Present the final setup output to the user.
- If installation was skipped, present the original setup output.
- If Qwen Code is installed but not authenticated, tell the user to configure a provider API key (e.g. `qwen --openai-api-key <key>` or the equivalent setting in `~/.config`), then rerun setup.
