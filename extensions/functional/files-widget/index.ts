/**
 * File Browser Extension
 *
 * Provides an in-terminal file browser and viewer.
 * Use /browse to open the file browser, navigate with j/k, Enter to view.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { join } from "node:path";

import { createFileBrowser, formatCommentMessage, POLL_INTERVAL_MS } from "./core";

export default function fileBrowserExtension(pi: ExtensionAPI): void {
  const cwd = process.cwd();
  const agentModifiedFiles = new Set<string>();

  pi.registerCommand("browse", {
    description: "Open file browser",
    handler: async (_args, ctx) => {
      await ctx.ui.custom<void>((tui, theme, _kb, done) => {
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
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

        const requestRender = () => tui.requestRender();
        const browser = createFileBrowser(cwd, agentModifiedFiles, theme, cleanup, requestComment, requestRender);

        pollInterval = setInterval(() => {
          requestRender();
        }, POLL_INTERVAL_MS);

        return {
          render: (w) => browser.render(w),
          handleInput: (data) => {
            browser.handleInput(data);
            requestRender();
          },
          invalidate: () => browser.invalidate(),
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
