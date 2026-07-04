#!/usr/bin/env node
import { runSimpleCompanion } from "./lib/simple-companion.mjs";
import { AGENT_RUNTIME } from "./lib/qwen.mjs";

runSimpleCompanion(AGENT_RUNTIME).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
