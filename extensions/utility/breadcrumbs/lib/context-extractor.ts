/**
 * Context extractor for handoff.
 *
 * Extracts mentioned/touched files from session content by scanning
 * tool calls for file operations (read, write, edit, etc.).
 */

import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type {
  AssistantMessage,
  ToolCall,
  ToolResultMessage,
} from "@mariozechner/pi-ai";
import type {
  SessionEntry,
  SessionMessageEntry,
} from "@mariozechner/pi-coding-agent";
import { parseSessionEntries } from "@mariozechner/pi-coding-agent";

/**
 * Tool names that have file path arguments.
 */
const FILE_TOOL_NAMES = new Set([
  "read",
  "Read",
  "write",
  "Write",
  "edit",
  "Edit",
  "Bash", // May contain file paths in command
]);

/**
 * Argument names that typically contain file paths.
 */
const PATH_ARG_NAMES = new Set(["path", "file", "filename"]);

/**
 * Extract files mentioned or touched in the session content.
 *
 * Scans for:
 * - File paths in tool call arguments (path, file, filename params)
 * - Explicit file path patterns in conversation text
 *
 * Returns a deduplicated list of absolute file paths that exist on disk.
 */
export function extractMentionedFiles(
  sessionContent: string,
  cwd: string,
): string[] {
  const paths = new Set<string>();

  // Pattern 1: Tool call arguments with file paths
  // Matches: [Tool call: read(path: "/some/path")]
  // Matches: [Tool call: edit(path: "/some/path", ...)]
  const toolCallPattern = /\[Tool call: \w+\(([^)]*)\)\]/g;

  for (const match of sessionContent.matchAll(toolCallPattern)) {
    const argsStr = match[1];
    if (!argsStr) continue;

    // Extract path-like arguments
    const pathPattern = /(?:path|file|filename):\s*"([^"]+)"/g;
    for (const pathMatch of argsStr.matchAll(pathPattern)) {
      const filePath = pathMatch[1];
      if (filePath) {
        paths.add(filePath);
      }
    }
  }

  // Pattern 2: Explicit file paths in text
  // Match absolute paths starting with /
  const absolutePathPattern = /(?:^|\s|`)(\/(?:[\w.-]+\/)*[\w.-]+\.[\w]+)/gm;

  for (const match of sessionContent.matchAll(absolutePathPattern)) {
    const filePath = match[1];
    if (
      filePath &&
      !filePath.startsWith("/dev/") &&
      !filePath.startsWith("/proc/")
    ) {
      paths.add(filePath);
    }
  }

  // Pattern 3: Relative paths that look like source files
  const relativePathPattern =
    /(?:^|\s|`)((?:\.\/|[\w-]+\/)(?:[\w.-]+\/)*[\w.-]+\.(?:ts|js|tsx|jsx|json|md|yaml|yml|toml|css|html|py|rs|go|sh))/gm;

  for (const match of sessionContent.matchAll(relativePathPattern)) {
    const filePath = match[1];
    if (filePath) {
      paths.add(filePath);
    }
  }

  // Resolve to absolute paths and filter to existing files
  const resolved = new Set<string>();
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    if (existsSync(abs)) {
      resolved.add(abs);
    }
  }

  return Array.from(resolved).sort();
}

/**
 * Extract file paths from session entries by parsing tool call arguments.
 *
 * This is more reliable than regex on formatted text since it has access
 * to the full, untruncated tool arguments.
 *
 * @param rawSessionContent - The raw JSONL session file content
 * @param cwd - Working directory for resolving relative paths
 * @returns Deduplicated list of absolute file paths that exist on disk
 */
export function extractFilesFromSessionEntries(
  rawSessionContent: string,
  cwd: string,
): string[] {
  if (!rawSessionContent.trim()) return [];

  const entries = parseSessionEntries(rawSessionContent);
  if (entries.length === 0) return [];

  const paths = new Set<string>();

  for (const entry of entries) {
    const sessionEntry = entry as SessionEntry;
    if (sessionEntry.type !== "message") continue;

    const msgEntry = sessionEntry as SessionMessageEntry;
    const msg = msgEntry.message;

    // Extract from assistant tool calls
    if (msg.role === "assistant") {
      const assistantMsg = msg as AssistantMessage;
      for (const block of assistantMsg.content) {
        if (block.type === "toolCall") {
          const tc = block as ToolCall;
          extractPathsFromToolCall(tc.name, tc.arguments, paths);
        }
      }
    }

    // Extract from tool results (e.g., file listings from ls)
    if (msg.role === "toolResult") {
      const toolResultMsg = msg as ToolResultMessage;
      // The tool result itself doesn't contain the path argument,
      // but we could extract paths from the content if needed.
      // For now, we rely on the tool call extraction above.
      void toolResultMsg; // Mark as intentionally unused
    }
  }

  // Resolve to absolute paths and filter to existing files
  const resolved = new Set<string>();
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : resolve(cwd, p);
    if (existsSync(abs)) {
      resolved.add(abs);
    }
  }

  return Array.from(resolved).sort();
}

/**
 * Extract file paths from a tool call's arguments.
 */
function extractPathsFromToolCall(
  toolName: string,
  args: Record<string, unknown>,
  paths: Set<string>,
): void {
  // Check if this is a file-related tool
  if (!FILE_TOOL_NAMES.has(toolName)) return;

  // Extract path arguments
  for (const [key, value] of Object.entries(args)) {
    if (PATH_ARG_NAMES.has(key) && typeof value === "string") {
      paths.add(value);
    }
  }

  // For Bash tool, try to extract file paths from the command
  if (toolName === "Bash" && typeof args.command === "string") {
    extractPathsFromBashCommand(args.command, paths);
  }
}

/**
 * Extract file paths from a bash command string.
 * Limited pattern matching for common file operations.
 */
function extractPathsFromBashCommand(
  command: string,
  paths: Set<string>,
): void {
  // Match absolute paths
  const absolutePathPattern = /(\/(?:[\w.-]+\/)*[\w.-]+)/g;
  for (const match of command.matchAll(absolutePathPattern)) {
    const filePath = match[1];
    if (
      filePath &&
      !filePath.startsWith("/dev/") &&
      !filePath.startsWith("/proc/") &&
      !filePath.startsWith("/tmp/pi-") // Exclude temp files
    ) {
      paths.add(filePath);
    }
  }
}
