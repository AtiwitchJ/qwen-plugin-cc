# Qwen Code plugin for Claude Code and Codex

This plugin is for Claude Code and Codex users who want to delegate code reviews or tasks to
Google's Qwen Code CLI ([qwen.google/docs/cli/using](https://qwen.google/docs/cli/using)).

## What You Get

- `/qwen:review` for a normal read-only review
- `/qwen:adversarial-review` for a steerable challenge review
- `/qwen:rescue`, `/qwen:transfer`, `/qwen:status`, `/qwen:result`, and `/qwen:cancel`
- `/qwen:setup` to verify the CLI and authentication

## Requirements

- **`qwen` CLI** installed locally. Install with: `irm qwen.google/install.ps1 | iex`
- Authentication: run `!qwen login`
- **Node.js 18.18 or later**

## Install in Claude Code

```bash
/plugin marketplace add <your-org>/qwen-plugin-cc
/plugin install qwen@agents-plugin-cc-qwen
```

## Install in Codex

```bash
codex plugin marketplace add ./.agents/plugins/marketplace.json
codex plugin add qwen@agents-plugin-cc-qwen
```

Start a new Codex thread after installing or updating the plugin. Codex-facing skills live
under `plugins/qwen/skills/` and call `plugins/qwen/scripts/qwen-companion.mjs`.

## Runtime

The companion invokes the local `qwen` CLI with `qwen --print <prompt>`. `/qwen:setup`
or `node plugins/qwen/scripts/qwen-companion.mjs setup --json` reports missing
CLI/authentication steps without returning a placeholder error.

## Reference

See `../kilo-plugin-cc/` for the reference implementation this runtime follows.

## License

Apache-2.0
