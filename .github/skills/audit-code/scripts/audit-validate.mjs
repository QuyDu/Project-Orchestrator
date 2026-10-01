#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createReadStream, existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

const REQUIRED_STANDARDS = new Set([
  "microsoft-sdl",
  "microsoft-cloud-security-benchmark",
  "azure-well-architected-security",
  "owasp-asvs",
  "owasp-top-10",
  "nist-ssdf",
  "cis-controls",
  "slsa",
  "openssf-scorecard"
]);
const REQUIRED_SECRET_SCOPES = new Set(["worktree", "tracked-reports", "all-local-refs", "reachable-history"]);
const REQUIRED_RESOURCE_CHECKS = new Set(["ownership-classification", "normal-exit", "early-return", "exception", "cancellation"]);
const REQUIRED_AI_QUALITY_CHECKS = new Set(["ai-slop-indicators", "ai-authorship-non-inference", "agentic-security-applicability"]);
const REQUIRED_ASSURANCE_GATES = new Set(["critical-high-findings", "secret-evidence", "analyzer-evidence", "standards-evidence", "hosted-evidence"]);
const WORKFLOW_STATE_PATHS = new Set([
  "reports/audit-remediation-execution.json",
  "reports/audit-remediation-execution.md",
  "reports/current-execution-state.json",
  "reports/current-execution-state.md",
  "reports/execution-log.jsonl",
  "reports/project-handoff.json",
  "reports/project-handoff.md",
  "reports/current-work-state.json",
  "reports/change-review.json",
  "reports/change-review.md",
  "reports/policy-evaluation.json",
  "reports/policy-evaluation.md",
  "reports/policy-decision-log.jsonl",
  "reports/gitleaks-scan.json"
]);

function fail(messages) {
  const details = [...new Set(messages)].map((message) => `- ${message}`).join("\n");
  throw new Error(`Audit validation failed:\n${details}`);
}

async function loadJson(file) {
  const resolved = path.resolve(file);
  try {
    return JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    throw new Error(`Audit validation failed: could not read JSON artifact '${resolved}': ${error.message}`);
  }
}

