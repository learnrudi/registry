import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";

const execFileAsync = promisify(execFile);

export type IssueSeverity = "error" | "warning";

export interface PublicReadinessIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  path?: string;
  details?: Record<string, unknown>;
}

export interface PublicReadinessReport {
  root: string;
  summary: {
    errors: number;
    warnings: number;
    referencedPackages: number;
  };
  issues: PublicReadinessIssue[];
}

export interface PublicReadinessOptions {
  trackedFiles?: Set<string>;
}

interface RegistryPackageRef {
  id: string;
  kind: string;
  path?: string;
  section: string;
  bucket: string;
}

const ZERO_SHA256 = /^0{64}$/;
const REQUIRED_PUBLIC_CATALOG_DIRS = [
  "catalog/stacks",
  "catalog/skills",
  "catalog/workflows",
];

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function relPath(root: string, filePath: string): string {
  return toPosixPath(path.relative(root, filePath));
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function getTrackedFiles(root: string): Promise<Set<string>> {
  const result = await execFileAsync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  }) as { stdout: string };

  return new Set(
    result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  );
}

function issue(
  severity: IssueSeverity,
  code: string,
  message: string,
  filePath?: string,
  details?: Record<string, unknown>
): PublicReadinessIssue {
  return {
    severity,
    code,
    message,
    ...(filePath ? { path: filePath } : {}),
    ...(details ? { details } : {}),
  };
}

function kindFromSection(section: string): string {
  const singulars: Record<string, string> = {
    agents: "agent",
    binaries: "binary",
    prompts: "prompt",
    runtimes: "runtime",
    skills: "skill",
    stacks: "stack",
    workflows: "workflow",
  };
  return singulars[section] ?? section.replace(/s$/, "");
}

function collectPackageRefs(index: unknown): RegistryPackageRef[] {
  if (!index || typeof index !== "object") return [];
  const packages = (index as { packages?: unknown }).packages;
  if (!packages || typeof packages !== "object") return [];

  const refs: RegistryPackageRef[] = [];
  for (const [section, value] of Object.entries(packages as Record<string, unknown>)) {
    const kind = kindFromSection(section);

    if (Array.isArray(value)) {
      refs.push(...collectBucketRefs(value, kind, section, "root"));
      continue;
    }

    if (!value || typeof value !== "object") continue;
    for (const [bucket, entries] of Object.entries(value as Record<string, unknown>)) {
      if (!Array.isArray(entries)) continue;
      refs.push(...collectBucketRefs(entries, kind, section, bucket));
    }
  }

  return refs;
}

function collectBucketRefs(
  entries: unknown[],
  kind: string,
  section: string,
  bucket: string
): RegistryPackageRef[] {
  return entries
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      kind,
      path: typeof entry.path === "string" ? entry.path : undefined,
      section,
      bucket,
    }));
}

function hasTrackedPayload(trackedFiles: Set<string>, registryPath: string): boolean {
  return trackedFiles.has(registryPath) || [...trackedFiles].some((file) => file.startsWith(`${registryPath}/`));
}

async function validatePackageJson(root: string, issues: PublicReadinessIssue[]): Promise<void> {
  const packageJsonPath = path.join(root, "package.json");
  const packageJson = await readJsonFile(packageJsonPath) as { files?: unknown };

  if (!Array.isArray(packageJson.files) || packageJson.files.length === 0) {
    issues.push(issue(
      "error",
      "package-allowlist-missing",
      "package.json must define a publish allowlist in files[] before public npm packaging.",
      "package.json"
    ));
  }
}

async function validateRequiredCatalogDirs(root: string, issues: PublicReadinessIssue[]): Promise<void> {
  for (const dir of REQUIRED_PUBLIC_CATALOG_DIRS) {
    if (!(await pathExists(path.join(root, dir)))) {
      issues.push(issue(
        "error",
        "catalog-dir-missing",
        `Required public catalog directory is missing: ${dir}`,
        dir
      ));
    }
  }
}

async function validateIndexRefs(
  root: string,
  refs: RegistryPackageRef[],
  trackedFiles: Set<string>,
  issues: PublicReadinessIssue[]
): Promise<void> {
  const seenIds = new Set<string>();

  for (const ref of refs) {
    if (!ref.id) {
      issues.push(issue(
        "error",
        "index-package-id-missing",
        `Registry package in ${ref.section}.${ref.bucket} is missing an id.`
      ));
      continue;
    }

    if (seenIds.has(ref.id)) {
      issues.push(issue(
        "error",
        "index-package-id-duplicate",
        `Registry package id is duplicated: ${ref.id}`,
        undefined,
        { id: ref.id }
      ));
    }
    seenIds.add(ref.id);

    if (!ref.id.startsWith(`${ref.kind}:`)) {
      issues.push(issue(
        "error",
        "index-package-kind-mismatch",
        `Package id ${ref.id} does not match index section kind ${ref.kind}.`,
        undefined,
        { id: ref.id, section: ref.section }
      ));
    }

    if (!ref.path) continue;

    const absolutePath = path.join(root, ref.path);
    if (!(await pathExists(absolutePath))) {
      issues.push(issue(
        "error",
        "index-path-missing",
        `Registry index references a path that does not exist: ${ref.path}`,
        ref.path,
        { id: ref.id }
      ));
      continue;
    }

    if (!hasTrackedPayload(trackedFiles, ref.path)) {
      issues.push(issue(
        "error",
        "index-path-untracked",
        `Registry index references a path with no tracked files: ${ref.path}`,
        ref.path,
        { id: ref.id }
      ));
    }
  }
}

