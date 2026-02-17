import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

/**
 * Suckless Status Bar
 *
 * A minimal, stable status bar that provides essential session info.
 * Replaces heavier, potentially janky TUI status extensions.
 */

function getGitBranch(cwd: string): string {
  try {
    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "none";
  }
}

function getGitCommit(cwd: string): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      cwd,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
  } catch {
    return "none";
  }
}

export default function statusBarExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    updateStatusBar(ctx);
  });

  pi.on("session_switch", (_event, ctx) => {
    updateStatusBar(ctx);
  });

  // Update status bar when configuration or session state changes
  function updateStatusBar(ctx: any) {
    if (!ctx || !ctx.hasUI || !ctx.sessionManager) return;

    ctx.ui.setWidget("suckless-status", (_tui: any, theme: any) => {
      const model = ctx.model?.id || "unknown";
      const provider = ctx.model?.provider || "unknown";
      // Use getThinkingLevel if available, otherwise default to "off"
      const thinking = typeof pi.getThinkingLevel === "function"
        ? pi.getThinkingLevel()
        : "off";
      const sessionId =
        ctx.sessionManager.getSessionId()?.slice(0, 8) || "none";
      // Use getSessionName if available, otherwise use sessionId
      const sessionName = typeof pi.getSessionName === "function"
        ? pi.getSessionName()
        : sessionId;

      const branch = getGitBranch(ctx.cwd);
      const commit = getGitCommit(ctx.cwd);

      // Format: [ SESSION: name ] [ COMMIT: hash ] [ BRANCH: branch ] [ MODEL: gemini-3-flash-preview ] [ THINKING: off ]
      const statusText = [
        ` ${theme.fg("muted", "[")} ${theme.fg("accent", "SESSION:")} ${theme.fg("success", sessionName)} ${theme.fg("muted", "]")} `,
        `${theme.fg("muted", "[")} ${theme.fg("accent", "COMMIT:")} ${theme.fg("success", commit)} ${theme.fg("muted", "]")} `,
        `${theme.fg("muted", "[")} ${theme.fg("accent", "BRANCH:")} ${theme.fg("success", branch)} ${theme.fg("muted", "]")} `,
        `${theme.fg("muted", "[")} ${theme.fg("accent", "MODEL:")} ${theme.fg("success", model)} (${provider}) ${theme.fg("muted", "]")} `,
        `${theme.fg("muted", "[")} ${theme.fg("accent", "THINKING:")} ${theme.fg("warning", thinking)} ${theme.fg("muted", "]")} `,
      ].join("");

      const text = new Text(statusText, 0, 0);

      return {
        render(width: number) {
          return text.render(width);
        },
        invalidate() {
          text.invalidate();
        },
      };
    });
  }
}