async function loadJsonArtifact(file) {
  const resolved = path.resolve(file);
  try {
    const bytes = await readFile(resolved);
    return {
      value: JSON.parse(bytes.toString("utf8")),
      sha256: createHash("sha256").update(bytes).digest("hex")
    };
  } catch (error) {
    throw new Error(`Audit validation failed: could not read JSON artifact '${resolved}': ${error.message}`);
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function equal(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? "");
}

function validateAuditEvidenceBinding(report, errors) {
  if (!validUuid(report.auditRunId)) errors.push("auditRunId must be a UUID");
  const reference = report.auditEvidence ?? {};
  const match = /^reports\/audit-evidence\/([a-fA-F0-9]{64})\.json$/.exec(reference.path ?? "");
  if (!match || reference.sha256 !== match[1]) {
    errors.push("audit evidence path and digest must be content-addressed and equal");
    return;
  }
  const evidencePath = path.resolve(reference.path);
  if (!existsSync(evidencePath)) {
    errors.push("referenced audit evidence snapshot is missing");
    return;
  }
  const bytes = readFileSync(evidencePath);
  if (createHash("sha256").update(bytes).digest("hex") !== reference.sha256) errors.push("audit evidence snapshot digest does not match");
  try {
    const evidence = JSON.parse(bytes.toString("utf8"));
    if (evidence.auditRunId !== report.auditRunId) errors.push("audit evidence auditRunId does not match findings");
    if (evidence.repository?.head !== report.repositoryEvidence?.localGit?.revision) errors.push("audit evidence repository revision does not match findings");
  } catch {
    errors.push("audit evidence snapshot is not valid JSON");
  }
}

function sameMembers(left, right) {
  return equal([...(left ?? [])].sort(), [...(right ?? [])].sort());
}

function containedPath(root, candidate, label) {
  const requestedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(requestedRoot, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) fail([`${label} must be contained within repository root`]);
  const resolvedRoot = realpathSync(requestedRoot);
  const canonicalCandidate = realpathSync(resolvedCandidate);
  const canonicalRelative = path.relative(resolvedRoot, canonicalCandidate);
  if (!canonicalRelative || canonicalRelative.startsWith("..") || path.isAbsolute(canonicalRelative)) fail([`${label} must be contained within repository root`]);
  return {
    resolvedRoot,
    resolvedCandidate,
    expectedCandidate: path.join(resolvedRoot, relative),
    relative: relative.replaceAll("\\", "/")
  };
}

function sameFilesystemPath(left, right) {
  const normalize = (value) => {
    const normalized = path.normalize(value).replace(/[\\/]+$/, "");
    return process.platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

async function snapshotPlan(planPath, root) {
  const { resolvedRoot, resolvedCandidate, expectedCandidate, relative } = containedPath(root, planPath, "canonical plan");
  if (relative !== "reports/audit-remediation-plan.json") fail(["snapshot source must be reports/audit-remediation-plan.json"]);
  const realRoot = realpathSync(resolvedRoot);
  const reportsDirectory = path.join(realRoot, "reports");
  if (!sameFilesystemPath(realpathSync(reportsDirectory), reportsDirectory)) fail(["reports directory must not redirect through a symbolic link"]);
  const sourceStat = lstatSync(resolvedCandidate);
  if (!sourceStat.isFile() || sourceStat.nlink !== 1 || !sameFilesystemPath(realpathSync(resolvedCandidate), expectedCandidate)) {
    fail(["canonical plan must be a regular file inside the repository"]);
  }
  const plan = await loadJson(resolvedCandidate);
  validatePlan(plan);
  const bytes = await readFile(resolvedCandidate);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const snapshotPath = `reports/audit-remediation-plans/${sha256}.json`;
  const target = path.join(realRoot, ...snapshotPath.split("/"));
  await mkdir(path.dirname(target), { recursive: true });
  if (!sameFilesystemPath(realpathSync(path.dirname(target)), path.dirname(target))) fail(["snapshot directory must not redirect through a symbolic link"]);
  try {
    await writeFile(target, bytes, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") fail([`could not publish immutable plan snapshot: ${error.message}`]);
    if (!(await readFile(target)).equals(bytes)) fail(["existing immutable plan snapshot content does not match canonical plan"]);
  }
  const stored = await readFile(target);
  const targetStat = lstatSync(target);
  if (!targetStat.isFile() || targetStat.nlink !== 1 || !sameFilesystemPath(realpathSync(target), target)) {
    fail(["immutable plan snapshot must be one regular file without links"]);
  }
  if (!stored.equals(bytes) || createHash("sha256").update(stored).digest("hex") !== sha256) {
    fail(["immutable plan snapshot failed post-write verification"]);
  }
  return { status: "valid", command: "snapshot", path: snapshotPath, planId: plan.planId, sha256, sourceReview: plan.sourceReview };
}

function errorCode(error) {
  return /^[A-Z][A-Z0-9_]*$/.test(error?.code ?? "") ? error.code : "unknown";
}

function failGit(operation, { error, outputError, status, signal }) {
  const detail = error ? `could not start (${errorCode(error)})`
    : outputError ? `output could not be read (${errorCode(outputError)})`
      : signal ? `terminated by signal ${signal}` : `exited with status ${status ?? "unknown"}`;
  fail([`could not inspect resume repository: git ${operation} ${detail}; check Git availability and repository state (output withheld)`]);
}

function git(root, ...args) {
  const result = spawnSync("git", args, {
    cwd: path.resolve(root), encoding: "utf8", windowsHide: true, shell: false,
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.error || result.status !== 0) failGit(args[0], result);
  return result.stdout.trim();
}

async function consumeGitOutput(root, args, consume) {
  let child;
  try {
    child = spawn("git", args, {
      cwd: path.resolve(root), windowsHide: true, shell: false,
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (error) {
    failGit(args[0], { error });
  }
  let error;
  let outputError;
  child.on("error", (cause) => { error ??= cause; });
  const closed = new Promise((resolve) => child.once("close", (status, signal) => resolve({ status, signal })));
  try {
    for await (const chunk of child.stdout) consume(chunk);
  } catch (cause) {
    outputError = cause;
    child.stdout?.destroy();
    if (child.pid && child.exitCode === null && child.signalCode === null) child.kill();
  }
  const result = await closed;
  child.stdout?.destroy();
  if (error || outputError || result.status !== 0) failGit(args[0], { ...result, error, outputError });
}

async function worktreeDigest(root) {
  const repositoryRoot = path.resolve(root);
  const revision = git(repositoryRoot, "rev-parse", "HEAD");
  const excludedPathspecs = [...WORKFLOW_STATE_PATHS].map((file) => `:(exclude)${file}`);
  const digest = createHash("sha256").update(revision).update("\0");
  await consumeGitOutput(repositoryRoot, ["diff", "--binary", "--no-ext-diff", "HEAD", "--", ".", ...excludedPathspecs], (chunk) => digest.update(chunk));
  const untrackedFiles = [];
  const decoder = new StringDecoder("utf8");
  let pending = "";
  const includeFile = (file) => { if (file && !WORKFLOW_STATE_PATHS.has(file)) untrackedFiles.push(file); };
  await consumeGitOutput(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"], (chunk) => {
    const names = (pending + decoder.write(chunk)).split("\0");
    pending = names.pop();
    for (const name of names) includeFile(name);
  });
  includeFile(pending + decoder.end());
  untrackedFiles.sort();
  digest.update("\0");
  for (const relative of untrackedFiles) digest.update(relative).update("\0");
  for (const relative of untrackedFiles) {
    const file = path.resolve(repositoryRoot, relative);
    const boundary = path.relative(repositoryRoot, file);
    if (boundary.startsWith("..") || path.isAbsolute(boundary)) fail([`untracked path escapes resume repository: '${relative}'`]);
    try {
      const stat = lstatSync(file);
      digest.update("\0").update(relative).update("\0");
      if (stat.isSymbolicLink()) digest.update(readlinkSync(file));
      else for await (const chunk of createReadStream(file)) digest.update(chunk);
    } catch (error) {
      fail([`untracked path changed during resume validation: '${relative}': ${error.message}`]);
    }
  }
  return digest.digest("hex");
}

function validateFindings(report) {
  if (report.schemaVersion === "1.0.0") return;
  const errors = [];
  if (!new Set(["2.0.0", "2.1.0", "2.2.0"]).has(report.schemaVersion)) errors.push("findings schemaVersion must be 1.0.0, 2.0.0, 2.1.0, or 2.2.0");

  const repository = report.repositoryEvidence ?? {};
  const secret = repository.secretScanning ?? {};
  const hosted = repository.hostedRepository ?? {};
  const standards = Array.isArray(report.standards) ? report.standards : [];
  const assurance = report.assurance ?? {};
  const standardIds = standards.map((standard) => standard.id);
  const requiresStrictEvidence = new Set(["2.1.0", "2.2.0"]).has(report.schemaVersion);
  if (report.schemaVersion === "2.2.0") validateAuditEvidenceBinding(report, errors);

  for (const id of REQUIRED_STANDARDS) {
    if (!standardIds.includes(id)) errors.push(`required standard '${id}' is missing`);
  }
  if (new Set(standardIds).size !== standardIds.length) errors.push("standards contain duplicate IDs");

  const incompleteEvidence = [];
  if (repository.localGit?.status !== "completed") incompleteEvidence.push("local Git evidence is not completed");
  if (secret.status !== "completed") incompleteEvidence.push("specialist secret scanning is not completed");
  if (!secret.version) incompleteEvidence.push("specialist secret scanner version is missing");
  if (!/^[a-fA-F0-9]{64}$/.test(secret.configurationDigest ?? "")) incompleteEvidence.push("secret scanner configuration digest is missing or invalid");
  for (const scope of REQUIRED_SECRET_SCOPES) {
    if (!secret.scopes?.includes(scope)) incompleteEvidence.push(`secret scan scope '${scope}' is missing`);
  }
  if (hosted.provider === "github" && hosted.status !== "completed") incompleteEvidence.push("hosted GitHub evidence is not completed");
  if (hosted.provider === "github" && !(hosted.controls?.length > 0)) incompleteEvidence.push("hosted GitHub controls are empty");

  let exceptions = 0;
  let expiredExceptions = 0;
  let nonConformant = false;
  const now = Date.now();
  for (const standard of standards) {
    if (!standard.version) errors.push(`standard '${standard.id}' has no version`);
    if (!standard.reference) errors.push(`standard '${standard.id}' has no authoritative reference`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(standard.accessedAt ?? "")) errors.push(`standard '${standard.id}' has no valid access date`);
    const accessedAt = Date.parse(`${standard.accessedAt ?? ""}T00:00:00.000Z`);
    const generatedAt = Date.parse(report.generatedAt ?? "");
    if (requiresStrictEvidence && Number.isFinite(accessedAt) && Number.isFinite(generatedAt)) {
      const ageDays = (generatedAt - accessedAt) / 86_400_000;
      if (ageDays < -1 || ageDays > 30) incompleteEvidence.push(`standard '${standard.id}' evidence is not current at report generation`);
    }
    if (requiresStrictEvidence && !new Set(["stable", "final", "current", "preview", "draft"]).has(standard.stability)) {
      errors.push(`standard '${standard.id}' has no valid stability`);
    }
    if (requiresStrictEvidence && !new Set(["normative", "informational"]).has(standard.baselineRole)) {
      errors.push(`standard '${standard.id}' has no valid baselineRole`);
    }
    if (standard.baselineRole === "normative" && new Set(["preview", "draft"]).has(standard.stability)) {
      incompleteEvidence.push(`standard '${standard.id}' uses ${standard.stability} guidance as a normative baseline`);
    }
    if (standard.applicability !== "not-applicable" && !(standard.controls?.length > 0)) {
      incompleteEvidence.push(`applicable standard '${standard.id}' has no controls`);
    }
    for (const control of standard.controls ?? []) {
      if (control.status === "blocked") incompleteEvidence.push(`control '${standard.id}/${control.id}' is blocked`);
      if (control.status === "non-conformant") nonConformant = true;
      if (control.status === "exception") {
        exceptions++;
        const expiry = Date.parse(control.exceptionExpiresAt ?? "");
        if (!control.exceptionOwner) errors.push(`exception '${standard.id}/${control.id}' has no owner`);
        if (!Number.isFinite(expiry)) errors.push(`exception '${standard.id}/${control.id}' has no valid expiry`);
        else if (expiry <= now) expiredExceptions++;
      }
    }
  }

  if (requiresStrictEvidence) {
    const verification = report.verificationEvidence ?? {};
    const requiredAssessments = ["secretExposure", "analyzers", "resourceOwnership", "aiQuality", "assuranceGates"];
    for (const name of requiredAssessments) {
      const assessment = verification[name];
      if (!assessment) {
        errors.push(`verificationEvidence.${name} is required`);
        continue;
      }
      if (assessment.status === "completed" && !(assessment.evidence?.length > 0)) {
        incompleteEvidence.push(`verificationEvidence.${name} is completed without evidence`);
      }
      if (new Set(["partial", "blocked", "failed"]).has(assessment.status) && !(assessment.limitations?.length > 0)) {
        errors.push(`verificationEvidence.${name} must explain incomplete status`);
      }
    }

    const secretEvidence = verification.secretExposure ?? {};
    if (secretEvidence.status === "not-applicable") errors.push("verificationEvidence.secretExposure cannot be not-applicable");
    for (const scope of REQUIRED_SECRET_SCOPES) {
      if (!secretEvidence.scopes?.includes(scope)) incompleteEvidence.push(`verification secret scope '${scope}' is missing`);
    }

    const analyzers = verification.analyzers ?? {};
    if (analyzers.status === "not-applicable" && analyzers.detectedLanguages?.length) {
      errors.push("verificationEvidence.analyzers cannot be not-applicable when languages are detected");
    }
    if (analyzers.status === "completed" && !(analyzers.tools?.length > 0)) incompleteEvidence.push("analyzer evidence has no tools");
    if (analyzers.tools?.some((tool) => tool.status !== "passed")) incompleteEvidence.push("one or more required analyzers did not pass");

    const resources = verification.resourceOwnership ?? {};
    for (const check of REQUIRED_RESOURCE_CHECKS) {
      if (!resources.checks?.includes(check)) incompleteEvidence.push(`resource ownership check '${check}' is missing`);
    }
    if (resources.status === "completed" && !(resources.pathsChecked?.length > 0)) incompleteEvidence.push("resource ownership evidence has no checked paths");

    const aiQuality = verification.aiQuality ?? {};
    for (const check of REQUIRED_AI_QUALITY_CHECKS) {
      if (!aiQuality.checks?.includes(check)) incompleteEvidence.push(`AI quality check '${check}' is missing`);
    }
    if (aiQuality.aiComponentsDetected && aiQuality.status !== "completed") incompleteEvidence.push("AI or agentic components were detected without completed AI quality evidence");
    if (!aiQuality.aiComponentsDetected && aiQuality.status === "not-applicable" && !(aiQuality.limitations?.length > 0)) {
      errors.push("not-applicable AI quality evidence must explain the applicability decision");
    }

    const assuranceGates = verification.assuranceGates ?? {};
    if (assuranceGates.status === "not-applicable") errors.push("verificationEvidence.assuranceGates cannot be not-applicable");
    for (const gate of REQUIRED_ASSURANCE_GATES) {
      if (!assuranceGates.gates?.includes(gate)) incompleteEvidence.push(`assurance gate '${gate}' is missing`);
    }
    if (report.schemaVersion === "2.2.0") {
      if (!(verification.records?.length > 0)) errors.push("verificationEvidence.records is required");
      for (const record of verification.records ?? []) {
        if (record.auditRunId !== report.auditRunId) errors.push(`verification record '${record.tool ?? "unknown"}' auditRunId does not match`);
        if (record.repositoryRevision !== repository.localGit?.revision) errors.push(`verification record '${record.tool ?? "unknown"}' repository revision does not match`);
        for (const field of ["tool", "toolVersion", "command", "scope", "executedAt", "evidenceSha256"]) {
          if (!record[field]) errors.push(`verification record '${record.tool ?? "unknown"}' is missing ${field}`);
        }
      }
    }
  }

  if (expiredExceptions > 0) errors.push(`${expiredExceptions} exception(s) expired`);
  if (assurance.exceptionCount !== exceptions) errors.push("assurance exceptionCount does not match controls");
  if (assurance.expiredExceptionCount !== expiredExceptions) errors.push("assurance expiredExceptionCount does not match controls");

  const blocking = Array.isArray(assurance.blockingEvidence) ? assurance.blockingEvidence : [];
  let expected;
  if (incompleteEvidence.length > 0 || blocking.length > 0) expected = "insufficient-evidence";
  else if (nonConformant) expected = "non-conformant";
  else if (exceptions > 0) expected = "conformant-with-exceptions";
  else expected = "conformant";
  if (assurance.conclusion !== expected) {
    errors.push(`assurance conclusion must be '${expected}' for the recorded evidence, not '${assurance.conclusion}'`);
  }
  if (expected === "insufficient-evidence" && blocking.length === 0) {
    errors.push(`blockingEvidence must identify incomplete evidence: ${incompleteEvidence.join("; ")}`);
  }

  if (errors.length) fail(errors);
}

function validateReview(source, review) {
  if (!new Set(["2.0.0", "2.1.0", "2.2.0"]).has(source.schemaVersion)) return;
  const errors = [];
  if (review.schemaVersion !== source.schemaVersion) errors.push(`reviews of schema ${source.schemaVersion} findings must use the same review schema version`);
  if (!equal(review.repositoryEvidence, source.repositoryEvidence)) errors.push("review must preserve source repository evidence exactly");
  if (!equal(review.standards, source.standards)) errors.push("review must preserve source standards exactly");
  if (!equal(review.assurance, source.assurance)) errors.push("review must preserve source assurance exactly");
  if (source.schemaVersion === "2.1.0" && !equal(review.verificationEvidence, source.verificationEvidence)) {
    errors.push("review must preserve source verification evidence exactly");
  }
  if (source.schemaVersion === "2.2.0") {
    if (review.auditRunId !== source.auditRunId) errors.push("review auditRunId must match source findings");
    if (!equal(review.auditEvidence, source.auditEvidence)) errors.push("review must preserve source audit evidence reference exactly");
    if (!equal(review.verificationEvidence, source.verificationEvidence)) errors.push("review must preserve source verification evidence exactly");
  }
  if (errors.length) fail(errors);
}

function validatePlan(plan) {
  if (plan.schemaVersion === "1.0.0") return;
  const errors = [];
  if (!new Set(["2.0.0", "2.1.0"]).has(plan.schemaVersion)) errors.push("plan schemaVersion must be 1.0.0, 2.0.0, or 2.1.0");
  if (!plan.prioritization?.includes("complexity")) errors.push("schema 2.0 remediation prioritization must include complexity");
  for (const item of plan.items ?? []) {
    if (!item.complexity) errors.push(`item '${item.id ?? "unknown"}' has no complexity`);
    if (!item.complexityRationale) errors.push(`item '${item.id ?? "unknown"}' has no complexity rationale`);
  }
  if (plan.schemaVersion === "2.1.0") {
    if (!validUuid(plan.auditRunId)) errors.push("plan auditRunId must be a UUID");
    const reviewPath = path.resolve(plan.sourceReview ?? "");
    if (!existsSync(reviewPath)) errors.push("plan source review is missing");
    else {
      const bytes = readFileSync(reviewPath);
      if (createHash("sha256").update(bytes).digest("hex") !== plan.sourceReviewSha256) errors.push("plan source review digest does not match");
      try { if (JSON.parse(bytes.toString("utf8")).auditRunId !== plan.auditRunId) errors.push("plan auditRunId does not match source review"); } catch { errors.push("plan source review is invalid JSON"); }
    }
  }
  if (errors.length) fail(errors);
}

async function validateExecution(plan, execution, planPath, planSha256, repositoryRoot, resumeRoot) {
  const errors = [];
  if (!new Set(["3.0.0", "3.1.0"]).has(execution.schemaVersion)) errors.push("new execution artifacts must use schemaVersion 3.0.0 or 3.1.0");
  if (execution.schemaVersion === "3.1.0" && execution.auditRunId !== plan.auditRunId) errors.push("execution auditRunId does not match plan");
  const snapshotPattern = /^reports\/audit-remediation-plans\/([a-fA-F0-9]{64})\.json$/;
  const snapshotMatch = snapshotPattern.exec(execution.sourcePlan?.path ?? "");
  if (!snapshotMatch) errors.push("execution source plan path must be a content-addressed immutable snapshot");
  else {
    if (snapshotMatch[1].toLowerCase() !== execution.sourcePlan.sha256?.toLowerCase()) errors.push("execution source plan filename does not match digest");
    if (!repositoryRoot) errors.push("schema 3.0 execution validation requires --root");
    else {
      const supplied = containedPath(repositoryRoot, planPath, "execution source plan");
      if (supplied.relative !== execution.sourcePlan.path) errors.push("supplied plan path does not match execution source plan path");
    }
    try {
      const stat = lstatSync(path.resolve(planPath));
      const supplied = containedPath(repositoryRoot, planPath, "execution source plan");
      if (!stat.isFile() || stat.nlink !== 1 || !sameFilesystemPath(realpathSync(path.resolve(planPath)), supplied.expectedCandidate)) {
        errors.push("execution source plan snapshot must be one regular file without links");
      }
    } catch (error) {
      errors.push(`execution source plan snapshot is unavailable: ${error.message}`);
    }
  }
  if (execution.sourcePlan?.planId !== plan.planId) errors.push("execution source plan ID does not match plan");
  if (execution.sourcePlan?.sourceReview !== plan.sourceReview) errors.push("execution source review does not match plan");
  if (execution.sourcePlan?.sha256 !== planSha256) errors.push("execution source plan digest does not match plan");

  const planItems = new Map((plan.items ?? []).map((item) => [item.id, item]));
  const milestones = new Map((plan.milestones ?? []).map((milestone) => [milestone.id, milestone]));
  const selection = execution.selection ?? {};
  let directIds = [];
  if (selection.mode === "all") directIds = [...planItems.keys()];
  else if (selection.mode === "phase") {
    const milestone = milestones.get(selection.value);
    if (!milestone) errors.push(`selected phase '${selection.value}' does not exist`);
    else directIds = milestone.itemIds ?? [];
  } else if (selection.mode === "finding") {
    if (!/^AUD-[0-9]{4,}$/.test(selection.value ?? "")) errors.push("finding selection must be an AUD ID");
    directIds = [...planItems.values()].filter((item) => item.findingIds?.includes(selection.value)).map((item) => item.id);
    if (directIds.length === 0) errors.push(`selected finding '${selection.value}' does not exist in plan`);
  } else if (selection.mode === "resume") {
    directIds = (execution.items ?? []).map((item) => item.id);
    if (!resumeRoot) errors.push("resume validation requires --resume-root");
  } else errors.push(`unsupported execution selection mode '${selection.mode}'`);

  const selected = new Set(directIds);
  const prerequisites = new Set();
  function includePrerequisites(itemId, visiting = new Set()) {
    if (visiting.has(itemId)) {
      errors.push(`execution dependency cycle includes '${itemId}'`);
      return;
    }
    const item = planItems.get(itemId);
    if (!item) {
      errors.push(`selected item '${itemId}' does not exist in plan`);
      return;
    }
    const nextVisiting = new Set(visiting).add(itemId);
    for (const dependencyId of item.dependsOn ?? []) {
      if (!selected.has(dependencyId)) prerequisites.add(dependencyId);
      selected.add(dependencyId);
      includePrerequisites(dependencyId, nextVisiting);
    }
  }
  for (const itemId of directIds) includePrerequisites(itemId);
  if (selection.mode !== "resume" && !sameMembers(selection.includedPrerequisites, prerequisites)) {
    errors.push("included prerequisites do not match selected plan dependencies");
  }

  const executionItems = new Map();
  for (const item of execution.items ?? []) {
    if (executionItems.has(item.id)) errors.push(`execution item '${item.id}' is duplicated`);
    executionItems.set(item.id, item);
  }
  if (!sameMembers(executionItems.keys(), selected)) errors.push("execution items do not match selected scope and prerequisites");

  const checkpoints = new Map();
  for (const checkpoint of execution.checkpoints ?? []) {
    if (checkpoints.has(checkpoint.id)) errors.push(`checkpoint '${checkpoint.id}' is duplicated`);
    checkpoints.set(checkpoint.id, checkpoint);
  }
  const completed = new Set();
  for (const [itemId, item] of executionItems) {
    const planned = planItems.get(itemId);
    if (!planned) continue;
    if (!sameMembers(item.findingIds, planned.findingIds)) errors.push(`item '${itemId}' finding IDs do not match plan`);
    const expectedPhases = (plan.milestones ?? []).filter((milestone) => milestone.itemIds?.includes(itemId)).map((milestone) => milestone.id);
    if (!sameMembers(item.phaseIds, expectedPhases)) errors.push(`item '${itemId}' phase IDs do not match plan`);
    if (item.status === "completed") {
      completed.add(itemId);
      if (!(item.validation?.length > 0) || item.validation.some((check) => check.status !== "passed" || check.exitCode !== 0)) {
        errors.push(`completed item '${itemId}' must have only passing validation with exit code 0`);
      }
      if (!item.checkpointId) errors.push(`completed item '${itemId}' must reference a checkpoint`);
      else if (!checkpoints.get(item.checkpointId)?.completedItemIds?.includes(itemId)) errors.push(`completed item '${itemId}' is absent from its checkpoint`);
    }
  }
  for (const itemId of completed) {
    for (const dependencyId of planItems.get(itemId)?.dependsOn ?? []) {
      if (!completed.has(dependencyId)) errors.push(`completed item '${itemId}' depends on incomplete item '${dependencyId}'`);
    }
  }

  if (execution.status === "completed" && [...selected].some((itemId) => !completed.has(itemId))) {
    errors.push("completed execution contains unresolved selected items");
  }
  const remainingIds = [...planItems.keys()].filter((itemId) => !completed.has(itemId));
  const remainingFindings = [...new Set(remainingIds.flatMap((itemId) => planItems.get(itemId)?.findingIds ?? []))];
  const remainingPhases = (plan.milestones ?? []).filter((milestone) => milestone.itemIds?.some((itemId) => remainingIds.includes(itemId))).map((milestone) => milestone.id);
  if (!sameMembers(execution.remaining?.itemIds, remainingIds)) errors.push("remaining item IDs do not match incomplete plan items");
  if (!sameMembers(execution.remaining?.findingIds, remainingFindings)) errors.push("remaining finding IDs do not match incomplete plan items");
  if (!sameMembers(execution.remaining?.phaseIds, remainingPhases)) errors.push("remaining phase IDs do not match incomplete plan items");

  const finalCheckpoint = execution.checkpoints?.at(-1);
  if (execution.status === "completed") {
    if (finalCheckpoint?.status !== "terminal") errors.push("completed execution must end with a terminal checkpoint");
    if (!sameMembers(finalCheckpoint?.completedItemIds, completed)) errors.push("terminal checkpoint completed items do not match execution");
    if (!sameMembers(finalCheckpoint?.remainingItemIds, remainingIds)) errors.push("terminal checkpoint remaining items do not match plan");
  }
  if (selection.mode === "all" && execution.status === "completed" && execution.pendingApprovals?.length > 0) {
    errors.push("completed all-scope execution cannot have pending approvals");
  }
  if (selection.mode === "resume" && resumeRoot && finalCheckpoint) {
    const currentRevision = git(resumeRoot, "rev-parse", "HEAD");
    if (finalCheckpoint.repositoryRevision !== currentRevision) errors.push("resume repository revision does not match checkpoint");
    if (finalCheckpoint.worktreeDigest !== await worktreeDigest(resumeRoot)) errors.push("resume worktree digest does not match checkpoint");
  }
  if (errors.length) fail(errors);
}

const [command, ...args] = process.argv.slice(2);
let result = { status: "valid", command };
if (command === "findings" && args.length === 1) validateFindings(await loadJson(args[0]));
else if (command === "review" && args.length === 2) {
  const source = await loadJson(args[0]);
  validateFindings(source);
  validateReview(source, await loadJson(args[1]));
}
else if (command === "plan" && args.length === 1) validatePlan(await loadJson(args[0]));
else if (command === "execution" && (args.length === 4 || args.length === 6) && args[2] === "--root" && (args.length === 4 || args[4] === "--resume-root")) {
  const planArtifact = await loadJsonArtifact(args[0]);
  await validateExecution(planArtifact.value, await loadJson(args[1]), args[0], planArtifact.sha256, args[3], args[5]);
} else if (command === "checkpoint" && args.length === 1) {
  result = { status: "valid", command, repositoryRevision: git(args[0], "rev-parse", "HEAD"), worktreeDigest: await worktreeDigest(args[0]) };
} else if (command === "snapshot" && args.length === 2) {
  result = await snapshotPlan(args[0], args[1]);
} else throw new Error("Use findings <report.json>, review <source.json> <review.json>, plan <plan.json>, execution <plan-snapshot.json> <execution.json> --root PATH [--resume-root PATH], checkpoint <repository-root>, or snapshot <canonical-plan.json> <repository-root>");

console.log(JSON.stringify(result));