import { binaryAvailable, formatCommandFailure, runCommand } from "./process.mjs";

const BINARY = "qwen";

export function getQwenAvailability(cwd) {
  return binaryAvailable(BINARY, ["--version"], { cwd });
}

export async function getQwenAuthStatus(cwd) {
  const availability = getQwenAvailability(cwd);
  if (!availability.available) {
    return {
      available: false,
      loggedIn: false,
      detail: `Qwen Code CLI is missing: ${availability.detail}`,
      source: "binary"
    };
  }
  return {
    available: true,
    loggedIn: true,
    detail: "Qwen Code CLI is available; command execution will surface any provider authentication errors.",
    source: "binary"
  };
}

export function ensureQwenAvailable(cwd) {
  const availability = getQwenAvailability(cwd);
  if (!availability.available) {
    throw new Error(
      `Qwen Code CLI is not installed or is missing required runtime support (${availability.detail}). Install Qwen Code and make sure the \`qwen\` binary is on PATH, then rerun /qwen:setup.`
    );
  }
}

export async function runQwen(cwd, options = {}) {
  ensureQwenAvailable(cwd);
  const prompt = String(options.prompt ?? options.defaultPrompt ?? "").trim();
  // Unlike Kimi, Qwen's headless mode does NOT force auto-approve: omitting
  // --yolo keeps file writes blocked, which is what review/adversarial-review need.
  const args = options.write ? ["--yolo", prompt] : [prompt];
  const result = runCommand(BINARY, args, { cwd });
  const failure = result.error
    ? result.error.message
    : result.status === 0
      ? ""
      : formatCommandFailure(result);
  return {
    status: result.error ? 1 : result.status,
    text: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: failure,
    sessionId: null
  };
}

export async function findLatestResumableSession() {
  return null;
}

export const AGENT_RUNTIME = {
  agent: "qwen",
  displayName: "Qwen Code",
  cliLabel: "Qwen Code CLI",
  installHint: "Install Qwen Code and make sure the `qwen` binary is on PATH.",
  authHint: "Authenticate Qwen Code (configure a provider API key), then rerun /qwen:setup.",
  getAvailability: getQwenAvailability,
  getAuthStatus: getQwenAuthStatus,
  ensureAvailable: ensureQwenAvailable,
  run: runQwen
};
