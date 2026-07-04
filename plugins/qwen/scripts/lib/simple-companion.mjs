import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseArgs, splitRawArgumentString } from "./args.mjs";
import { collectReviewContext, resolveReviewTarget } from "./git.mjs";
import { readStdinIfPiped } from "./fs.mjs";
import {
  generateJobId,
  listJobs,
  readJobFile,
  resolveJobFile,
  resolveJobLogFile,
  upsertJob,
  writeJobFile,
  nowIso
} from "./state.mjs";
import { terminateProcessTree } from "./process.mjs";
import { resolveWorkspaceRoot } from "./workspace.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const LIB_DIR = path.dirname(SCRIPT_PATH);
const SCRIPTS_DIR = path.resolve(LIB_DIR, "..");
const PLUGIN_ROOT = path.resolve(SCRIPTS_DIR, "..");

function normalizeArgv(argv) {
  if (argv.length === 1) {
    const raw = argv[0];
    return raw?.trim() ? splitRawArgumentString(raw) : [];
  }
  return argv;
}

function parseCommandInput(argv, config = {}) {
  return parseArgs(normalizeArgv(argv), config);
}

function resolveCommandCwd(options = {}) {
  return options.cwd ? path.resolve(process.cwd(), options.cwd) : process.cwd();
}

function shorten(text, limit = 80) {
  const normalized = String(text ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 3)}...`;
}

function fence(text) {
  const value = String(text ?? "").trim();
  return `\`\`\`\n${value || "(empty)"}\n\`\`\``;
}

function readTaskPrompt(cwd, options, positionals) {
  if (options["prompt-file"]) {
    return fs.readFileSync(path.resolve(cwd, options["prompt-file"]), "utf8");
  }
  return positionals.join(" ") || readStdinIfPiped();
}

function requirePrompt(prompt) {
  if (!String(prompt ?? "").trim()) {
    throw new Error("Provide a prompt, a prompt file, or piped stdin.");
  }
}

function renderSetup(runtime, report) {
  const lines = [
    `# ${runtime.displayName} setup`,
    `- ${runtime.cliLabel}: ${report.agent.available ? "ready" : "missing"} (${report.agent.detail})`,
    `- Authentication: ${report.auth.loggedIn ? "ready" : "not ready"} (${report.auth.detail})`,
    `- Workspace: \`${report.workspaceRoot}\``
  ];
  if (report.nextSteps.length) {
    lines.push("", "## Next steps", ...report.nextSteps.map((step) => `- ${step}`));
  }
  return `${lines.join("\n")}\n`;
}

function renderTask(runtime, result, { title, jobId, write }) {
  const lines = [`# ${title}`, jobId ? `- Job ID: \`${jobId}\`` : null, `- Write-enabled: ${write ? "yes" : "no"}`].filter(Boolean);
  if (result.error || result.stderr) {
    lines.push("", "## Error", fence(result.error || result.stderr));
  }
  lines.push("", `## ${runtime.displayName} output`, fence(result.text));
  return `${lines.join("\n")}\n`;
}

function renderReview(runtime, result, { reviewLabel, targetLabel }) {
  return [
    `# ${runtime.displayName} ${reviewLabel}`,
    `- Target: ${targetLabel}`,
    "",
    `## ${runtime.displayName} output`,
    fence(result.text || result.error || result.stderr)
  ].join("\n") + "\n";
}

function renderStatus(runtime, cwd, reference = "") {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = listJobs(workspaceRoot).filter((job) => !reference || job.id === reference);
  if (!jobs.length) {
    return `_No ${runtime.agent} jobs recorded for this repository yet._\n`;
  }
  const rows = [
    `# ${runtime.displayName} status`,
    "",
    "| Job ID | Kind | Status | Phase | Summary |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const job of jobs) {
    rows.push(`| \`${job.id}\` | ${job.kindLabel ?? job.kind ?? "job"} | \`${job.status ?? "?"}\` | ${job.phase ?? ""} | ${shorten(job.summary ?? "", 56)} |`);
  }
  return `${rows.join("\n")}\n`;
}

function latestJob(cwd, reference = "") {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const jobs = listJobs(workspaceRoot);
  if (reference) return jobs.find((job) => job.id === reference);
  return jobs.find((job) => job.status === "completed") ?? jobs[0] ?? null;
}

function readStoredJob(workspaceRoot, id) {
  const file = resolveJobFile(workspaceRoot, id);
  if (!fs.existsSync(file)) return null;
  return readJobFile(file);
}

