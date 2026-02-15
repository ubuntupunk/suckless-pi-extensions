/**
 * Core checkpoint functions - shared between hook and tests
 *
 * This module contains all git operations for creating and restoring checkpoints.
 * It has no dependencies on the pi-coding-agent hook system.
 */

import { spawn } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ============================================================================
// Constants & Types
// ============================================================================

export const ZEROS = "0".repeat(40);
export const REF_BASE = "refs/pi-checkpoints";

/** Maximum size for untracked files to be included in snapshot (10 MiB) */
export const MAX_UNTRACKED_FILE_SIZE = 10 * 1024 * 1024; // 10 MiB

/** Maximum number of files in an untracked directory to be included in snapshot */
export const MAX_UNTRACKED_DIR_FILES = 200;

/**
 * Directories to exclude from checkpoint snapshots.
 */
export const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  ".venv",
  "venv",
  "env",
  ".env",
  "dist",
  "build",
  ".pytest_cache",
  ".mypy_cache",
  ".cache",
  ".tox",
  "__pycache__",
]);

export interface CheckpointData {
  id: string;
  turnIndex: number;
  sessionId: string;
  headSha: string;
  indexTreeSha: string;
  worktreeTreeSha: string;
  timestamp: number;
  preexistingUntrackedFiles?: string[];
  skippedLargeFiles?: string[];
  skippedLargeDirs?: string[];
}

// ============================================================================
// Git helpers
// ============================================================================

function parseArgs(cmd: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];
    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
    } else if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
    } else if (char === " " && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) args.push(current);
  return args;
}

export function git(
  cmd: string,
  cwd: string,
  opts: { env?: NodeJS.ProcessEnv; input?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = parseArgs(cmd);
    const proc = spawn("git", args, {
      cwd,
      env: opts.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data;
    });
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `git ${cmd} failed with code ${code}`));
    });

    proc.on("error", reject);

    if (opts.input && proc.stdin) {
      proc.stdin.write(opts.input);
      proc.stdin.end();
    } else if (proc.stdin) {
      proc.stdin.end();
    }
  });
}

export function gitLowPriority(cmd: string, cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = parseArgs(cmd);
    const proc = spawn("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data;
    });
    proc.stderr.on("data", (data) => {
      stderr += data;
    });

    proc.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(stderr || `git ${cmd} failed with code ${code}`));
    });

    proc.on("error", reject);
  });
}

export const isGitRepo = (cwd: string) =>
  git("rev-parse --is-inside-work-tree", cwd)
    .then(() => true)
    .catch(() => false);

export const getRepoRoot = (cwd: string) =>
  git("rev-parse --show-toplevel", cwd);

// ============================================================================
// Path filtering
// ============================================================================

export function shouldIgnoreForSnapshot(path: string): boolean {
  const components = path.split(/[/\\]/);
  return components.some((component) => IGNORED_DIR_NAMES.has(component));
}

function countFilesInDirectory(dirPath: string, maxCount: number): number {
  let count = 0;
  function countRecursive(currentPath: string): void {
    if (count > maxCount) return;
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        if (count > maxCount) return;
        const fullPath = join(currentPath, entry.name);
        if (entry.isDirectory()) countRecursive(fullPath);
        else if (entry.isFile()) count++;
      }
    } catch {
      /* ignore */
    }
  }
  countRecursive(dirPath);
  return count;
}

function normalizeGitPath(path: string): string {
  let normalized = path.replace(/\\/g, "/");
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  return normalized.replace(/\/$/, "");
}

function isPathWithinDir(path: string, dir: string): boolean {
  if (!dir || dir === ".") return true;
  if (path === dir) return true;
  return path.startsWith(dir.endsWith("/") ? dir : `${dir}/`);
}

function isPathWithinAnyDir(path: string, dirs: Set<string>): boolean {
  for (const dir of dirs) if (isPathWithinDir(path, dir)) return true;
  return false;
}

function _isPathAncestorOfAnyDir(path: string, dirs: Set<string>): boolean {
  for (const dir of dirs) if (isPathWithinDir(dir, path)) return true;
  return false;
}

function extractStatusPathAfterFields(
  record: string,
  fieldsBeforePath: number,
): string | null {
  if (fieldsBeforePath <= 0) return null;
  let spaces = 0;
  for (let i = 0; i < record.length; i++) {
    if (record[i] === " ") {
      spaces++;
      if (spaces === fieldsBeforePath) {
        const path = record.slice(i + 1);
        return path.length > 0 ? path : null;
      }
    }
  }
  return null;
}

interface StatusSnapshot {
  trackedPaths: string[];
  untrackedFiles: string[];
  untrackedFilesForIndex: string[];
  untrackedFilesForDirScan: string[];
  untrackedDirs: string[];
  skippedLargeFiles: string[];
}

