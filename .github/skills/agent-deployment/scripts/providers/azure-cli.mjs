import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stop } from "../contracts.mjs";

const operations = {
  version: ["version", "--output", "json"],
  cloud: ["cloud", "show", "--output", "json"],
  account: ["account", "show", "--output", "json", "--only-show-errors"],
  token: ["account", "get-access-token", "--resource", "https://ai.azure.com", "--output", "json", "--only-show-errors"],
  "token-arm": ["account", "get-access-token", "--resource", "https://management.azure.com/", "--output", "json", "--only-show-errors"]
};
const bridge = path.join(path.dirname(fileURLToPath(import.meta.url)), "azure-cli.ps1");

function selectedOperation(args) {
  if (!Array.isArray(args) || args.some((value) => typeof value !== "string")) stop("CLI_OPERATION_REJECTED", "Only fixed allowlisted Azure CLI operations are permitted.");
  const selected = Object.entries(operations).find(([, expected]) => expected.length === args.length && expected.every((value, index) => value === args[index]));
  if (!selected) stop("CLI_OPERATION_REJECTED", "Only fixed allowlisted Azure CLI operations are permitted.");
  return selected;
}

function environmentPath(environment) {
  const key = Object.keys(environment).find((name) => name.toUpperCase() === "PATH");
  return key ? environment[key] : "";
}

function resolveAzureLauncher(environment) {
  const names = process.platform === "win32" ? ["az.exe", "az.cmd"] : ["az"];
  for (const raw of String(environmentPath(environment)).split(path.delimiter)) {
    const directory = raw.replace(/^"|"$/g, "");
    if (!path.isAbsolute(directory)) continue;
    for (const name of names) {
      const candidate = path.join(directory, name);
      if (!existsSync(candidate)) continue;
      if (process.platform === "win32" && /["%!\r\n&|<>^]/.test(candidate)) stop("CLI_LAUNCHER_PATH", "Unsafe Azure CLI launcher path; use a trusted installed location.");
      try { if (statSync(candidate).isFile()) return candidate; }
      catch { stop("CLI_LAUNCHER_PATH", "Azure CLI launcher could not be inspected."); }
    }
  }
  stop("AZURE_CLI_REQUIRED", "A trusted installed Azure CLI launcher is required; no installation or login was attempted.");
}

export function buildAzureCliInvocation(args, dependencies = {}) {
  const [operation, fixedArguments] = selectedOperation(args);
  const environment = dependencies.env ?? process.env;
  const launcher = resolveAzureLauncher(environment);
  if (process.platform !== "win32") return { command: launcher, args: [...fixedArguments], env: environment };
  const systemRoot = environment.SystemRoot ?? environment.SYSTEMROOT ?? process.env.SystemRoot;
  if (!systemRoot || !path.isAbsolute(systemRoot)) stop("POWERSHELL_REQUIRED", "A trusted system Windows PowerShell launcher is required.");
  const powershell = path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!existsSync(powershell)) stop("POWERSHELL_REQUIRED", "Windows PowerShell is unavailable; no tools were installed.");
  return {
    command: powershell,
    args: ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", bridge, "-Operation", operation, "-AzureCliPath", launcher],
    env: environment
  };
}

export function runAzureCli(args, dependencies = {}) {
  const invocation = buildAzureCliInvocation(args, dependencies);
  const spawn = dependencies.spawn ?? spawnSync;
  const result = spawn(invocation.command, invocation.args, {
    env: invocation.env, encoding: "utf8", windowsHide: true, timeout: 30_000, maxBuffer: 1_048_576,
    stdio: ["ignore", "pipe", "pipe"], shell: false
  });
  if (result.error || result.status !== 0) stop("AZURE_SESSION_REQUIRED", "Azure CLI session or trusted launcher is unavailable; authenticate outside this command. CLI output was redacted.");
  try { return JSON.parse(result.stdout); }
  catch { stop("AZURE_CLI_CONTRACT", "Azure CLI returned an unsupported response; output was redacted."); }
}
