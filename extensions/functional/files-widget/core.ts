import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, statSync, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";

// ============================================================================
// CONSTANTS
// ============================================================================

export const POLL_INTERVAL_MS = 2000;
export const SCAN_BATCH_SIZE = 10;
export const SCAN_BATCH_DELAY_MS = 50;
export const LINE_COUNT_BATCH_SIZE = 50;
export const LINE_COUNT_BATCH_DELAY_MS = 100;
export const MAX_TREE_DEPTH = 5;
export const MAX_BROWSER_HEIGHT = 40;
export const DEFAULT_BROWSER_HEIGHT = 20;
export const MAX_VIEWER_HEIGHT = 100;
export const DEFAULT_VIEWER_HEIGHT = 40;
export const MIN_PANEL_HEIGHT = 10;
export const VIEWER_SCROLL_MARGIN = 5;
export const SEARCH_SCROLL_OFFSET = 5;
export const MAX_LINE_COUNT_BYTES = 500000; // 500KB
export const SAFE_MODE_ENTRY_THRESHOLD = 500;

// ============================================================================
// TYPES
// ============================================================================

export interface DiffStats {
  additions: number;
  deletions: number;
}

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
  expanded?: boolean;
  loading?: boolean;
  gitStatus?: string;
  agentModified?: boolean;
  diffStats?: DiffStats;
  lineCount?: number;
  totalLines?: number;
  totalAdditions?: number;
  totalDeletions?: number;
  lineCountComplete?: boolean;
  hasChangedChildren?: boolean;
}

export interface FlatNode {
  node: FileNode;
  depth: number;
}

export interface CommentPayload {
  relPath: string;
  lineRange: string;
  ext: string;
  selectedText: string;
}

// ============================================================================
// UTILS
// ============================================================================