async function captureStatusSnapshot(root: string): Promise<StatusSnapshot> {
  const snapshot: StatusSnapshot = {
    trackedPaths: [],
    untrackedFiles: [],
    untrackedFilesForIndex: [],
    untrackedFilesForDirScan: [],
    untrackedDirs: [],
    skippedLargeFiles: [],
  };

  const output = await git(
    "status --porcelain=2 -z --untracked-files=all",
    root,
  ).catch(() => "");
  if (!output) return snapshot;

  const entries = output.split("\0").filter(Boolean);
  let expectRenameSource = false;

  for (const entry of entries) {
    if (expectRenameSource) {
      const normalized = normalizeGitPath(entry);
      if (normalized) snapshot.trackedPaths.push(normalized);
      expectRenameSource = false;
      continue;
    }

    const recordType = entry[0];
    switch (recordType) {
      case "?":
      case "!": {
        const spaceIndex = entry.indexOf(" ");
        if (spaceIndex === -1) break;
        const rawPath = entry.slice(spaceIndex + 1);
        if (!rawPath) break;
        const normalized = normalizeGitPath(rawPath);
        if (!normalized) break;
        if (shouldIgnoreForSnapshot(normalized)) break;

        const fullPath = join(root, normalized);
        let stats: ReturnType<typeof statSync> | null;
        try {
          stats = statSync(fullPath);
        } catch {
          stats = null;
        }

        if (stats?.isDirectory()) {
          snapshot.untrackedDirs.push(normalized);
          break;
        }

        snapshot.untrackedFiles.push(normalized);
        snapshot.untrackedFilesForDirScan.push(normalized);

        const isLarge = stats?.isFile()
          ? stats.size > MAX_UNTRACKED_FILE_SIZE
          : false;
        if (isLarge) snapshot.skippedLargeFiles.push(normalized);
        else snapshot.untrackedFilesForIndex.push(normalized);
        break;
      }
      case "1": {
        const path = extractStatusPathAfterFields(entry, 8);
        if (path) snapshot.trackedPaths.push(normalizeGitPath(path));
        break;
      }
      case "2": {
        const path = extractStatusPathAfterFields(entry, 9);
        if (path) snapshot.trackedPaths.push(normalizeGitPath(path));
        expectRenameSource = true;
        break;
      }
      case "u": {
        const path = extractStatusPathAfterFields(entry, 10);
        if (path) snapshot.trackedPaths.push(normalizeGitPath(path));
        break;
      }
    }
  }
  return snapshot;
}

async function getFilesToAdd(root: string): Promise<{
  filtered: string[];
  allUntracked: string[];
  skippedLargeFiles: string[];
  skippedLargeDirs: string[];
}> {
  const status = await captureStatusSnapshot(root);
  const skippedLargeDirs: string[] = [];
  const skippedLargeDirsSet = new Set<string>();

  for (const dir of status.untrackedDirs) {
    if (
      countFilesInDirectory(join(root, dir), MAX_UNTRACKED_DIR_FILES) >=
      MAX_UNTRACKED_DIR_FILES
    ) {
      skippedLargeDirs.push(dir);
      skippedLargeDirsSet.add(dir);
    }
  }

  const untrackedFilesForIndex = status.untrackedFilesForIndex.filter(
    (path) => !isPathWithinAnyDir(path, skippedLargeDirsSet),
  );
  const skippedLargeFiles = status.skippedLargeFiles.filter(
    (path) => !isPathWithinAnyDir(path, skippedLargeDirsSet),
  );

  const filesToAddSet = new Set<string>(status.trackedPaths);
  for (const path of untrackedFilesForIndex) {
    filesToAddSet.add(path);
  }

  return {
    filtered: [...filesToAddSet],
    allUntracked: status.untrackedFiles,
    skippedLargeFiles,
    skippedLargeDirs,
  };
}

// ============================================================================
// Checkpoint operations
// ============================================================================

