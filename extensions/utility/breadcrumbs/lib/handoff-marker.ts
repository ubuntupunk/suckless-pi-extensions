import { randomUUID } from "node:crypto";
import { appendFileSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ExtensionAPI,
  MessageRenderOptions,
  Theme,
} from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";

export const HANDOFF_MARKER_CUSTOM_TYPE = "handoff-marker";

export interface HandoffMarkerDetails {
  targetSessionId: string;
  goal: string;
}

interface HandoffMarkerMessage {
  customType: string;
  content: string | Array<{ type: string; text?: string }>;
  details?: HandoffMarkerDetails;
}

/**
 * Find a session JSONL file by session ID and extract its display name.
 * Falls back to the session ID if the file can't be found or has no name.
 */
function resolveSessionName(sessionId: string): string {
  try {
    const sessionsDir = join(homedir(), ".pi", "agent", "sessions");
    const suffix = `_${sessionId}.jsonl`;

    // Scan subdirectories for a file ending with _<id>.jsonl
    for (const subdir of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!subdir.isDirectory()) continue;
      const dirPath = join(sessionsDir, subdir.name);
      for (const file of readdirSync(dirPath)) {
        if (!file.endsWith(suffix)) continue;

        // Found the file -- read and look for session_info with name
        const content = readFileSync(join(dirPath, file), "utf-8");
        const lines = content.split("\n");

        // Check lines in reverse -- latest name wins
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i]?.trim();
          if (!line || !line.includes("session_info")) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === "session_info" && entry.name) {
              return entry.name;
            }
          } catch {
            // skip malformed lines
          }
        }

        // No name found -- use first user message as fallback
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.type === "message" && entry.message?.role === "user") {
              const content = entry.message.content;
              const text =
                typeof content === "string"
                  ? content
                  : Array.isArray(content)
                    ? content
                        .filter(
                          (c: { type: string; text?: string }) =>
                            c.type === "text",
                        )
                        .map((c: { type: string; text?: string }) => c.text)
                        .join("")
                    : "";
              if (text) return text.slice(0, 60);
            }
          } catch {
            // skip
          }
        }

        return sessionId;
      }
    }
  } catch {
    // fs errors -- fall back to ID
  }
  return sessionId;
}

/**
 * Register the handoff marker message renderer.
 * Displays "Handed off to -> {sessionId}" or "(pending...)" if placeholder.
 * Placeholder entries return undefined (hidden) -- only the patched entry renders.
 */
export function setupHandoffMarkerRenderer(pi: ExtensionAPI) {
  pi.registerMessageRenderer<HandoffMarkerDetails>(
    HANDOFF_MARKER_CUSTOM_TYPE,
    (
      message: HandoffMarkerMessage,
      _options: MessageRenderOptions,
      theme: Theme,
    ) => {
      const details = message.details;

      if (!details) {
        return undefined;
      }

      const targetSessionId = details.targetSessionId;
      const isPending = targetSessionId.startsWith("__handoff_");

      // Skip placeholder entries -- the patched entry will render instead.
      // If patching failed, nothing renders (acceptable).
      if (isPending) {
        return undefined;
      }

      const displayName = resolveSessionName(targetSessionId);
      const label = theme.fg("muted", "Handed off to ");
      const displayText = `${label}${theme.fg("accent", displayName)}`;

      const box = new Box(1, 1, (t) => theme.bg("customMessageBg", t));
      box.addChild(new Text(displayText, 0, 0));
      return box;
    },
  );
}

/**
 * Patch a handoff marker in the old session file.
 *
 * Reads the session JSONL file, finds the line containing the placeholder,
 * creates a corrected copy with the real session ID, and appends it to the file.
 *
 * @param oldSessionFile - Path to the old session JSONL file
 * @param placeholder - The placeholder string to find (e.g., "__handoff_xxx__")
 * @param newSessionId - The real new session ID
 */
export function patchHandoffMarker(
  oldSessionFile: string,
  placeholder: string,
  newSessionId: string,
): void {
  try {
    // Read all lines from the session file
    const content = readFileSync(oldSessionFile, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());

    // Find the line containing the placeholder
    const matchLine = lines.find((line) => line.includes(placeholder));
    if (!matchLine) {
      // No matching line found, nothing to patch
      return;
    }

    // Parse the matching line
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(matchLine);
    } catch {
      // If we can't parse it, skip patching
      return;
    }

    // Create a corrected copy
    const correctedEntry = { ...entry };
    if (correctedEntry.details && typeof correctedEntry.details === "object") {
      const details = correctedEntry.details as Record<string, unknown>;
      details.targetSessionId = newSessionId;
    }

    // Generate new IDs for the corrected entry
    const originalId = correctedEntry.id;
    correctedEntry.id = randomUUID();
    correctedEntry.parentId = originalId;

    // Append the corrected line to the file
    appendFileSync(oldSessionFile, `\n${JSON.stringify(correctedEntry)}`);
  } catch (error) {
    // Silently fail if file operations don't work
    console.error("Error patching handoff marker:", error);
  }
}