export function hasCommand(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function isUntrackedStatus(status?: string): boolean {
  return status === "?" || status === "??";
}

export function isIgnoredStatus(status?: string): boolean {
  return status === "!" || status === "!!";
}

export function stripLeadingEmptyLines(lines: string[]): string[] {
  let startIdx = 0;
  while (startIdx < lines.length && !lines[startIdx].trim()) startIdx++;
  return lines.slice(startIdx);
}

export function isPrintableChar(data: string): boolean {
  return data.length === 1 && data >= " " && data <= "~";
}

// ============================================================================
// GIT
// ============================================================================

export function isGitRepo(cwd: string): boolean {
  try {
    execSync("git rev-parse --is-inside-work-tree", { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function getGitFileList(cwd: string): string[] {
  try {
    const output = execSync("git ls-files", { cwd, encoding: "utf-8", stdio: "pipe" });
    return output.trim().split("\n");
  } catch {
    return [];
  }
}

export function getGitStatus(cwd: string): Map<string, string> {
  const status = new Map<string, string>();
  try {
    const output = execSync("git status --porcelain", { cwd, encoding: "utf-8", stdio: "pipe" });
    const lines = output.trim().split("\n");
    for (const line of lines) {
      if (line.length < 4) continue;
      const s = line.slice(0, 2).trim();
      const path = line.slice(3).trim();
      status.set(path, s);
    }
  } catch {}
  return status;
}

export function getGitDiffStats(cwd: string): Map<string, DiffStats> {
  const stats = new Map<string, DiffStats>();
  try {
    const output = execSync("git diff --numstat", { cwd, encoding: "utf-8", stdio: "pipe" });
    const lines = output.trim().split("\n");
    for (const line of lines) {
      const [add, del, path] = line.split("\t");
      if (add && del && path) {
        stats.set(path, { additions: parseInt(add, 10) || 0, deletions: parseInt(del, 10) || 0 });
      }
    }
  } catch {}
  return stats;
}

export function getGitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", { cwd, encoding: "utf-8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

// ============================================================================
// FILE TREE
// ============================================================================

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

function compareNodes(a: FileNode, b: FileNode): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  return collator.compare(a.name, b.name);
}

export function sortChildren(node: FileNode): void {
  if (node.children?.length) node.children.sort(compareNodes);
}

export function updateTreeStats(root: FileNode | null): void {
  if (!root) return;
  function traverse(node: FileNode) {
    if (!node.isDirectory) {
      return { 
        totalLines: node.lineCount ?? 0, 
        totalAdditions: node.diffStats?.additions ?? 0, 
        totalDeletions: node.diffStats?.deletions ?? 0, 
        lineCountComplete: node.lineCount !== undefined, 
        hasChanges: Boolean(node.gitStatus || node.agentModified) 
      };
    }
    let totalLines = 0, totalAdditions = 0, totalDeletions = 0, lineCountComplete = true, hasChanges = false;
    if (node.children) {
      for (const child of node.children) {
        const stats = traverse(child);
        totalLines += stats.totalLines;
        totalAdditions += stats.totalAdditions;
        totalDeletions += stats.totalDeletions;
        if (!stats.lineCountComplete) lineCountComplete = false;
        if (stats.hasChanges) hasChanges = true;
      }
    }
    node.totalLines = totalLines;
    node.totalAdditions = totalAdditions;
    node.totalDeletions = totalDeletions;
    node.lineCountComplete = lineCountComplete;
    node.hasChangedChildren = hasChanges;
    return { totalLines, totalAdditions, totalDeletions, lineCountComplete, hasChanges };
  }
  traverse(root);
}

export function buildFileTreeFromPaths(
  cwd: string,
  filePaths: string[],
  gitStatus: Map<string, string>,
  diffStats: Map<string, DiffStats>,
  ignored: Set<string>,
  agentModified: Set<string>
): FileNode {
  const root: FileNode = { name: ".", path: cwd, isDirectory: true, children: [], expanded: true, hasChangedChildren: false };
  const directoryMap = new Map<string, FileNode>();
  directoryMap.set("", root);
  const seenFiles = new Set<string>();

  for (const rawPath of filePaths) {
    let normalized = rawPath.trim();
    if (!normalized) continue;
    if (normalized.startsWith("./")) normalized = normalized.slice(2);
    normalized = normalized.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0 || parts.length - 1 > MAX_TREE_DEPTH) continue;

    let current = root, relPath = "", skip = false;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (ignored.has(part) || part.startsWith(".")) { skip = true; break; }
      relPath = relPath ? `${relPath}/${part}` : part;
      let dirNode = directoryMap.get(relPath);
      if (!dirNode) {
        dirNode = { name: part, path: join(cwd, relPath), isDirectory: true, children: [], expanded: i + 1 < 1, hasChangedChildren: false };
        directoryMap.set(relPath, dirNode);
        current.children?.push(dirNode);
      }
      current = dirNode;
    }
    if (skip) continue;

    const fileName = parts[parts.length - 1];
    if (ignored.has(fileName) || fileName.startsWith(".")) continue;
    const fileRelPath = parts.join("/");
    if (seenFiles.has(fileRelPath)) continue;
    const filePath = join(cwd, fileRelPath);
    const fileGitStatus = gitStatus.get(fileRelPath) ?? gitStatus.get(`${fileRelPath}/`);
    const fileDiffStats = diffStats.get(fileRelPath);
    const existingDir = directoryMap.get(fileRelPath);

    if (existingDir) {
      if (fileGitStatus) existingDir.gitStatus = fileGitStatus;
      if (fileDiffStats) existingDir.diffStats = fileDiffStats;
      continue;
    }

    if (normalized.endsWith("/") || (existsSync(filePath) && statSync(filePath).isDirectory())) {
      const dirNode: FileNode = { name: fileName, path: filePath, isDirectory: true, children: [], expanded: parts.length < 1, hasChangedChildren: false, gitStatus: fileGitStatus, diffStats: fileDiffStats };
      directoryMap.set(fileRelPath, dirNode);
      current.children?.push(dirNode);
      continue;
    }

    seenFiles.add(fileRelPath);
    current.children?.push({ name: fileName, path: filePath, isDirectory: false, gitStatus: fileGitStatus, agentModified: agentModified.has(filePath), diffStats: fileDiffStats });
  }
  updateTreeStats(root);
  return root;
}

export function flattenTree(node: FileNode, depth = 0, isRoot = true, includeCollapsed = false): FlatNode[] {
  const result: FlatNode[] = [];
  if (isRoot && node.name === ".") {
    for (const child of node.children || []) result.push(...flattenTree(child, 0, false, includeCollapsed));
    return result;
  }
  result.push({ node, depth });
  if (node.isDirectory && node.children && (includeCollapsed || node.expanded)) {
    for (const child of node.children) result.push(...flattenTree(child, depth + 1, false, includeCollapsed));
  }
  return result;
}

// ============================================================================
// FILE VIEWER LOGIC
// ============================================================================

function wrapLine(line: string, width: number): string[] {
  if (width <= 0 || line.length <= width) return [line];
  const wrapped: string[] = [];
  for (let i = 0; i < line.length; i += width) wrapped.push(line.slice(i, i + width));
  return wrapped;
}

function wrapDiffLines(lines: string[], width: number): string[] {
  if (width <= 0) return lines;
  const wrapped: string[] = [];
  for (const line of lines) {
    if (line.length <= width) { wrapped.push(line); continue; }
    if (line[0] === "+" || line[0] === "-" || line[0] === " ") {
      const contentWidth = Math.max(width - 1, 1);
      for (const chunk of wrapLine(line.slice(1), contentWidth)) wrapped.push(line[0] + chunk);
    } else {
      wrapped.push(...wrapLine(line, width));
    }
  }
  return wrapped;
}

export function loadFileContent(filePath: string, cwd: string, diffMode: boolean, hasChanges: boolean, width?: number): string[] {
  const termWidth = width || 80;
  try {
    if (diffMode && hasChanges && isGitRepo(cwd)) {
      const diffCmd = `git diff --no-color -- "${filePath}" || git diff --no-color --cached -- "${filePath}" || git diff --no-color HEAD -- "${filePath}"`;
      const diffOutput = execSync(diffCmd, { cwd, encoding: "utf-8", timeout: 10000, stdio: "pipe" });
      if (!diffOutput.trim()) return ["No diff available"];
      if (hasCommand("delta")) {
        const deltaOutput = execSync(`delta --no-gitconfig --width=${termWidth} --line-numbers --wrap-max-lines=unlimited`, { cwd, encoding: "utf-8", timeout: 10000, input: diffOutput });
        return stripLeadingEmptyLines(deltaOutput.split("\n"));
      }
      return wrapDiffLines(stripLeadingEmptyLines(diffOutput.split("\n")), termWidth);
    }
    if (filePath.endsWith(".md") && hasCommand("glow")) {
      const output = execSync(`glow -s dark -w ${termWidth} "${filePath}"`, { encoding: "utf-8", timeout: 10000 });
      if (output.trim()) return stripLeadingEmptyLines(output.split("\n"));
    }
    if (hasCommand("bat")) {
      return execSync(`bat --style=numbers --color=always --paging=never --terminal-width=${termWidth} "${filePath}"`, { encoding: "utf-8", timeout: 10000 }).split("\n");
    }
    const raw = readFileSync(filePath, "utf-8");
    return raw.split("\n").map((line, i) => `${String(i + 1).padStart(4)} │ ${line}`);
  } catch (e: any) { return [`Error: ${e.message}`]; }
}

// ============================================================================
// VIEWER CONTROLLER
// ============================================================================

export function createViewer(cwd: string, theme: Theme, requestComment: (p: CommentPayload, c: string) => void) {
  const state = { file: null as FileNode | null, content: [] as string[], rawContent: "", scroll: 0, diffMode: false, mode: "normal" as any, selectStart: 0, selectEnd: 0, commentText: "", searchQuery: "", searchMatches: [] as number[], searchIndex: 0, lastRenderWidth: 0, height: DEFAULT_VIEWER_HEIGHT };
  const resetSearch = () => { state.searchQuery = ""; state.searchMatches = []; state.searchIndex = 0; };
  return {
    isOpen: () => !!state.file,
    getFile: () => state.file,
    setFile: (file: FileNode) => {
      state.file = file; state.scroll = 0; state.diffMode = !!file.gitStatus && !isUntrackedStatus(file.gitStatus); state.mode = "normal"; state.content = []; state.lastRenderWidth = 0;
      try { state.rawContent = readFileSync(file.path, "utf-8"); file.lineCount = state.rawContent.split("\n").length; } catch { state.rawContent = ""; file.lineCount = undefined; }
    },
    updateFileRef: (file: FileNode | null) => { state.file = file; },
    close: () => { state.file = null; state.content = []; state.mode = "normal"; },
    render: (width: number) => {
      if (!state.file) return [];
      if (state.lastRenderWidth !== width || state.content.length === 0) { state.content = loadFileContent(state.file.path, cwd, state.diffMode, !!state.file.gitStatus, width); state.lastRenderWidth = width; }
      const lines = [truncateToWidth(theme.bold(state.file.name) + (state.diffMode ? theme.fg("warning", " [DIFF]") : ""), width), theme.fg("borderMuted", "─".repeat(width))];
      const visible = state.content.slice(state.scroll, state.scroll + state.height);
      for (let i = 0; i < state.height; i++) {
        if (i < visible.length) lines.push(truncateToWidth(visible[i] || "", width));
        else lines.push(theme.fg("dim", "~"));
      }
      lines.push(theme.fg("borderMuted", "─".repeat(width)), truncateToWidth(theme.fg("dim", `j/k: scroll  d: diff  q: back`), width));
      return lines;
    },
    handleInput: (data: string) => {
      if (!state.file) return { type: "none" };
      if (matchesKey(data, "q")) return { type: "close" };
      if (matchesKey(data, "j") || matchesKey(data, Key.down)) { state.scroll = Math.min(Math.max(0, state.content.length - VIEWER_SCROLL_MARGIN), state.scroll + 1); }
      if (matchesKey(data, "k") || matchesKey(data, Key.up)) { state.scroll = Math.max(0, state.scroll - 1); }
      if (matchesKey(data, "d") && state.file.gitStatus && !isUntrackedStatus(state.file.gitStatus)) { state.diffMode = !state.diffMode; state.lastRenderWidth = 0; state.scroll = 0; }
      return { type: "none" };
    }
  };
}

// ============================================================================
// BROWSER CONTROLLER
// ============================================================================

export function createFileBrowser(
  cwd: string,
  agentModifiedFiles: Set<string>,
  theme: Theme,
  onClose: () => void,
  requestComment: (p: CommentPayload, c: string) => void,
  requestRender: () => void
) {
  const ignored = new Set(["node_modules", ".git", "dist", "build"]);
  const repo = isGitRepo(cwd);
  let gitStatus = repo ? getGitStatus(cwd) : new Map<string, string>();
  let diffStats = repo ? getGitDiffStats(cwd) : new Map<string, DiffStats>();
  const gitBranch = repo ? getGitBranch(cwd) : "";
  const viewer = createViewer(cwd, theme, requestComment);
  const root = repo ? buildFileTreeFromPaths(cwd, getGitFileList(cwd), gitStatus, diffStats, ignored, agentModifiedFiles) : { name: ".", path: cwd, isDirectory: true, expanded: true };
  const state = { root, flatList: [] as FlatNode[], selectedIndex: 0, showOnlyChanged: false, browserHeight: DEFAULT_BROWSER_HEIGHT, lastPollTime: Date.now() };
  state.flatList = root ? flattenTree(root as FileNode) : [];

  return {
    render: (width: number) => {
      if (viewer.isOpen()) return viewer.render(width);
      const lines = [truncateToWidth(theme.bold(basename(cwd)) + (gitBranch ? theme.fg("accent", ` (${gitBranch})`) : ""), width), theme.fg("borderMuted", "─".repeat(width))];
      const displayList = state.flatList;
      const start = Math.max(0, Math.min(state.selectedIndex - Math.floor(state.browserHeight / 2), displayList.length - state.browserHeight));
      const end = Math.min(displayList.length, start + state.browserHeight);
      for (let i = start; i < end; i++) {
        const { node, depth } = displayList[i];
        const isSelected = i === state.selectedIndex;
        const line = truncateToWidth("  ".repeat(depth) + (node.isDirectory ? (node.expanded ? "▼ " : "▶ ") : "  ") + node.name, width);
        lines.push(isSelected ? theme.bg("selectedBg", line) : line);
      }
      lines.push(theme.fg("borderMuted", "─".repeat(width)), truncateToWidth(theme.fg("dim", "j/k: nav  Enter: open  q: close"), width));
      return lines;
    },
    handleInput: (data: string) => {
      if (viewer.isOpen()) { if (viewer.handleInput(data).type === "close") viewer.close(); return; }
      if (matchesKey(data, "q")) onClose();
      if (matchesKey(data, "j") || matchesKey(data, Key.down)) state.selectedIndex = Math.min(state.flatList.length - 1, state.selectedIndex + 1);
      if (matchesKey(data, "k") || matchesKey(data, Key.up)) state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      if (matchesKey(data, Key.enter)) {
        const item = state.flatList[state.selectedIndex];
        if (item?.node.isDirectory) { item.node.expanded = !item.node.expanded; state.flatList = flattenTree(state.root as FileNode); }
        else if (item) viewer.setFile(item.node);
      }
    },
    invalidate: () => {}
  };
}

export function formatCommentMessage(payload: CommentPayload, comment: string): string {
  return `Regarding \`${payload.relPath}\` (${payload.lineRange}):\n\n> ${payload.selectedText.split("\n").join("\n> ")}\n\n${comment}`;
}