export async function createCheckpoint(
  root: string,
  id: string,
  turnIndex: number,
  sessionId: string,
): Promise<CheckpointData> {
  const headSha = await git("rev-parse HEAD", root).catch(() => ZEROS);
  const indexTreeSha = await git("write-tree", root);

  const tmpD = await mkdtemp(join(tmpdir(), "pi-checkpoint-"));
  const tmpIndex = join(tmpD, "index");

  try {
    const tmpEnv = { ...process.env, GIT_INDEX_FILE: tmpIndex };
    const {
      filtered: filesToAdd,
      allUntracked,
      skippedLargeFiles,
      skippedLargeDirs,
    } = await getFilesToAdd(root);

    const skippedLargeDirsSet = new Set(skippedLargeDirs);
    const skippedLargeFilesSet = new Set(skippedLargeFiles);
    const preexistingUntrackedFiles = allUntracked.filter((f) => {
      if (shouldIgnoreForSnapshot(f)) return false;
      if (skippedLargeFilesSet.has(f)) return false;
      if (isPathWithinAnyDir(f, skippedLargeDirsSet)) return false;
      return true;
    });

    if (headSha !== ZEROS)
      await git(`read-tree ${headSha}`, root, { env: tmpEnv });

    if (filesToAdd.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < filesToAdd.length; i += BATCH_SIZE) {
        const batch = filesToAdd.slice(i, i + BATCH_SIZE);
        const pathArgs = batch.map((f) => `"${f}"`).join(" ");
        await git(`add --all -- ${pathArgs}`, root, { env: tmpEnv });
      }
    }

    const worktreeTreeSha = await git("write-tree", root, { env: tmpEnv });
    const isoTimestamp = new Date().toISOString();
    const message = [
      `checkpoint:${id}`,
      `sessionId ${sessionId}`,
      `turn ${turnIndex}`,
      `head ${headSha}`,
      `index-tree ${indexTreeSha}`,
      `worktree-tree ${worktreeTreeSha}`,
      `created ${isoTimestamp}`,
      `untracked ${JSON.stringify(preexistingUntrackedFiles)}`,
      `largeFiles ${JSON.stringify(skippedLargeFiles)}`,
      `largeDirs ${JSON.stringify(skippedLargeDirs)}`,
    ].join("\n");

    const commitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "pi-checkpoint",
      GIT_AUTHOR_EMAIL: "checkpoint@pi",
      GIT_AUTHOR_DATE: isoTimestamp,
      GIT_COMMITTER_NAME: "pi-checkpoint",
      GIT_COMMITTER_EMAIL: "checkpoint@pi",
      GIT_COMMITTER_DATE: isoTimestamp,
    };

    const commitSha = await git(`commit-tree ${worktreeTreeSha}`, root, {
      input: message,
      env: commitEnv,
    });
    await git(`update-ref ${REF_BASE}/${id} ${commitSha}`, root);

    return {
      id,
      turnIndex,
      sessionId,
      headSha,
      indexTreeSha,
      worktreeTreeSha,
      timestamp: Date.now(),
      preexistingUntrackedFiles,
      skippedLargeFiles,
      skippedLargeDirs,
    };
  } finally {
    await rm(tmpD, { recursive: true, force: true }).catch(() => {});
  }
}

export async function restoreCheckpoint(
  root: string,
  cp: CheckpointData,
): Promise<void> {
  if (cp.headSha !== ZEROS) await git(`reset --hard ${cp.headSha}`, root);
  await git(`read-tree --reset -u ${cp.worktreeTreeSha}`, root);
  const currentUntracked = await git(
    "ls-files --others --exclude-standard",
    root,
  )
    .then((o) => (o ? o.split("\n").filter(Boolean) : []))
    .catch(() => []);
  if (currentUntracked.length > 0) {
    const preexistingSet = new Set(cp.preexistingUntrackedFiles || []);
    const skippedLargeFilesSet = new Set(cp.skippedLargeFiles || []);
    const skippedLargeDirsSet = new Set(cp.skippedLargeDirs || []);
    const filesToRemove = currentUntracked.filter(
      (f) =>
        !preexistingSet.has(f) &&
        !shouldIgnoreForSnapshot(f) &&
        !skippedLargeFilesSet.has(f) &&
        !isPathWithinAnyDir(f, skippedLargeDirsSet),
    );
    if (filesToRemove.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < filesToRemove.length; i += BATCH_SIZE) {
        const batch = filesToRemove.slice(i, i + BATCH_SIZE);
        const pathArgs = batch.map((f) => `"${f}"`).join(" ");
        await git(`clean -f -- ${pathArgs}`, root).catch(() => {});
      }
    }
  }
  await git(`read-tree --reset ${cp.indexTreeSha}`, root);
}

export async function loadCheckpointFromRef(
  root: string,
  refName: string,
): Promise<CheckpointData | null> {
  try {
    const commitSha = await git(
      `rev-parse --verify ${REF_BASE}/${refName}`,
      root,
    );
    const commitMsg = await git(`cat-file commit ${commitSha}`, root);
    const get = (key: string) =>
      commitMsg.match(new RegExp(`^${key} (.+)$`, "m"))?.[1]?.trim();
    const sessionId = get("sessionId"),
      turn = get("turn"),
      head = get("head"),
      index = get("index-tree"),
      worktree = get("worktree-tree"),
      created = get("created");
    if (!sessionId || !turn || !head || !index || !worktree) return null;
    return {
      id: refName,
      turnIndex: parseInt(turn, 10),
      sessionId,
      headSha: head,
      indexTreeSha: index,
      worktreeTreeSha: worktree,
      timestamp: created ? new Date(created).getTime() : 0,
      preexistingUntrackedFiles: JSON.parse(get("untracked") || "[]"),
      skippedLargeFiles: JSON.parse(get("largeFiles") || "[]"),
      skippedLargeDirs: JSON.parse(get("largeDirs") || "[]"),
    };
  } catch {
    return null;
  }
}

export async function listCheckpointRefs(root: string): Promise<string[]> {
  try {
    const stdout = await git(
      `for-each-ref --format="%(refname)" ${REF_BASE}/`,
      root,
    );
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((ref) => ref.replace(`${REF_BASE}/`, ""));
  } catch {
    return [];
  }
}
