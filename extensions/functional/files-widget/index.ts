/**
 * File Browser Extension
 *
 * Provides an in-terminal file browser and viewer.
 * Use /browse to open the file browser, navigate with j/k, Enter to view.
 */

import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";

import {
  createFileBrowser,
  formatCommentMessage,
  POLL_INTERVAL_MS,
} from "./core";

export default function fileBrowserExtension(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const agentModifiedFiles = new Set<string>();

  pi.registerCommand("browse", {
    description: "Open file browser",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("File browser requires TUI", "error");
        return;
      }

      ctx.ui.notify("Opening file browser - j/k navigate, Enter open, q close", "info");
      
      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        let isClosed = false;

        const cleanup = () => {
          if (isClosed) return;
          isClosed = true;
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          done();
        };

        const requestComment = (payload: any, comment: string) => {
          pi.sendUserMessage(formatCommentMessage(payload, comment), {
            deliverAs: "followUp",
            streamingBehavior: "followUp" as any,
          } as any);
        };

        const requestRender = () => {
          if (!isClosed) tui.requestRender();
        };

        const browser = createFileBrowser(
          cwd,
          agentModifiedFiles,
          theme,
          cleanup,
          requestComment,
          requestRender,
        );

        // Poll for git changes
        pollInterval = setInterval(() => {
          if (!isClosed) {
            requestRender();
          }
        }, POLL_INTERVAL_MS);

        return {
          render: (width: number) => {
            if (isClosed) return [];
            return browser.render(width);
          },
          handleInput: (data: string) => {
            if (isClosed) return;
            
            // Handle escape key to close
            if (matchesKey(data, Key.escape)) {
              cleanup();
              return;
            }
            
            browser.handleInput(data);
            requestRender();
          },
          invalidate: () => {
            if (!isClosed) browser.invalidate();
          },
        };
      });
    },
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = event.input?.path as string | undefined;
      if (filePath) {
        agentModifiedFiles.add(join(cwd, filePath));
      }
    }
  });

  pi.on("session_start", async () => {
    agentModifiedFiles.clear();
  });

  pi.on("session_switch", async () => {
    agentModifiedFiles.clear();
  });
}
