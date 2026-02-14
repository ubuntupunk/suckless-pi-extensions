import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync, spawnSync } from "node:child_process";
import { hasCommand } from "../../functional/files-widget/core";

/**
 * Review Tools Extension
 *
 * Provides specialized commands for reviewing changes:
 * - /tui-review: Opens tuicr to review changes and send feedback.
 * - /tui-diff: Opens critique to view diffs.
 */
export default function reviewToolsExtension(pi: ExtensionAPI): void {
  const cwd = process.cwd();

  pi.registerCommand("tui-review", {
    description: "Open tuicr to review changes and send feedback to agent",
    handler: async (_args, ctx) => {
      if (!hasCommand("tuicr")) {
        ctx.ui.notify("Install tuicr: brew install agavra/tap/tuicr", "error");
        return;
      }

      ctx.ui.notify("Opening tuicr... Press :wq or y to copy review", "info");

      try {
        spawnSync("tuicr", [], { cwd, stdio: "inherit" });

        try {
          const clipboard = execSync(
            process.platform === "darwin" ? "pbpaste" : "xclip -selection clipboard -o",
            { encoding: "utf-8", timeout: 5000 }
          );

          if (
            clipboard.includes("## Review") ||
            clipboard.includes("```") ||
            clipboard.includes("[Issue]") ||
            clipboard.includes("[Suggestion]")
          ) {
            pi.sendUserMessage(clipboard, { deliverAs: "steer" });
            ctx.ui.notify("Review sent to agent", "success");
          }
        } catch {}
      } catch (e: any) {
        ctx.ui.notify(`tuicr error: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("tui-diff", {
    description: "Open critique to view diffs",
    handler: async (args, ctx) => {
      if (!hasCommand("bun")) {
        ctx.ui.notify("critique requires Bun: brew install oven-sh/bun/bun", "error");
        return;
      }

      const critiqueArgs = args ? args.split(" ") : [];
      ctx.ui.notify("Opening critique...", "info");

      try {
        spawnSync("bunx", ["critique", ...critiqueArgs], { cwd, stdio: "inherit" });
      } catch (e: any) {
        ctx.ui.notify(`critique error: ${e.message}`, "error");
      }
    },
  });
}