function isChecksumLike(pointer: string): boolean {
  const lower = pointer.toLowerCase();
  return lower.includes("sha256") || lower.includes("checksum");
}

function scanPlaceholderChecksums(
  value: unknown,
  filePath: string,
  pointer: string,
  issues: PublicReadinessIssue[]
): void {
  if (typeof value === "string") {
    if (ZERO_SHA256.test(value) && isChecksumLike(pointer)) {
      issues.push(issue(
        "error",
        "checksum-placeholder",
        "Catalog manifest contains an all-zero sha256 placeholder.",
        filePath,
        { pointer }
      ));
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      scanPlaceholderChecksums(item, filePath, `${pointer}/${index}`, issues);
    });
    return;
  }

  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    scanPlaceholderChecksums(child, filePath, `${pointer}/${key}`, issues);
  }
}

async function validateNoPlaceholderChecksums(root: string, issues: PublicReadinessIssue[]): Promise<void> {
  const files = await fg(["catalog/**/*.json"], {
    cwd: root,
    dot: false,
    onlyFiles: true,
    ignore: ["**/node_modules/**"],
  });

  for (const file of files.sort()) {
    try {
      const parsed = await readJsonFile(path.join(root, file));
      scanPlaceholderChecksums(parsed, file, "", issues);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push(issue(
        "error",
        "catalog-json-invalid",
        `Catalog JSON could not be parsed: ${message}`,
        file
      ));
    }
  }
}

function isForbiddenSecretFile(filePath: string): boolean {
  const base = path.basename(filePath).toLowerCase();
  if (base === ".env.example") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (["credentials.json", "token.json", "state.json", "secrets.json"].includes(base)) return true;
  if (/^client_secret.*\.json$/.test(base)) return true;
  return /\.(pem|key|p12|pfx)$/.test(base);
}

async function validateNoSecretLikeFiles(root: string, issues: PublicReadinessIssue[]): Promise<void> {
  const files = await fg(["catalog/**/*"], {
    cwd: root,
    dot: true,
    onlyFiles: true,
    ignore: ["**/node_modules/**"],
  });

  for (const file of files.sort()) {
    if (!isForbiddenSecretFile(file)) continue;
    issues.push(issue(
      "error",
      "secret-like-file",
      "Catalog contains a secret-like file name that must not be published.",
      file
    ));
  }
}

async function validatePromptDeprecation(root: string, issues: PublicReadinessIssue[]): Promise<void> {
  const promptCatalog = path.join(root, "catalog/prompts");
  if (!(await pathExists(promptCatalog))) return;

  issues.push(issue(
    "warning",
    "prompt-catalog-present",
    "catalog/prompts is still present. Keep prompt support as a compatibility alias and migrate public entries to catalog/skills.",
    relPath(root, promptCatalog)
  ));
}

export async function validatePublicReadiness(
  root = process.cwd(),
  options: PublicReadinessOptions = {}
): Promise<PublicReadinessReport> {
  const absoluteRoot = path.resolve(root);
  const issues: PublicReadinessIssue[] = [];
  const trackedFiles = options.trackedFiles ?? await getTrackedFiles(absoluteRoot);

  await validatePackageJson(absoluteRoot, issues);
  await validateRequiredCatalogDirs(absoluteRoot, issues);

  const indexPath = path.join(absoluteRoot, "index.json");
  let refs: RegistryPackageRef[] = [];
  try {
    const index = await readJsonFile(indexPath);
    refs = collectPackageRefs(index);
    await validateIndexRefs(absoluteRoot, refs, trackedFiles, issues);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    issues.push(issue(
      "error",
      "index-json-invalid",
      `Root index.json could not be parsed: ${message}`,
      "index.json"
    ));
  }

  await validateNoPlaceholderChecksums(absoluteRoot, issues);
  await validateNoSecretLikeFiles(absoluteRoot, issues);
  await validatePromptDeprecation(absoluteRoot, issues);

  const errors = issues.filter((item) => item.severity === "error").length;
  const warnings = issues.filter((item) => item.severity === "warning").length;

  return {
    root: absoluteRoot,
    summary: {
      errors,
      warnings,
      referencedPackages: refs.length,
    },
    issues,
  };
}

function printReport(report: PublicReadinessReport): void {
  console.log("RUDI registry public-readiness validation");
  console.log(`Root: ${report.root}`);
  console.log(`Referenced packages: ${report.summary.referencedPackages}`);
  console.log(`Errors: ${report.summary.errors}`);
  console.log(`Warnings: ${report.summary.warnings}`);

  if (report.issues.length === 0) {
    console.log("\nNo public-readiness issues found.");
    return;
  }

  console.log("");
  for (const item of report.issues) {
    const location = item.path ? ` ${item.path}` : "";
    console.log(`[${item.severity}] ${item.code}${location}`);
    console.log(`  ${item.message}`);
    if (item.details) {
      console.log(`  ${JSON.stringify(item.details)}`);
    }
  }
}

async function main(): Promise<void> {
  const json = process.argv.includes("--json");
  const report = await validatePublicReadiness(process.cwd());

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  process.exit(report.summary.errors > 0 ? 1 : 0);
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}
