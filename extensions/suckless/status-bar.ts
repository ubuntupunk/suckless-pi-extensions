import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";

/**
 * Suckless Status Bar
 *
 * A minimal, stable status bar that provides essential session info.
 * Replaces heavier, potentially janky TUI status extensions.
 */
export default function statusBarExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    updateStatusBar(ctx);
  });

  pi.on("session_switch", (_event, ctx) => {
    updateStatusBar(ctx);
  });

  // Update status bar when configuration or session state changes
  function updateStatusBar(ctx: any) {
    if (!ctx.hasUI) return;

    ctx.ui.setWidget("suckless-status", (_tui: any, theme: any) => {
      const model = ctx.sessionManager.getSession()?.model || "unknown";
      const provider = ctx.sessionManager.getSession()?.provider || "unknown";
      const thinking = ctx.sessionManager.getSession()?.thinking || "off";
      const sessionId =
        ctx.sessionManager.getSession()?.id?.slice(0, 8) || "none";

      // Format: [ SESSION: abc12345 ] [ MODEL: gemini-3-flash-preview ] [ THINKING: off ]
      const statusText = [
        ` ${theme.fg("muted", "[")} ${theme.fg("accent", "SESSION:")} ${theme.fg("success", sessionId)} ${theme.fg("muted", "]")} `,
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