function renderResult(runtime, cwd, reference = "") {
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const job = latestJob(cwd, reference);
  if (!job) return `_No ${runtime.agent} jobs recorded for this repository yet._\n`;
  const stored = readStoredJob(workspaceRoot, job.id) ?? {};
  const lines = [`# ${job.title ?? `${runtime.displayName} result`}`, `- Job ID: \`${job.id}\``, `- Status: \`${job.status ?? "?"}\``];
  if (stored.text) lines.push("", `## ${runtime.displayName} output`, fence(stored.text));
  if (stored.stderr || stored.error) lines.push("", "## Error", fence(stored.stderr || stored.error));
  if (!stored.text && !stored.stderr && !stored.error) lines.push("", "_No stored payload for this job._");
  return `${lines.join("\n")}\n`;
}

function createJob(runtime, workspaceRoot, { kind, title, summary, write = false, request = null }) {
  return {
    id: generateJobId(kind),
    kind,
    kindLabel: kind,
    title,
    summary,
    write,
    request,
    workspaceRoot,
    status: "queued",
    phase: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}

async function executeTask(runtime, cwd, { prompt, write, jobId = null }) {
  runtime.ensureAvailable(cwd);
  const result = await runtime.run(cwd, { prompt, write });
  return {
    ...result,
    rendered: renderTask(runtime, result, {
      title: `${runtime.displayName} Task`,
      jobId,
      write
    })
  };
}

function buildReviewPrompt(context, focusText, reviewLabel) {
  return [
    `Run a ${reviewLabel.toLowerCase()} in read-only mode.`,
    `Review target: ${context.target.label}`,
    focusText ? `Focus: ${focusText}` : "",
    "",
    "Repository context:",
    context.summary,
    "",
    "Diff:",
    context.content
  ].filter(Boolean).join("\n");
}

async function executeReview(runtime, cwd, { base, scope, focusText, reviewLabel }) {
  runtime.ensureAvailable(cwd);
  const target = resolveReviewTarget(cwd, { base, scope });
  const context = collectReviewContext(cwd, target);
  const prompt = buildReviewPrompt(context, focusText, reviewLabel);
  const result = await runtime.run(cwd, { prompt, write: false });
  return {
    ...result,
    rendered: renderReview(runtime, result, {
      reviewLabel,
      targetLabel: target.label
    }),
    target
  };
}

function spawnWorker(cwd, jobId) {
  const script = path.join(SCRIPTS_DIR, `${path.basename(PLUGIN_ROOT)}-companion.mjs`);
  const child = spawn(process.execPath, [script, "task-worker", "--cwd", cwd, "--job-id", jobId], {
    cwd,
    env: process.env,
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return child.pid ?? null;
}

async function handleSetup(runtime, argv) {
  const { options } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const agent = runtime.getAvailability(cwd);
  const auth = await runtime.getAuthStatus(cwd);
  const nextSteps = [];
  if (!agent.available) nextSteps.push(runtime.installHint);
  if (agent.available && !auth.loggedIn) nextSteps.push(runtime.authHint);
  const report = { ready: agent.available && auth.loggedIn, agent, auth, workspaceRoot, nextSteps };
  console.log(options.json ? JSON.stringify(report, null, 2) : renderSetup(runtime, report));
}

async function handleTask(runtime, argv) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "prompt-file", "job-id"],
    booleanOptions: ["json", "write", "background"]
  });
  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const prompt = readTaskPrompt(cwd, options, positionals);
  requirePrompt(prompt);
  const write = Boolean(options.write);

  if (options.background) {
    runtime.ensureAvailable(cwd);
    const job = createJob(runtime, workspaceRoot, {
      kind: "task",
      title: `${runtime.displayName} Task`,
      summary: shorten(prompt),
      write,
      request: { cwd, prompt, write }
    });
    const logFile = resolveJobLogFile(workspaceRoot, job.id);
    const pid = spawnWorker(cwd, job.id);
    writeJobFile(workspaceRoot, job.id, { ...job, pid, logFile });
    upsertJob(workspaceRoot, { ...job, pid, logFile });
    const payload = { jobId: job.id, status: "queued", logFile };
    console.log(options.json ? JSON.stringify(payload, null, 2) : `${runtime.displayName} task queued as ${job.id}.\n`);
    return;
  }

  const job = createJob(runtime, workspaceRoot, {
    kind: "task",
    title: `${runtime.displayName} Task`,
    summary: shorten(prompt),
    write
  });
  upsertJob(workspaceRoot, { ...job, status: "running", phase: "running" });
  const result = await executeTask(runtime, cwd, { prompt, write, jobId: job.id });
  const status = result.status === 0 ? "completed" : "failed";
  writeJobFile(workspaceRoot, job.id, { ...job, ...result, status, phase: status });
  upsertJob(workspaceRoot, { ...job, status, phase: status });
  console.log(options.json ? JSON.stringify(result, null, 2) : result.rendered);
  if (result.status !== 0) process.exitCode = result.status || 1;
}

