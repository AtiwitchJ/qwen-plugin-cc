---
description: Delegate investigation, an explicit fix request, or follow-up rescue work to the Qwen Code rescue subagent
argument-hint: "[--background|--wait] [--resume|--fresh] [what Qwen Code should investigate, solve, or continue]"
allowed-tools: Bash(node:*), AskUserQuestion, Agent
---

Invoke the `qwen:qwen-rescue` subagent via the `Agent` tool (`subagent_type: "qwen:qwen-rescue"`), forwarding the raw user request as the prompt.
`qwen:qwen-rescue` is a subagent, not a skill — do not call `Skill(qwen:qwen-rescue)` (no such skill) or `Skill(qwen:rescue)` (that re-enters this command and hangs the session).
The final user-visible response must be Qwen Code's output verbatim.

Raw user request:
$ARGUMENTS

Operating rules:

- The subagent is a thin forwarder only. It should use one `Bash` call to invoke `node "${CLAUDE_PLUGIN_ROOT}/scripts/qwen-companion.mjs" task ...` and return that command's stdout as-is.
- Return the Qwen Code companion stdout verbatim to the user.
- If Qwen Code is missing or unauthenticated, stop and tell the user to run `/qwen:setup`.
- If the user did not supply a request, ask what Qwen Code should investigate or fix.