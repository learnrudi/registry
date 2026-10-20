import path from "node:path";
import { randomUUID } from "node:crypto";

export function createEnrollmentOperations(dependencies) {
  const {
    assertAllowedKeys, requireOwner, nonEmptyString, requireDirectoryRealpath,
    requireRepositoryId, optionalBoolean, boundedInteger, defaultStateRoot,
    withEnrollmentLock, loadConfigurationSources, pathsOverlap, enrollmentPaths,
    ensureStateDirectory, atomicWriteJson, discoverRepositories, publicRoot,
    requireExpectedVersion, boundedSafeText, CONFIG_SCHEMA_VERSION,
    DEFAULT_DISCOVERY_DEPTH, MAX_DISCOVERY_DEPTH, MAX_ENROLLMENT_HISTORY
  } = dependencies;

  function defaultRootId(rootPath) {
    const candidate = path.basename(rootPath)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "workspace";
    return requireRepositoryId(candidate, "root_id");
  }

  async function enrollRepositoryRoot(args = {}, options = {}) {
    assertAllowedKeys(args, "arguments", [
      "root_id",
      "root_path",
      "owner",
      "fetch_allowed",
      "max_depth",
    ]);
    const owner = requireOwner(args.owner);
    const rootPathInput = nonEmptyString(args.root_path, "root_path", 4096);
    if (!path.isAbsolute(rootPathInput)) throw new Error("root_path must be absolute.");
    const rootPath = await requireDirectoryRealpath(rootPathInput, "root_path");
    const rootId = args.root_id === undefined
      ? defaultRootId(rootPath)
      : requireRepositoryId(args.root_id, "root_id");
    const root = {
      id: rootId,
      path: rootPath,
      fetchAllowed: optionalBoolean(args.fetch_allowed, "fetch_allowed"),
      maxDepth: boundedInteger(args.max_depth, "max_depth", {
        defaultValue: DEFAULT_DISCOVERY_DEPTH,
        min: 0,
        max: MAX_DISCOVERY_DEPTH,
      }),
      source: "enrollment",
    };
    const stateRoot = defaultStateRoot(options);

    const enrollmentResult = await withEnrollmentLock(stateRoot, owner, async () => {
      const sources = await loadConfigurationSources(options);
      const existingByPath = sources.roots.find((candidate) => candidate.path === root.path);
      if (existingByPath) {
        const samePolicy =
          existingByPath.id === root.id &&
          existingByPath.fetchAllowed === root.fetchAllowed &&
          existingByPath.maxDepth === root.maxDepth;
        if (!samePolicy) {
          throw new Error(`Root ${root.path} is already enrolled with different policy.`);
        }
        return {
          enrollmentVersion: sources.enrollment.version,
          idempotent: true,
          root: existingByPath,
        };
      }
      const existingById = sources.roots.find((candidate) => candidate.id === root.id);
      if (existingById) {
        throw new Error(`Root ID already belongs to another path: ${root.id}.`);
      }
      const overlapping = sources.roots.find((candidate) => pathsOverlap(candidate.path, root.path));
      if (overlapping) {
        const label = overlapping.source === "enrollment" ? "enrolled" : "configured";
        throw new Error(`Root ${root.id} overlaps ${label} root ${overlapping.id}.`);
      }

      const current = sources.enrollment;
      const now = new Date(
        typeof options.now === "function" ? options.now() : Date.now()
      ).toISOString();
      const version = current.version + 1;
      const next = {
        schema_version: CONFIG_SCHEMA_VERSION,
        version,
        roots: [...current.roots, {
          root_id: root.id,
          path: root.path,
          fetch_allowed: root.fetchAllowed,
          max_depth: root.maxDepth,
        }],
        history: [...current.history, {
          version,
          event: "root_enrolled",
          owner,
          root_id: root.id,
          path: root.path,
          at: now,
        }].slice(-MAX_ENROLLMENT_HISTORY),
      };
      await saveEnrollment(stateRoot, current, next);
      return { enrollmentVersion: version, idempotent: false, root };
    }, options);

    const discovery = await discoverRepositories({ root_ids: [rootId] }, options);
    return {
      enrollment_version: enrollmentResult.enrollmentVersion,
      idempotent: enrollmentResult.idempotent,
      root: publicRoot(enrollmentResult.root),
      discovery,
    };
  }

  async function saveEnrollment(stateRoot, current, next) {
    const paths = enrollmentPaths(stateRoot);
    if (current.version > 0) {
      await ensureStateDirectory(paths.history);
      await atomicWriteJson(
        path.join(paths.history, `enrollment-v${current.version}-${Date.now()}-${randomUUID()}.json`),
        current
      );
    }
    await atomicWriteJson(paths.active, next);
  }

  async function updateRootPolicy(args = {}, options = {}) {
    assertAllowedKeys(args, "arguments", ["root_id", "root_path", "owner",
      "fetch_allowed", "expected_version", "approval_reference", "confirm_update"]);
    if (args.confirm_update !== true) throw new Error("confirm_update must be true.");
    if (typeof args.fetch_allowed !== "boolean") throw new Error("fetch_allowed must be an explicit boolean.");
    const owner = requireOwner(args.owner);
    const rootId = requireRepositoryId(args.root_id, "root_id");
    const rootPath = await requireDirectoryRealpath(args.root_path, "root_path");
    const expected = requireExpectedVersion(args.expected_version);
    if (expected === null || expected < 1) throw new Error("expected_version must be a positive enrollment version.");
    const approval = boundedSafeText(args.approval_reference, "approval_reference", 1000);
    const stateRoot = defaultStateRoot(options);
    return withEnrollmentLock(stateRoot, owner, async () => {
      const sources = await loadConfigurationSources(options);
      const root = sources.roots.find((candidate) => candidate.id === rootId);
      if (!root || root.path !== rootPath) throw new Error("Enrolled root identity does not match root_id and root_path.");
      if (root.source !== "enrollment") throw new Error("Policy updates require a locally enrolled root; external configuration is read-only.");
      const current = sources.enrollment;
      const last = current.history.at(-1);
      const exactRetry = current.version === expected + 1 &&
        last?.version === current.version && last.event === "root_policy_updated" &&
        last.owner === owner && last.root_id === rootId && last.path === rootPath &&
        last.fetch_allowed === args.fetch_allowed && last.approval_reference === approval &&
        root.fetchAllowed === args.fetch_allowed;
      if (exactRetry) {
        return { enrollment_version: current.version, idempotent: true, root: publicRoot(root) };
      }
      if (current.version !== expected) throw new Error(`Enrollment version conflict: expected ${expected}, current ${current.version}.`);
      if (root.fetchAllowed === args.fetch_allowed) {
        return { enrollment_version: current.version, idempotent: true, root: publicRoot(root) };
      }
      if (current.version === Number.MAX_SAFE_INTEGER) throw new Error("Enrollment version is exhausted.");
      const version = current.version + 1;
      const next = {
        ...current,
        version,
        roots: current.roots.map((r) => r.root_id === rootId ? { ...r, fetch_allowed: args.fetch_allowed } : r),
        history: [...current.history, {
          version, event: "root_policy_updated", owner, root_id: rootId, path: rootPath,
          previous_fetch_allowed: root.fetchAllowed, fetch_allowed: args.fetch_allowed,
          approval_reference: approval,
          at: new Date(typeof options.now === "function" ? options.now() : Date.now()).toISOString(),
        }].slice(-MAX_ENROLLMENT_HISTORY),
      };
      await saveEnrollment(stateRoot, current, next);
      return { enrollment_version: version, idempotent: false,
        root: publicRoot({ ...root, fetchAllowed: args.fetch_allowed }) };
    }, options);
  }

  return { enrollRepositoryRoot, updateRootPolicy };
}