async function handleTaskWorker(runtime, argv) {
  const { options } = parseCommandInput(argv, { valueOptions: ["cwd", "job-id"] });
  if (!options["job-id"]) throw new Error("Missing required --job-id.");
  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const stored = readStoredJob(workspaceRoot, options["job-id"]);
  if (!stored?.request) throw new Error(`Stored job ${options["job-id"]} is missing its request.`);
  upsertJob(workspaceRoot, { id: stored.id, status: "running", phase: "running" });
  const result = await executeTask(runtime, stored.request.cwd, { ...stored.request, jobId: stored.id });
  const status = result.status === 0 ? "completed" : "failed";
  writeJobFile(workspaceRoot, stored.id, { ...stored, ...result, status, phase: status });
  upsertJob(workspaceRoot, { id: stored.id, status, phase: status, completedAt: nowIso() });
}

async function handleReview(runtime, argv, reviewLabel) {
  const { options, positionals } = parseCommandInput(argv, {
    valueOptions: ["cwd", "base", "scope"],
    booleanOptions: ["json", "background", "wait"]
  });
  const cwd = resolveCommandCwd(options);
  const result = await executeReview(runtime, cwd, {
    base: options.base,
    scope: options.scope,
    focusText: positionals.join(" ").trim(),
    reviewLabel
  });
  console.log(options.json ? JSON.stringify(result, null, 2) : result.rendered);
  if (result.status !== 0) process.exitCode = result.status || 1;
}

function handleStatus(runtime, argv) {
  const { options, positionals } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCommandCwd(options);
  const rendered = renderStatus(runtime, cwd, positionals[0] ?? "");
  console.log(options.json ? JSON.stringify({ output: rendered }, null, 2) : rendered);
}

function handleResult(runtime, argv) {
  const { options, positionals } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCommandCwd(options);
  const rendered = renderResult(runtime, cwd, positionals[0] ?? "");
  console.log(options.json ? JSON.stringify({ output: rendered }, null, 2) : rendered);
}

async function handleCancel(runtime, argv) {
  const { options, positionals } = parseCommandInput(argv, { valueOptions: ["cwd"], booleanOptions: ["json"] });
  const cwd = resolveCommandCwd(options);
  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const job = latestJob(cwd, positionals[0] ?? "");
  if (!job) throw new Error(`No active ${runtime.agent} jobs to cancel.`);
  if (job.pid) terminateProcessTree(job.pid, { cwd });
  const next = { ...job, status: "cancelled", phase: "cancelled", completedAt: nowIso() };
  writeJobFile(workspaceRoot, job.id, next);
  upsertJob(workspaceRoot, next);
  const rendered = `# ${runtime.displayName} cancel\n- Job ID: \`${job.id}\`\n- Status: \`cancelled\`\n`;
  console.log(options.json ? JSON.stringify(next, null, 2) : rendered);
}

function handleTransfer(runtime, argv) {
  const { options } = parseCommandInput(argv, { booleanOptions: ["json"] });
  const payload = {
    supported: false,
    message: `${runtime.displayName} does not expose native session transfer yet. Start a task with the context you want transferred.`
  };
  console.log(options.json ? JSON.stringify(payload, null, 2) : `${payload.message}\n`);
}

function printUsage(runtime) {
  console.log([
    "Usage:",
    `  node scripts/${runtime.agent}-companion.mjs setup [--json]`,
    `  node scripts/${runtime.agent}-companion.mjs review [--wait|--background] [--base <ref>]`,
    `  node scripts/${runtime.agent}-companion.mjs adversarial-review [--wait|--background] [--base <ref>] [focus text]`,
    `  node scripts/${runtime.agent}-companion.mjs task [--background] [--write] [prompt]`,
    `  node scripts/${runtime.agent}-companion.mjs status [job-id] [--json]`,
    `  node scripts/${runtime.agent}-companion.mjs result [job-id] [--json]`,
    `  node scripts/${runtime.agent}-companion.mjs cancel [job-id] [--json]`,
    `  node scripts/${runtime.agent}-companion.mjs transfer [--json]`
  ].join("\n"));
}

export async function runSimpleCompanion(runtime) {
  const [subcommand, ...argv] = process.argv.slice(2);
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    printUsage(runtime);
    return;
  }
  switch (subcommand) {
    case "setup":
      await handleSetup(runtime, argv);
      break;
    case "task":
      await handleTask(runtime, argv);
      break;
    case "task-worker":
      await handleTaskWorker(runtime, argv);
      break;
    case "review":
      await handleReview(runtime, argv, "Review");
      break;
    case "adversarial-review":
      await handleReview(runtime, argv, "Adversarial Review");
      break;
    case "status":
      handleStatus(runtime, argv);
      break;
    case "result":
      handleResult(runtime, argv);
      break;
    case "cancel":
      await handleCancel(runtime, argv);
      break;
    case "transfer":
      handleTransfer(runtime, argv);
      break;
    default:
      throw new Error(`Unknown subcommand: ${subcommand}`);
  }
}
